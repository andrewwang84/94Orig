'use strict';

const { sleep } = require('./utils');

/**
 * ONCE JAPAN 系列站台自動登入
 *
 * 原本靠 FirefoxCookies 從本機 Firefox 的 cookies.sqlite 撈登入 cookie，
 * 使用者得先自己用 Firefox 登入且 session 不能過期。
 * 這裡改成用 puppeteer 開 headless Chrome，以 cred.js 的帳密實際登入，
 * 再把瀏覽器 cookie 轉成 Cookie header 字串給既有的 https 爬蟲流程使用。
 *
 * 三站共用同一組 Plus member ID / 密碼：
 *   - oncejapan.com        → secure.plusmember.jp/twice/1/login/
 *   - sp.twicejapan.com    → secure.plusmember.jp/twice/3/login/（只認手機 UA）
 *   - www.w.oncejapan.com  → 站內表單 POST /check.php
 * 登入頁結構不同，因此不寫死 selector，改用「找 input[type=password]，
 * 再取同一個 form 內第一個可見文字欄位當帳號欄」的通用偵測。
 */

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0';
const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/14.2 Chrome/146.0.0.0 Mobile Safari/537.36';

/**
 * 各站設定
 * verifyUrl 用會員限定頁，登入失敗時該頁會被導回登入頁 → 可用來驗證
 */
const LOGIN_SITES = {
    wMember: {
        label: 'W MEMBER',
        loginUrl: 'https://www.w.oncejapan.com/login',
        verifyUrl: 'https://www.w.oncejapan.com/photo/',
        ua: UA_DESKTOP,
        mobile: false,
    },
    onceJapan: {
        label: 'ONCE JAPAN',
        loginUrl: 'https://oncejapan.com/login',
        verifyUrl: 'https://oncejapan.com/photo/list/10',
        ua: UA_DESKTOP,
        mobile: false,
    },
    spTwice: {
        label: 'ONCE JAPAN MOBILE',
        loginUrl: 'https://sp.twicejapan.com/login',
        verifyUrl: 'https://sp.twicejapan.com/photo/list/7',
        ua: UA_MOBILE,
        mobile: true,
    },
};

/** 被導到這些網址代表尚未登入 */
const LOGIN_URL_PATTERN = /secure\.plusmember\.jp|\/login(\.php)?(\/|\?|$)/i;

class OjLogin {
    /**
     * @param {Object} [credentials] - { id, password }，未提供時從 config.js / cred.js 讀取
     */
    constructor(credentials = null) {
        const cred = credentials || OjLogin._loadCredentials();
        this.id = cred.id;
        this.password = cred.password;
        this.headless = process.env.OJ_LOGIN_HEADFUL ? false : true;
    }

    /**
     * 從 config.js（development 走 cred.js、production 走環境變數）取得帳密
     * @private
     */
    static _loadCredentials() {
        try {
            const env = process.env.NODE_ENV === 'production' ? 'production' : 'development';
            const config = require('../config.js')[env];
            return { id: config.ojLoginId, password: config.ojLoginPassword };
        } catch (err) {
            console.error(`[ERROR][OjLogin] 讀取設定失敗: ${err.message}`);
            return {};
        }
    }

    _getDelay() {
        return 2000 + Math.random() * 3000;
    }

    _assertCredentials() {
        if (!this.id || !this.password) {
            throw new Error('OJ 登入失敗: 未設定帳號密碼，請在 cred.js 補上 ojLoginId / ojLoginPassword（可參考 cred.tmp.js）');
        }
    }

    /**
     * 登入指定站台並回傳 Cookie header 字串
     * @param {Array<string>} [siteKeys] - 要登入的站台 key，預設全部
     * @returns {Promise<{wMember?: string, onceJapan?: string, spTwice?: string}>}
     * @throws {Error} 任一站台登入失敗即拋出
     */
    async getAllOjCookies(siteKeys = null) {
        this._assertCredentials();

        const keys = siteKeys || Object.keys(LOGIN_SITES);
        for (const key of keys) {
            if (!LOGIN_SITES[key]) throw new Error(`OJ 登入失敗: 未知的站台 key "${key}"`);
        }

        let browser;
        const cookies = {};
        try {
            // 延遲載入：只有真的要登入時才付 puppeteer 的載入成本，
            // 也讓下面的 MODULE_NOT_FOUND 判斷真的抓得到「沒安裝」的情況
            const puppeteer = require('puppeteer');
            browser = await puppeteer.launch({
                headless: this.headless,
                args: [
                    '--no-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-blink-features=AutomationControlled',
                    '--lang=ja-JP',
                ],
            });

            for (let i = 0; i < keys.length; i++) {
                if (i > 0) await sleep(this._getDelay());
                const key = keys[i];
                cookies[key] = await this._loginSite(browser, LOGIN_SITES[key]);
            }
        } catch (err) {
            // puppeteer 未安裝時給明確提示
            if (err.code === 'MODULE_NOT_FOUND' || /Could not find (Chrome|browser)/i.test(err.message)) {
                throw new Error(`OJ 登入失敗: puppeteer / Chrome 未就緒（${err.message}），請先執行 npm install`);
            }
            throw err;
        } finally {
            if (browser) {
                try { await browser.close(); } catch (e) { /* ignore */ }
            }
        }

        return cookies;
    }

    /**
     * 單一站台登入流程
     * @private
     * @returns {Promise<string>} Cookie header 字串
     */
    async _loginSite(browser, site) {
        const page = await browser.newPage();
        try {
            await page.setUserAgent(site.ua);
            await page.setViewport(site.mobile
                ? { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 }
                : { width: 1366, height: 900 });
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'ja-JP,ja;q=0.9,zh-TW;q=0.8,en-US;q=0.7,en;q=0.6',
            });
            page.setDefaultNavigationTimeout(60000);

