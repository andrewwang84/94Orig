var config = {
    development: {
        telegramToken: null,
        insCookies: null,
        adminId: [],
        maintenceMode: true,
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
        // isHeadless: false,
        isHeadless: 'new'
    },
    production: {
        telegramToken: process.env.telegramToken,
        insCookies: process.env.insCookies,
        adminId: process.env.adminId,
        maintenceMode: true,
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
        isHeadless: 'new'
    }
}

if (process.env.NODE_ENV != 'production') {
    config.development['telegramToken'] = require('./cred.js').telegramToken;
    config.development['insCookies'] = require('./cred.js').insCookies;
    config.development['adminId'] = require('./cred.js').adminId;
}

module.exports = config;
