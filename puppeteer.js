const puppeteer = require('puppeteer');
const app = require('express')();
const timerP = require('node:timers/promises');
const insCookies = require('./config.js')[app.get('env')].insCookies;
const storyHomeEnterSelector = `section > main > div > header > div > div`;
// 白條 div，不是外層的 div
const storiesCountClassSelector = 'div > div > div > div > div > div > div > div:nth-child(1) > section > div > div > section > div > header > div:nth-child(1) > div';
const igPauseSelector = `div > div > div > div > div > div > div > div:nth-child(1) > section > div > div > section > div > header > div:nth-child(2) > div:nth-child(2) > div:nth-child(1) > div`;
const nextStorySelector = 'div > div > div > div > div > div > div > div:nth-child(1) > section > div > div > section > div > button:last-of-type';
const storySwitchSelector = 'div > div > div > div > div > div > div > div:nth-child(1) > section > div > div > section > div > button';
const prevStorySelector = 'div > div > div > div > div > div > div > div:nth-child(1) > section > div > div > section > div > button:first-of-type';

const igShareDialog = `div > div > div > div:nth-child(4) > div > div > div > div > div > div > div > div > div > div > div > div > div > div > div:nth-child(1) > button`;
const privateAccSelector = `#react-root > section > main > div > header > div > div > div > button > img`;
const igMetaTitle = "head > meta[property='og:title']";
const userAgent = require('./config.js')[app.get('env')].ua;
const isHeadless = require('./config.js')[app.get('env')].isHeadless;
let browserWSEndpoint = null;
const waitUntilMain = 'networkidle0';
const CACHE = new Map();
const LAUNCH_ARGS = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-infobars',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--no-zygote'
];

