const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const cheerio = require('cheerio');
const FirefoxCookies = require('./firefoxCookies');
const { sleep } = require('./utils');

const BASE_DIR = 'E:\\AndrewWang\\00\\Celeb\\tmp\\IG & Offical\\__ONCE JAPAN';

const SITES = {
    W_MEMBER: 'w_member',
    OJ_GALLERY: 'oj_gallery',
    OJ_BLOG: 'oj_blog',
    OJ_MOBILE: 'oj_mobile',
};

const SITE_LABELS = {
    [SITES.W_MEMBER]: 'ONCE W MEMBER',
    [SITES.OJ_GALLERY]: 'ONCE JAPAN Gallery',
    [SITES.OJ_BLOG]: 'ONCE JAPAN Blog',
    [SITES.OJ_MOBILE]: 'ONCE JAPAN MOBILE',
};

const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0';
const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 11; SAMSUNG SM-G973U) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/14.2 Chrome/146.0.0.0 Mobile Safari/537.36';

/**
 * ONCE JAPAN 全站圖片自動下載器
 */
class OnceJapanDownloader {
    constructor(downloadCache, baseDir = BASE_DIR) {
        this.downloadCache = downloadCache;
        this.baseDir = baseDir;
        this.firefoxCookies = new FirefoxCookies();
        this.cookies = null;
    }

    /**
     * 取得隨機延遲 (2-5 秒)
     */
    _getDelay() {
        return 2000 + Math.random() * 3000;
    }

    /**
     * 清理標題中不合法的檔案名稱字元
     */
    _sanitizeTitle(title) {
        return title
            .replace(/[\/\\:*?"<>|]/g, '_')
            .replace(/[\u2018\u2019\u201C\u201D]/g, "'")  // 智慧引號 → 直引號
            .replace(/[\uFF01\uFF1F]/g, '')               // 全形！？
            .replace(/[\x00-\x1F\x7F]/g, '')              // 控制字元
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/\.+$/, '');                          // 結尾的點
    }

    /**
     * 重試包裝器
     */
    async _retry(fn, maxRetries = 3) {
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (err) {
                if (attempt === maxRetries) throw err;
                const delay = 2000 * attempt;
                console.log(`[LOG][OJ] 重試 ${attempt}/${maxRetries}，等待 ${delay}ms... (${err.message})`);
                await sleep(delay);
            }
        }
    }

    /**
     * HTTP GET request（回傳 Buffer 或 string）
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
                'Upgrade-Insecure-Requests': '1',
                'Sec-Fetch-Dest': 'document',
                'Sec-Fetch-Mode': 'navigate',
                'Sec-Fetch-Site': options.referer ? 'same-origin' : 'none',
                'Sec-Fetch-User': '?1',
            };

            if (options.cookie) headers['Cookie'] = options.cookie;
            if (options.referer) headers['Referer'] = options.referer;
            if (options.acceptImage) {
                headers['Accept'] = 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8';
                headers['Sec-Fetch-Dest'] = 'image';
                headers['Sec-Fetch-Mode'] = 'no-cors';
                delete headers['Sec-Fetch-User'];
                delete headers['Upgrade-Insecure-Requests'];
            }

            const req = mod.get({
                hostname: parsedUrl.hostname,
                path: parsedUrl.pathname + parsedUrl.search,
                headers,
                timeout: 30000,
            }, (res) => {
                // Follow redirects
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
                    const contentType = res.headers['content-type'] || '';
                    resolve({
                        buffer: buf,
                        text: contentType.includes('image') ? null : buf.toString('utf-8'),
                        contentType,
                        headers: res.headers,
                    });
                });
            });

            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout: ${url}`)); });
        });
    }

    /**
     * 下載檔案到本地
     */
    async _downloadFile(url, savePath, options = {}) {
        try {
            return await this._retry(async () => {
                const dir = path.dirname(savePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }

                const res = await this._fetch(url, { ...options, acceptImage: true });
                fs.writeFileSync(savePath, res.buffer);
                console.log(`[LOG][OJ] 已下載: ${path.basename(savePath)}`);
                return savePath;
            });
        } catch (err) {
            console.error(`[ERROR][OJ] 下載失敗 ${url}: ${err.message}`);
            return null;
        }
    }

