const express = require('express');
const router = express.Router();
const request = require('request').defaults({ jar: true });

/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: '94Origin' });
});

router.get('/yam',async function (req, res, next) {
  try {
    let response = [];
    let target = [
      'https://qu.yam.com',
      'https://tian.yam.com',
      'https://dq.yam.com',
      'https://fps.yam.com'
    ];

    for (let url of target) {
      let result = await checkYam(url);
      response.push(result);
    }

    res.status(200).json({
      data: response
    });
  } catch (error) {
    res.status(500).json({ message: `${error}` });
    return error;
  }
});

async function checkYam(url) {
  return new Promise(function (resolve, reject) {
    request(url, function (error, response) {
      if (error) reject(error);

      let result = `${url}: ${response.statusCode}, ${response.statusMessage}`;
      resolve(result);
    });
  });
}

module.exports = router;
