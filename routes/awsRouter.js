const express = require('express');
const router = express.Router();

var request = require('request');
var request = require('request').defaults({ jar: true });

router.use(function (req, res, next) {
  if (req.headers['x-amz-sns-message-type']) {
      req.headers['content-type'] = 'application/json;charset=UTF-8';
  }
  next();
});

router.post('/aws-test', function (req, res) {
  try {
    let msgBody = req.body
    let msgHeader = req.headers
    console.log(msgBody)
    console.log(msgHeader)
    request(msgBody.SubscribeURL, function (error, response, body) {
      console.log(body)
    });
    res.status(200).json({ url: `hi` });
  } catch (error) {
    res.status(500).json({ message: `${error}` });
    return error;
  }
});

module.exports = router;
