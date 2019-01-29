const puppeteer = require('puppeteer');
let url = 'https://instagram.com/0212_lonce';
const insEmail = require('./config.js')['development'].insEmail;
const insPass = require('./config.js')['development'].insPass;
const usernameSelector = 'input[name="username"]';
const passwordSelector = 'input[name="password"]';
const loginBtn = 'button[type="submit"]';
const avatarSelector = 'span[role="link"]';

async function run(url) {
  try {
    if(url.indexOf('/login/') === -1) {
      let username = url.slice(url.lastIndexOf('/')+1);
      url = `https://www.instagram.com/accounts/login/?next=%2F${username}%2F`;
    }
    const browser = await puppeteer.launch({ headless: false});
    const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle0' });

    await page.click(usernameSelector);
    await page.keyboard.type(insEmail);
    await page.click(passwordSelector);
    await page.keyboard.type(insPass);
    await page.click(loginBtn).catch(e => e);

    await page.waitForNavigation({ waitUntil: 'networkidle0' });
    await page.click(avatarSelector);

    await page.setRequestInterception(true);
    page.on('request', interceptedRequest => {
      if (interceptedRequest.url().indexOf('.mp4?') !== -1 || interceptedRequest.url().indexOf('.jpg?') !== -1) {
        console.log(interceptedRequest.url());
      }
      interceptedRequest.continue();
    });
    // await browser.close();
  } catch (error) {
    console.log(error);
  }
}

// module.exports = {
//   getStories: getStories
// };

run(url);
