var config = {
    development: {
        telegramToken: null,
        adminId: [],
        myId: null,
        galleryDlListPath: null,
        ytDlListPath: null,
        ytDl2ListPath: null,
        ojDownloadPath: null,
        ojLoginId: null,
        ojLoginPassword: null
    },
    production: {
        telegramToken: process.env.telegramToken,
        adminId: process.env.adminId,
        myId: process.env.myId,
        galleryDlListPath: process.env.downloadListPath,
        ytDlListPath: process.env.downloadListPath,
        ytD2ListPath: process.env.downloadListPath,
        ojDownloadPath: process.env.ojDownloadPath,
        ojLoginId: process.env.ojLoginId,
        ojLoginPassword: process.env.ojLoginPassword
    }
}

if (process.env.NODE_ENV != 'production') {
    config.development['telegramToken'] = require('./cred.js').telegramToken;
    config.development['adminId'] = require('./cred.js').adminId;
    config.development['myId'] = require('./cred.js').myId;
    config.development['galleryDlListPath'] = require('./cred.js').galleryDlListPath;
    config.development['ytDlListPath'] = require('./cred.js').ytDlListPath;
    config.development['ytDl2ListPath'] = require('./cred.js').ytDl2ListPath;
    config.development['ojDownloadPath'] = require('./cred.js').ojDownloadPath;
    config.development['ojLoginId'] = require('./cred.js').ojLoginId;
    config.development['ojLoginPassword'] = require('./cred.js').ojLoginPassword;
}

module.exports = config;
