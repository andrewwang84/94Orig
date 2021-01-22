const express = require('express');
const multer = require('multer');
const crawler = require('../crawler.js');
const router = express.Router();
const upload = multer();

router.post('/', upload.array(), async function (req, res) {
    try {
        //let result = await crawler.getImage(req.body.url);
        let result = `Api Deprecated`;
        let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        console.log(`[LOG][OLD_WEB] ${ip}`);
        console.log(`[LOG][OLD_WEB] ${req.body.url}`);
        res.status(200).json({ url: `${result}` });
    } catch (error) {
        res.status(500).json({ message: `${error}` });
        return error;
    }
});

router.post('/web/', upload.array(), async function (req, res) {
    try {
        let ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        console.log(`[LOG][WEB] ${ip}`);
        let result = await crawler.getImage(req.body.url);
        res.status(200).json({ url: `${result}` });
    } catch (error) {
        res.status(500).json({ message: `${error}` });
        return error;
    }
});

router.get('/apk/', async function (req, res) {
    try {
        let result = await crawler.getApk();
        res.status(200).json({ result });
    } catch (error) {
        res.status(500).json({ message: `${error}` });
        return error;
    }
});

module.exports = router;
