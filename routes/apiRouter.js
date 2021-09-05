const express = require('express');
const multer = require('multer');
const crawler = require('../crawler.js');
const router = express.Router();
const upload = multer();

const TEXT_CD = new Map();

router.post('/web/', upload.array(), async function (req, res) {
    try {
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

        let timestamp = Date.now();
        if (TEXT_CD.has(ip)) {
            let cdData = TEXT_CD.get(ip);
            if (timestamp - cdData.time > 60 * 1000) {
                TEXT_CD.delete(ip);
            } else {
                throw new Error(`CD 時間冷卻中，請 1 分鐘後再試一次`);
            }
        }

        console.log(`[LOG][WEB] ${ip}`);
        let result = await crawler.getImage(req.body.url);

        TEXT_CD.set(ip, {
            'time': timestamp
        });

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
