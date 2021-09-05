var request = require('request');
var cheerio = require('cheerio');
const puppeteer = require('./puppeteer.js');
const block = require('./block.js');
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

let getImage = async (urls, isPup = false, forceUpdate = false, uid = '') => {
    try {
        const data = await prepareData(urls, isPup, forceUpdate, uid);
        return data;
    } catch (error) {
        console.error(`[ERROR] ${error}`);
    }
}

async function prepareData(urls, isPup = false, forceUpdate = false, uid = '') {
    var imageUrls = [];
    for (var i = 0; i < urls.length; i++) {
        let storyType = 'IG_STORY';
        if (/instagram\.com\/(?:p|tv|reel)\//.test(urls[i])) {
            try {
                start = Date.now();
                if (isPup == true) {
                    let res = await puppeteer.igUrl(urls[i], uid);
                    imageUrls.push(res);
                    end = Date.now();
                    console.log(`[LOG][IG][${urls[i]}][${(end - start) / 1000}s][${res.length}] Puppeteer Done`);
                } else {
                    let res = await igUrl(urls[i], uid);
                    imageUrls.push(res);
                }
            } catch (error) {
                console.log(`[ERROR][IG][${urls[i]}]`);
                return error;
            }
        } else if (!/instagram\.com\/(?:p|tv)\//.test(urls[i]) && /instagram\.com/.test(urls[i])) {
            try {
                let url = urls[i];
                if (urls[i].indexOf('?') !== -1) {
                    url = urls[i].slice(0, urls[i].indexOf('?'));
                }
                let res = [];
                start = Date.now();
                if (/instagram\.com\/s\//.test(url) || /instagram\.com\/stories\/highlights\/S+/.test(url)) {
                    storyType = 'IG_STORY_Highlight';
                    res = await puppeteer.getStoriesHighlight(url, forceUpdate, uid);
                } else {
                    res = await puppeteer.getStories(url, forceUpdate, uid);
                }
                imageUrls.push(res);
                end = Date.now();
                console.log(`[LOG][${storyType}][${url}][${(end - start) / 1000}s][${res.length}] Puppeteer Done`);
            } catch (error) {
                console.log(`[ERROR][${storyType}][${urls[i]}]`);
                return error;
            }
        } else if (/https:\/\/twitter\.com/.test(urls[i])) {
            try {
                start = Date.now();
                let res = await twitterUrl(urls[i], uid);
                imageUrls.push(res);
                end = Date.now();
                console.log(`[LOG][TWITTER][${urls[i]}][${(end - start) / 1000}s][${res.length}] Done`);
            } catch (error) {
                console.log(`[ERROR][TWITTER][${urls[i]}]`);
                return error;
            }
        } else if (/https:\/\/mobile\.twitter\.com/.test(urls[i])) {
            try {
                let targetUrl = urls[i].replace('mobile.', '');
                start = Date.now();
                let res = await twitterUrl(targetUrl, uid);
                imageUrls.push(res);
                end = Date.now();
                console.log(`[LOG][TWITTER][${targetUrl}][${(end - start) / 1000}s][${res.length}] Done`);
            } catch (error) {
                console.log(`[ERROR][TWITTER][${urls[i]}]`);
                return error;
            }
        }
    }

    return new Promise(function (resolve, reject) {
        resolve(imageUrls);
    });
}

