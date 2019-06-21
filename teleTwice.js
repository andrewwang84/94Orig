let request = require('request').defaults({ jar: true });
let cheerio = require('cheerio');
let app = require('./app');
const apiUrl = require('./config.js')[app.get('env')].url;
const channel = require('./config.js')[app.get('env')].channel;
const snsLists = {
  test: {
    source: 'twitter',
    url: 'https://twitter.com/yrwang84',
  },
  // twicetagram: {
  //   source: 'instagram',
  //   url: 'https://www.instagram.com/twicetagram/',
  // },
  // jypetwice_japan: {
  //   source: 'instagram',
  //   url: 'https://www.instagram.com/jypetwice_japan/',
  // },
  // JYPETWICE: {
  //   source: 'twitter',
  //   url: 'https://twitter.com/JYPETWICE',
  // },
  // JYPETWICE_JAPAN: {
  //   source: 'twitter',
  //   url: 'https://twitter.com/JYPETWICE_JAPAN',
  // }
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
    let url = snsLists[name].url;
    try {
      request(url, function (error, response, body) {
        const $ = cheerio.load(body);
        $(`.permalink-tweet-container`).each((index, element) => {
            console.log(element);
        })
      });
    } catch (error) {
      console.log(error);
    }
  }
};

//setIntervel(checkUpdate(), 180000);
checkUpdate();
