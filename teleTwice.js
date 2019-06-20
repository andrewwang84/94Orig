const TelegramBot = require('node-telegram-bot-api');
const request = require('request');
let app = require('./app');
const token = require('./config.js')[app.get('env')].telegramToken;
const bot = new TelegramBot(token, { polling: true });
const apiUrl = require('./config.js')[app.get('env')].url;
const channel = `@twiceDev`;
const listenLists = [
  [
    'source': 'instagram',
    'url': '',
    'name': ''
  ],
  [
    'source': 'instagram',
    'url': '',
    'name': ''
  ],
  [
    'source': 'instagram-story',
    'url': '',
    'name': ''
  ],
  [
    'source': 'Twitter',
    'url': '',
    'name': ''
  ],
  [
    'source': 'Twitter',
    'url': '',
    'name': ''
  ],
];

function sendMsg(url, name, snsUrl, imgUrls = '') {
  let html = `<b>From <a href="${url}">@${name}</a>:</b>
${snsUrl}
<b>Img Source</b>
${imgUrls}
`;

  bot.sendMessage(channel, html, {parse_mode : "HTML"});
};

async function checkUpdate() {

};

setIntervel(checkUpdate, 180000);
