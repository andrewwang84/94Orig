var config = {
    development: {
        telegramToken: null,
        adminId: [],
        myId: null,
        galleryDlListPath: null,
        ytDlListPath: null
    },
    production: {
        telegramToken: process.env.telegramToken,
        adminId: process.env.adminId,
        myId: process.env.myId,
        galleryDlListPath: process.env.downloadListPath,
        ytDlListPath: process.env.downloadListPath
    }
}

if (process.env.NODE_ENV != 'production') {
    config.development['telegramToken'] = require('./cred.js').telegramToken;
    config.development['adminId'] = require('./cred.js').adminId;
    config.development['myId'] = require('./cred.js').myId;
    config.development['galleryDlListPath'] = require('./cred.js').galleryDlListPath;
    config.development['ytDlListPath'] = require('./cred.js').ytDlListPath;
}

module.exports = config;
