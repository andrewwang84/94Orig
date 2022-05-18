const puppeteer = require('puppeteer');
var app = require('express')();
const block = require('./block.js');
const insEmail = require('./config.js')[app.get('env')].insEmail;
const insPass = require('./config.js')[app.get('env')].insPass;
const insCookies = require('./config.js')[app.get('env')].insCookies;
const usernameSelector = 'input[name="username"]';
const passwordSelector = 'input[name="password"]';
const loginBtn = 'button[type="submit"]';
// const storiesCountClassSelector = '#react-root > div > div > section > div > div > section > div > header > div:nth-child(1) > div > div';
const storiesCountClassSelector = '#react-root > section > div > div > section > div > header > div:nth-child(1) > div';
const nextStorySelector = '.coreSpriteRightChevron';
const WTFStorySelector = '#react-root > section > div > div > section > div.GHEPc > div.Igw0E.IwRSH.eGOV_._4EzTm.NUiEW > div > div > button > div';
// const storyHomeEnterSelector = `#react-root > div > div > section > main > div > header > div > div`;
const storyHomeEnterSelector = `#react-root > section > main > div > header > div > div > span`;
const privateAccSelector = `#react-root > section > main > div > header > div > div > div > button > img`;
const igPauseSelector = '#react-root > section > div > div > section > div > header > div > div > button:nth-child(1)';
const igMetaTitle = "head > meta[property='og:title']";
const igConfirmCheckStoryBtn = '#react-root > section > div > div > section > div > div > div > div > div > div > button';
const igUserNameSelector = '#react-root > section > main > div > div > article > div > div > div > div > div > header > div > div > div > span > a';
const userAgent = require('./config.js')[app.get('env')].ua;
// const isHeadless = false;
const isHeadless = true;
let browserWSEndpoint = null;
const waitUntilMain = 'networkidle0';
const waitUntilMinor = 'domcontentloaded';
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
    try {
        let baseUrl = 'https://www.instagram.com/';
        let imgUrls = [];
        let userName = url.match(/https:\/\/(?:www\.)?instagram\.com\/(?:stories\/)?([a-zA-Z0-9\.\_]+)/)[1];
        let loginUrl = `https://www.instagram.com/accounts/login/?next=%2F${userName}%2F`;
        let storyId = (url.match(/https:\/\/(?:www\.)?instagram.com\/stories\/[a-zA-Z0-9\.\_]+\/([0-9]+)/) == null) ? null : url.match(/https:\/\/(?:www\.)?instagram.com\/stories\/[a-zA-Z0-9\.\_]+\/([0-9]+)/)[1];
        let storiesUrl = (storyId == null) ? null : `https://www.instagram.com/stories/${userName}/${storyId}/`;
        let homeUrl = `https://www.instagram.com/${userName}/`;

        if (block.blackList.includes(userName) || block.knownIds.includes(userName)) {
            return new Promise(function (resolve, reject) {
                console.log(`[LOG][IG_Story][Blink_Block][${url}]`);
                resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
                return;
            });
        }
        let score = 0;
        userName = userName.toLowerCase();
        for (const key in block.greyList) {
            if (userName.search(key) !== -1) {
                score += parseInt(block.greyList[key]);
            }
        }
        if (score >= 150) {
            console.log(`[LOG][IG_Story][Blink_Block][${score}][${url}]`);
            resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
            return;
        }
        if (score >= 60 && block.blinkIds.includes(uid)) {
            console.log(`[LOG][IG][Blink_Block][${score}][${url}]`);
            resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
            return;
        }

        // get Cache
        if (CACHE.has(homeUrl) && !forceUpdate) {
            console.info(`[LOG][IG_STORY]Get Story From Cache`);
            let timestamp = Date.now();
            let cache = CACHE.get(homeUrl);
            if (timestamp - cache.time > 30 * 60 * 1000) {
                console.info(`[LOG][IG_STORY]Cache Outdated, Delete Cache`);
                CACHE.delete(homeUrl);
            } else {
                let data = cache.data;
                let result = [];
                if (storiesUrl !== null) {
                    if (data[storiesUrl] != undefined || data[storiesUrl] != '') {
                        result.push(data[storiesUrl]);
                        return new Promise(function (resolve, reject) {
                            resolve(result);
                        });
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

        await getBrowser();
        const browser = await puppeteer.connect({ browserWSEndpoint });

        const cookie = {
            name: "sessionid",
            value: insCookies,
            path: "/",
            domain: ".instagram.com",
        };

        const page = await browser.newPage();
        await page.setCookie(cookie);
        await page.setUserAgent(userAgent);
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.resourceType() === 'image' || request.resourceType() === 'font' || request.resourceType() === 'media') request.abort();
            else request.continue();
        });

        await page.goto(homeUrl, { waitUntil: waitUntilMain });
        // login
        if (await page.$(usernameSelector)) {
            await page.goto(loginUrl, { waitUntil: waitUntilMain });

            console.log(`[LOG] Start Login`);
            await page.click(usernameSelector);
            await page.keyboard.type(insEmail);
            await page.click(passwordSelector);
            await page.keyboard.type(insPass);
            await page.click(loginBtn).catch(e => e).then(() => page.waitForNavigation({ waitUntil: waitUntilMinor }));

            currentPage = await page.url();
            if (currentPage.search(/\/challenge\//) !== -1) {
                await page.close();
                return new Promise(function (resolve, reject) {
                    imgUrls.push(`請重新驗證帳號喔QQ`);
                    resolve(imgUrls);
                });
            }
        }
        if (await page.$(privateAccSelector)) {
            await page.close();
            return new Promise(function (resolve, reject) {
                let timestamp = Date.now();
                let cacheArr = [];
                cacheArr[url] = `@${userName} 是私人帳號`;
                CACHE.set(homeUrl, {
                    'time': timestamp,
                    'data': cacheArr
                });

                imgUrls.push(`@${userName} 是私人帳號`);
                resolve(imgUrls);
            });
        }

        try {
            await page.click(storyHomeEnterSelector).catch(e => puppeteerError(e)).then(() => page.waitForNavigation({ waitUntil: waitUntilMain }));
        } catch (error) {
            await page.close();
            return new Promise(function (resolve, reject) {
                console.log(`[ERROR][IG_STORY][${userName}] Not Found`);
                let timestamp = Date.now();
                let cacheArr = [];
                cacheArr[url] = `@${userName} 目前沒有限時動態`;
                CACHE.set(homeUrl, {
                    'time': timestamp,
                    'data': cacheArr
                });
                imgUrls.push(`@${userName} 目前沒有限時動態`);
                resolve(imgUrls);
            });
        }

        await page.waitForSelector(storiesCountClassSelector).catch(e => puppeteerError(e));
        let count = await page.$$eval(storiesCountClassSelector, div => div.length);
        let errFlag = false;
        let cacheArr = [];
        for (let index = 0; index < count; index++) {
            if (index === 0) {
                await page.click(igPauseSelector).catch(e => puppeteerError(e))
            }
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
                result = `${homeUrl} 限時下載錯誤，請稍後再試一次`;
                // const html = await page.content();
                // console.log(html);
                errFlag = true;
            }
            currentPage = await page.url();
            cacheArr[currentPage] = result;
            imgUrls.push(result);

            if (await page.$(nextStorySelector) !== null) {
                await Promise.all([
                    page.click(nextStorySelector).catch(e => puppeteerError(e)),
                    waitForNetworkIdle(page, 500, 0),
                ]);

                if (await page.url() === baseUrl) {
                    break;
                }
            }
        }

        if (!errFlag) {
            let timestamp = Date.now();

            CACHE.set(homeUrl, {
                'time': timestamp,
                'data': cacheArr
            });
        }

        //await browser.close();
        await page.close();
        if (score >= 75) {
            result.push(`[ADMIN][${score}][${userName}][${url}]`);
        }

        return new Promise(function (resolve, reject) {
            if (storiesUrl !== null) {
                resolve([cacheArr[storiesUrl]]);
            } else {
                resolve(imgUrls);
            }
        });
    } catch (error) {
        console.log(error);
        return new Promise(function (resolve, reject) {
            resolve([`${homeUrl} 發生錯誤，請再試一次`]);
        });
    }
}

