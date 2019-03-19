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
});

bot.onText(/王彥儒/, (msg) => {
  const chatId = msg.chat.id;
  bot.sendMessage(chatId, '好帥 <3');
});

bot.onText(/\/t/, (msg, match) => {
  const chatId = msg.chat.id;
  const input = match.input;
  let counts = input.split(" ");
  let resp = (counts['1'] * 5) + (counts['2'] * 10) + (counts['3'] * 25);
  let until = 50000 - resp;
  let heart = Math.round(until/25);
  let keyRound = Math.round(until/(20*10+40*25));
  let key = keyRound*5;
  let data = `目前分數: ${resp}\n還差 ${until} 分可兌換新卡\n約等於 ${heart} 個❤\n${keyRound}關鑰匙關，${key}把鑰匙`;
  bot.sendMessage(chatId, data);
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
