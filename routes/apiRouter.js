const express = require('express');
const multer = require('multer');
const crawler = require('../crawler.js')
const router = express.Router();
const upload = multer();

router.post('/telegram', upload.array(), async function (req, res) {
  try{
    let result = await telegram(req.body.url);
    res.status(200).json({ url: `${result}` });
  } catch (error) {
    res.status(500).json({ message: `${error}` });
    return next(error);
  }
});

router.post('/web', upload.array(), async function (req, res) {
  try{
    let result = await web(req.body.url);
    res.status(200).json({ url: `${result}` });
  } catch (error) {
    res.status(500).json({ message: `${error}` });
    return next(error);
  }
});

function telegram(urls) {
  return crawler.getImage(urls);
}

function web(url) {
  return crawler.getImage(urls);
}

module.exports = router;
