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
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/74.0.3729.169 Safari/537.36';
const WTFStorySelector = '#react-root > section > div > div > section > div.GHEPc > div.Igw0E.IwRSH.eGOV_._4EzTm.NUiEW > div > div > div.Igw0E.IwRSH.YBx95._4EzTm.O1flK.D8xaz.fm1AK.TxciK.yiMZG > div > div > button';
const storyBtnSelector = '#react-root > section > main > div > header > div > div > span > img';
const twitterSelector = 'section > div > div > div > div:nth-of-type(2) article:first-of-type div[data-testid=tweet] > div:nth-of-type(2) img';
let browserWSEndpoint = null;

async function getStories(url) {
    try {
        let storiesUrl = '';
        let baseUrl = 'https://www.instagram.com/';
        let targetHomeUrl = '';
        let imgUrls = [];
        let username = '';
        if (url.indexOf('/login/') === -1) {
            username = url.slice(url.lastIndexOf('.com/') + 5);
            url = `https://www.instagram.com/accounts/login/?next=%2F${username}%2F`;
            storiesUrl = `https://www.instagram.com/stories/${username}`;
            targetHomeUrl = `https://www.instagram.com/${username}`;
        }

        if (!browserWSEndpoint) {
            const browser = await puppeteer.launch({
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

        await page.goto(url, { waitUntil: 'networkidle0' });

        if (await page.$(usernameSelector)) {
            // login
            await page.click(usernameSelector);
            await page.keyboard.type(insEmail);
            await page.click(passwordSelector);
            await page.keyboard.type(insPass);
            await page.click(loginBtn).catch(e => e).then(() => page.waitForNavigation({ waitUntil: 'networkidle0' }));

            //await page.waitForNavigation({waitUntil: 'networkidle0'});

            currentPage = await page.url();
            if (currentPage.search(/\/challenge\//) !== -1) {
                await page.close();
                return new Promise(function (resolve, reject) {
                    imgUrls.push(`請重新驗證帳號喔QQ`);
                    resolve(imgUrls);
                });
            }

            const getCookies = await page.cookies();
            let session = '';
            for (const i of getCookies) {
                if (i.name == 'sessionid') {
                    session = i.value;
                }
            }
            imgUrls.push(`session:${session}`);
        }

        await page.goto(storiesUrl, { waitUntil: 'networkidle0' });
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

        await page.waitForSelector('img[decoding="sync"]');
        let countClass = await page.$eval(storiesCountClassSelector, e => e.getAttribute('class'));
        let count = await page.$$eval(`.${countClass}`, e => e.length);
        for (let index = 0; index < count; index++) {
            let img = '';
            let video = '';
            img = await page.$eval('img[decoding="sync"]', e => e.getAttribute('src')).catch(e => e);
            video = await page.$eval('video[preload="auto"] > source', e => e.getAttribute('src')).catch(e => e);
            if (typeof video === 'string') {
                imgUrls.push(video);
            } else {
                imgUrls.push(img);
            }
            await page.click(nextStorySelector);
            if (await page.url() === baseUrl) {
                break;
            }
            await page.waitForSelector('img[decoding="sync"]');
        }

        //await browser.close();
        await page.close();

        return new Promise(function (resolve, reject) {
            resolve(imgUrls);
        });
    } catch (error) {
        console.log(error);
    }
}

async function igUrl(url) {
    try {
        let imgUrls = [];

        if (!browserWSEndpoint) {
            const browser = await puppeteer.launch({
                //headless: false,
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

        await page.goto(url, { waitUntil: 'networkidle0' });
        if (await page.$(usernameSelector)) {
            // login
            await page.click(usernameSelector);
            await page.keyboard.type(insEmail);
            await page.click(passwordSelector);
            await page.keyboard.type(insPass);
            await page.click(loginBtn).catch(e => e).then(() => page.waitForNavigation({ waitUntil: 'networkidle0' }));

            currentPage = await page.url();
            if (currentPage.search(/\/challenge\//) !== -1) {
                await page.close();
                return new Promise(function (resolve, reject) {
                    imgUrls.push(`請重新驗證帳號喔QQ`);
                    resolve(imgUrls);
                });
            }

            const getCookies = await page.cookies();
            let session = '';
            for (const i of getCookies) {
                if (i.name == 'sessionid') {
                    session = i.value;
                }
            }
            imgUrls.push(`session:${session}`);
        }

        for (let index = 0; index < 12; index++) {
            if (await page.$('.coreSpriteRightChevron') !== null) {
                await page.click('.coreSpriteRightChevron');
            }
        }

        await page.waitForSelector('article img[decoding="auto"]');
        let img = await page.$$eval('article img[decoding="auto"]', e => e.map(img => img.getAttribute('src'))).catch(e => e);
        if (img.length !== 0) {
            imgUrls.push(img);
        }

        let video = await page.$$eval('article video[type="video/mp4"]', e => e.map(img => img.getAttribute('src'))).catch(e => e);
        if (video.length !== 0) {
            imgUrls.push(video);
        }

        //await browser.close();
        await page.close();

        return new Promise(function (resolve, reject) {
            resolve(imgUrls);
        });
    } catch (error) {
        console.log(error);
    }
}

async function twitterUrl(url) {
    try {
        let imgUrls = [];

        if (!browserWSEndpoint) {
            const browser = await puppeteer.launch({
                //headless: false,
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

        await page.goto(url, { waitUntil: 'networkidle0' });

        await page.waitForSelector('img');
        let img = await page.$$eval(twitterSelector, e => e.map((img) => {
            let rawImg = img.getAttribute('src');
            let result = '';
            if (/https:\/\/pbs\.twimg\.com\/media\//.test(rawImg)) {
                if (/\?format=/.test(rawImg)) {
                    let ext = rawImg.match(/\?format=([^\&]*)\&/)[1];
                    result = `${rawImg.slice(0, rawImg.lastIndexOf('?'))}?format=${ext}&name=orig`;
                    //result += `\n${rawImg.slice(0, rawImg.lastIndexOf('?'))}?format=png&name=orig`;
                } else {
                    result = `${rawImg.slice(0, rawImg.lastIndexOf(':'))}:orig`;
                }
            }

            return result;
        })).catch(e => e);
        if (img.length !== 0) {
            imgUrls.push(img);
        }

        // let video = await page.$$eval('article video[type="video/mp4"]', e => e.map(img => img.getAttribute('src'))).catch(e => e);
        // if (video.length !== 0) {
        //     imgUrls.push(video);
        // }

        //await browser.close();
        await page.close();

        return new Promise(function (resolve, reject) {
            resolve(imgUrls);
        });
    } catch (error) {
        console.log(error);
    }
}

module.exports = {
    getStories: getStories,
    igUrl: igUrl,
    twitterUrl: twitterUrl
};