async function getStoriesHighlight(url, forceUpdate = false, uid = '') {
    try {
        await getBrowser('IG_STORY_Highlight');
        const browser = await puppeteer.connect({ browserWSEndpoint });

        const cookie = {
            name: "sessionid",
            value: insCookies,
            path: "/",
            domain: ".instagram.com",
        };

        const page = await browser.newPage();
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
        let loginUrl = `https://www.instagram.com/accounts/login/?next=%2F${userName}%2F`;
        let imgUrls = [];

        if (block.blackList.includes(userName) || block.knownIds.includes(userName)) {
            return new Promise(function (resolve, reject) {
                console.log(`[LOG][IG_STORY_Highlight][Blink_Block][${url}]`);
                resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
                return;
            });
        }
        let score = 0;
        userName = userName.toLowerCase();
        for (const key in block.greyList) {
            if (userName.search(key) !== -1) {
                score += parseInt(block.greyList[key]);
            }
        }
        if (score >= 150) {
            console.log(`[LOG][IG_STORY_Highlight][Blink_Block][${score}][${url}]`);
            resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
            return;
        }
        if (score >= 60 && block.blinkIds.includes(uid)) {
            console.log(`[LOG][IG][Blink_Block][${score}][${url}]`);
            resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
            return;
        }

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
        // login
        if (await page.$(usernameSelector)) {
            await page.goto(loginUrl, { waitUntil: waitUntilMain });

            console.log(`[LOG] Start Login`);
            await page.click(usernameSelector);
            await page.keyboard.type(insEmail);
            await page.click(passwordSelector);
            await page.keyboard.type(insPass);
            await page.click(loginBtn).catch(e => e).then(() => page.waitForNavigation({ waitUntil: waitUntilMinor }));

            currentPage = await page.url();
            if (currentPage.search(/\/challenge\//) !== -1) {
                await page.close();
                return new Promise(function (resolve, reject) {
                    imgUrls.push(`請重新驗證帳號喔QQ`);
                    resolve(imgUrls);
                });
            }
        }
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

        if (await page.$(igConfirmCheckStoryBtn) !== null) {
            await Promise.all([
                page.click(igConfirmCheckStoryBtn).catch(e => puppeteerError(e)),
                waitForNetworkIdle(page, 500, 0),
            ]);
        }

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

        // await page.close();
        if (score >= 75) {
            result.push(`[ADMIN][${score}][${userName}][${storyBaseUrl}]`);
        }

        return new Promise(function (resolve, reject) {
            resolve(imgUrls);
        });
    } catch (error) {
        console.log(error);
        await page.close();
        return new Promise(function (resolve, reject) {
            resolve([`${storyBaseUrl} 發生錯誤，請再試一次`]);
        });
    }
}

async function igUrl(url, uid = '') {
    console.log(`[LOG] Get IG from Puppeteer`);
    try {
        let imgUrls = [];

        await getBrowser('IG');
        const browser = await puppeteer.connect({ browserWSEndpoint });

        const cookie = {
            name: "sessionid",
            value: insCookies,
            path: "/",
            domain: ".instagram.com",
        };

        const page = await browser.newPage();
        await page.setCookie(cookie);
        await page.setUserAgent(userAgent);

        await page.goto(url, { waitUntil: waitUntilMain });
        if (await page.$(usernameSelector)) {
            console.log(`[LOG] Start Login`);
            // login
            await page.click(usernameSelector);
            await page.keyboard.type(insEmail);
            await page.click(passwordSelector);
            await page.keyboard.type(insPass);
            await page.click(loginBtn).catch(e => e).then(() => page.waitForNavigation({ waitUntil: waitUntilMain }));

            currentPage = await page.url();
            if (currentPage.search(/\/challenge\//) !== -1) {
                await page.close();
                return new Promise(function (resolve, reject) {
                    imgUrls.push(`請重新驗證帳號喔QQ`);
                    resolve(imgUrls);
                });
            }
        }

        const html = await page.content();
        let userName = await page.$eval(igUserNameSelector, (elem) => elem.textContent);
        if (userName == null) {
            console.log(html);
            throw new Error('No Username');
        }

        let score = 0;
        if (block.whiteList.includes(userName) === false) {
            if (block.blackList.includes(userName) || block.knownIds.includes(userName)) {
                return new Promise(function (resolve, reject) {
                    console.log(`[LOG][IG][Puppeteer][Blink_Block][${url}]`);
                    resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
                });
            }
            userName = userName.toLowerCase();
            for (const key in block.greyList) {
                if (userName.search(key) !== -1) {
                    score += parseInt(block.greyList[key]);
                }
            }
            if (score >= 150) {
                console.log(`[LOG][IG][Puppeteer][Blink_Block][${score}][${url}]`);
                resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
                return;
            }
            if (score >= 60 && block.blinkIds.includes(uid)) {
                console.log(`[LOG][IG][Blink_Block][${score}][${url}]`);
                resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
                return;
            }
        }

        let count = 1;
        for (let index = 0; index < 12; index++) {
            if (await page.$('.coreSpriteRightChevron') !== null) {
                await page.click('.coreSpriteRightChevron');
                count++;
            }
        }

        let img = await page.$$eval('article img[decoding="auto"]', e => e.map(img => img.getAttribute('src'))).catch(err => err);
        let video = await page.$$eval('article video[type="video/mp4"]', e => e.map(img => img.getAttribute('src'))).catch(err => err);
        imgUrls = [].concat(img, video);

        if (imgUrls.length < count) {
            imgUrls.push(`[警告] ${url} 疑似下載不完全，請再試一次`);
        }

        //await browser.close();
        await page.close();

        return new Promise(function (resolve, reject) {
            resolve(imgUrls);
        });
    } catch (error) {
        console.log(`[ERROR] ${error.message}`);
        return new Promise(function (resolve, reject) {
            resolve([`${url} 發生錯誤，請再試一次`]);
        });
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
    igUrl: igUrl,
    getBrowser: getBrowser
};
