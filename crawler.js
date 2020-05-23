var request = require('request');
var request = require('request').defaults({ jar: true });
var cheerio = require('cheerio');
const puppeteer = require('./puppeteer.js');
var app = require('express')();
const deepSite = require('./config.js')[app.get('env')].deepSite;

let getImage = async (urls) => {
    try {
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
            try {
                let url = await igUrl(urls[i]);
                imageUrls.push(url);
            } catch (error) {
                return error;
            }
        }
        if (urls[i].search(/instagram/) !== -1 && urls[i].search(/\/p\//) === -1) {
            try {
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
            console.log(target);

            while (target.indexOf(`"display_url"`) !== -1) {
                var chopFront = target.substring(target.indexOf(`"display_url"`) + 15, target.length);
                var currentResult = chopFront.substring(0, chopFront.indexOf(`","`));
                target = chopFront.substring(currentResult.length, chopFront.length);

                currentResult = currentResult.replace(/\\u0026/g, "&");
                console.log(currentResult);
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