    /**
     * 確保 cookies 已載入
     */
    _ensureCookies() {
        if (!this.cookies) {
            this.cookies = this.firefoxCookies.getAllOjCookies();
        }
    }

    // ========================================
    // Site 1: W MEMBER (www.w.oncejapan.com)
    // ========================================

    async _crawlWMember(progressCallback) {
        this._ensureCookies();
        const siteKey = SITES.W_MEMBER;
        const cookie = this.cookies.wMember;
        const baseUrl = 'https://www.w.oncejapan.com';
        const results = [];
        let page = 1;
        let stopped = false;

        while (!stopped) {
            const listUrl = page === 1 ? `${baseUrl}/photo/` : `${baseUrl}/photo/?page=${page}`;
            console.log(`[LOG][OJ][W_MEMBER] 爬取列表頁 ${page}: ${listUrl}`);

            await sleep(this._getDelay());
            let res;
            try {
                res = await this._fetch(listUrl, { cookie, referer: baseUrl + '/' });
            } catch (err) {
                console.error(`[ERROR][OJ][W_MEMBER] 列表頁請求失敗: ${err.message}`);
                break;
            }

            const $ = cheerio.load(res.text);
            const items = [];

            $('ul.list--contents.photo li').each((_, li) => {
                const $li = $(li);
                const href = $li.find('a').attr('href');
                if (!href) return;
                const date = ($li.find('.date').text() || '').trim();
                const title = ($li.find('.tit').text() || '').trim();
                const detailUrl = new URL(href, listUrl).href;
                items.push({ detailUrl, date, title });
            });

            if (items.length === 0) {
                console.log(`[LOG][OJ][W_MEMBER] 第 ${page} 頁沒有項目，結束`);
                break;
            }

            for (const item of items) {
                if (this.downloadCache.ojHasDownloaded(item.detailUrl)) {
                    console.log(`[LOG][OJ][W_MEMBER] 已下載過: ${item.title}，停止爬取`);
                    stopped = true;
                    break;
                }

                const downloaded = await this._downloadWMemberDetail(item, cookie, baseUrl);
                if (downloaded > 0) {
                    results.push({ title: item.title, date: item.date, count: downloaded });
                    this.downloadCache.ojRecordDownload(siteKey, item.detailUrl, item.title, item.date);
                    if (progressCallback) progressCallback(siteKey, item.title, downloaded);
                }
            }

            // 檢查是否有下一頁
            const hasNext = $('a.pagenation__next').length > 0
                || $('li.pager__item--older a').length > 0;
            if (!hasNext || stopped) break;
            page++;
        }

        return results;
    }

