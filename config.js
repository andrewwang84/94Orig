var config = {
    development: {
        telegramToken: null,
        adminId: [],
        myId: null,
        galleryDlListPath: null,
        galleryDlListPath2: null,
        ytDlListPath: null,
        ytDl2ListPath: null
    },
    production: {
        telegramToken: process.env.telegramToken,
        adminId: process.env.adminId,
        myId: process.env.myId,
        galleryDlListPath: process.env.downloadListPath,
        galleryDlListPath2: process.env.downloadListPath2,
        ytDlListPath: process.env.downloadListPath,
        ytD2ListPath: process.env.downloadListPath
    }
}

if (process.env.NODE_ENV != 'production') {
    config.development['telegramToken'] = require('./cred.js').telegramToken;
    config.development['adminId'] = require('./cred.js').adminId;
    config.development['myId'] = require('./cred.js').myId;
    config.development['galleryDlListPath'] = require('./cred.js').galleryDlListPath;
    config.development['galleryDlListPath2'] = require('./cred.js').galleryDlListPath2;
    config.development['ytDlListPath'] = require('./cred.js').ytDlListPath;
    config.development['ytDl2ListPath'] = require('./cred.js').ytDl2ListPath;
}

module.exports = config;
