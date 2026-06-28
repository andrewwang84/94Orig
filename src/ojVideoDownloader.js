'use strict';

const https = require('https');
const http = require('http');
const { spawn } = require('child_process');
const cheerio = require('cheerio');
const FirefoxCookies = require('./firefoxCookies');
const { sleep } = require('./utils');

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0';
const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/14.2 Chrome/146.0.0.0 Mobile Safari/537.36';

const OJ_SITE = {
    key: 'oj_movie',
    baseUrl: 'https://oncejapan.com',
    listPath: '/movies/list/44/0/',
    cookieKey: 'onceJapan',
    ua: UA_DESKTOP,
    // OJ list page 1: no referer (Sec-Fetch-Site: none)
    listFirstReferer: null,
    // N_m3u8DL-RE Referer: detail URL
    dlReferer: (detailUrl) => detailUrl,
};

const OJM_SITE = {
    key: 'ojm_movie',
    baseUrl: 'https://sp.twicejapan.com',
    listPath: '/movies/list/43/0/',
    cookieKey: 'spTwice',
    ua: UA_MOBILE,
    // OJM list page 1: referer = self URL (same-origin)
    listFirstReferer: 'https://sp.twicejapan.com/movies/list/43/0/',
    // N_m3u8DL-RE Referer: base URL
    dlReferer: () => 'https://sp.twicejapan.com/',
};

class OjVideoDownloader {
    constructor(downloadCache, downloadDir) {
        this.downloadCache = downloadCache;
        this.downloadDir = downloadDir;
        this.firefoxCookies = new FirefoxCookies();
        this.cookies = null;
    }

    _getDelay() {
        return 2000 + Math.random() * 3000;
    }

    _sanitizeTitle(title) {
        return title
            .normalize('NFC')
            .replace(/[\/\\:*?"<>|]/g, ' ')
            .replace(/[\u2018\u2019\u201C\u201D]/g, "'")
            .replace(/[\uFF01\uFF1F]/g, '')
            .replace(/[\x00-\x1F\x7F]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\.+$/, '');
    }

    async _retry(fn, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (err) {
                if (attempt === maxRetries) throw err;
                const delay = 2000 * attempt;
                console.log(`[LOG][OJV] 重試 ${attempt}/${maxRetries}，等待 ${delay}ms... (${err.message})`);
                await sleep(delay);
            }
        }
    }

    /**
     * HTTP GET request
     * options.isPlay: true → cors mode (play URL request, no Upgrade-Insecure-Requests, no Sec-Fetch-User)
     */
    _fetch(url, options = {}) {
        return new Promise((resolve, reject) => {
            const parsedUrl = new URL(url);
            const mod = parsedUrl.protocol === 'https:' ? https : http;

            const headers = {
                'User-Agent': options.userAgent || UA_DESKTOP,
                'Accept': options.accept || 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                'DNT': '1',
                'Connection': 'keep-alive',
            };

            if (options.isPlay) {
                // XHR/fetch request for M3U8 (cors)
                headers['Sec-Fetch-Dest'] = 'empty';
                headers['Sec-Fetch-Mode'] = 'cors';
                headers['Sec-Fetch-Site'] = 'same-origin';
            } else {
                // Normal page navigation
                headers['Upgrade-Insecure-Requests'] = '1';
                headers['Sec-Fetch-Dest'] = 'document';
                headers['Sec-Fetch-Mode'] = 'navigate';
                headers['Sec-Fetch-Site'] = options.referer ? 'same-origin' : 'none';
                headers['Sec-Fetch-User'] = '?1';
                headers['Priority'] = 'u=0, i';
            }

            if (options.cookie) headers['Cookie'] = options.cookie;
            if (options.referer) headers['Referer'] = options.referer;

            const req = mod.get({
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                headers,
                timeout: 30000,
            }, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    const redirectUrl = new URL(res.headers.location, url).href;
                    resolve(this._fetch(redirectUrl, options));
                    return;
                }

                if (res.statusCode !== 200) {
                    reject(new Error(`HTTP ${res.statusCode} for ${url}`));
                    return;
                }

                const chunks = [];
                res.on('data', chunk => chunks.push(chunk));
                res.on('end', () => {
                    const buf = Buffer.concat(chunks);
                    resolve({ text: buf.toString('utf-8') });
                });
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
        });
    }

    _ensureCookies() {
        if (!this.cookies) {
            this.cookies = this.firefoxCookies.getAllOjCookies();
        }
    }

    /**
     * 從 M3U8 master playlist 取最高 BANDWIDTH 的串流 URL
     * 忽略 EXT-X-IMAGE-STREAM-INF 行
     */
    _parseBestM3u8(m3u8Text) {
        const lines = m3u8Text.split('\n').map(l => l.trim()).filter(Boolean);
        let bestBandwidth = -1;
        let bestUrl = null;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.startsWith('#EXT-X-STREAM-INF:')) {
                const bwMatch = line.match(/BANDWIDTH=(\d+)/);
                if (bwMatch) {
                    const bw = parseInt(bwMatch[1], 10);
                    const nextLine = lines[i + 1];
                    if (nextLine && !nextLine.startsWith('#') && bw > bestBandwidth) {
                        bestBandwidth = bw;
                        bestUrl = nextLine;
                    }
                }
            }
        }