function igUrl(url, uid = '') {
    var result = [];
    var target = '';
    return new Promise(function (resolve, reject) {
        start = Date.now();
        const j = request.jar();
        const cookie = request.cookie(`sessionid=${insCookies}`);
        j.setCookie(cookie, url);
        request({url: url, jar: j}, function (error, response, body) {
            if (error) reject(error);

            var $ = cheerio.load(body);
            let data = $(`body > script:contains("window.__additionalDataLoaded")`)[0];
            if (data === undefined) {
                reject ('data not found');
            }
            target = data.children[0].data;
            let userName = target.match(/"username":"([a-zA-Z0-9\.\_]+)","blocked_by_viewer":/)[1];
            let score = 0;
            if (block.whiteList.includes(userName) === false) {
                if (block.blackList.includes(userName) || block.knownIds.includes(userName)) {
                    console.log(`[LOG][IG][Blink_Block][${url}]`);
                    resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
                    return;
                }
                userName = userName.toLowerCase();
                for (const key in block.greyList) {
                    if (userName.search(key) !== -1) {
                        score += parseInt(block.greyList[key]);
                    }
                }
                if (score >= 150) {
                    console.log(`[LOG][IG][Blink_Block][${score}][${url}]`);
                    resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
                    return;
                }
                if (score >= 60 && block.blinkIds.includes(uid)) {
                    console.log(`[LOG][IG][Blink_Block][${score}][${url}]`);
                    resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
                    return;
                }
            }
            if (score >= 60 && block.blinkIds.includes(uid)) {
                console.log(`[LOG][IG][Blink_Block][${score}][${url}]`);
                resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
                return;
            }

            let results = target.matchAll(/"(?:display_url|video_url)":"([^"]+)",/gi);
            for (let value of results) {
                value = value[1].replace(/\\u0026/gi, "&");

                result.push(value);
            }

            if (result.length > 1) {
                result.shift();
            }
            end = Date.now();
            console.log(`[LOG][IG][${userName}][${url}][${(end - start) / 1000}s][${result.length}] Done`);

            if (score >= 75) {
                result.push(`[ADMIN][${score}][${userName}][${url}]`);
            }

            resolve(result);
        });
    });
}

function twitterUrl(url, uid = '') {
    let id = url.match(/https:\/\/twitter\.com\/\S+\/status\/([0-9]+)/)[1];
    let userName = url.match(/https:\/\/twitter\.com\/(\S+)\/status\/[0-9]+/)[1];
    userName = userName.toLowerCase();

    return new Promise(function (resolve, reject) {
        let score = 0;
        if (block.whiteList.includes(userName) === false) {
            if (block.blackList.includes(userName) || block.knownIds.includes(userName)) {
                console.log(`[LOG][TWITTER][Blink_Block][${url}]`);
                resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
                return;
            }
            for (const key in block.greyList) {
                if (userName.search(key) !== -1) {
                    score += parseInt(block.greyList[key]);
                }
            }
            if (score >= 150) {
                console.log(`[LOG][TWITTER][Blink_Block][${score}][${url}]`);
                resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
                return;
            }
            if (score >= 60 && block.blinkIds.includes(uid)) {
                console.log(`[LOG][IG][Blink_Block][${score}][${url}]`);
                resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
                return;
            }
        }
        if (score >= 60 && block.blinkIds.includes(uid)) {
            console.log(`[LOG][IG][Blink_Block][${score}][${url}]`);
            resolve(['非常抱歉，本工具不支援 BlackPink，請另尋高明 https://www.dcard.tw/f/entertainer/p/229335287']);
            return;
        }

        request.get(`https://api.twitter.com/2/tweets?ids=${id}&media.fields=type,url&expansions=attachments.media_keys`, {
            'auth': {
                'bearer': twitterToken
            }
        }, async function (error, response, body) {
            let data = JSON.parse(body);
            let media = data.includes.media;
            let result = [];
            for (let i = 0; i < media.length; i++) {
                let data = media[i];
                if (data.url == undefined) {
                    let vid = await twitterVid(id);
                    result.push(vid);
                } else {
                    result.push(`${data.url}:orig`);
                }
            }

            if (score >= 75) {
                result.push(`[ADMIN][${score}][${userName}][${url}]`);
            }

            resolve(result);
        });
    });
}

function twitterVid (id) {
    return new Promise(function (resolve, reject) {
        request.get(`https://api.twitter.com/1.1/statuses/show.json?id=${id}`, {
            'auth': {
                'bearer': twitterToken
            }
        }, function (error, response, body) {
            let data = JSON.parse(body);
            let vidUrl = '';
            if (data.extended_entities !== undefined) {
                let video = data.extended_entities.media[0].video_info.variants;
                let bitrate = 0;
                for (const key in video) {
                    let elem = video[key];
                    if (elem.bitrate == undefined) {
                        continue;
                    }
                    if (elem.bitrate > bitrate) {
                        vidUrl = elem.url;
                        bitrate = elem.bitrate;
                    }
                }
            }

            resolve(vidUrl);
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
    let urlObj = {
        'JYPNATION': jypnationUrl,
        'TWICEgogoFightin': twicegogofightinUrl
    };
    let result = {};

    for (const key in urlObj) {
        let url = urlObj[key];

        result[key] = await apkpure(url);
        result[key]['downloadLink'] = `https://apkpure.com${result[key]['downloadLink']}`;
    }

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

module.exports = {
    getImage: getImage,
    getApk: getApk
};