            console.log(`[LOG][OjLogin][${site.label}] 開啟登入頁: ${site.loginUrl}`);
            await page.goto(site.loginUrl, { waitUntil: 'networkidle2' });

            const passEl = await page.$('input[type="password"]');
            if (passEl) {
                await this._submitLoginForm(page, passEl, site);
            } else if (LOGIN_URL_PATTERN.test(page.url())) {
                // 停在登入頁卻找不到密碼欄位 → 版面改版或被擋
                throw new Error(`${site.label} 登入失敗: 登入頁找不到密碼欄位（${page.url()}），可能改版或被阻擋`);
            } else {
                // 其他站台登入時已透過 plusmember SSO 帶入登入狀態
                console.log(`[LOG][OjLogin][${site.label}] 已是登入狀態，略過表單`);
            }

            await this._verifyLoggedIn(page, site);

            const cookieStr = await this._collectCookies(browser, page, site);
            if (!cookieStr) {
                throw new Error(`${site.label} 登入失敗: 登入後取不到任何 cookie`);
            }
            return cookieStr;
        } finally {
            try { await page.close(); } catch (e) { /* ignore */ }
        }
    }

    /**
     * 填入帳密並送出（通用偵測，不依賴各站固定 selector）
     * @private
     */
    async _submitLoginForm(page, passEl, site) {
        const idHandle = await page.evaluateHandle((pw) => {
            const scope = pw.form || document;
            const inputs = Array.from(scope.querySelectorAll('input'));
            return inputs.find(i =>
                ['text', 'email', 'tel'].includes(i.type)
                && !i.disabled
                && !i.readOnly
                && i.offsetParent !== null
            ) || null;
        }, passEl);
        const idEl = idHandle.asElement();
        if (!idEl) {
            throw new Error(`${site.label} 登入失敗: 找不到帳號輸入欄位（${page.url()}）`);
        }

        await idEl.click({ clickCount: 3 });
        await idEl.type(this.id, { delay: 60 });
        await passEl.click({ clickCount: 3 });
        await passEl.type(this.password, { delay: 60 });

        const submitHandle = await page.evaluateHandle((pw) => {
            const form = pw.form;
            if (!form) return null;
            return form.querySelector('input[type="submit"], button[type="submit"], button:not([type])') || null;
        }, passEl);
        const submitEl = submitHandle.asElement();

        console.log(`[LOG][OjLogin][${site.label}] 送出登入表單`);
        const navigation = page.waitForNavigation({ waitUntil: 'networkidle2' }).catch(() => null);
        if (submitEl) {
            await submitEl.click();
        } else {
            await passEl.press('Enter');
        }
        await navigation;

        // 仍看得到密碼欄位 → 帳密錯誤或被擋，抓頁面上的錯誤訊息
        const stillOnForm = await page.$('input[type="password"]');
        if (stillOnForm) {
            const reason = await this._extractErrorMessage(page);
            throw new Error(`${site.label} 登入失敗${reason ? `: ${reason}` : '：帳號或密碼可能有誤'}（停留在 ${page.url()}）`);
        }
    }

    /**
     * 讀取登入頁上的錯誤訊息
     * @private
     */
    async _extractErrorMessage(page) {
        try {
            return await page.evaluate(() => {
                const selectors = [
                    '.error', '.errorTxt', '.error__txt', '.txt--error', '.msg--error',
                    '.alert', '.attention', '[class*="error"]', '[class*="alert"]',
                ];
                for (const sel of selectors) {
                    for (const el of document.querySelectorAll(sel)) {
                        const text = (el.innerText || '').trim().replace(/\s+/g, ' ');
                        if (text && text.length <= 200) return text;
                    }
                }
                return '';
            });
        } catch (err) {
            return '';
        }
    }

    /**
     * 開會員限定頁確認登入狀態
     * @private
     */
    async _verifyLoggedIn(page, site) {
        await page.goto(site.verifyUrl, { waitUntil: 'domcontentloaded' });
        const finalUrl = page.url();
        const hasPasswordField = await page.$('input[type="password"]') !== null;

        if (hasPasswordField || LOGIN_URL_PATTERN.test(finalUrl)) {
            throw new Error(`${site.label} 登入失敗: 會員頁 ${site.verifyUrl} 仍被導向登入頁（${finalUrl}）`);
        }
        console.log(`[LOG][OjLogin][${site.label}] 登入成功`);
    }

    /**
     * 取出該站可用的 cookie 並組成 Cookie header 字串
     *
     * page.cookies(url) 在 puppeteer 25 已標記 deprecated（目前仍可用且會依 URL 過濾），
     * 未來移除時退回 browser.cookies() 再自行比對 domain，避免把別站的 cookie 混進來。
     * @private
     */
    async _collectCookies(browser, page, site) {
        const host = new URL(site.verifyUrl).hostname;
        let cookies;
        if (typeof page.cookies === 'function') {
            cookies = await page.cookies(site.verifyUrl);
        } else {
            const all = await browser.cookies();
            cookies = all.filter(c => {
                const domain = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
                return host === domain || host.endsWith('.' + domain);
            });
        }

        const seen = new Set();
        const unique = cookies.filter(c => {
            if (seen.has(c.name)) return false;
            seen.add(c.name);
            return true;
        });
        console.log(`[LOG][OjLogin][${site.label}] 取得 ${unique.length} 個 cookie`);
        return unique.map(c => `${c.name}=${c.value}`).join('; ');
    }
}

module.exports = OjLogin;
module.exports.UA_DESKTOP = UA_DESKTOP;
module.exports.UA_MOBILE = UA_MOBILE;
module.exports.LOGIN_SITES = LOGIN_SITES;