        return bestUrl;
    }

    /**
     * 建立下載檔名
     * date: "2026.02.21" → "260221 TITLE"
     */
    _buildFilename(date, title) {
        const datePart = date.replace(/\./g, '').slice(-6);
        const titlePart = this._sanitizeTitle(title);
        return `${datePart} ${titlePart}`;
    }

    _runN_m3u8DL_RE(m3u8Url, filename, ua, referer) {
        return new Promise((resolve) => {
            const args = [
                m3u8Url,
                '--header', `User-Agent: ${ua}`,
                '--header', `Referer: ${referer}`,
                '--save-name', filename,
                '--save-dir', this.downloadDir,
            ];

            console.log(`[LOG][OJV] 下載: ${filename}`);
            const proc = spawn('N_m3u8DL-RE', args, { stdio: 'inherit' });

            proc.on('close', (code) => {
                resolve(code === 0);
            });

            proc.on('error', (err) => {
                console.error(`[ERROR][OJV] N_m3u8DL-RE 啟動失敗: ${err.message}`);
                resolve(false);
            });
        });
    }

    async _crawlSite(siteConf, progressCallback) {
        this._ensureCookies();
        const cookie = this.cookies[siteConf.cookieKey];
        const results = [];
        let page = 1;
        let stopped = false;

        while (!stopped) {
            const listUrl = page === 1
                ? `${siteConf.baseUrl}${siteConf.listPath}`
                : `${siteConf.baseUrl}${siteConf.listPath}?page=${page}`;

            const listReferer = page === 1
                ? siteConf.listFirstReferer
                : `${siteConf.baseUrl}${siteConf.listPath}`;

            console.log(`[LOG][OJV][${siteConf.key}] 列表頁 ${page}: ${listUrl}`);

            if (page > 1) await sleep(this._getDelay());

            let res;
            try {
                res = await this._retry(() => this._fetch(listUrl, {
                    userAgent: siteConf.ua,
                    cookie,
                    referer: listReferer,
                }));
            } catch (err) {
                console.error(`[ERROR][OJV][${siteConf.key}] 列表頁請求失敗: ${err.message}`);
                break;
            }

            const $ = cheerio.load(res.text);
            const items = [];

            $('ul.list--contents li a').each((_, a) => {
                const href = $(a).attr('href');
                if (!href) return;
                const $li = $(a).closest('li');
                const date = ($li.find('.date').text() || '').trim();
                const title = ($li.find('.tit').text() || '').trim();
                const detailUrl = new URL(href, siteConf.baseUrl).href;
                items.push({ detailUrl, date, title, listUrl });
            });

            if (items.length === 0) {
                console.log(`[LOG][OJV][${siteConf.key}] 第 ${page} 頁無項目，結束`);
                break;
            }

            for (const item of items) {
                if (this.downloadCache.ojHasDownloaded(item.detailUrl)) {
                    console.log(`[LOG][OJV][${siteConf.key}] 已下載過: ${item.title}，停止爬取`);
                    stopped = true;
                    break;
                }

                console.log(`[LOG][OJV][${siteConf.key}] 處理: ${item.title} (${item.date})`);
                if (progressCallback) progressCallback(item.title);

                await sleep(this._getDelay());
                const ok = await this._processVideo(item, siteConf, cookie);
                results.push({ title: item.title, date: item.date, success: ok });

                if (ok) {
                    this.downloadCache.ojRecordDownload(siteConf.key, item.detailUrl, item.title, item.date);
                }

                await sleep(this._getDelay());
            }

            const hasNext = $('li.pager__item--older a').length > 0;
            if (!hasNext || stopped) break;
            page++;
        }

        return results;
    }

    async _processVideo(item, siteConf, cookie) {
        // 1. Fetch detail page
        let detailRes;
        try {
            detailRes = await this._retry(() => this._fetch(item.detailUrl, {
                userAgent: siteConf.ua,
                cookie,
                referer: item.listUrl,
            }));
        } catch (err) {
            console.error(`[ERROR][OJV][${siteConf.key}] detail 頁失敗 ${item.detailUrl}: ${err.message}`);
            return false;
        }

        // 單一網址模式：列表頁沒給 title/date，從 detail 頁解析
        if (!item.title) {
            const $ = cheerio.load(detailRes.text);
            item.title = ($('.section--detail .tit').first().text() || '').trim();
            if (!item.date) {
                item.date = ($('.section--detail .date').first().text() || '').trim();
            }
        }

        // Extract video ID from URL
        const idMatch = item.detailUrl.match(/\/movies\/detail\/(\d+)/);
        if (!idMatch) {
            console.error(`[ERROR][OJV][${siteConf.key}] 無法解析 ID: ${item.detailUrl}`);
            return false;
        }

        const videoId = idMatch[1];
        const playUrl = `${siteConf.baseUrl}/movies/detail/play/${videoId}`;

        await sleep(this._getDelay());

        // 2. Fetch play URL → M3U8 master playlist
        let playRes;
        try {
            playRes = await this._retry(() => this._fetch(playUrl, {
                userAgent: siteConf.ua,
                cookie,
                referer: item.detailUrl,
                accept: '*/*',
                isPlay: true,
            }));
        } catch (err) {
            console.error(`[ERROR][OJV][${siteConf.key}] play URL 失敗 ${playUrl}: ${err.message}`);
            return false;
        }

        // 3. Parse best stream URL
        const bestUrl = this._parseBestM3u8(playRes.text);
        if (!bestUrl) {
            console.error(`[ERROR][OJV][${siteConf.key}] 無法解析 M3U8，回應:\n${playRes.text.substring(0, 300)}`);
            return false;
        }

        // 4. Download（OJM 來源在檔名結尾加上 _m 標示出處）
        const baseName = item.title
            ? this._buildFilename(item.date, item.title)
            : videoId;
        const filename = siteConf.key === OJM_SITE.key ? `${baseName}_m` : baseName;
        const dlReferer = siteConf.dlReferer(item.detailUrl);

        return await this._runN_m3u8DL_RE(bestUrl, filename, siteConf.ua, dlReferer);
    }

    /**
     * 依網址 hostname 判斷對應站點設定
     * @returns {Object|null} OJ_SITE / OJM_SITE 或 null
     */
    _siteForUrl(url) {
        let host;
        try {
            host = new URL(url).hostname;
        } catch (e) {
            return null;
        }
        if (host.includes('sp.twicejapan.com')) return OJM_SITE;
        if (host.includes('oncejapan.com')) return OJ_SITE;
        return null;
    }

    /**
     * 單一網址下載：只下載指定的 detail 網址，不寫入 DB
     * title/date 由 detail 頁解析，解析不到時以影片 ID 當檔名
     * @param {string} detailUrl
     * @param {Function} progressCallback
     */
    async runSingle(detailUrl, progressCallback) {
        this._ensureCookies();

        const siteConf = this._siteForUrl(detailUrl);
        if (!siteConf) {
            throw new Error(`無法判斷站點（僅支援 oncejapan.com / sp.twicejapan.com）: ${detailUrl}`);
        }

        console.log(`[LOG][OJV] === 單一影片下載（不寫入 DB）: ${detailUrl} ===`);

        const cookie = this.cookies[siteConf.cookieKey];
        const item = {
            detailUrl,
            date: '',
            title: '',
            listUrl: `${siteConf.baseUrl}${siteConf.listPath}`,
        };

        if (progressCallback) progressCallback(detailUrl);
        const ok = await this._processVideo(item, siteConf, cookie);
        if (progressCallback && item.title) progressCallback(item.title);

        const siteLabel = siteConf.key === OJM_SITE.key ? 'OJM' : 'OJ';
        return [{ site: siteLabel, results: [{ title: item.title || detailUrl, date: item.date, success: ok }] }];
    }

    async run(progressCallback) {
        const allResults = [];

        console.log('[LOG][OJV] === 開始 OJ 影片下載 ===');
        const ojResults = await this._crawlSite(OJ_SITE, progressCallback);
        allResults.push({ site: 'OJ', results: ojResults });

        await sleep(this._getDelay());

        console.log('[LOG][OJV] === 開始 OJM 影片下載 ===');
        const ojmResults = await this._crawlSite(OJM_SITE, progressCallback);
        allResults.push({ site: 'OJM', results: ojmResults });

        return allResults;
    }

    formatResults(allResults) {
        const lines = ['📽️ OJ 影片下載完成'];

        for (const { site, results } of allResults) {
            if (results.length === 0) {
                lines.push(`\n[${site}] 無新影片`);
                continue;
            }

            const succeeded = results.filter(r => r.success);
            const failed = results.filter(r => !r.success);
            lines.push(`\n[${site}] 成功 ${succeeded.length} 部，失敗 ${failed.length} 部`);

            for (const r of succeeded) {
                const datePart = r.date.replace(/\./g, '').slice(-6);
                lines.push(`✅ ${datePart} ${r.title}`);
            }
            for (const r of failed) {
                const datePart = r.date.replace(/\./g, '').slice(-6);
                lines.push(`❌ ${datePart} ${r.title}`);
            }
        }

        return lines.join('\n');
    }
}

module.exports = OjVideoDownloader;
