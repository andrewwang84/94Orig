const puppeteer = require('puppeteer');
var app = require('express')();
const insEmail = require('./config.js')[app.get('env')].insEmail;
const insPass = require('./config.js')[app.get('env')].insPass;
const usernameSelector = 'input[name="username"]';
const passwordSelector = 'input[name="password"]';
const loginBtn = 'button[type="submit"]';
const storiesCountClassSelector = '#react-root > section > div > div > section > div > div:nth-child(1)';
const nextStorySelector = '.coreSpriteRightChevron';

async function getStories(url) {
  try {
    let storiesUrl = '';
    let baseUrl = 'https://www.instagram.com/';
    let targetHomeUrl = '';
    let imgUrls = [];
    if(url.indexOf('/login/') === -1) {
      let username = url.slice(url.lastIndexOf('.com/')+5);
      url = `https://www.instagram.com/accounts/login/?next=%2F${username}%2F`;
      storiesUrl = `https://www.instagram.com/stories/${username}`;
      targetHomeUrl = `https://www.instagram.com/${username}`;
    }
    const browser = await puppeteer.launch({
      headless: true,
      // headless: false,
      args: [
        // '--proxy-server="direct://"',
        // '--proxy-bypass-list=*',
        '--no-sandbox',
        '--disable-setuid-sandbox'
      ]
    });
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle0' });

    // login
    await page.click(usernameSelector);
    await page.keyboard.type(insEmail);
    await page.click(passwordSelector);
    await page.keyboard.type(insPass);
    await page.click(loginBtn).catch(e => e);

    // get image urls
    await page.waitForNavigation();
    await page.goto(storiesUrl, { waitUntil: 'load' });
    if (await page.url() === targetHomeUrl) {
      await browser.close();
      return new Promise(function (resolve, reject) {
        resolve(imgUrls);
      });
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
      if(await page.url() === baseUrl) {
        break;
      }
      await page.waitForSelector('img[decoding="sync"]');
    }

    await browser.close();

    return new Promise(function (resolve, reject) {
      resolve(imgUrls);
    });
  } catch (error) {
    console.log(error);
  }
}

module.exports = {
  getStories: getStories
};