    async _downloadWMemberDetail(item, cookie, baseUrl) {
        console.log(`[LOG][OJ][W_MEMBER] 爬取: ${item.title}`);
        await sleep(this._getDelay());

        let res;
        try {
            res = await this._fetch(item.detailUrl, { cookie, referer: baseUrl + '/photo/' });
        } catch (err) {
            console.error(`[ERROR][OJ][W_MEMBER] 詳情頁失敗: ${err.message}`);
            return 0;
        }

        const $ = cheerio.load(res.text);
        const imageIds = [];

        $('a.photo-image').each((_, a) => {
            const href = $(a).attr('href');
            if (href) {
                const match = href.match(/images_id=(\d+)/);
                if (match) imageIds.push(match[1]);
            }
        });

        if (imageIds.length === 0) return 0;

        const dateStr = (item.date || '').replace(/\./g, '');
        const shortDate = dateStr.length === 8 ? dateStr.slice(2) : dateStr;
        const folderName = this._sanitizeTitle(shortDate ? `${shortDate} ${item.title}` : item.title);
        const saveDir = path.join(this.baseDir, folderName);
        let downloaded = 0;

        for (const imgId of imageIds) {
            const imgUrl = `${baseUrl}/photo/image.php?images_id=${imgId}`;
            await sleep(this._getDelay());

            try {
                await this._retry(async () => {
                    const imgRes = await this._fetch(imgUrl, {
                        cookie,
                        referer: item.detailUrl,
                        acceptImage: true,
                    });

                    // 判斷回傳的是圖片還是 HTML
                    const ct = imgRes.contentType || '';
                    if (ct.includes('image')) {
                        const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : 'jpeg';
                        const savePath = path.join(saveDir, `${imgId}_image.${ext}`);
                        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
                        fs.writeFileSync(savePath, imgRes.buffer);
                        console.log(`[LOG][OJ][W_MEMBER] 已下載: ${imgId}_image.${ext}`);
                        downloaded++;
                    } else {
                        // HTML 包裝頁，解析出真正的圖片 URL
                        const $img = cheerio.load(imgRes.buffer.toString('utf-8'));
                        const realSrc = $img('img').attr('src') || $img('img').attr('data-src');
                        if (realSrc) {
                            const realUrl = new URL(realSrc, imgUrl).href;
                            const ext = path.extname(new URL(realUrl).pathname).replace('.', '') || 'jpeg';
                            const filename = path.basename(new URL(realUrl).pathname);
                            const savePath = path.join(saveDir, `${imgId}_${filename}`);
                            await this._downloadFile(realUrl, savePath, { cookie, referer: imgUrl });
                            downloaded++;
                        }
                    }
                });
            } catch (err) {
                console.error(`[ERROR][OJ][W_MEMBER] 圖片下載失敗 ${imgId} (重試後仍失敗): ${err.message}`);
            }
        }

        return downloaded;
    }

    // ========================================
    // Site 2: OJ Gallery (oncejapan.com)
    // ========================================

    async _crawlOjGallery(progressCallback) {
        this._ensureCookies();
        const siteKey = SITES.OJ_GALLERY;
        const cookie = this.cookies.onceJapan;
        const baseUrl = 'https://oncejapan.com';
        const results = [];
        let page = 1;
        let stopped = false;

        while (!stopped) {
            const listUrl = page === 1
                ? `${baseUrl}/photo/list/10`
                : `${baseUrl}/photo/list/10?page=${page}`;
            console.log(`[LOG][OJ][OJ_GALLERY] 爬取列表頁 ${page}: ${listUrl}`);

            await sleep(this._getDelay());
            let res;
            try {
                res = await this._fetch(listUrl, { cookie, referer: baseUrl + '/' });
            } catch (err) {
                console.error(`[ERROR][OJ][OJ_GALLERY] 列表頁失敗: ${err.message}`);
                break;
            }

            const $ = cheerio.load(res.text);
            const items = [];

            $('ul.list--contents li.list--item__gallery, ul.list--contents li[id]').each((_, li) => {
                const $li = $(li);
                const href = $li.find('a').attr('href');
                if (!href || href.includes('javascript')) return;
                const date = ($li.find('.date').text() || '').trim();
                const title = ($li.find('.tit').text() || '').trim();
                const detailUrl = new URL(href, listUrl).href;
                items.push({ detailUrl, date, title });
            });

            if (items.length === 0) {
                console.log(`[LOG][OJ][OJ_GALLERY] 第 ${page} 頁沒有項目，結束`);
                break;
            }

            for (const item of items) {
                if (this.downloadCache.ojHasDownloaded(item.detailUrl)) {
                    console.log(`[LOG][OJ][OJ_GALLERY] 已下載過: ${item.title}，停止爬取`);
                    stopped = true;
                    break;
                }

                const downloaded = await this._downloadOjGalleryDetail(item, cookie, baseUrl);
                if (downloaded > 0) {
                    results.push({ title: item.title, date: item.date, count: downloaded });
                    this.downloadCache.ojRecordDownload(siteKey, item.detailUrl, item.title, item.date);
                    if (progressCallback) progressCallback(siteKey, item.title, downloaded);
                }
            }

            const hasNext = $('li.pager__item--older a').length > 0;
            if (!hasNext || stopped) break;
            page++;
        }

        return results;
    }

