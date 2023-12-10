const cheerio = require('cheerio');
const timerP = require('node:timers/promises');
const puppeteer = require('./puppeteer.js');
const app = require('express')();
const insCookies = require('./config.js')[app.get('env')].insCookies;
const userAgent = require('./config.js')[app.get('env')].ua;
const Twit = require('twit');

let T = new Twit({
    consumer_key: require('./config.js')[app.get('env')].twitterKey,
    consumer_secret: require('./config.js')[app.get('env')].twitterKeySecret,
    access_token: require('./config.js')[app.get('env')].twitterAccessToken,
    access_token_secret: require('./config.js')[app.get('env')].twitterAccessTokenSecret,
})

const request = require('request').defaults({
    jar: true,
    headers: {
        'User-Agent': userAgent
    }
});

var start = '';
var end = '';
const TYPE_FANSPAGE = 1;
const TYPE_GRAPHQL = 2;

let getImage = async (urls, forceUpdate = false, uid = '') => {
    try {
        const data = await prepareData(urls, forceUpdate, uid);
        return data;
    } catch (error) {
        return new Promise(function (resolve, reject) {
            reject(error);
        });
    }
}

async function prepareData(urls, forceUpdate = false, uid = '') {
    var imageUrls = [];
    for (var i = 0; i < urls.length; i++) {
        let storyType = 'IG_STORY';
        if (/instagram\.com\//.test(urls[i])) {
            if (/\/(?:p|tv|reel)\//.test(urls[i])) {
                try {
                    start = Date.now();
                    urls[i] = urls[i].replace(/\?\S+/, '');
                    urls[i] = urls[i].replace(/\/(?:tv|reel)\//, '/p/');

                    let res = await igUrl(urls[i], uid);
                    imageUrls.push(res);
                } catch (error) {
                    console.log(`[ERROR][IG][${urls[i]}]`);
                    throw error;
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
                    throw error;
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
                throw error;
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
                throw error;
            }
        }

        await timerP.setTimeout(1000);
    }

    return new Promise(function (resolve, reject) {
        resolve(imageUrls);
    });
}

function igUrl(url) {
    var result = [];
    var target = '';
    return new Promise(function (resolve, reject) {
        start = Date.now();
        const j = request.jar();
        const cookie = request.cookie(`sessionid=${insCookies}`);
        j.setCookie(cookie, url);
        request({ url: `${url}?__a=1&__d=dis`, jar: j }, function (error, response, body) {
            if (error) reject(error);

            if (/<!DOCTYPE/.test(body)) {
                reject('cookie 失效');
                return;
            }
            let data = [];
            try {
                data = JSON.parse(body);
            } catch (error) {
                console.log(body);
                console.log(`[ERROR][IG] ${error}`);
            }

            if (data === undefined) {
                console.log(`[ERROR][IG] data not found`);
                console.log(`[ERROR][IG] current cookie: ${insCookies}`);
                reject('');
                return;
            }

            let type = TYPE_FANSPAGE;
            if (data.items != undefined) {
                target = data.items;
            } else if (data.graphql != undefined) {
                type = TYPE_GRAPHQL;
                target = data.graphql;
            } else {
                console.log(data);
                reject('錯誤:找不到 Data');
                return;
            }

            let userName = '';
            if (type == TYPE_FANSPAGE) {
                target = target[0];
                userName = target.user.username;
            } else if (type == TYPE_GRAPHQL) {
                target = target.shortcode_media;
                userName = target.owner.username;
            }

            if (userName == '') {
                reject('錯誤:找不到 username');
                return;
            }

            let results = '';
            let imgRecord = {};
            if (type == TYPE_FANSPAGE) {
                if (target.carousel_media != undefined) {
                    results = target.carousel_media;
                    for (let value of results) {
                        let img = value.image_versions2.candidates[0].url.replace(/\\u0026/gi, "&");
                        let imgHeight = value.image_versions2.candidates[0].height;
                        let imgFileName = img.match(/\/([0-9\_n]+\.(?:jpe?g|png|heic))/)[1];
                        if (imgRecord[imgFileName] == undefined || imgHeight > imgRecord.imgFileName) {
                            imgRecord[imgFileName] = imgHeight;
                            result.push(img);
                        }

                        if (value.media_type == 2) {
                            let vid = '';
                            let currentH = 0;
                            let currentW = 0;
                            for (let vidData of value.video_versions) {
                                if (vidData.height >= currentH && vidData.width >= currentW) {
                                    currentH = vidData.height;
                                    currentW = vidData.width;
                                    vid = vidData.url.replace(/\\u0026/gi, "&");
                                }
                            }
                            result.push(vid);
                        }
                    }
                }
                if (target.image_versions2 != undefined) {
                    results = target.image_versions2;
                    let origW = results.original_width;
                    let origH = results.original_height;
                    let img = '';
                    let currentH = 0;
                    let currentW = 0;
                    for (let v of results.candidates) {
                        if (v.width == origW && v.height == origH) {
                            currentH = v.height;
                            currentW = v.width;
                            img = v.url.replace(/\\u0026/gi, "&");
                            break;
                        } else if (v.height >= currentH && v.width >= currentW) {
                            currentH = v.height;
                            currentW = v.width;
                            img = v.url.replace(/\\u0026/gi, "&");
                        }
                    }

                    let imgHeight = currentH;
                    let imgFileName = img.match(/\/([0-9\_n]+\.(?:jpe?g|png|heic))/)[1];
                    if (imgRecord[imgFileName] == undefined || imgHeight > imgRecord.imgFileName) {
                        imgRecord[imgFileName] = imgHeight;
                        result.push(img);
                    }
                }
                if (target.video_versions != undefined) {
                    results = target.video_versions;
                    let vid = '';
                    let currentH = 0;
                    let currentW = 0;
                    for (let v of results) {
                        if (v.height >= currentH && v.width >= currentW) {
                            currentH = v.height;
                            currentW = v.width;
                            vid = v.url.replace(/\\u0026/gi, "&");
                        }
                    }
                    result.push(vid);
                }

                if (result.length == 0) {
                    console.log(target);
                    reject('錯誤:找不到圖片');
                    return;
                }
            } else if (type == TYPE_GRAPHQL) {
                results = target.display_resources;
                let img = '';
                for (let v of results) {
                    img = v.src.replace(/\\u0026/gi, "&");
                }

                if (!result.includes(img)) {
                    result.push(img);
                }

                if (target.video_url != undefined) {
                    img = target.video_url.replace(/\\u0026/gi, "&");
                    result.push(img);
                }
            }

            end = Date.now();
            console.log(`[LOG][IG][${userName}][${url}][${(end - start) / 1000}s][${result.length}] Done`);

            console.log(imgRecord);
            resolve(result);
        })
    });
}

function twitterUrl(url) {
    let id = url.match(/https:\/\/twitter\.com\/\S+\/status\/([0-9]+)/)[1];
    let userName = url.match(/https:\/\/twitter\.com\/(\S+)\/status\/[0-9]+/)[1];
    userName = userName.toLowerCase();

    return new Promise(function (resolve, reject) {
        T.get('statuses/show/:id', {
            id: id,
            tweet_mode: 'extended'
        }, (err, data, response) => {
            if (err) {
                reject(err);
            } else {
                let result = [];
                if (data.extended_entities == undefined) {
                    reject('');
                    return;
                }
                let medias = data.extended_entities.media;
                for (const media of medias) {
                    if (media.type == 'photo') {
                        result.push(`${media.media_url_https}:orig`);
                    } else if (media.type == 'video') {
                        let videoUrl = media.video_info.variants[0].url;
                        let bitrate = 0;
                        for (let v of media.video_info.variants) {
                            if (v.bitrate == undefined) continue;
                            if (v.bitrate > bitrate) {
                                bitrate = v.bitrate;
                                videoUrl = v.url;
                            }
                        }
                        result.push(videoUrl);
                    }
                }

                resolve(result);
            }
        });
    });
}

module.exports = {
    getImage: getImage
};
