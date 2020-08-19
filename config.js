var config = {
    development: {
        telegramToken: null,
        insEmail: null,
        insPass: null,
        port: 3000,
        insCookies: null,
        url: 'http://127.0.0.1:3000/',
        deepSite: null,
        lineAccessToken: null,
        lineSecret: null,
        twitterToken: null
    },
    production: {
        telegramToken: process.env.telegramToken,
        insEmail: process.env.insEmail,
        insPass: process.env.insPass,
        port: process.env.PORT,
        insCookies: process.env.insCookies,
        url: process.env.url,
        deepSite: process.env.deepSite,
        lineAccessToken: process.env.lineAccessToken,
        lineSecret: process.env.lineSecret,
        twitterToken: process.env.twitterToken
    }
}

if (process.env.NODE_ENV != 'production') {
    config.development['telegramToken'] = require('./cred.js').telegramToken;
    config.development['insEmail'] = require('./cred.js').insEmail;
    config.development['insPass'] = require('./cred.js').insPass;
    config.development['insCookies'] = require('./cred.js').insCookies;
    config.development['deepSite'] = require('./cred.js').deepSite;
    config.development['lineAccessToken'] = require('./cred.js').lineAccessToken;
    config.development['lineSecret'] = require('./cred.js').lineSecret;
    config.development['twitterToken'] = require('./cred.js').twitterToken;
}

module.exports = config;