    async _downloadOjGalleryDetail(item, cookie, baseUrl) {
        console.log(`[LOG][OJ][OJ_GALLERY] 爬取: ${item.title}`);
        await sleep(this._getDelay());

        let res;
        try {
            res = await this._fetch(item.detailUrl, { cookie, referer: baseUrl + '/photo/list/10' });
        } catch (err) {
            console.error(`[ERROR][OJ][OJ_GALLERY] 詳情頁失敗: ${err.message}`);
            return 0;
        }

        const $ = cheerio.load(res.text);
        const imageLinks = [];

        $('a.photo-image').each((_, a) => {
            const href = $(a).attr('href');
            if (href) {
                imageLinks.push(new URL(href, item.detailUrl).href);
            }
        });

        if (imageLinks.length === 0) return 0;

        const dateStr = (item.date || '').replace(/\./g, '').replace(/\s/g, '');
        const shortDate = dateStr.length === 8 ? dateStr.slice(2) : dateStr;
        const folderName = this._sanitizeTitle(shortDate ? `${shortDate} ${item.title}` : item.title);
        const saveDir = path.join(this.baseDir, folderName);
        let downloaded = 0;

        for (const imgUrl of imageLinks) {
            await sleep(this._getDelay());

            const urlPath = new URL(imgUrl).pathname;
            const imgId = path.basename(urlPath, path.extname(urlPath));
            const ext = path.extname(urlPath).replace('.', '') || 'jpg';
            const savePath = path.join(saveDir, `${imgId}.${ext}`);

            const result = await this._downloadFile(imgUrl, savePath, {
                cookie,
                referer: item.detailUrl,
            });
            if (result) downloaded++;
        }

        return downloaded;
    }

    // ========================================
    // Site 3: OJ Blog (oncejapan.com)
    // ========================================

    async _crawlOjBlog(progressCallback) {
        this._ensureCookies();
        const siteKey = SITES.OJ_BLOG;
        const cookie = this.cookies.onceJapan;
        const baseUrl = 'https://oncejapan.com';
        const results = [];
        let page = 1;
        let stopped = false;

        while (!stopped) {
            const listUrl = page === 1
                ? `${baseUrl}/blog/twice/list`
                : `${baseUrl}/blog/twice/list?page=${page}`;
            console.log(`[LOG][OJ][OJ_BLOG] 爬取列表頁 ${page}: ${listUrl}`);

            await sleep(this._getDelay());
            let res;
            try {
                res = await this._fetch(listUrl, { cookie, referer: baseUrl + '/' });
            } catch (err) {
                console.error(`[ERROR][OJ][OJ_BLOG] 列表頁失敗: ${err.message}`);
                break;
            }

            const $ = cheerio.load(res.text);
            const items = [];

            $('ul.list--contents.list--blog li.list__item').each((_, li) => {
                const $li = $(li);
                const href = $li.find('a').attr('href');
                if (!href || href.includes('javascript')) return;
                const date = ($li.find('.date').text() || '').trim();
                const title = ($li.find('.tit').text() || '').trim();
                const detailUrl = new URL(href, listUrl).href;
                items.push({ detailUrl, date, title });
            });

            if (items.length === 0) {
                console.log(`[LOG][OJ][OJ_BLOG] 第 ${page} 頁沒有項目，結束`);
                break;
            }

            for (const item of items) {
                if (this.downloadCache.ojHasDownloaded(item.detailUrl)) {
                    console.log(`[LOG][OJ][OJ_BLOG] 已下載過: ${item.title}，停止爬取`);
                    stopped = true;
                    break;
                }

                const downloaded = await this._downloadOjBlogDetail(item, cookie, baseUrl);
                if (downloaded > 0) {
                    results.push({ title: item.title, date: item.date, count: downloaded });
                    this.downloadCache.ojRecordDownload(siteKey, item.detailUrl, item.title, item.date);
                    if (progressCallback) progressCallback(siteKey, item.title, downloaded);
                }
            }

            const hasNext = $('li.pager__item--older a').length > 0;
            if (!hasNext || stopped) break;
            page++;
        }

        return results;
    }

