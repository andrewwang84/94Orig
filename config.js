var config = {
    development: {
        telegramToken: null,
        adminId: [],
    },
    production: {
        telegramToken: process.env.telegramToken,
        adminId: process.env.adminId,
    }
}

if (process.env.NODE_ENV != 'production') {
    config.development['telegramToken'] = require('./cred.js').telegramToken;
    config.development['adminId'] = require('./cred.js').adminId;
}

module.exports = config;
