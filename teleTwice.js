const TelegramBot = require('node-telegram-bot-api');
const request = require('request');
let app = require('./app');
const apiUrl = require('./config.js')[app.get('env')].url;
const channel = require('./config.js')[app.get('env')].channel;
let snsLists = {
  test: {
    source: 'twitter',
    url: 'https://twitter.com/yrwang84',
  },
  twicetagram: {
    source: 'instagram',
    url: 'https://www.instagram.com/twicetagram/',
  },
  jypetwice_japan: {
    source: 'instagram',
    url: 'https://www.instagram.com/jypetwice_japan/',
  },
  JYPETWICE: {
    source: 'twitter',
    url: 'https://twitter.com/JYPETWICE',
  },
  JYPETWICE_JAPAN: {
    source: 'twitter',
    url: 'https://twitter.com/JYPETWICE_JAPAN',
  }
};

function sendMsg(url, name, snsUrl, imgUrls = '') {
  let html = `<b>From <a href="${url}">@${name}</a>:</b>
${snsUrl}
<b>Img Source</b>
${imgUrls}
`;

  bot.sendMessage(channel, html, {parse_mode : "HTML"});
};

async function checkUpdate() {
  for(let name in snsLists){
    console.log(snsLists[name]);
  }
};

//setIntervel(checkUpdate(), 180000);
checkUpdate();
