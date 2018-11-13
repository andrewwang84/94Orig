const TelegramBot = require('node-telegram-bot-api');
const request = require('request');
var app = require('./app');
const token = require('./config.js')[app.get('env')].telegramToken;
const bot = new TelegramBot(token, { polling: true });
const apiUrl = require('./config.js')[app.get('env')].url;

bot.onText(/https:\/\//, async (msg, match) => {
  const chatId = msg.chat.id;
  let target = match.input;

  target = target.substring(target.indexOf(`https:`), target.length);
  target = target.split("\n");

  if (target[0].search(/https:\/\/www.instagram.com\/p\//) === -1 && target[0].search(/https:\/\/instagram.com\//) !== -1) {
    target = target[0].substring(22, target[0].length);
    target = [`https:/\/www.instagram.com/stories/${target}`];
  }

  try{
    let resp = await callApi(target);
    if (resp == '') {
      resp[0] = '沒圖片啦 !!';
    }

    for (var i = 0; i < resp.length; i++) {
      bot.sendMessage(chatId, resp[i]);
    }

    setTimeout(() => { bot.sendMessage(chatId, '要是我沒反應，請點我 => https://origin94origin.herokuapp.com/'); }, 1500);
  } catch (error) {
    bot.sendMessage(chatId, `出錯了: ${error}}`);
  }
});

bot.onText(/圓仔/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '笨馬麻你給窩閉嘴 !!!');
});

bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '請輸入instagram 或 twitter 連結\n多個連結請以"換行"隔開\n要是沒反應，請點選以下連結\n https://origin94origin.herokuapp.com/');
});

bot.onText(/\/ping/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, 'https://origin94origin.herokuapp.com/');
});

bot.onText(/王彥儒/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '好帥 <3');
});

async function callApi(urls) {
  return new Promise(function (resolve, reject) {
    try {
      request.post(apiUrl, { form: { url: urls } }, function (error, response, body) {
        if (error) reject(error);
        if (response.statusCode !== 200) {
          reject(body);
        } else {
          let data = JSON.parse(body);
          data = data.url;
          resolve(data.split(","));
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