    async _downloadOjBlogDetail(item, cookie, baseUrl) {
        console.log(`[LOG][OJ][OJ_BLOG] 爬取: ${item.title}`);
        await sleep(this._getDelay());

        let res;
        try {
            res = await this._fetch(item.detailUrl, { cookie, referer: baseUrl + '/blog/twice/list' });
        } catch (err) {
            console.error(`[ERROR][OJ][OJ_BLOG] 詳情頁失敗: ${err.message}`);
            return 0;
        }

        const $ = cheerio.load(res.text);
        const imageUrls = [];

        // Blog 文章中的圖片 — img 標籤，src 指向 S3 的圖片
        $('section.section--detail .txt img, section.section--detail .section--inner img').each((_, img) => {
            const src = $(img).attr('src');
            if (src && /\.(jpe?g|png|gif|webp)/i.test(src) && !src.includes('dummy.gif')) {
                imageUrls.push(src);
            }
        });

        if (imageUrls.length === 0) return 0;

        const dateStr = (item.date || '').replace(/\./g, '').replace(/\s/g, '');
        const shortDate = dateStr.length === 8 ? dateStr.slice(2) : dateStr;
        const folderName = this._sanitizeTitle(shortDate ? `${shortDate} ${item.title}` : item.title);
        const saveDir = path.join(this.baseDir, folderName);
        let downloaded = 0;

        for (let i = 0; i < imageUrls.length; i++) {
            const imgUrl = imageUrls[i];
            await sleep(this._getDelay());

            const urlPath = new URL(imgUrl).pathname;
            const filename = path.basename(urlPath);
            const savePath = path.join(saveDir, `${i + 1}_${filename}`);

            const result = await this._downloadFile(imgUrl, savePath, {
                referer: item.detailUrl,
            });
            if (result) downloaded++;
        }

        return downloaded;
    }

    // ========================================
    // Site 4: OJ MOBILE (sp.twicejapan.com)
    // ========================================

    async _crawlOjMobile(progressCallback) {
        this._ensureCookies();
        const siteKey = SITES.OJ_MOBILE;
        const cookie = this.cookies.spTwice;
        const baseUrl = 'https://sp.twicejapan.com';
        const results = [];
        let page = 1;
        let stopped = false;

        while (!stopped) {
            const listUrl = page === 1
                ? `${baseUrl}/photo/list/7`
                : `${baseUrl}/photo/list/7?page=${page}`;
            console.log(`[LOG][OJ][OJ_MOBILE] 爬取列表頁 ${page}: ${listUrl}`);

            await sleep(this._getDelay());
            let res;
            try {
                res = await this._fetch(listUrl, {
                    cookie,
                    referer: baseUrl + '/',
                    userAgent: UA_MOBILE,
                });
            } catch (err) {
                console.error(`[ERROR][OJ][OJ_MOBILE] 列表頁失敗: ${err.message}`);
                break;
            }

            const $ = cheerio.load(res.text);
            const items = [];

            $('ul.list--contents li').each((_, li) => {
                const $li = $(li);
                const href = $li.find('a').attr('href');
                if (!href || href.includes('javascript')) return;
                const title = ($li.find('.tit').text() || '').trim();
                const detailUrl = new URL(href, listUrl).href;
                items.push({ detailUrl, date: '', title });
            });

            if (items.length === 0) {
                console.log(`[LOG][OJ][OJ_MOBILE] 第 ${page} 頁沒有項目，結束`);
                break;
            }

            for (const item of items) {
                if (this.downloadCache.ojHasDownloaded(item.detailUrl)) {
                    console.log(`[LOG][OJ][OJ_MOBILE] 已下載過: ${item.title}，停止爬取`);
                    stopped = true;
                    break;
                }

                const downloaded = await this._downloadOjMobileDetail(item, cookie, baseUrl);
                if (downloaded > 0) {
                    results.push({ title: item.title, date: '', count: downloaded });
                    this.downloadCache.ojRecordDownload(siteKey, item.detailUrl, item.title, '');
                    if (progressCallback) progressCallback(siteKey, item.title, downloaded);
                }
            }

            const hasNext = $('li.pager__item--older a').length > 0;
            if (!hasNext || stopped) break;
            page++;
        }

        return results;
    }

