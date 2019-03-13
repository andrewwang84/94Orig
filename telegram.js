const TelegramBot = require('node-telegram-bot-api');
const request = require('request');
var app = require('./app');
const token = require('./config.js')[app.get('env')].telegramToken;
const bot = new TelegramBot(token, { polling: true });
const apiUrl = require('./config.js')[app.get('env')].url;

bot.onText(/https:\/\//, async (msg, match) => {
  const chatId = msg.chat.id;
  let target = match.input;
  let isStory = false;
  if (target.search(/\/p\//) === -1 && target.search(/instagram/) !== -1) {
    isStory = true;
  }

  target = target.substring(target.indexOf(`https:`), target.length);
  target = target.split("\n");

  try{
    if (isStory === true) {
      bot.sendMessage(chatId, '限時動態請稍候 10~15 秒');
    }
    let resp = await callApi(target, 'api/telegram');
    if (resp == '') {
      resp[0] = '沒東西啦 !!';
    }

    for (var i = 0; i < resp.length; i++) {
      bot.sendMessage(chatId, resp[i]);
    }

    //setTimeout(() => { bot.sendMessage(chatId, '要是我沒反應，請點我 => https://origin94origin.herokuapp.com/'); }, 1500);
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
  bot.sendMessage(chatId, '請輸入Instagram 或 Twitter 連結\n多個連結請以"換行"隔開');
});

bot.onText(/\/ping/, async (msg) => {
  const chatId = msg.chat.id;
  let resp = await yamCheck('yam');
  let data = '';
  for (let value of resp) {
    data = `${data}\n${value}`;
  }
  bot.sendMessage(chatId, data);
  //setTimeout(() => { bot.sendMessage(chatId, '要是我沒反應，請點我 => https://origin94origin.herokuapp.com/'); }, 1000);
});

bot.onText(/王彥儒/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '好帥 <3');
});

async function callApi(urls, route) {
  return new Promise(function (resolve, reject) {
    try {
      request.post(`${apiUrl}${route}`, { form: { url: urls } }, function (error, response, body) {
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

async function yamCheck(route) {
  return new Promise(function (resolve, reject) {
    try {
      request.get(`${apiUrl}${route}`, function (error, response, body) {
        if (error) reject(error);
        if (response.statusCode !== 200) {
          reject(body);
        } else {
          let data = JSON.parse(body);
          resolve(data.data);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}
