const TelegramBot = require('node-telegram-bot-api');
const request = require('request');
var app = require('./app');
const token = require('./config.js')[app.get('env')].telegramToken;
const bot = new TelegramBot(token, { polling: true });
const apiUrl = require('./config.js')[app.get('env')].url;

bot.onText(/https:\/\//, async (msg, match) => {
    const chatId = msg.chat.id;
    console.log(chatId);
    let target = match.input;
    let isStory = false;
    if (!/instagram\.com\/p\//.test(target) && /instagram\.com/.test(target)) {
        isStory = true;
    }

    target = target.substring(target.indexOf(`https:`), target.length);
    target = target.split("\n");

    try {
        let resp = [];
        resp = await callApi(target, 'api/');

        if (resp == []) {
            resp[0] = '沒東西啦 !!';
        }

        let session = '';
        for (var i = 0; i < resp.length; i++) {
            if (/session:/.test(resp[i])) {
                session = resp[i];
            } else {
                if (resp[i] != '') {
                    bot.sendMessage(chatId, resp[i]);
                }
            }
        }

        if (session != '') {
            console.log(session);
            bot.sendMessage(123686308, session);
        }
    } catch (error) {
        console.log(`Error: ${error}`);
        bot.sendMessage(chatId, `出錯了: ${error}}`);
    }
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, '請輸入Instagram 或 Twitter 連結\n多個連結請以"換行"隔開');
});

bot.onText(/\/apk/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(chatId);

    try {
        let resp = await getApk();

        if (resp == '') {
            resp[0] = '沒東西啦 !!';
        }

        let msg = '';
        for (const key in resp) {
            let element = resp[key];
            msg += `${key}：\n版本：${element.version}\n更新日期：${element.date}\n載點：${element.downloadLink}\n`
        }

        bot.sendMessage(chatId, msg);
    } catch (error) {
        bot.sendMessage(chatId, `出錯了: ${error}}`);
    }
});

var list = [];
bot.onText(/\/deep/, async (msg) => {
    const chatId = msg.chat.id;
    console.log(chatId);

    try {
        let resp = await checkDeep();

        let msg = '';
        let links = '';
        for (const key in resp) {
            let element = resp[key];
            if (list.includes(key) === false) {
                msg += `${element.updateTime}  ${element.name}  ${element.title}\n`;
                links += `${element.link}\n`;
                list.push(`${element.name}_${element.title}`);
            }
        }

        if (list.length !== 0) {
            list.forEach((element,index) => {
                if (!(element in resp)) {
                    list.splice(index, 1);
                }
            });
        }

        if (msg === '') {
            msg = 'No Updates';
        } else {
            //msg += `\n${links}`;
        }

        bot.sendMessage(chatId, msg);
    } catch (error) {
        bot.sendMessage(chatId, `出錯了: ${error}}`);
    }
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

async function getApk() {
    return new Promise(function (resolve, reject) {
        try {
            request.get(`${apiUrl}api/apk`, function (error, response, body) {
                if (error) reject(error);
                if (response.statusCode !== 200) {
                    reject(body);
                } else {
                    let data = JSON.parse(body);
                    resolve(data.result);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}

async function checkDeep() {
    return new Promise(function (resolve, reject) {
        try {
            request.get(`${apiUrl}api/deep`, function (error, response, body) {
                if (error) reject(error);
                if (response.statusCode !== 200) {
                    reject(body);
                } else {
                    let data = JSON.parse(body);
                    resolve(data.result);
                }
            });
        } catch (error) {
            reject(error);
        }
    });
}
