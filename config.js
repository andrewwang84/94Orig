var config = {
  telegramToken: '578132627:AAHx7v1sNnq0IkLQycgakTHaNp28Y6SK3yc',
  development: {
    port: 3000,
    url: 'http://127.0.0.1:3000/api/telegram'
  },
  production: {
    port: 8080,
    url: 'https://origin94origin.herokuapp.com/api/telegram'
  }
}
module.exports = config;
