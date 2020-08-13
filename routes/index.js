const express = require('express');
const router = express.Router();
const request = require('request').defaults({ jar: true });

/* GET home page. */
router.get('/', function(req, res, next) {
    res.render('index', { title: '94Origin' });
});

module.exports = router;
