var request = require('request');
var cheerio = require('cheerio');
const puppeteer = require('./puppeteer.js');
var app = require('express')();
const deepSite = require('./config.js')[app.get('env')].deepSite;
const twitterToken = require('./config.js')[app.get('env')].twitterToken;
const insCookies = require('./config.js')[app.get('env')].insCookies;
var request = require('request').defaults({
    jar: true,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_14_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.61 Safari/537.36',
    }
});
var start = '';
var end = '';

let getImage = async (urls, isPup = false, forceUpdate = false) => {
    try {
        const data = await prepareData(urls, isPup, forceUpdate);
        return data;
    } catch (error) {
        console.error(`[ERROR] ${error}`);
    }
}

async function prepareData(urls, isPup = false, forceUpdate = false) {
    var imageUrls = [];
    for (var i = 0; i < urls.length; i++) {
        if (/instagram\.com\/p\//.test(urls[i])) {
            try {
                start = Date.now();
                if (isPup == true) {
                    let res = await puppeteer.igUrl(urls[i]);
                    imageUrls.push(res);
                    end = Date.now();
                    console.log(`[LOG][IG][${urls[i]}][${(end - start) / 1000}s][${res.length}] Puppeteer Done`);
                } else {
                    let res = await igUrl(urls[i]);
                    imageUrls.push(res);
                    end = Date.now();
                    console.log(`[LOG][IG][${urls[i]}][${(end - start) / 1000}s][${res.length}] Done`);
                }
            } catch (error) {
                return error;
            }
        }
        if (!/instagram\.com\/p\//.test(urls[i]) && /instagram\.com/.test(urls[i])) {
            try {
                let url = urls[i];
                if (urls[i].indexOf('?') !== -1) {
                    url = urls[i].slice(0, urls[i].indexOf('?'));
                }
                start = Date.now();
                let res = await puppeteer.getStories(url, forceUpdate);
                imageUrls.push(res);
                end = Date.now();
                console.log(`[LOG][IG_STORY][${url}][${(end - start) / 1000}s][${res.length}] Puppeteer Done`);
            } catch (error) {
                return error;
            }
        }
        if (/https:\/\/twitter\.com/.test(urls[i])) {
            try {
                start = Date.now();
                let res = await twitterUrl(urls[i]);
                imageUrls.push(res);
                end = Date.now();
                console.log(`[LOG][TWITTER][${urls[i]}][${(end - start) / 1000}s][${res.length}] Done`);
            } catch (error) {
                return error;
            }
        }
        if (/https:\/\/mobile\.twitter\.com/.test(urls[i])) {
            try {
                let targetUrl = urls[i].replace('mobile.', '');
                start = Date.now();
                let res = await twitterUrl(targetUrl);
                imageUrls.push(res);
                end = Date.now();
                console.log(`[LOG][TWITTER][${targetUrl}][${(end - start) / 1000}s][${res.length}] Done`);
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
        const j = request.jar();
        const cookie = request.cookie(`sessionid=${insCookies}`);
        j.setCookie(cookie, url);
        request({url: url, jar: j}, function (error, response, body) {
            if (error) reject(error);

            var $ = cheerio.load(body);
            target = $(`body > script:contains("window.__additionalDataLoaded")`)[0].children[0].data;
            while (/"display_url"/.test(target)) {
                var chopFront = target.substring(target.indexOf(`"display_url"`) + 15, target.length);
                var currentResult = chopFront.substring(0, chopFront.indexOf(`","`));
                target = chopFront.substring(currentResult.length, chopFront.length);

                currentResult = currentResult.replace(/\\u0026/gi, "&");

                result.push(currentResult);
            }

            target = $(`body > script:contains("window.__additionalDataLoaded")`)[0].children[0].data;
            while (/"video_url"/.test(target)) {
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

function twitterUrl (url) {
    let id = url.match(/https:\/\/twitter\.com\/\S+\/status\/([0-9]+)/)[1];

    return new Promise(function (resolve, reject) {
        request.get(`https://api.twitter.com/2/tweets?ids=${id}&media.fields=type,url&expansions=attachments.media_keys`, {
            'auth': {
                'bearer': twitterToken
            }
        }, function (error, response, body) {
            let data = JSON.parse(body);
            let media = data.includes.media;
            let result = [];
            for (let i = 0; i < media.length; i++) {
                let data = media[i];
                result.push(`${data.url}:orig`);
            }

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
    const twicegogofightinUrl2 = 'https://apkcombo.com/tw-tw/twice-go-go-fightin%E2%80%99/jp.co.tenantz.twicegogofightin/download/apk';
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

            let version = $(`#download-result > div:nth-child(1) > div > div:nth-child(6) > a > div:nth-child(2) > b`).text();
            result['version'] = '最新版';
            let date = $(`#download-result > div:nth-child(1) > div > div:nth-child(6) > a > div:nth-child(2) > p`).text();
            result['date'] = '馬的網站更新的比遊戲還頻繁，還每次都變結構';
            result['downloadLink'] = 'https://apkcombo.com/tw-tw/twice-go-go-fightin%E2%80%99/jp.co.tenantz.twicegogofightin/download/apk';

            resolve(result);
        });
    });
}

let checkDeep = async (url) => {
    try {
        const data = await prepareDeep(url);
        return data;
    } catch (error) {
        console.log(error);
        return error;
    }
}

function prepareDeep() {
    let result = {};

    const videoBlockSelector = '.kd-video-list-item';
    const videoSelector = '.video-link-container';
    const titleSelector = '.video-title';
    const nameSelector = 'div.idol-info > a:nth-child(3)';
    const timeSelector = 'div.meta-info:nth-child(2) > span';

    return new Promise(function (resolve, reject) {
        request(deepSite, function (error, response, body) {
            const $ = cheerio.load(body);

            let vidList = $(videoBlockSelector);

            vidList.each((index, element) => {
                let title = $(element).find(titleSelector).text();
                let name = $(element).find(nameSelector).text().split(' ')[0];

                result[`${name}_${title}`] = {
                    'title': title,
                    'name': name,
                    'updateTime': $(element).find(timeSelector).text(),
                    'link': $(element).find(videoSelector).attr('href')
                }
            })

            resolve(result);
        });
    });
}

module.exports = {
    getImage: getImage,
    getApk: getApk,
    checkDeep: checkDeep
};
