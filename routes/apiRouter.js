var express = require('express');
var multer = require('multer');
var crawler = require('../crawler.js')
var router = express.Router();
var upload = multer();

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
