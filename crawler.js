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
    if (urls[i].search(/instagram/) !== -1 && urls[i].search(/\/p\//) === -1) {
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

        currentResult = currentResult.replace(/\\u0026/g, "&");

        result.push(currentResult);
      }

      target = $(`body > script`)[0].children[0].data;
      while (target.indexOf(`"video_url"`) !== -1) {
        chopFront = target.substring(target.indexOf(`"video_url"`) + 13, target.length);
        currentResult = chopFront.substring(0, chopFront.indexOf(`","`));
        target = chopFront.substring(currentResult.length, chopFront.length);
        currentResult = currentResult.replace(/\\u0026/gi, '&');

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

  if (url.search(/https:\/\/mobile.twitter.com/) !== -1) {
    webUrl = url.substring(url.indexOf(`https:\/\/mobile.`) + 15, url.length);
    webUrl = `https://${webUrl}`;
  }

  return new Promise(function (resolve, reject) {
    // deal with img
    request(webUrl, function (error, response, body) {
      if (error) reject(error);

      const $ = cheerio.load(body);

      $(`.permalink-tweet-container img`).each((index, element) => {
        if (element['attribs']['src'].indexOf('/media/') !== -1) {
          result.push(`${element['attribs']['src']}:orig`);
        }
      })

      resolve(result);
    });
  });
}

let getApk = async () => {
    try {
        const data = await prepareApk();
        return data;
    } catch (error) {
        console.log(error);
        return error;
    }
}

async function prepareApk() {
    const jypnationUrl = 'https://apkpure.com/superstar-jypnation/com.dalcomsoft.ss.jyp';
    const twicegogofightinUrl = 'https://apkpure.com/twice-go-go-fightin%E2%80%99/jp.co.tenantz.twicegogofightin';
    const twicegogofightinUrl2 = 'https://apkcombo.com/tw-tw/twice-go-go-fightin%E2%80%99/jp.co.tenantz.twicegogofightin/#latest-version';
    let urlObj = {
        'JYPNATION': jypnationUrl,
        'TWICEgogoFightin': twicegogofightinUrl
    };
    let result = {};

    for (const key in urlObj) {
        let url = urlObj[key];

        result[key] = await apkpure(url);
        result[key]['downloadLink'] = `https://apkpure.com${result[key]['downloadLink']}`
    }

    result['TWICEgogoFightin_2'] = await apkcombo(twicegogofightinUrl2);
    result['TWICEgogoFightin_2']['downloadLink'] = `https://apkcombo.com${result['TWICEgogoFightin_2']['downloadLink']}`

    return new Promise(function (resolve, reject) {
        resolve(result);
    });
}

function apkpure(url) {
    let result = {};

    return new Promise(function (resolve, reject) {
        request(url, function (error, response, body) {
            const $ = cheerio.load(body);

            result['version'] = $(`.details-sdk > span`).text();
            result['date'] = $(`div.additional > ul > li:nth-child(3) > p:nth-child(2)`).text();
            result['downloadLink'] = $(`.ny-down > a.da`).attr('href');

            resolve(result);
        });
    });
}

function apkcombo(url) {
    let result = {};

    return new Promise(function (resolve, reject) {
        request(url, function (error, response, body) {
            const $ = cheerio.load(body);

            result['version'] = $(`body > section > div > div > div.column.is-8 > table:nth-child(21) > tbody > tr:nth-child(2) > td:nth-child(2)`).text();
            result['date'] = $(`body > section > div > div > div.column.is-8 > table:nth-child(21) > tbody > tr:nth-child(3) > td:nth-child(2)`).text();
            result['downloadLink'] = $(`body > section > div > div > div.column.is-8 > div.abuttons > a`).attr('href');

            resolve(result);
        });
    });
}

module.exports = {
    getImage: getImage,
    getApk: getApk
};
