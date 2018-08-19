var request = require('request');
var request = require('request').defaults({ jar: true });
var cheerio = require('cheerio');

let getImage = async (urls) => {
  const data = await prepareData(urls);
  return data;
}

async function prepareData(urls) {
  var imageUrls = [];
  for (var i = 0; i < urls.length; i++) {
    if (urls[i].search(/https:\/\/www.instagram.com/) !== -1) {
      let url = await igUrl(urls[i]);
      imageUrls.push(url);
    }
    if (urls[i].search(/https:\/\/twitter.com/) !== -1) {
      let url = await twitterUrl(urls[i]);
      imageUrls.push(url);
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

      resolve(result);
    });
  });
}

function twitterUrl(url) {
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

      resolve(result);
    });
  });
}

module.exports = {
  getImage: getImage
};
