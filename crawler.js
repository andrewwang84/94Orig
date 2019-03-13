var request = require('request');
var request = require('request').defaults({ jar: true });
var cheerio = require('cheerio');
const puppeteer = require('./puppeteer.js')

let getImage = async (urls) => {
  try{
    const data = await prepareData(urls);
    return data;
  } catch (error) {
    return next(error);
  }
}

async function prepareData(urls) {

  var imageUrls = [];
  for (var i = 0; i < urls.length; i++) {
    if (urls[i].search(/\/p\//) !== -1) {
      try{
        let url = await igUrl(urls[i]);
        imageUrls.push(url);
      } catch (error) {
        return error;
      }
    }
    if (urls[i].search(/instagram/) !== -1 || (urls[i].search(/\/p\//) === -1)) {
      try{
        let url = urls[i];
        if (urls[i].indexOf('?') !== -1) {
          url = urls[i].slice(0, urls[i].indexOf('?'));
        }
        imageUrls.push(await puppeteer.getStories(url));
      } catch (error) {
        return error;
      }
    }
    if (urls[i].search(/https:\/\/twitter.com/) !== -1 || urls[i].search(/https:\/\/mobile.twitter.com/) !== -1) {
      try {
        let url = await twitterUrl(urls[i]);
        imageUrls.push(url);
      } catch (error) {
        return error;
      }
    }
  }

  return new Promise(function (resolve, reject) {
    resolve(imageUrls);
  });
}

function igUrl(url) {
  var result = [];
  var target = '';
  return new Promise(function (resolve, reject) {
    request(url, function (error, response, body) {
      if (error) reject(error);

      var $ = cheerio.load(body);
      target = $(`body > script`)[0].children[0].data;

      while (target.indexOf(`"display_url"`) !== -1) {
        var chopFront = target.substring(target.indexOf(`"display_url"`) + 15, target.length);
        var currentResult = chopFront.substring(0, chopFront.indexOf(`","`));
        target = chopFront.substring(currentResult.length, chopFront.length);

        result.push(currentResult);
      }

      target = $(`body > script`)[0].children[0].data;
      while (target.indexOf(`"video_url"`) !== -1) {
        chopFront = target.substring(target.indexOf(`"video_url"`) + 13, target.length);
        currentResult = chopFront.substring(0, chopFront.indexOf(`","`));
        target = chopFront.substring(currentResult.length, chopFront.length);
        result.push(currentResult);
      }

      if (result.length > 1) {
        result.shift();
      }

      resolve(result);
    });
  });
}

function twitterUrl(url) {
  var result = [];
  let mobileUrl = url;
  let webUrl = url;

  // if (url.search(/https:\/\/twitter.com/) !== -1) {
  //   mobileUrl = url.substring(url.indexOf(`https:\/\/`) + 8, url.length);
  //   mobileUrl = `https://mobile.${mobileUrl}/video/1`;
  // }
  if (url.search(/https:\/\/mobile.twitter.com/) !== -1) {
    webUrl = url.substring(url.indexOf(`https:\/\/mobile.`) + 15, url.length);
    webUrl = `https://${webUrl}`;
  }

  return new Promise(function (resolve, reject) {
    // deal with img
    request(webUrl, function (error, response, body) {
      if (error) reject(error);

      const $ = cheerio.load(body);

      // Web version Twitter
      // $(`.AdaptiveMedia-photoContainer > img`).each((index, element) => {
      //   result.push(`${element['attribs']['src']}:orig`);
      // })
      $(`.permalink-tweet-container img`).each((index, element) => {
        if (element['attribs']['src'].indexOf('/media/') !== -1) {
          result.push(`${element['attribs']['src']}:orig`);
        }
      })

      resolve(result);
    });
  });
}

module.exports = {
  getImage: getImage
};