async function getStories(url, forceUpdate = false, uid = '') {
    let baseUrl = 'https://www.instagram.com/';
    let userName = url.match(/https:\/\/(?:www\.)?instagram\.com\/(?:stories\/)?([a-zA-Z0-9\.\_]+)/)[1];
    let storyId = (url.match(/https:\/\/(?:www\.)?instagram.com\/stories\/[a-zA-Z0-9\.\_]+\/([0-9]+)/) == null) ? null : url.match(/https:\/\/(?:www\.)?instagram.com\/stories\/[a-zA-Z0-9\.\_]+\/([0-9]+)/)[1];
    let storiesUrl = (storyId == null) ? null : `https://www.instagram.com/stories/${userName}/${storyId}/`;
    let homeUrl = `https://www.instagram.com/${userName}/`;
    let imgUrls = [];

    userName = userName.toLowerCase();

    console.info(`[LOG][PUPPETEER_DEBUG] Cache Start`);
    // get Cache
    if (CACHE.has(homeUrl) || CACHE.has(storiesUrl)) {
        console.info(`[LOG][IG_STORY]Get Story From Cache`);
        let timestamp = Date.now();
        let cache = '';
        let tmpUrl = '';
        if (CACHE.has(storiesUrl)) {
            cache = CACHE.get(storiesUrl);
            tmpUrl = storiesUrl;
        } else {
            cache = CACHE.get(homeUrl);
            tmpUrl = homeUrl;
        }

        // 12 小時直接清 cache
        if (timestamp - cache.time > 12 * 60 * 60 * 1000) {
            console.info(`[LOG][IG_STORY]Cache Outdated, Delete Cache`);
            CACHE.delete(tmpUrl);
        } else if (forceUpdate) {
            // forceupdate 表示 cache 過期
            console.info(`[LOG][IG_STORY]Forceupdate, Delete Cache`);
            CACHE.delete(tmpUrl);
        } else {
            let data = cache.data;
            let result = [];
            if (storiesUrl !== null) {
                if (data[storiesUrl] != undefined && data[storiesUrl] != '') {
                    result.push(data[storiesUrl]);
                    return new Promise(function (resolve, reject) {
                        resolve(result);
                    });
                } else {
                    console.info(`[LOG][IG_STORY]Cache Outdated, Delete Cache`);
                    CACHE.delete(tmpUrl);
                }
            } else {
                for (const key in data) {
                    result.push(data[key]);
                }
                return new Promise(function (resolve, reject) {
                    resolve(result);
                });
            }
        }
    }

    console.info(`[LOG][PUPPETEER_DEBUG] Puppeteer Start`);

    await getBrowser();
    const browser = await puppeteer.connect({ browserWSEndpoint });

    const cookie = {
        name: "sessionid",
        value: insCookies,
        path: "/",
        domain: ".instagram.com",
    };

    const page = await browser.newPage();
    try {
        await page.setCookie(cookie);
        await page.setUserAgent(userAgent);
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.resourceType() === 'image' || request.resourceType() === 'font' || request.resourceType() === 'media') request.abort();
            else request.continue();
        });

        console.info(`[LOG][PUPPETEER_DEBUG] Go to ${homeUrl}`);
        await page.goto(homeUrl, { waitUntil: waitUntilMain });
        if (await page.$(privateAccSelector)) {
            await page.close();
            return new Promise(function (resolve, reject) {
                imgUrls.push(`@${userName} 是私人帳號`);
                resolve(imgUrls);
            });
        }

        console.info(`[LOG][PUPPETEER_DEBUG] Click ${homeUrl}`);
        let countClass = storiesCountClassSelector;
        let nextClass = nextStorySelector;
        let pauseClass = igPauseSelector;
        let homeEnter = storyHomeEnterSelector;
        try {
            await page.click(homeEnter)
                .catch(e => {
                    // puppeteerError(e);
                    throw new Error(`Don't wait`);
                })
                .then(() => page.waitForNavigation({ waitUntil: waitUntilMain }));
        } catch (error) {
            console.log(`[ERROR][IG_STORY][${userName}] Not Found`);
            imgUrls.push(`@${userName} 目前沒有限時動態`);
            return new Promise(function (resolve, reject) {
                resolve(imgUrls);
            });
        }

        console.info(`[LOG][PUPPETEER_DEBUG] Start parsing stories`);
        await page.waitForSelector(pauseClass);
        await page.click(pauseClass);
        await page.waitForSelector(countClass).catch(e => puppeteerError(e));
        let count = await page.$$eval(countClass, div => div.length);
        let errFlag = false;
        let cacheArr = [];
        for (let index = 0; index < count; index++) {
            if (await page.$(igShareDialog) !== null) {
                await Promise.all([
                    page.click(igShareDialog).catch(e => puppeteerError(e)),
                    waitForNetworkIdle(page, 500, 0),
                ]);
                await timerP.setTimeout(1000);
            }

            let switchCount = await page.$$eval(storySwitchSelector, btn => btn.length);
            while (index === 0 && switchCount > 1) {
                if (await page.$(igShareDialog) !== null) {
                    await Promise.all([
                        page.click(igShareDialog).catch(e => puppeteerError(e)),
                        waitForNetworkIdle(page, 500, 0),
                    ]);
                    await timerP.setTimeout(500);
                }

                await Promise.all([
                    page.click(prevStorySelector).catch(e => puppeteerError(e)),
                    waitForNetworkIdle(page, 500, 0),
                ]);
                await timerP.setTimeout(500);

                switchCount = await page.$$eval(storySwitchSelector, btn => btn.length);
            }

            let img = await page.$eval('img[decoding="sync"]', e => e.getAttribute('src')).catch(err => err);
            let video1 = await page.$eval('video[preload="auto"] > source', e => e.getAttribute('src')).catch(err => err);
            let video2 = await page.$eval('video[preload="none"]', e => e.getAttribute('src')).catch(err => err);
            let result = null;
            if (typeof img == 'string') {
                result = img;
            } else if (typeof video1 == 'string') {
                result = video1;
            } else if (typeof video2 == 'string') {
                result = video2;
            }

            if (result == null) {
                result = `${url} 限時下載錯誤，請稍後再試一次`;
                console.log(result);
                // const html = await page.content();
                // console.log(html);
                errFlag = true;
            }

            currentPage = await page.url();
            cacheArr[currentPage] = result;
            imgUrls.push(result);

            let timestamp = Date.now();
            let tmpArr = [];
            tmpArr[currentPage] = result;
            CACHE.set(currentPage, {
                'time': timestamp,
                'data': tmpArr
            });

            if (await page.$(nextClass) !== null) {
                await timerP.setTimeout(1000);
                await Promise.all([
                    page.click(nextClass).catch(e => puppeteerError(e)),
                    waitForNetworkIdle(page, 500, 0),
                ]);
                if (await page.url() === baseUrl) {
                    break;
                }
            }
        }

        console.info(`[LOG][PUPPETEER_DEBUG] Set cache`);
        if (!errFlag) {
            let timestamp = Date.now();

            CACHE.set(homeUrl, {
                'time': timestamp,
                'data': cacheArr
            });
        }

        let res = [];
        if (storiesUrl !== null) {
            res = [cacheArr[storiesUrl]];
        } else {
            res = imgUrls;
        }

        if (cacheArr[storiesUrl] == undefined && Object.keys(imgUrls).length == 0) {
            res = [`${homeUrl} Not Found`];
        }

        return new Promise(function (resolve, reject) {
            resolve(res);
        });
    } catch (error) {
        console.log(error);
        return new Promise(function (resolve, reject) {
            resolve([`${homeUrl} 發生錯誤，請再試一次`]);
        });
    } finally {
        await page.close();
    }
}