    async _downloadOjMobileDetail(item, cookie, baseUrl) {
        console.log(`[LOG][OJ][OJ_MOBILE] 爬取: ${item.title}`);
        await sleep(this._getDelay());

        let res;
        try {
            res = await this._fetch(item.detailUrl, {
                cookie,
                referer: baseUrl + '/photo/list/7',
                userAgent: UA_MOBILE,
            });
        } catch (err) {
            console.error(`[ERROR][OJ][OJ_MOBILE] 詳情頁失敗: ${err.message}`);
            return 0;
        }

        const $ = cheerio.load(res.text);
        const imageLinks = [];

        $('a.photo-image').each((_, a) => {
            const href = $(a).attr('href');
            if (href) {
                imageLinks.push(new URL(href, item.detailUrl).href);
            }
        });

        if (imageLinks.length === 0) return 0;

        const folderName = this._sanitizeTitle(item.title);
        const saveDir = path.join(this.baseDir, folderName);
        let downloaded = 0;

        for (const imgUrl of imageLinks) {
            await sleep(this._getDelay());

            // /photo/image/1452 → 取得圖片二進位
            const urlPath = new URL(imgUrl).pathname;
            const imgId = path.basename(urlPath);

            try {
                await this._retry(async () => {
                    const imgRes = await this._fetch(imgUrl, {
                        cookie,
                        referer: item.detailUrl,
                        userAgent: UA_MOBILE,
                        acceptImage: true,
                    });

                    const ct = imgRes.contentType || '';
                    if (ct.includes('image')) {
                        const ext = ct.includes('png') ? 'png' : ct.includes('gif') ? 'gif' : 'jpeg';
                        const savePath = path.join(saveDir, `${imgId}_image.${ext}`);
                        if (!fs.existsSync(saveDir)) fs.mkdirSync(saveDir, { recursive: true });
                        fs.writeFileSync(savePath, imgRes.buffer);
                        console.log(`[LOG][OJ][OJ_MOBILE] 已下載: ${imgId}_image.${ext}`);
                        downloaded++;
                    } else {
                        // HTML 包裝，解析出實際圖片
                        const $img = cheerio.load(imgRes.buffer.toString('utf-8'));
                        const realSrc = $img('img').attr('src') || $img('img').attr('data-src');
                        if (realSrc && !realSrc.includes('dummy.gif')) {
                            const realUrl = new URL(realSrc, imgUrl).href;
                            const filename = path.basename(new URL(realUrl).pathname);
                            const savePath = path.join(saveDir, `${imgId}_${filename}`);
                            await this._downloadFile(realUrl, savePath, {
                                cookie,
                                referer: imgUrl,
                                userAgent: UA_MOBILE,
                            });
                            downloaded++;
                        }
                    }
                });
            } catch (err) {
                console.error(`[ERROR][OJ][OJ_MOBILE] 圖片下載失敗 ${imgId} (重試後仍失敗): ${err.message}`);
            }
        }

        return downloaded;
    }

    // ========================================
    // Public API
    // ========================================

