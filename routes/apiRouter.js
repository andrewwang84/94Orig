const express = require('express');
const multer = require('multer');
const crawler = require('../crawler.js');
const router = express.Router();
const upload = multer();

router.post('/', upload.array(), async function (req, res) {
  try {
    console.log(req.body.url)
    let result = await crawler.getImage(req.body.url);
    res.status(200).json({ url: `${result}` });
  } catch (error) {
    res.status(500).json({ message: `${error}` });
    return error;
  }
});

module.exports = router;
