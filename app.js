const TelegramBot = require('node-telegram-bot-api');
const token = require('./config.js')['development'].telegramToken;
const bot = new TelegramBot(token, { polling: true });
const adminId = require('./config.js')['development'].adminId;
const myId = require('./config.js')['development'].myId;
const crawler = require('./crawler.js');

const TYPE_IG_NORMAL = 1;
const TYPE_IG_STORY = 2;
const TYPE_X = 3;
const TYPE_YT = 4;
const TYPE_STREAM = 5;
const patterns = {
    [TYPE_IG_NORMAL]: /https:\/\/www\.instagram\.com\/(?:[\w-]+\/)?(?:p|reel)\/[\w-]+\/?/g,
    [TYPE_IG_STORY]: /https:\/\/www\.instagram\.com\/stories\/[\w.-]+(?:\/[\w-]+)?\/?/g,
    [TYPE_X]: /https:\/\/x\.com\/[\w-]+\/status\/[\d]+\/?/g,
    [TYPE_YT]: /https:\/\/www\.youtube\.com\/(?:watch\?v=|shorts\/)([\w-]+)/g,
    [TYPE_STREAM]: /https:\/\/(?:www\.)?(kick\.com|twitch\.tv)\/([\w-]+)/g,
};

bot.onText(/https:\/\//, async (msg, match) => {
    const chatId = msg.chat.id;
    let logName = msg.from.username || msg.from.first_name || msg.from.id;
    let chatMsg = match.input;

    try {
        if (!adminId.includes(chatId)) {
            console.info(`[LOG][${chatId}][${logName}] Not Admin - ${chatMsg}`);
            throw new Error(`System under maintain, please try again later`);
        }

        // 檢查網址
        let targets = [];
        for (const [type, regex] of Object.entries(patterns)) {
            let intType = parseInt(type);
            let typeTxt = '';
            switch (intType) {
                case TYPE_IG_STORY:
                    typeTxt = 'IG Story';
                    break;
                case TYPE_X:
                    typeTxt = 'X';
                    break;
                case TYPE_YT:
                    typeTxt = 'YT';
                    break;
                case TYPE_STREAM:
                    typeTxt = 'STREAM';
                    break;
                case TYPE_IG_NORMAL:
                default:
                    typeTxt = 'IG';
                    break;
            }
            if (regex.test(chatMsg)) {
                for (const target of chatMsg.match(regex)) {
                    let tmpData = {
                        'type': type,
                        'typeTxt': typeTxt,
                        'target': target,
                        'isDone': false,
                        'data': []
                    };
                    targets[target] = tmpData;
                }
            }
        }

        let downloadRemote = /--r/i.test(chatMsg);
        let urlOnly = /--s/i.test(chatMsg);

        if (chatId == myId) {
            downloadRemote = !downloadRemote;
        }

        // console.log(targets);
        // console.log('downloadRemote:', downloadRemote);
        // console.log('urlOnly:', urlOnly);

        if (Object.keys(targets).length === 0) {
            throw new Error(`[${logName}] 目前不支援該網址 ${chatMsg}`);
        }

        console.log(`[LOG][Telegram] ${logName}`);
        let resps = await crawler.getImage(targets, downloadRemote);
        // console.log('resps:', resps);
        if (Object.keys(resps).length !== 0) {
            sendMessages(msg, resps, downloadRemote, urlOnly);
        } else {
            bot.sendMessage(chatId, '沒東西啦 !!', { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
        }
    } catch (error) {
        console.error(`[ERROR][Telegram] ${error}`);
        bot.sendMessage(chatId, `出錯了: ${error}`, { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
    }
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `
\- Instagram 照片、影片：
    - https://www.instagram.com/p/\[貼文ID\]/
    - https://www.instagram.com/reel/\[貼文ID\]/

\- Instagram 限動：
    - https://www.instagram.com/stories/\[用戶名稱\]/
    - https://www.instagram.com/stories/\[用戶名稱\]/\[貼文ID\]/

\- X(Twitter) 圖片、影片：
    - https://x.com/[用戶名稱]/status/\[貼文ID\]/

\- 預設下載到 Telegram：
    - 下載到遠端主機，訊息帶「--r」
    - 獲取圖片網址，訊息帶「--s」

\- 一次傳入多個連結請用「\*換行\*」分開`, { parse_mode: 'Markdown' });
});

async function sendMessages(msg, datas, downloadRemote = false, urlOnly = false) {
    const chatId = msg.chat.id;
    if (downloadRemote) {
        let resTxt = '';
        for (const data of datas) {
            if (data.isDone && data.data.length > 0) {
                resTxt += `${data.target} 下載完成\n`;
            } else {
                resTxt += `${data.target} 下載失敗\n`;
            }
        }

        await bot.sendMessage(chatId, resTxt, { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
    } else {
        for (const data of datas) {
            if (data.isDone && data.data.length > 0) {
                let sendTwitLink = [];
                for (const link of data.data) {
                    // console.log('link:', link);
                    // 推特有多種大小，抓最大就好
                    if (data.type == TYPE_X) {
                        let tmpLink = link.split('?')[0];
                        if (sendTwitLink.includes(tmpLink)) {
                            continue;
                        }
                        sendTwitLink.push(tmpLink);
                    }

                    if (urlOnly) {
                        await bot.sendMessage(chatId, link);
                    } else if (data.type == TYPE_YT || data.type == TYPE_STREAM) {
                        await bot.sendMessage(chatId, `${data.target} 下載完成\n`, { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
                    } else {
                        try {
                            await bot.sendDocument(chatId, link);
                        } catch (error) {
                            console.log(`[ERROR] sendDocument error: ${error}`);
                            await bot.sendMessage(chatId, link);
                        }
                    }
                }
            } else if (data.type == TYPE_X) {
                let tmpData = [];
                tmpData[data.target] = data;
                let resp = await crawler.getImage(tmpData, downloadRemote, true);
                sendMessages(msg, resp, true);
            } else {
                await bot.sendMessage(chatId, `${data.target} 下載失敗`, { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
            }
        }
    }
}
