const TelegramBot = require('node-telegram-bot-api');
const app = require('./app');
const token = require('./config.js')[app.get('env')].telegramToken;
const bot = new TelegramBot(token, { polling: true });
const adminId = require('./config.js')[app.get('env')].adminId;
const maintenceMode = require('./config.js')[app.get('env')].maintenceMode;
const crawler = require('./crawler.js');

const TEXT_CD = new Map();

bot.onText(/https:\/\//, async (msg, match) => {
    const chatId = msg.chat.id;
    let logName = msg.from.username || msg.from.first_name || msg.from.id;
    let chatMsg = match.input;

    try {
        if (!adminId.includes(chatId) && maintenceMode == true) {
            console.log(`[LOG][${chatId}][${logName}] Maintain Block - ${chatMsg}`);
            throw new Error(`System under maintain, please try again later`);
        }
        if (!adminId.includes(chatId)) {
            await bot.sendMessage(adminId[0], `[@${logName}] ${chatMsg}`);
        }
        let target = chatMsg.match(/(?:https:\/\/www\.instagram\.com\/p\/\S{11})|(?:https:\/\/(?:www\.)?instagram\.com\/\S+)|(?:https:\/\/(?:mobile\.)?twitter\.com\/\S+\/[0-9]+)/g);
        let forceUpdate = (chatMsg.match(/--f/i) !== null) ? true : false;

        if (target == null) {
            throw new Error(`[${logName}] 目前不支援該網址 ${chatMsg}`);
        }
        let timestamp = Date.now();
        if (TEXT_CD.has(chatId) && !adminId.includes(chatId)) {
            let cdData = TEXT_CD.get(chatId);
            if (timestamp - cdData.time > 60 * 1000) {
                TEXT_CD.delete(chatId);
            } else {
                throw new Error(`[${logName}][${chatId}] CD 時間冷卻中，請 1 分鐘後再試一次`);
            }
        }
        console.log(`[LOG][Telegram] ${logName}`);
        let resp = await crawler.getImage(target, forceUpdate, logName);

        TEXT_CD.set(chatId, {
            'time': timestamp
        });

        if (resp.length !== 0) {
            let resArr = [];
            for (let i = 0; i < resp.length; i++) {
                resArr = resArr.concat(resp[i]);
            }

            for (var i = 0; i < resArr.length; i++) {
                if (resArr[i] != '') {
                    if (/mp4|jpe?g|png|heic/.test(resArr[i]) && adminId.includes(chatId)) {
                        try {
                            if (/dst-webp/.test(resArr[i])) {
                                await bot.sendMessage(chatId, resArr[i], { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
                            } else {
                                await bot.sendDocument(chatId, resArr[i]);
                            }
                        } catch (error) {
                            console.log(`[ERROR] sendDocument error: ${error}`);
                            await bot.sendMessage(chatId, resArr[i]);
                        }
                    } else if (/\[ADMIN\]/.test(resArr[i])) {
                        await bot.sendMessage(adminId[0], resArr[i]);
                    } else if (/blob/.test(resArr[i])) {
                        await bot.sendMessage(chatId, 'Get Blob, https://twitter.com/twicebot_/media', { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
                    } else {
                        await bot.sendMessage(chatId, resArr[i], { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
                    }
                }
            }
        } else {
            bot.sendMessage(chatId, '沒東西啦 !!', { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
        }
    } catch (error) {
        console.log(`[ERROR][Telegram] ${error}`);
        bot.sendMessage(chatId, `出錯了: ${error}`, { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
    }
});

bot.onText(/\/reboot/, async (msg, match) => {
    const chatId = msg.chat.id;
    let logName = msg.from.username || msg.from.first_name || msg.from.id;
    let chatMsg = match.input;

    try {
        if (!adminId.includes(chatId) && maintenceMode == true) {
            console.log(`[LOG][${chatId}][${logName}] Maintain Block - ${chatMsg}`);
            throw new Error(`System under maintain, please try again later`);
        }

        if (Date.now() - msg.date * 1000 < 1000) {
            console.log('[Telegram] 重啟指令');
            await bot.sendMessage(chatId, `正在重啟程式......`, { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
            process.exit();
        }
    } catch (error) {
        console.log(`[ERROR][Telegram] ${error}`);
        bot.sendMessage(chatId, `出錯了: ${error}`, { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
    }
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `
\- 保存 Instagram 照片、影片：傳入該則貼文連結

\- 保存 Instagram 限動：傳入該用戶\*帳號\*連結 or 單則限動連結
    限動撈取比較費時，請耐心等候
    撈取不完全可嘗試在網址後面空一格加上 \`\-\-f\` 強制重整

\- 保存 Twitter 原圖\(orig\)、影片：傳入單篇推文

\- 一次傳入多個連結請用「\*換行\*」分開`, { parse_mode: 'Markdown'});
});
