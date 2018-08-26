const line = require('@line/bot-sdk');
const express = require('express');
const multer = require('multer');
const crawler = require('../crawler.js');
const router = express.Router();
const upload = multer();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};
const client = new line.Client(config);

router.post('/callback', line.middleware(config), (req, res) => {
  console.log(req.body)
  // Promise
  //   .all(req.body.events.map(handleEvent))
  //   .then((result) => res.json(result))
  //   .catch((err) => {
  //     console.error(err);
  //     res.status(500).res.json(err);
  //   });
  res.status(200).json(res);
});

function handleEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') {
    // ignore non-text-message event
    return Promise.resolve(null);
  }

  // create a echoing text message
  const echo = { type: 'text', text: event.message.text };

  // use reply API
  return client.replyMessage(event.replyToken, echo);
}

module.exports = router;
