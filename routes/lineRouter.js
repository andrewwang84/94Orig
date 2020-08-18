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
    let targetArr = (msg.match(/https:\/\/www\.instagram\.com\/p\/\S{11}\//g)).concat(msg.match(/https:\/\/instagram\.com\/\S+/g));
    let res = [];
    try {
        res = await crawler.getImage(targetArr);

        if (res.length !== 0) {
            res = res[0][0];

            let msg = [];
            let imgPerMsg = Math.ceil(res.length / 5);
            for (let i = 0; i < res.length; i++) {
                let img = res[i];
                let imgIndex = i+1;
                if (res.length <= 5) {
                    if (msg[Math.floor(i / imgPerMsg)] !== undefined) {
                        msg[Math.floor(i / imgPerMsg)] += `${img}`;
                    } else {
                        msg[Math.floor(i / imgPerMsg)] = `${img}`;
                    }
                } else {
                    if (msg[Math.floor(i / imgPerMsg)] !== undefined) {
                        msg[Math.floor(i / imgPerMsg)] += `${imgIndex}: ${img}\n`;
                    } else {
                        msg[Math.floor(i / imgPerMsg)] = `${imgIndex}: ${img}\n`;
                    }
                }
            }

            let msgArrObj = [];
            for (let i = 0; i < msg.length; i++) {
                let currentMsg = msg[i];
                if (res.length <= 5) {
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