var config = {
    development: {
        telegramToken: null,
        insCookies: null,
        adminId: [],
        maintenceMode: true,
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0',
        twitterKey: null,
        twitterKeySecret: null,
        twitterAccessToken: null,
        twitterAccessTokenSecret: null,
        // isHeadless: false,
        isHeadless: 'new'
    },
    production: {
        telegramToken: process.env.telegramToken,
        insCookies: process.env.insCookies,
        adminId: process.env.adminId,
        maintenceMode: true,
        ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/117.0',
        twitterKey: process.env.twitterKey,
        twitterKeySecret: process.env.twitterKeySecret,
        twitterAccessToken: process.env.twitterAccessToken,
        twitterAccessTokenSecret: process.env.twitterAccessTokenSecret,
        isHeadless: 'new'
    }
}

if (process.env.NODE_ENV != 'production') {
    config.development['telegramToken'] = require('./cred.js').telegramToken;
    config.development['insCookies'] = require('./cred.js').insCookies;
    config.development['adminId'] = require('./cred.js').adminId;
    config.development['twitterKey'] = require('./cred.js').twitterKey;
    config.development['twitterKeySecret'] = require('./cred.js').twitterKeySecret;
    config.development['twitterAccessToken'] = require('./cred.js').twitterAccessToken;
    config.development['twitterAccessTokenSecret'] = require('./cred.js').twitterAccessTokenSecret;
}

module.exports = config;
