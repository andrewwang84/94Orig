var request = require('request');
var cheerio = require('cheerio');
const puppeteer = require('./puppeteer.js');
const block = require('./block.js');
var app = require('express')();
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
        if (/instagram\.com\//.test(urls[i])) {
            if (/\/(?:p|tv|reel)\//.test(urls[i])) {
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
            } else {
                try {
                    let url = urls[i];
                    if (urls[i].indexOf('?') !== -1) {
                        url = urls[i].slice(0, urls[i].indexOf('?'));
                    }
                    let res = [];
                    start = Date.now();
                    if (/\/s\//.test(url) || /\/stories\/highlights\/S+/.test(url)) {
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
                reject ('');
                return;
            }
            target = data.children[0].data;
            let userNameData = target.match(/"username":"([a-zA-Z0-9\.\_]+)","blocked_by_viewer":/);
            if (userNameData == null) {
                reject ('');
                return;
            }
            let userName = userNameData[1];
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

module.exports = {
    getImage: getImage
};
