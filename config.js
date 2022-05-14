var config = {
    development: {
        telegramToken: null,
        insEmail: null,
        insPass: null,
        insCookies: null,
        insEmail_2: null,
        insCookies_2: null,
        twitterToken: null,
        adminId: [],
        maintenceMode: true
    },
    production: {
        telegramToken: process.env.telegramToken,
        insEmail: process.env.insEmail,
        insPass: process.env.insPass,
        insCookies: process.env.insCookies,
        insEmail_2: process.env.insEmail_2,
        insCookies_2: process.env.insCookies_2,
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
    config.development['insEmail_2'] = require('./cred.js').insEmail_2;
    config.development['insCookies_2'] = require('./cred.js').insCookies_2;
    config.development['twitterToken'] = require('./cred.js').twitterToken;
    config.development['adminId'] = require('./cred.js').adminId;
}

module.exports = config;
