const express = require('express');
const multer = require('multer');
const crawler = require('../crawler.js');
const router = express.Router();
const upload = multer();

var request = require('request');
var request = require('request').defaults({ jar: true });

router.post('/telegram', upload.array(), async function (req, res) {
  try {
    console.log(req.body.url)
    let result = await getImage(req.body.url);
    res.status(200).json({ url: `${result}` });
  } catch (error) {
    res.status(500).json({ message: `${error}` });
    return error;
  }
});

router.post('/web', upload.array(), async function (req, res) {
  try{
    let result = await getImage(req.body.url);
    res.status(200).json({ url: `${result}` });
  } catch (error) {
    res.status(500).json({ message: `${error}` });
    return error;
  }
});

function getImage(urls) {
  return crawler.getImage(urls);
}

module.exports = router;
