const express = require('express');
const multer = require('multer');
const crawler = require('../crawler.js');
const router = express.Router();
const upload = multer();

router.post('/web/', upload.array(), async function (req, res) {
    try {
        let ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        console.log(`[ERROR][${req.headers.origin}][${ip}] 403`);
        throw new Error(`Bye`);
    } catch (error) {
        res.status(500).json({ message: `${error}` });
        return error;
    }
});

module.exports = router;