    /**
     * 爬取所有站點
     * @param {Function} progressCallback - 進度回呼 (siteKey, title, imageCount)
     * @returns {Promise<Object>} 各站結果
     */
    async crawlAll(progressCallback) {
        // 重新取得 cookies（每次執行都重新抓）
        this.cookies = null;
        this._ensureCookies();

        const allResults = {};

        console.log('[LOG][OJ] ===== 開始爬取 ONCE JAPAN 全站 =====');

        try {
            console.log('[LOG][OJ] --- Site 1: W MEMBER ---');
            allResults[SITES.W_MEMBER] = await this._crawlWMember(progressCallback);
        } catch (err) {
            console.error(`[ERROR][OJ] W_MEMBER 爬取失敗: ${err.message}`);
            allResults[SITES.W_MEMBER] = [];
        }

        try {
            console.log('[LOG][OJ] --- Site 2: OJ Gallery ---');
            allResults[SITES.OJ_GALLERY] = await this._crawlOjGallery(progressCallback);
        } catch (err) {
            console.error(`[ERROR][OJ] OJ_GALLERY 爬取失敗: ${err.message}`);
            allResults[SITES.OJ_GALLERY] = [];
        }

        try {
            console.log('[LOG][OJ] --- Site 3: OJ Blog ---');
            allResults[SITES.OJ_BLOG] = await this._crawlOjBlog(progressCallback);
        } catch (err) {
            console.error(`[ERROR][OJ] OJ_BLOG 爬取失敗: ${err.message}`);
            allResults[SITES.OJ_BLOG] = [];
        }

        try {
            console.log('[LOG][OJ] --- Site 4: OJ MOBILE ---');
            allResults[SITES.OJ_MOBILE] = await this._crawlOjMobile(progressCallback);
        } catch (err) {
            console.error(`[ERROR][OJ] OJ_MOBILE 爬取失敗: ${err.message}`);
            allResults[SITES.OJ_MOBILE] = [];
        }

        console.log('[LOG][OJ] ===== ONCE JAPAN 全站爬取完成 =====');
        return allResults;
    }

