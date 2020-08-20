const puppeteer = require('puppeteer');
var app = require('express')();
const insEmail = require('./config.js')[app.get('env')].insEmail;
const insPass = require('./config.js')[app.get('env')].insPass;
const insCookies = require('./config.js')[app.get('env')].insCookies;
const usernameSelector = 'input[name="username"]';
const passwordSelector = 'input[name="password"]';
const loginBtn = 'button[type="submit"]';
const storiesCountClassSelector = '#react-root > section > div > div > section > div > div:nth-child(1)';
const nextStorySelector = '.coreSpriteRightChevron';
const WTFStorySelector = '#react-root > section > div > div > section > div:nth-of-type(2) > div:nth-of-type(1) > div > div button';
//const twitterSelector = 'section > div > div > div > div:nth-of-type(1) article div:nth-of-type(3) img';
const twitterSelector = 'article:nth-of-type(1) img';
const twitterShowSensitiveBtn = 'section > div > div > div > div:nth-of-type(2) article:first-of-type div[data-testid=tweet] > div > div:nth-of-type(2) > div > div:nth-of-type(2) div[role=button]';
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/84.0.4147.125 Safari/537.36';
//const isHeadless = false;
const isHeadless = true;
let browserWSEndpoint = null;
const waitUntil = 'networkidle0';
const CACHE = new Map();

async function getStories(url, forceUpdate = false) {
    try {
        let storiesUrl = '';
        let baseUrl = 'https://www.instagram.com/';
        let targetHomeUrl = '';
        let imgUrls = [];
        let username = '';
        if (url.indexOf('/login/') === -1) {
            username = url.slice(url.lastIndexOf('.com/') + 5);
            loginUrl = `https://www.instagram.com/accounts/login/?next=%2F${username}%2F`;
            storiesUrl = `https://www.instagram.com/stories/${username}`;
            targetHomeUrl = `https://www.instagram.com/${username}`;
        }

        // get Cache
        var date = new Date().toISOString().replace(/:[0-9]{2}:[0-9]{2}\..+/, '');
        if (CACHE.has(`${targetHomeUrl}_${date}`) && !forceUpdate) {
            console.info(`[LOG] Get Story From Cache`);
            return new Promise(function (resolve, reject) {
                resolve(CACHE.get(`${targetHomeUrl}_${date}`));
            });
        }

        if (!browserWSEndpoint) {
            console.log(`[LOG] Launch Browser`);
            const browser = await puppeteer.launch({
                headless: isHeadless,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    // '--disable-gpu',
                    // '--single-process',
                    //'--disable-dev-shm-usage',
                    //'--no-first-run',
                    //'--no-zygote',
                ]
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

        await page.goto(loginUrl, { waitUntil: waitUntil });

        if (await page.$(usernameSelector)) {
            console.log(`[LOG] Start Login`);
            // login
            await page.click(usernameSelector);
            await page.keyboard.type(insEmail);
            await page.click(passwordSelector);
            await page.keyboard.type(insPass);
            await page.click(loginBtn).catch(e => e).then(() => page.waitForNavigation({ waitUntil: waitUntil }));

            //await page.waitForNavigation({waitUntil: waitUntil});

            currentPage = await page.url();
            if (currentPage.search(/\/challenge\//) !== -1) {
                await page.close();
                return new Promise(function (resolve, reject) {
                    imgUrls.push(`請重新驗證帳號喔QQ`);
                    resolve(imgUrls);
                });
            }
        }

        await page.goto(storiesUrl, { waitUntil: waitUntil });
        if (await page.url() === targetHomeUrl) {
            await page.close();
            return new Promise(function (resolve, reject) {
                imgUrls.push(`${username} 是私人帳號喔QQ`);
                resolve(imgUrls);
            });
        }

        //await page.click(storyBtnSelector);

        if (await page.$(WTFStorySelector)) {
            await page.waitForSelector(WTFStorySelector);
            await page.click(WTFStorySelector);
        }

        let countClass = await page.$eval(storiesCountClassSelector, e => e.getAttribute('class'));
        let count = await page.$$eval(`.${countClass}`, e => e.length);
        let errFlag = false;
        for (let index = 0; index < count; index++) {
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
                result = `${targetHomeUrl} 限時下載錯誤，請稍後再試一次`;
                errFlag = true;
            }
            imgUrls.push(result);

            await page.click(nextStorySelector);
            if (await page.url() === baseUrl) {
                break;
            }
        }

        if (!errFlag) {
            let date = new Date().toISOString().replace(/:[0-9]{2}:[0-9]{2}\..+/, '');

            CACHE.set(`${targetHomeUrl}_${date}`, imgUrls);
        }

        //await browser.close();
        await page.close();

        return new Promise(function (resolve, reject) {
            resolve(imgUrls);
        });
    } catch (error) {
        console.log(error);
        return new Promise(function (resolve, reject) {
            resolve([`${targetHomeUrl} 發生錯誤，請再試一次`]);
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
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
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

        await page.goto(url, { waitUntil: waitUntil });
        if (await page.$(usernameSelector)) {
            console.log(`[LOG] Start Login`);
            // login
            await page.click(usernameSelector);
            await page.keyboard.type(insEmail);
            await page.click(passwordSelector);
            await page.keyboard.type(insPass);
            await page.click(loginBtn).catch(e => e).then(() => page.waitForNavigation({ waitUntil: waitUntil }));

            currentPage = await page.url();
            if (currentPage.search(/\/challenge\//) !== -1) {
                await page.close();
                return new Promise(function (resolve, reject) {
                    imgUrls.push(`請重新驗證帳號喔QQ`);
                    resolve(imgUrls);
                });
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
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox'
                ]
            });
            browserWSEndpoint = await browser.wsEndpoint();
        }
        const browser = await puppeteer.connect({ browserWSEndpoint });

        const page = await browser.newPage();
        await page.setUserAgent(userAgent);

        await page.goto(url, { waitUntil: waitUntil });

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
