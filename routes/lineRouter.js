const express = require('express');
const line = require('@line/bot-sdk');
const crawler = require('../crawler.js');
const router = express.Router();
const lineAccessToken = require('../config.js')[process.env.NODE_ENV].lineAccessToken;
const lineSecret = require('../config.js')[process.env.NODE_ENV].lineSecret;

const config = {
    channelAccessToken: lineAccessToken,
    channelSecret: lineSecret
};

router.post('/webhook', (req, res) => {
    Promise
        .all(req.body.events.map(handleEvent))
        .then((result) => res.status(200).json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

const client = new line.Client(config);
async function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        // ignore non-text-message event
        return Promise.resolve(null);
    }

    let msg = event.message.text;
    let igArr = (msg.match(/https:\/\/www\.instagram\.com\/p\/\S{11}\//g) !== null) ? msg.match(/https:\/\/www\.instagram\.com\/p\/\S{11}\//g) : [];
    let igStoryArr = (msg.match(/https:\/\/instagram\.com\/\S+/g) !== null) ? msg.match(/https:\/\/instagram\.com\/\S+/g) : [];
    let twArr = (msg.match(/https:\/\/(?:mobile\.)?twitter\.com/g) !== null) ? msg.match(/https:\/\/(?:mobile\.)?twitter\.com\/\S+\/[0-9]+/g) : [];
    let targetArr = (igArr).concat(igStoryArr, twArr);
    let res = [];
    try {
        res = await crawler.getImage(targetArr);
        if (res.length !== 0) {
            let newArr = [];
            for (let i = 0; i < res.length; i++) {
                newArr = newArr.concat(res[i]);
            }

            let msg = [];
            let imgPerMsg = Math.ceil(newArr.length / 5);
            for (let i = 0; i < newArr.length; i++) {
                let img = newArr[i];
                let imgIndex = i+1;
                // if (newArr.length <= 5) {
                //     if (msg[Math.floor(i / imgPerMsg)] !== undefined) {
                //         msg[Math.floor(i / imgPerMsg)] += `${img}`;
                //     } else {
                //         msg[Math.floor(i / imgPerMsg)] = `${img}`;
                //     }
                // } else {
                //     if (msg[Math.floor(i / imgPerMsg)] !== undefined) {
                //         msg[Math.floor(i / imgPerMsg)] += `${imgIndex}: ${img}\n`;
                //     } else {
                //         msg[Math.floor(i / imgPerMsg)] = `${imgIndex}: ${img}\n`;
                //     }
                // }
                msg[i] = img;
            }
            let msgArrObj = [];
            let tmpVideoMsg = [];
            for (let i = 0; i < msg.length; i++) {
                let currentMsg = msg[i];
                if (newArr.length <= 5) {
                    if (/\.mp4/.test(currentMsg)) {
                        msgArrObj.push({
                            'type': 'video',
                            "originalContentUrl": currentMsg,
                            "previewImageUrl": "https://pbs.twimg.com/profile_images/1269685818345394176/lPyLjEXz_400x400.jpg"
                        });
                    } else if (/\.jpe?g|\.png/i.test(currentMsg)) {
                        msgArrObj.push({
                            'type': 'image',
                            "originalContentUrl": currentMsg,
                            "previewImageUrl": currentMsg
                        });
                    } else {
                        msgArrObj.push({
                            'type': 'text',
                            'text': currentMsg
                        });
                    }
                } else {
                    if (/\.mp4/.test(currentMsg)) {
                        tmpVideoMsg.push(currentMsg);
                    } else {
                        msgArrObj.push({
                            "imageUrl": currentMsg,
                            "action": {
                                "type": "uri",
                                "label": "看大圖",
                                "uri": currentMsg
                            }
                        });
                    }
                }
            }

            if (newArr.length > 5) {
                msgArrObj = [{
                    "type": "template",
                    "altText": "94Orig Results",
                    "template": {
                        "type": "image_carousel",
                        "columns": msgArrObj
                    }
                }];

                if (tmpVideoMsg.length !== 0) {
                    let vidArr = [];
                    for (let i = 0; i < tmpVideoMsg.length; i++) {
                        let vid = tmpVideoMsg[i];
                        if (tmpVideoMsg.length > 4) {
                            vidArr.push({
                                'type': 'text',
                                'text': vid
                            });
                        } else {
                            vidArr.push({
                                'type': 'video',
                                "originalContentUrl": vid,
                                "previewImageUrl": "https://pbs.twimg.com/profile_images/1269685818345394176/lPyLjEXz_400x400.jpg"
                            });
                        }
                    }

                    msgArrObj = msgArrObj.concat(vidArr);
                }
            }

            client.replyMessage(event.replyToken, msgArrObj)
                .catch((err) => {
                    console.error(err);
                });
        }
    } catch (error) {
        console.error(error);
        return Promise.reject(error);
    }

    return true;
}

module.exports = router;