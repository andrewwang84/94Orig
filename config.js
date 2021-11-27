var config = {
    development: {
        telegramToken: null,
        insEmail: null,
        insPass: null,
        port: 3001,
        insCookies: null,
        lineAccessToken: null,
        lineSecret: null,
        twitterToken: null,
        adminId: [],
        maintenceMode: false
    },
    production: {
        telegramToken: process.env.telegramToken,
        insEmail: process.env.insEmail,
        insPass: process.env.insPass,
        port: process.env.PORT,
        insCookies: process.env.insCookies,
        lineAccessToken: process.env.lineAccessToken,
        lineSecret: process.env.lineSecret,
        twitterToken: process.env.twitterToken,
        adminId: process.env.adminId,
        maintenceMode: process.env.maintenceMode
    }
}

if (process.env.NODE_ENV != 'production') {
    config.development['telegramToken'] = require('./cred.js').telegramToken;
    config.development['insEmail'] = require('./cred.js').insEmail;
    config.development['insPass'] = require('./cred.js').insPass;
    config.development['insCookies'] = require('./cred.js').insCookies;
    config.development['lineAccessToken'] = require('./cred.js').lineAccessToken;
    config.development['lineSecret'] = require('./cred.js').lineSecret;
    config.development['twitterToken'] = require('./cred.js').twitterToken;
    config.development['adminId'] = require('./cred.js').adminId;
}

module.exports = config;
