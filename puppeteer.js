// const puppeteer = require('puppeteer');

// let getStories = async (urls) => {
//   try{
//     const data = await prepareData(urls);
//     return data;
//   } catch (error) {
//     return next(error);
//   }
// }

// async function prepareData(urls) {
//   var imageUrls = [];
//   for (var i = 0; i < urls.length; i++) {
//     if (urls[i].search(/https:\/\/instagram.com\/stories/) !== -1) {
//       try{
//         let url = await igStoriesUrl(urls[i]);
//         imageUrls.push(url);
//       } catch (error) {
//         return error;
//       }
//     }
//   }

//   return new Promise(function (resolve, reject) {
//     resolve(imageUrls);
//   });
// }

// async function igStoriesUrl(url) {
//   console.log(url);
//   var result = [url];
//   var target = '';
//   const browser = await puppeteer.launch({ headless: false });
//   const page = await browser.newPage();

//   await page.goto(url);
//   return new Promise(function (resolve, reject) {
//     resolve(result);
//   });
// }

// // module.exports = {
// //   getStories: getStories
// // };
// getStories('https://instagram.com/twicetagram');


const puppeteer = require('puppeteer');
// const url = 'https://instagram.com/twicetagram';
const url = 'https://www.instagram.com/';
const insEmail = require('./config.js')['development'].insEmail;
const insPass = require('./config.js')['development'].insPass;

async function run(url) {
  const browser = await puppeteer.launch({ headless: false});
  const page = await browser.newPage();

  await page.goto(url);
}

//run(url);
