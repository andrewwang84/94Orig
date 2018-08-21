const TelegramBot = require('node-telegram-bot-api');
const request = require('request');
var app = require('./app');
const config = require('./config.js');
const token = config.telegramToken;
const bot = new TelegramBot(token, { polling: true });
const apiUrl = require('./config.js')[app.get('env')].url;

bot.onText(/https:\/\//, async (msg, match) => {
  const chatId = msg.chat.id;
  let target = match.input;

  bot.sendMessage(chatId, '要是我沒反應，請點我 => https://origin94origin.herokuapp.com/');

  target = target.substring(target.indexOf(`https:`), target.length);
  target = target.split("\n");

  try{
    let resp = await callApi(target);
    if (resp == '') {
      resp[0] = '沒圖片啦 !!';
    }

    for (var i = 0; i < resp.length; i++) {
      bot.sendMessage(chatId, resp[i]);
    }
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

bot.onText(/王彥儒/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '好帥 <3');
});

async function callApi(urls) {
  // Used to active heroku, but it's not working QQ
  // request('https://origin94origin.herokuapp.com/', function (error, response, body) {
  //   console.log(`wake up !!`)
  // });
  return new Promise(function (resolve, reject) {
    request.post(apiUrl, { form: { url: urls } }, function (error, response, body) {
      if (error) reject(error);
      let data = JSON.parse(body);
      data = data.url;
      resolve(data.split(","));
    });
  });
}
