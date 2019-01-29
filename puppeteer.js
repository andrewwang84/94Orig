const puppeteer = require('puppeteer');
const insEmail = require('./config.js')['development'].insEmail;
const insPass = require('./config.js')['development'].insPass;
const usernameSelector = 'input[name="username"]';
const passwordSelector = 'input[name="password"]';
const loginBtn = 'button[type="submit"]';
const storiesCountClassSelector = '#react-root > section > div > div > section > div > div:nth-child(1)';
const nextStorySelector = '.coreSpriteRightChevron';

async function getStories(url) {
  try {
    let storiesUrl = '';
    let imgUrls = [];
    if(url.indexOf('/login/') === -1) {
      let username = url.slice(url.lastIndexOf('/')+1);
      url = `https://www.instagram.com/accounts/login/?next=%2F${username}%2F`;
      storiesUrl = `https://www.instagram.com/stories/${username}/`
    }
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--proxy-server="direct://"',
        '--proxy-bypass-list=*'
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
    await page.waitForSelector('img[decoding="sync"]');
    let countClass = await page.$eval(storiesCountClassSelector, e => e.getAttribute('class'));
    let count = await page.$$eval(`.${countClass}`, e => e.length);
    for (let index = 1; index < count; index++) {
      let img = await page.$eval('img[decoding="sync"]', e => e.getAttribute('src'));
      imgUrls.push(img);
      await page.click(nextStorySelector);
      await page.waitForSelector('img[decoding="sync"]');
    }

    await browser.close();

    console.log(imgUrls);
    // return new Promise(function (resolve, reject) {
    //   resolve(imgUrls);
    // });
  } catch (error) {
    console.log(error);
  }
}

module.exports = {
  getStories: getStories
};
