const puppeteer = require('puppeteer');
var app = require('express')();
const insEmail = require('./config.js')[app.get('env')].insEmail;
const insPass = require('./config.js')[app.get('env')].insPass;
const insCookies = require('./config.js')[app.get('env')].insCookies;
const usernameSelector = 'input[name="username"]';
const passwordSelector = 'input[name="password"]';
const loginBtn = 'button[type="submit"]';
const storiesCountClassSelector = '#react-root > section > div > div > section > div:first-of-type > div';
const nextStorySelector = '.coreSpriteRightChevron';
const WTFStorySelector = '#react-root > section > div > div > section > div.GHEPc > div.Igw0E.IwRSH.eGOV_._4EzTm.NUiEW > div > div > button > div';
const storyHomeEnterSelector = `#react-root > section > main > div > header > div > div > canvas`;
const privateAccSelector = `#react-root > section > main > div > header > div > div > div > button > img`;
const twitterSelector = 'article:nth-of-type(1) img';
const twitterShowSensitiveBtn = 'section > div > div > div > div:nth-of-type(2) article:first-of-type div[data-testid=tweet] > div > div:nth-of-type(2) > div > div:nth-of-type(2) div[role=button]';
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.125 Safari/537.36';
//const isHeadless = false;
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
const blackList = [
    'sooyaaa__',
    'jennierubyjane',
    'roses_are_rosie',
    'lalalalisa_m',
    'blackpinkofficial'
];

