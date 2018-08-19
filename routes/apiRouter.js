const express = require('express');
const multer = require('multer');
const crawler = require('../crawler.js')
const router = express.Router();
const upload = multer();

router.post('/telegram', upload.array(), async function (req, res) {
  let result = await telegram(req.body.url);
  res.status(200).json({ url: `${result}` });
});

router.post('/web', upload.array(), async function (req, res) {
  let result = await web(req.body.url);
  res.status(200).json({ url: `${result}` });
});

function telegram(urls) {
  return crawler.getImage(urls);
}

function web(url) {

}

module.exports = router;