    /**
     * 測試模式：每個站點只下載最新一篇，不寫入 DB
     * @param {Function} progressCallback
     * @returns {Promise<Object>}
     */
    async crawlTest(progressCallback) {
        this.cookies = null;
        this._ensureCookies();

        const allResults = {};
        console.log('[LOG][OJ] ===== 測試模式：每站只下載一篇 =====');

        // Helper：從列表頁取第一篇並呼叫對應的 detail 下載方法
        const fetchFirstItem = async (listUrl, parseItems, downloadDetail, siteKey, cookie, baseUrl, ua) => {
            await sleep(this._getDelay());
            let res;
            try {
                res = await this._fetch(listUrl, { cookie, referer: baseUrl + '/', userAgent: ua });
            } catch (err) {
                console.error(`[ERROR][OJ][TEST][${siteKey}] 列表頁失敗: ${err.message}`);
                return [];
            }
            const $ = cheerio.load(res.text);
            const items = parseItems($, listUrl);
            if (items.length === 0) {
                console.log(`[LOG][OJ][TEST][${siteKey}] 沒有找到任何項目`);
                return [];
            }
            const item = items[0];
            console.log(`[LOG][OJ][TEST][${siteKey}] 僅下載第一篇: ${item.title}`);
            const downloaded = await downloadDetail(item);
            if (downloaded > 0) {
                if (progressCallback) progressCallback(siteKey, item.title, downloaded);
                return [{ title: item.title, date: item.date || '', count: downloaded }];
            }
            return [];
        };

        // W MEMBER
        try {
            const cookie = this.cookies.wMember;
            const baseUrl = 'https://www.w.oncejapan.com';
            allResults[SITES.W_MEMBER] = await fetchFirstItem(
                `${baseUrl}/photo/`,
                ($, listUrl) => {
                    const items = [];
                    $('ul.list--contents.photo li').each((_, li) => {
                        const $li = $(li);
                        const href = $li.find('a').attr('href');
                        if (!href) return;
                        items.push({
                            detailUrl: new URL(href, listUrl).href,
                            date: ($li.find('.date').text() || '').trim(),
                            title: ($li.find('.tit').text() || '').trim(),
                        });
                    });
                    return items;
                },
                (item) => this._downloadWMemberDetail(item, cookie, baseUrl),
                SITES.W_MEMBER, cookie, baseUrl, UA_DESKTOP
            );
        } catch (err) {
            console.error(`[ERROR][OJ][TEST] W_MEMBER: ${err.message}`);
            allResults[SITES.W_MEMBER] = [];
        }

        // OJ Gallery
        try {
            const cookie = this.cookies.onceJapan;
            const baseUrl = 'https://oncejapan.com';
            allResults[SITES.OJ_GALLERY] = await fetchFirstItem(
                `${baseUrl}/photo/list/10`,
                ($, listUrl) => {
                    const items = [];
                    $('ul.list--contents li.list--item__gallery, ul.list--contents li[id]').each((_, li) => {
                        const $li = $(li);
                        const href = $li.find('a').attr('href');
                        if (!href || href.includes('javascript')) return;
                        items.push({
                            detailUrl: new URL(href, listUrl).href,
                            date: ($li.find('.date').text() || '').trim(),
                            title: ($li.find('.tit').text() || '').trim(),
                        });
                    });
                    return items;
                },
                (item) => this._downloadOjGalleryDetail(item, cookie, baseUrl),
                SITES.OJ_GALLERY, cookie, baseUrl, UA_DESKTOP
            );
        } catch (err) {
            console.error(`[ERROR][OJ][TEST] OJ_GALLERY: ${err.message}`);
            allResults[SITES.OJ_GALLERY] = [];
        }

        // OJ Blog
        try {
            const cookie = this.cookies.onceJapan;
            const baseUrl = 'https://oncejapan.com';
            allResults[SITES.OJ_BLOG] = await fetchFirstItem(
                `${baseUrl}/blog/twice/list`,
                ($, listUrl) => {
                    const items = [];
                    $('ul.list--contents.list--blog li.list__item').each((_, li) => {
                        const $li = $(li);
                        const href = $li.find('a').attr('href');
                        if (!href || href.includes('javascript')) return;
                        items.push({
                            detailUrl: new URL(href, listUrl).href,
                            date: ($li.find('.date').text() || '').trim(),
                            title: ($li.find('.tit').text() || '').trim(),
                        });
                    });
                    return items;
                },
                (item) => this._downloadOjBlogDetail(item, cookie, baseUrl),
                SITES.OJ_BLOG, cookie, baseUrl, UA_DESKTOP
            );
        } catch (err) {
            console.error(`[ERROR][OJ][TEST] OJ_BLOG: ${err.message}`);
            allResults[SITES.OJ_BLOG] = [];
        }

        // OJ MOBILE
        try {
            const cookie = this.cookies.spTwice;
            const baseUrl = 'https://sp.twicejapan.com';
            allResults[SITES.OJ_MOBILE] = await fetchFirstItem(
                `${baseUrl}/photo/list/7`,
                ($, listUrl) => {
                    const items = [];
                    $('ul.list--contents li').each((_, li) => {
                        const $li = $(li);
                        const href = $li.find('a').attr('href');
                        if (!href || href.includes('javascript')) return;
                        items.push({
                            detailUrl: new URL(href, listUrl).href,
                            date: '',
                            title: ($li.find('.tit').text() || '').trim(),
                        });
                    });
                    return items;
                },
                (item) => this._downloadOjMobileDetail(item, cookie, baseUrl),
                SITES.OJ_MOBILE, cookie, baseUrl, UA_MOBILE
            );
        } catch (err) {
            console.error(`[ERROR][OJ][TEST] OJ_MOBILE: ${err.message}`);
            allResults[SITES.OJ_MOBILE] = [];
        }

        console.log('[LOG][OJ] ===== 測試模式爬取完成 =====');
        return allResults;
    }

    /**
     * 格式化結果為 Telegram 訊息
     */
    formatResults(allResults) {
        let msg = '📸 ONCE JAPAN 下載完成\n\n';
        let totalNew = 0;

        for (const [siteKey, items] of Object.entries(allResults)) {
            const label = SITE_LABELS[siteKey] || siteKey;
            if (items.length === 0) {
                msg += `【${label}】無新內容\n`;
            } else {
                msg += `【${label}】${items.length} 篇新內容:\n`;
                for (const item of items) {
                    msg += `  • ${item.title} (${item.count} 張)\n`;
                    totalNew += item.count;
                }
            }
            msg += '\n';
        }

        msg += `共下載 ${totalNew} 個檔案`;
        return msg;
    }
}

module.exports = OnceJapanDownloader;