async function getStoriesHighlight(url, forceUpdate = false, uid = '') {
    await getBrowser('IG_STORY_Highlight');
    const browser = await puppeteer.connect({ browserWSEndpoint });

    const cookie = {
        name: "sessionid",
        value: insCookies,
        path: "/",
        domain: ".instagram.com",
    };

    const page = await browser.newPage();
    try {
        await page.setCookie(cookie);
        await page.setUserAgent(userAgent);
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.resourceType() === 'image' || request.resourceType() === 'font' || request.resourceType() === 'media') request.abort();
            else request.continue();
        });

        await page.goto(url, { waitUntil: waitUntilMain });

        let ogTitle = await page.$eval(igMetaTitle, element => element.content);
        let userName = ogTitle.slice(ogTitle.lastIndexOf('@') + 1);
        let storyBaseUrl = await page.url();
        let imgUrls = [];

        userName = userName.toLowerCase();

        // get Cache
        if (CACHE.has(storyBaseUrl) && !forceUpdate) {
            console.info(`[LOG][IG_STORY_Highlight][${userName}]Get Story From Cache`);
            let timestamp = Date.now();
            let cache = CACHE.get(storyBaseUrl);
            if (timestamp - cache.time > 30 * 60 * 1000) {
                console.info(`[LOG][IG_STORY_Highlight]Cache Outdated, Delete Cache`);
                CACHE.delete(storyBaseUrl);
            } else {
                let result = [];
                result.push(cache.data);
                return new Promise(function (resolve, reject) {
                    resolve(result);
                });
            }
        }

        console.info(`[LOG][IG_STORY_Highlight][${userName}]Start`);
        if (await page.$(privateAccSelector)) {
            await page.close();
            return new Promise(function (resolve, reject) {
                let timestamp = Date.now();
                let cacheArr = [];
                cacheArr[storyBaseUrl] = `@${userName} 是私人帳號`;
                CACHE.set(homeUrl, {
                    'time': timestamp,
                    'data': cacheArr
                });

                imgUrls.push(`@${userName} 是私人帳號`);
                resolve(imgUrls);
            });
        }

        await page.goto(storyBaseUrl, { waitUntil: waitUntilMain });

        let errFlag = false;
        let cacheData = [];

        await page.click(igPauseSelector).catch(e => puppeteerError(e));

        let img = await page.$eval('img[decoding="sync"]', e => e.getAttribute('src')).catch(err => err);
        let video = await page.$eval('video[preload="auto"] > source', e => e.getAttribute('src')).catch(err => err);
        let result = null;
        if (/Error:/.test(video) && /Error:/.test(img)) {
            result = null;
        } else if (/Error:/.test(video)) {
            result = img;
        } else {
            result = video;
        }
        if (result == null) {
            result = `${storyBaseUrl} 限時下載錯誤，請稍後再試一次`;
            // const html = await page.content();
            // console.log(html);
            errFlag = true;
        }

        cacheData = result;
        imgUrls.push(result);

        if (!errFlag) {
            let timestamp = Date.now();

            CACHE.set(storyBaseUrl, {
                'time': timestamp,
                'data': cacheData
            });
        }

        return new Promise(function (resolve, reject) {
            resolve(imgUrls);
        });
    } catch (error) {
        console.log(error);
        return new Promise(function (resolve, reject) {
            resolve([`${storyBaseUrl} 發生錯誤，請再試一次`]);
        });
    } finally {
        await page.close();
    }
}

function puppeteerError(e) {
    console.log(`[ERROR][Puppeteer] ${e}`);
}

function waitForNetworkIdle(page, timeout, maxInflightRequests = 0) {
    page.on('request', onRequestStarted);
    page.on('requestfinished', onRequestFinished);
    page.on('requestfailed', onRequestFinished);

    let inflight = 0;
    let fulfill;
    let promise = new Promise(x => fulfill = x);
    let timeoutId = setTimeout(onTimeoutDone, timeout);
    return promise;

    function onTimeoutDone() {
        page.removeListener('request', onRequestStarted);
        page.removeListener('requestfinished', onRequestFinished);
        page.removeListener('requestfailed', onRequestFinished);
        fulfill();
    }

    function onRequestStarted() {
        ++inflight;
        if (inflight > maxInflightRequests)
            clearTimeout(timeoutId);
    }

    function onRequestFinished() {
        if (inflight === 0)
            return;
        --inflight;
        if (inflight === maxInflightRequests)
            timeoutId = setTimeout(onTimeoutDone, timeout);
    }
}

async function getBrowser(source = 'IG_STORY') {
    if (!browserWSEndpoint) {
        console.log(`[LOG][${source}] Launch Browser`);
        const browser = await puppeteer.launch({
            headless: isHeadless,
            args: LAUNCH_ARGS
        });
        browserWSEndpoint = await browser.wsEndpoint();
    }

    return new Promise(function (resolve, reject) {
        resolve(browserWSEndpoint);
    });
}

module.exports = {
    getStories: getStories,
    getStoriesHighlight: getStoriesHighlight,
    getBrowser: getBrowser
};
