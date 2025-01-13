var config = {
    development: {
        telegramToken: null,
        adminId: [],
        myId: null
    },
    production: {
        telegramToken: process.env.telegramToken,
        adminId: process.env.adminId,
        myId: process.env.myId
    }
}

if (process.env.NODE_ENV != 'production') {
    config.development['telegramToken'] = require('./cred.js').telegramToken;
    config.development['adminId'] = require('./cred.js').adminId;
    config.development['myId'] = require('./cred.js').myId;
}

module.exports = config;
