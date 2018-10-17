var cred = require('./cred.js');
var config = {
  development: {
    telegramToken: cred.telegramToken,
    port: 3000,
    url: 'http://127.0.0.1:3000/api/telegram'
  },
  production: {
    telegramToken: process.env.telegramToken,
    port: process.env.PORT,
    url: 'https://origin94origin.herokuapp.com/api/telegram'
  }
}
module.exports = config;
