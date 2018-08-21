var request = require('request');
var request = require('request').defaults({ jar: true });
var cheerio = require('cheerio');

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
    if (urls[i].search(/https:\/\/www.instagram.com/) !== -1) {
      try{
        let url = await igUrl(urls[i]);
        imageUrls.push(url);
      } catch (error) {
        return next(error);
      }
    }
    if (urls[i].search(/https:\/\/twitter.com/) !== -1) {
      try{
        let url = await twitterUrl(urls[i]);
        imageUrls.push(`${url}:orig`);
      } catch (error) {
        return next(error);
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

      target = $(`body > script`)[0].children[0].data
      while (target.indexOf(`"video_url"`) !== -1) {
        var chopFront = target.substring(target.indexOf(`"video_url"`) + 13, target.length);
        var currentResult = chopFront.substring(0, chopFront.indexOf(`","`));
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
  var target = '';
  return new Promise(function (resolve, reject) {
    request(url, function (error, response, body) {
      if (error) reject(error);

      var $ = cheerio.load(body);
      target = $(`.AdaptiveMedia-photoContainer > img`)[0]['attribs']['src'];

      // while (target.indexOf(`"display_url"`) !== -1) {
      //   var chopFront = target.substring(target.indexOf(`"display_url"`) + 15, target.length);
      //   var currentResult = chopFront.substring(0, chopFront.indexOf(`","`));
      //   target = chopFront.substring(currentResult.length, chopFront.length);

      //   result.push(currentResult);
      // }

      // if (result.length > 1) {
      //   result.shift();
      // }
      result.push(target);
      resolve(result);
    });
  });
}

module.exports = {
  getImage: getImage
};
