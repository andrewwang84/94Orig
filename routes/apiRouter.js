const express = require('express');
const line = require('@line/bot-sdk');
const multer = require('multer');
const crawler = require('../crawler.js');
const lineEvent = require('../line');
const router = express.Router();
const upload = multer();

const config = {
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
};

router.post('/telegram', upload.array(), async function (req, res) {
  try{
    let result = await telegram(req.body.url);
    res.status(200).json({ url: `${result}` });
  } catch (error) {
    res.status(500).json({ message: `${error}` });
    return error;
  }
});

router.post('/web', upload.array(), async function (req, res) {
  try{
    let result = await web(req.body.url);
    res.status(200).json({ url: `${result}` });
  } catch (error) {
    res.status(500).json({ message: `${error}` });
    return error;
  }
});

router.post('/line', line.middleware(config), (req, res) => {
  Promise
    .all(req.body.events.map(handleEvent))
    .then((result) => res.json(result))
    .catch((err) => {
      console.error(err);
      res.status(500).res.json(err);
    });
});

function telegram(urls) {
  return crawler.getImage(urls);
}

function web(url) {
  return crawler.getImage(urls);
}

module.exports = router;
