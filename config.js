var config = {
  development: {
    telegramToken: null,
    insEmail: 'leofddt@gmail.com',
    insPass: null,
    port: 3000,
    url: 'http://127.0.0.1:3000/'
  },
  production: {
    telegramToken: process.env.telegramToken,
    insEmail: 'sanaingress@gmail.com',
    insPass: process.env.insPass,
    port: process.env.PORT,
    url: 'https://origin94origin.herokuapp.com/'
  }
}

if (process.env.NODE_ENV != 'production') {
  config.development['telegramToken'] = require('./cred.js').telegramToken;
  config.development['insPass'] = require('./cred.js').insPass;
}

module.exports = config;
