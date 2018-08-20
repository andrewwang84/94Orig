const TelegramBot = require('node-telegram-bot-api');
const request = require('request');
var app = require('./app');
const config = require('./config.js');
const token = config.telegramToken;
const bot = new TelegramBot(token, { polling: true });
const apiUrl = 'https://origin94origin.herokuapp.com/api/telegram';// 'http://127.0.0.1:3000/api/telegram';

bot.onText(/https:\/\/*/, async (msg, match) => {
  const chatId = msg.chat.id;
  let target = match.input;
  target = target.split(",");

  const resp = await callApi(target);
  for (var i = 0; i < resp.length; i++) {
    bot.sendMessage(chatId, resp[i]);
  }
});

async function callApi(urls) {
  request('https://origin94origin.herokuapp.com', function (error, response, body) {
    
  });
  return new Promise(function (resolve, reject) {
    request.post(apiUrl, { form: { url: urls } }, function (error, response, body) {
      if (error) reject(error);
      let data = JSON.parse(body);
      data = data.url;
      resolve(data.split(","));
    });
  });
}