async function getStories(url, forceUpdate = false) {
    try {
        let baseUrl = 'https://www.instagram.com/';
        let imgUrls = [];
        let username = url.match(/https:\/\/(?:www\.)?instagram\.com\/(?:stories\/)?([a-zA-Z0-9\.\_]+)/)[1];
        let loginUrl = `https://www.instagram.com/accounts/login/?next=%2F${username}%2F`;
        let storyId = (url.match(/https:\/\/(?:www\.)?instagram.com\/stories\/[a-zA-Z0-9\.\_]+\/([0-9]+)/) == null) ? null : url.match(/https:\/\/(?:www\.)?instagram.com\/stories\/[a-zA-Z0-9\.\_]+\/([0-9]+)/)[1];
        let storiesUrl = (storyId == null) ? null : `https://www.instagram.com/stories/${username}/${storyId}/`;
        let homeUrl = `https://www.instagram.com/${username}/`;

        if (blackList.includes(username)) {
            return new Promise(function (resolve, reject) {
                resolve(['非常抱歉，本工具不支援 Blind，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
            });
        }
        // get Cache
        if (CACHE.has(homeUrl) && !forceUpdate) {
            console.info(`[LOG] Get Story From Cache`);
            let timestamp = Date.now();
            let cache = CACHE.get(homeUrl);
            if (timestamp - cache.time > 30 * 60 * 1000) {
                console.info(`[LOG] Cache Outdated, Delete Cache`);
                CACHE.delete(homeUrl);
            } else {
                let data = cache.data;
                let result = [];
                if (storiesUrl !== null) {
                    result.push(data[storiesUrl]);
                    return new Promise(function (resolve, reject) {
                        resolve(result);
                    });
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

        if (!browserWSEndpoint) {
            console.log(`[LOG] Launch Browser`);
            const browser = await puppeteer.launch({
                headless: isHeadless,
                args: LAUNCH_ARGS
            });
            browserWSEndpoint = await browser.wsEndpoint();
        }
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
                cacheArr[url] = `@${username} 是私人帳號`;
                CACHE.set(homeUrl, {
                    'time': timestamp,
                    'data': cacheArr
                });

                imgUrls.push(`@${username} 是私人帳號`);
                resolve(imgUrls);
            });
        }

        try {
            await page.click(storyHomeEnterSelector).catch(e => e).then(() => page.waitForNavigation({ waitUntil: waitUntilMinor }));
        } catch (error) {
            await page.close();
            return new Promise(function (resolve, reject) {
                console.log(`[ERROR][IG_STORY][${username}] Not Found`);
                let timestamp = Date.now();
                let cacheArr = [];
                cacheArr[url] = `@${username} 目前沒有限時動態`;
                CACHE.set(homeUrl, {
                    'time': timestamp,
                    'data': cacheArr
                });
                imgUrls.push(`@${username} 目前沒有限時動態`);
                resolve(imgUrls);
            });
        }

        if (await page.$(WTFStorySelector)) {
            console.log(`[DEBUG_LOG][IG_STORY] WTF Btn Clicked`)
            await page.waitForSelector(WTFStorySelector);
            await page.click(WTFStorySelector);
        }

        await page.waitForSelector(storiesCountClassSelector);
        let count = await page.$$eval(storiesCountClassSelector, div => div.length);
        let errFlag = false;
        let cacheArr = [];
        for (let index = 0; index < count; index++) {
            if (await page.$(WTFStorySelector)) {
                console.log(`[DEBUG_LOG][IG_STORY] WTF Btn Clicked`)
                await page.waitForSelector(WTFStorySelector);
                await page.click(WTFStorySelector);
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

            page.click(nextStorySelector);
            await page.waitForNavigation({ waitUntil: waitUntilMain })
            if (await page.url() === baseUrl) {
                break;
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

        return new Promise(function (resolve, reject) {
            if (storiesUrl !== null) {
                resolve([cacheArr[storiesUrl]]);
            } else {
                resolve(imgUrls);
            }
        });
    } catch (error) {
        console.log(error);
        await page.close();
        return new Promise(function (resolve, reject) {
            resolve([`${homeUrl} 發生錯誤，請再試一次`]);
        });
    }
}

async function igUrl(url) {
    console.log(`[LOG] Get IG from Puppeteer`);
    try {
        let imgUrls = [];

        if (!browserWSEndpoint) {
            console.log(`[LOG] Launch Browser`);
            const browser = await puppeteer.launch({
                headless: isHeadless,
                args: LAUNCH_ARGS
            });
            browserWSEndpoint = await browser.wsEndpoint();
        }
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
        let userName = html.match(/"username":"([a-zA-Z0-9\.\_]+)","blocked_by_viewer":/)[1];
        if (blackList.includes(userName)) {
            return new Promise(function (resolve, reject) {
                resolve(['非常抱歉，本工具不支援 Blind，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
            });
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
        console.log(error);
        return new Promise(function (resolve, reject) {
            resolve([`${url} 發生錯誤，請再試一次`]);
        });
    }
}

// Deprecated due to twitter's blocking of headless chrome
async function twitterUrl(url) {
    try {
        let imgUrls = [];

        if (!browserWSEndpoint) {
            console.log(`[LOG] Launch Browser`);
            const browser = await puppeteer.launch({
                headless: isHeadless,
                args: LAUNCH_ARGS
            });
            browserWSEndpoint = await browser.wsEndpoint();
        }
        const browser = await puppeteer.connect({ browserWSEndpoint });

        const page = await browser.newPage();
        await page.setUserAgent(userAgent);

        await page.goto(url, { waitUntil: waitUntilMain });

        // for twitter sensitive content block
        if (await page.$(twitterShowSensitiveBtn)) {
            await page.click(twitterShowSensitiveBtn);
        }

        let img = await page.$$eval(twitterSelector, e => e.map((img) => {
            let rawImg = img.getAttribute('src');
            let result = '';
            if (/https:\/\/pbs\.twimg\.com\/media\//.test(rawImg)) {
                if (/\?format=/.test(rawImg)) {
                    let ext = rawImg.match(/\?format=([^\&]*)\&/)[1];
                    result = `${rawImg.slice(0, rawImg.lastIndexOf('?'))}?format=${ext}&name=orig`;
                } else {
                    result = `${rawImg.slice(0, rawImg.lastIndexOf(':'))}:orig`;
                }
            }

            return result;
        })).catch(e => e);

        img = img.filter(url => url !== '');
        if (img.length !== 0) {
            imgUrls = [].concat(img);
        } else {
            const html = await page.content();
            console.log(html);
            imgUrls.push(`${url} 找不到圖片`);
        }

        await page.close();

        return new Promise(function (resolve, reject) {
            resolve(imgUrls);
        });
    } catch (error) {
        console.log(error);
        return new Promise(function (resolve, reject) {
            resolve([`${url} 發生錯誤，請再試一次`]);
        });
    }
}

module.exports = {
    getStories: getStories,
    igUrl: igUrl,
    twitterUrl: twitterUrl
};
