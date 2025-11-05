const TelegramBot = require('node-telegram-bot-api');
const kill = require('kill-with-style');
const token = require('./config.js')['development'].telegramToken;
const bot = new TelegramBot(token, { polling: true });
const adminId = require('./config.js')['development'].adminId;
const galleryDlListPath = require('./config.js')['development'].galleryDlListPath;
const ytDlListPath = require('./config.js')['development'].ytDlListPath;
const ytDl2ListPath = require('./config.js')['development'].ytDl2ListPath;
const myId = require('./config.js')['development'].myId;
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
if (!fs.existsSync(galleryDlListPath)) {
    console.log(`[LOG] gallery-dl list path not exists, create it: ${galleryDlListPath}`);
    fs.mkdirSync(path.dirname(galleryDlListPath), { recursive: true });
    fs.writeFileSync(galleryDlListPath, '');
}
if (!fs.existsSync(ytDlListPath)) {
    console.log(`[LOG] yt-dlp list path not exists, create it: ${ytDlListPath}`);
    fs.mkdirSync(path.dirname(ytDlListPath), { recursive: true });
    fs.writeFileSync(ytDlListPath, '');
}
if (!fs.existsSync(ytDl2ListPath)) {
    console.log(`[LOG] yt-dlp list2 path not exists, create it: ${ytDl2ListPath}`);
    fs.mkdirSync(path.dirname(ytDl2ListPath), { recursive: true });
    fs.writeFileSync(ytDl2ListPath, '');
}
const absoluteGalleryDlListPath = path.resolve(galleryDlListPath);
const absoluteYtDlListPath = path.resolve(ytDlListPath);
const absoluteYtDl2ListPath = path.resolve(ytDl2ListPath);

const TYPE_IG_NORMAL = 1;
const TYPE_IG_STORY = 2;
const TYPE_X = 3;
const TYPE_YT = 4;
const TYPE_STREAM = 5;
const TYPE_M3U8 = 6;
const TYPE_NAVER = 7;
const patterns = {
    [TYPE_IG_NORMAL]: /https:\/\/www\.instagram\.com\/(?:[\w-]+\/)?(?:p|reel)\/[\w-]+\/?/g,
    [TYPE_IG_STORY]: /https:\/\/www\.instagram\.com\/stories\/[\w.-]+(?:\/[\w-]+)?\/?/g,
    [TYPE_X]: /https:\/\/x\.com\/[\w-]+\/status\/[\d]+\/?/g,
    [TYPE_YT]: /https:\/\/(?:www\.youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/g,
    [TYPE_STREAM]: /https:\/\/(?:www\.)?(kick\.com|twitch\.tv)\/([\w-]+)/g,
    [TYPE_M3U8]: /https:\/\/.+\.m3u8/g,
    [TYPE_NAVER]: /https:\/\/blog\.naver\.com\/\S+\/\d+/g,
};

const videoQueue = [];
const streamQueue = [];
const videoRunningQueue = [];
const streamRunningQueue = [];

const doneEmpji = '🟩';
const unDoneEmpji = '⬜️';

bot.onText(/https:\/\//, async (msg, match) => {
    const chatId = msg.chat.id;
    const msgId = msg.message_id;
    let logName = msg.from.username || msg.from.first_name || msg.from.id;
    let chatMsg = match.input;

    try {
        if (/\/gal/.test(chatMsg) || /\/ytd/.test(chatMsg)) {
            return;
        }
        if (await checkCanUse(chatId, msgId, logName, chatMsg) === false) {
            return;
        }

        console.log(`[LOG][Telegram] ${logName}`);

        // 檢查網址
        let imgTargets = [],
            streamTargets = [],
            vidTargets = [];
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
                case TYPE_M3U8:
                    typeTxt = 'M3U8';
                    break;
                case TYPE_NAVER:
                    typeTxt = 'IMG';
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
                    if (intType == TYPE_IG_NORMAL || intType == TYPE_IG_STORY || intType == TYPE_X || TYPE_NAVER) {
                        imgTargets[target] = tmpData;
                    } else if (intType == TYPE_STREAM || intType == TYPE_M3U8) {
                        let replyMsg = await bot.sendMessage(chatId, `${target}\n\n即將開始下載...`, { is_disabled: true, reply_to_message_id: msgId, allow_sending_without_reply: true });
                        let replyMsgId = replyMsg.message_id;
                        tmpData['chatId'] = chatId;
                        tmpData['replyMsgId'] = replyMsgId;
                        if (streamRunningQueue.length >= 1) {
                            streamQueue.push(tmpData);
                        } else {
                            streamRunningQueue.push(tmpData);
                            getVideo(tmpData);
                        }
                        streamTargets[target] = tmpData;
                    } else {
                        let replyMsg = await bot.sendMessage(chatId, `${target}\n\n即將開始下載...`, { is_disabled: true, reply_to_message_id: msgId, allow_sending_without_reply: true });
                        let replyMsgId = replyMsg.message_id;
                        tmpData['chatId'] = chatId;
                        tmpData['replyMsgId'] = replyMsgId;
                        if (videoRunningQueue.length >= 2) {
                            videoQueue.push(tmpData);
                        } else {
                            videoRunningQueue.push(tmpData);
                            getVideo(tmpData);
                        }
                        vidTargets[target] = tmpData;
                    }
                }
            }
        }

        let downloadRemote = /--r/i.test(chatMsg);
        let urlOnly = /--s/i.test(chatMsg);
        if (chatId == myId) {
            downloadRemote = !downloadRemote;
        }

        if (Object.keys(imgTargets).length === 0 && Object.keys(vidTargets).length === 0 && Object.keys(streamTargets).length === 0) {
            throw new Error(`[${logName}] 沒發現支援的網址 ${chatMsg}`);
        }

        if (Object.keys(imgTargets).length > 0) {
            let resps = await getImage(imgTargets, downloadRemote);
            if (Object.keys(resps).length !== 0) {
                sendMessages(msg, resps, downloadRemote, urlOnly);
            } else {
                bot.sendMessage(chatId, '沒東西啦 !!', { is_disabled: true, reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
            }
        }
    } catch (error) {
        console.error(`[ERROR][Telegram] ${error}`);
        bot.sendMessage(chatId, `出錯了: ${error}`, { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
    }
});

bot.onText(/^\/gal\s/, async (msg, match) => {
    const chatId = msg.chat.id;
    const msgId = msg.message_id;
    let logName = msg.from.username || msg.from.first_name || msg.from.id;
    let chatMsg = match.input;

    try {
        if (await checkCanUse(chatId, msgId, logName, chatMsg) === false) {
            return;
        }

        console.log(`[LOG][Telegram][gal] ${logName}`);

        let urls = chatMsg.match(/https?:\/\/[^\s]+/g);
        if (!urls || urls.length === 0) {
            throw new Error(`[${logName}] 沒有發現任何網址`);
        }

        let galleryDlListStream = fs.createWriteStream(absoluteGalleryDlListPath, { flags: 'a' });
        for (const url of urls) {
            if (!/^https?:\/\//.test(url)) {
                continue;
            }
            galleryDlListStream.write(`${url.split('?')[0]}\n`);
        }

        bot.sendMessage(chatId, `gallery-dl 網址寫入完成！`, { reply_to_message_id: msgId, allow_sending_without_reply: true });
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, error, { reply_to_message_id: msgId, allow_sending_without_reply: true });
    }
});

bot.onText(/^\/gal_get$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const msgId = msg.message_id;
    let logName = msg.from.username || msg.from.first_name || msg.from.id;
    let chatMsg = match.input;

    try {
        if (await checkCanUse(chatId, msgId, logName, chatMsg) === false) {
            return;
        }

        console.log(`[LOG][Telegram][gal_get] ${logName}`);

        let list = fs.readFileSync(absoluteGalleryDlListPath, { encoding: 'utf8', flag: 'r' });
        if (list.length === 0) {
            bot.sendMessage(chatId, `目前沒有任何網址！`, { reply_to_message_id: msgId, allow_sending_without_reply: true });
            return;
        }
        bot.sendMessage(chatId, list, { reply_to_message_id: msgId, allow_sending_without_reply: true });
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, error, { reply_to_message_id: msgId, allow_sending_without_reply: true });
    }
});

bot.onText(/^\/gal_run$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const msgId = msg.message_id;
    let logName = msg.from.username || msg.from.first_name || msg.from.id;
    let chatMsg = match.input;

    try {
        if (await checkCanUse(chatId, msgId, logName, chatMsg) === false) {
            return;
        }

        console.log(`[LOG][Telegram][gal_run] ${logName}`);

        let cmd = `gallery-dl`;
        let args = ['--cookies-from-browser', 'firefox', '-I', absoluteGalleryDlListPath];

        let startMsg = await bot.sendMessage(chatId, `gallery-dl 開始下載...`);
        let startMsgId = startMsg.message_id;

        let progressTxt = '下載進度:';

        const process = spawn(cmd, args);
        process.stdout.on('data', async (data) => {
            let dataStr = data.toString();
            // console.log(`stdout: ${dataStr}`);

            if (/([^\\\/]+)\n$/.test(dataStr)) {
                let tmpFileName = dataStr.match(/([^\\\/]+)\n$/)[1];
                progressTxt += `\n✅ ${tmpFileName}`;
                await bot.editMessageText(progressTxt, { chat_id: chatId, message_id: startMsgId });
            }
        });

        process.stderr.on('data', async (data) => {
            let dataStr = data.toString();
            if (/^ERROR:/.test(dataStr)) {
                console.log(dataStr);
                await bot.editMessageText(progressTxt + `\ngallery-dl 下載發生錯誤：${dataStr}`, { is_disabled: true, chat_id: chatId, message_id: startMsgId });
            }
        });

        process.on('close', async (code) => {
            // console.log(`Done, code:${code}`);
            if (code == 0) {
                await bot.editMessageText(progressTxt + `\n\n列表下載完成！`, { is_disabled: true, chat_id: chatId, message_id: startMsgId });
            }
        });

        process.on('error', async (err) => {
            console.error(`${err.message}`);
            await bot.editMessageText(progressTxt + `\ngallery-dl 下載發生錯誤：${err}`, { is_disabled: true, chat_id: chatId, message_id: startMsgId });
        });

    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, error, { reply_to_message_id: msgId, allow_sending_without_reply: true });
    }
});

bot.onText(/^\/ytd\s/, async (msg, match) => {
    const chatId = msg.chat.id;
    const msgId = msg.message_id;
    let logName = msg.from.username || msg.from.first_name || msg.from.id;
    let chatMsg = match.input;

    try {
        if (await checkCanUse(chatId, msgId, logName, chatMsg) === false) {
            return;
        }

        console.log(`[LOG][Telegram][ytd] ${logName}`);

        let urls = chatMsg.match(/https?:\/\/[^\s]+/g);
        if (!urls || urls.length === 0) {
            throw new Error(`[${logName}] 沒有發現任何網址`);
        }

        let ytDlListStream = fs.createWriteStream(absoluteYtDlListPath, { flags: 'a' });
        let ytDl2ListStream = fs.createWriteStream(absoluteYtDl2ListPath, { flags: 'a' });
        ytDl2ListStream.write(`\n\n#${new Date().toLocaleDateString()}\n`);

        for (const url of urls) {
            if (!/^https?:\/\//.test(url)) {
                continue;
            }
            ytDlListStream.write(`${url}\n`);
            ytDl2ListStream.write(`${url}\n`);
        }

        bot.sendMessage(chatId, `yt-dlp 網址寫入完成！`, { reply_to_message_id: msgId, allow_sending_without_reply: true });
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, error, { reply_to_message_id: msgId, allow_sending_without_reply: true });
    }
});

bot.onText(/^\/ytd_get$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const msgId = msg.message_id;
    let logName = msg.from.username || msg.from.first_name || msg.from.id;
    let chatMsg = match.input;

    try {
        if (await checkCanUse(chatId, msgId, logName, chatMsg) === false) {
            return;
        }

        console.log(`[LOG][Telegram][ytd_get] ${logName}`);

        let list = fs.readFileSync(absoluteYtDlListPath, { encoding: 'utf8', flag: 'r' });
        if (list.length === 0) {
            bot.sendMessage(chatId, `目前沒有任何網址！`, { reply_to_message_id: msgId, allow_sending_without_reply: true });
            return;
        }
        bot.sendMessage(chatId, list, { reply_to_message_id: msgId, allow_sending_without_reply: true });
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, error, { reply_to_message_id: msgId, allow_sending_without_reply: true });
    }
});

bot.onText(/^\/ytd_run$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const msgId = msg.message_id;
    let logName = msg.from.username || msg.from.first_name || msg.from.id;
    let chatMsg = match.input;

    try {
        if (await checkCanUse(chatId, msgId, logName, chatMsg) === false) {
            return;
        }

        console.log(`[LOG][Telegram][ytd_run] ${logName}`);

        let cmd = `yt-dlp`;
        let args = ['-a', absoluteYtDlListPath, '--mark-watched'];

        let startMsg = await bot.sendMessage(chatId, `yt-dlp 開始下載...`);
        let startMsgId = startMsg.message_id;

        let progressTxt = '下載進度:';
        let currentVid = '';
        let currentProgress = 0;

        const process = spawn(cmd, args);
        process.stdout.on('data', async (data) => {
            let dataStr = data.toString();
            // console.log(`stdout:`, dataStr);
            // 新下載
            if (/\[info\] \S+: Downloading/.test(dataStr)) {
                let videoId = dataStr.match(/\[info\] (\S+): Downloading/)[1];
                currentVid = videoId;
                progressTxt += `\n${videoId}: ${await getProgressEmoji(0)}`;
                await bot.editMessageText(progressTxt, { chat_id: chatId, message_id: startMsgId });
            } else if (/\[download\]\s+\d+\.\d+% of/.test(dataStr) && currentProgress < 100) { // 下載進度
                let tmpProgress = dataStr.match(/\[download\]\s+(\d+\.\d+)% of/);
                if (tmpProgress != null) {
                    let tmpCurrentProgress = Math.round(parseFloat(tmpProgress[1]) / 10) * 10;
                    if (currentProgress < tmpCurrentProgress) {
                        currentProgress = tmpCurrentProgress;
                        let progress = await getProgressEmoji(currentProgress);
                        let tmpRegex = new RegExp(`\n${currentVid}: \\S+$`);
                        progressTxt = progressTxt.replace(tmpRegex, `\n${currentVid}: ${progress}`);
                        if (currentProgress == 100) {
                            progressTxt += ` 下載即將完成，影片合併中...`;
                        }

                        await bot.editMessageText(progressTxt, { chat_id: chatId, message_id: startMsgId });
                    }
                }
            } else if (new RegExp(`Deleting original file .*_(${currentVid})_`).test(dataStr) && currentProgress == 100) { // 下載完成
                let tmpRegex = new RegExp(`\n${currentVid}: \\S+ \\S+$`);
                progressTxt = progressTxt.replace(tmpRegex, `\n✅ ${currentVid}: ${await getProgressEmoji(100)}`);

                currentVid = '';
                currentProgress = 0;

                await bot.editMessageText(progressTxt, { chat_id: chatId, message_id: startMsgId });
            } else if (new RegExp(`[download] .*_(${currentVid})_.* has already been downloaded`).test(dataStr)) { // 檔案已存在
                let tmpRegex = new RegExp(`\n${currentVid}: \\S+$`);
                progressTxt = progressTxt.replace(tmpRegex, `\n❌ ${currentVid}: 檔案已存在`);
                currentVid = '';
                currentProgress = 0;
                await bot.editMessageText(progressTxt, { chat_id: chatId, message_id: startMsgId });
            }
        });

        process.stderr.on('data', async (data) => {
            let dataStr = data.toString();
            if (/^ERROR:/.test(dataStr)) {
                console.log(dataStr);
                await bot.editMessageText(progressTxt + `\nyt-dlp 下載發生錯誤：${dataStr}`, { is_disabled: true, chat_id: chatId, message_id: startMsgId });
            }
        });

        process.on('close', async (code) => {
            // console.log(`Done, code:${code}`);
            if (code == 0) {
                await bot.editMessageText(progressTxt + `\n\n列表下載完成！`, { is_disabled: true, chat_id: chatId, message_id: startMsgId });
                progressTxt = '下載進度:';
                currentVid = '';
                currentProgress = 0;
            }
        });

        process.on('error', async (err) => {
            console.error(`${err.message}`);
            await bot.editMessageText(progressTxt + `\nyt-dlp 下載發生錯誤：${err}`, { is_disabled: true, chat_id: chatId, message_id: startMsgId });
        });
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, error, { reply_to_message_id: msgId, allow_sending_without_reply: true });
    }
});

bot.onText(/^\/ytd_purge$/, async (msg, match) => {
    const chatId = msg.chat.id;
    const msgId = msg.message_id;
    let logName = msg.from.username || msg.from.first_name || msg.from.id;
    let chatMsg = match.input;

    try {
        if (await checkCanUse(chatId, msgId, logName, chatMsg) === false) {
            return;
        }

        console.log(`[LOG][Telegram][ytd_purge] ${logName}`);

        fs.writeFileSync(absoluteYtDlListPath, '');
        bot.sendMessage(chatId, `yt-dlp 下載列表已清空！`, { reply_to_message_id: msgId, allow_sending_without_reply: true });
    } catch (error) {
        console.error(error);
        bot.sendMessage(chatId, error, { reply_to_message_id: msgId, allow_sending_without_reply: true });
    }
});

bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    if (msg.reply_to_message == undefined) {
        await bot.sendMessage(chatId, `找不到對應的下載！`, { is_disabled: true, reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
        return;
    }

    const stopChatId = msg.reply_to_message.message_id;
    for (const data of streamRunningQueue) {
        if (data.replyMsgId == stopChatId && data.process) {
            kill(data.process.pid, {
                signal: ["SIGINT", "SIGKILL"],
                retryCount: 1,
                // 等待兩分鐘
                retryInterval: 120000,
                // 等待五分鐘
                timeout: 300000
            },async (err) => {
                if (err) {
                    await bot.sendMessage(chatId, `停止 ${data.target} 下載失敗！`, { is_disabled: true, reply_to_message_id: data.replyMsgId, allow_sending_without_reply: true });
                }

                await bot.sendMessage(chatId, `已停止 ${data.target} 下載作業！`, { is_disabled: true, reply_to_message_id: data.replyMsgId, allow_sending_without_reply: true });
            });

            return;
        }
    }
});

bot.onText(/\/help/, (msg) => {
    const chatId = msg.chat.id;
    bot.sendMessage(chatId, `
- Instagram 照片、影片：
    - https://www.instagram.com/p/[貼文ID]/
    - https://www.instagram.com/reel/[貼文ID]/

- Instagram 限動：
    - https://www.instagram.com/stories/[用戶名稱]/
    - https://www.instagram.com/stories/[用戶名稱]/[貼文ID]/

- X(Twitter) 圖片、影片：
    - https://x.com/[用戶名稱]/status/[貼文ID]/

- 預設下載到 Telegram：
    - 下載到遠端主機，訊息帶「--r」
    - 獲取圖片網址，訊息帶「--s」

- 一次傳入多個連結請用「<strong>換行</strong>」分開

- /gal [連結]：將連結寫入 gallery-dl 下載列表

- /ytd [連結]：將連結寫入 yt-dlp 下載列表`, { parse_mode: 'HTML' });
});

bot.onText(/\/get_my_id/, async (msg) => {
    const chatId = msg.chat.id;
    console.log('msg', msg);
    let replyMsg = await bot.sendMessage(chatId, chatId, { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
    console.log('replyMsg', replyMsg);
});

async function sendMessages(msg, datas, downloadRemote = false, urlOnly = false) {
    const chatId = msg.chat.id;
    const msgId = msg.message_id;
    if (chatId != myId) {
        await bot.sendMessage(chatId, '🐵:嗚吱！');
    }
    if (downloadRemote) {
        let resTxt = '';
        for (const data of datas) {
            if (data.isDone && data.data.length > 0) {
                resTxt += `${data.target} 下載完成\n`;
            } else if (data.type == TYPE_X) {
                let replyMsg = await bot.sendMessage(chatId, `${data.target}\n\n即將開始下載...`, { is_disabled: true, reply_to_message_id: msgId, allow_sending_without_reply: true });
                let replyMsgId = replyMsg.message_id;
                data['chatId'] = chatId;
                data['replyMsgId'] = replyMsgId;
                if (videoRunningQueue.length >= 2) {
                    videoQueue.push(data);
                } else {
                    videoRunningQueue.push(data);
                    getVideo(data);
                }
            } else {
                resTxt += `${data.target} 下載失敗\n`;
            }
        }

        if (resTxt != '') {
            await bot.sendMessage(chatId, resTxt, {is_disabled: true, reply_to_message_id: msgId, allow_sending_without_reply: true });
        }
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
                let replyMsg = await bot.sendMessage(chatId, `${data.target}\n\n即將開始下載...`, { is_disabled: true, reply_to_message_id: msgId, allow_sending_without_reply: true });
                let replyMsgId = replyMsg.message_id;
                data['chatId'] = chatId;
                data['replyMsgId'] = replyMsgId;
                if (videoRunningQueue.length >= 2) {
                    videoQueue.push(data);
                } else {
                    videoRunningQueue.push(data);
                    getVideo(data);
                }
            } else {
                await bot.sendMessage(chatId, `${data.target} 下載失敗`, { is_disabled: true, reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
            }
        }
    }
}

async function getImage(urlDatas, downloadRemote = false) {
    try {
        let results = [];
        for (const url in urlDatas) {
            let tmpElem = urlDatas[url];

            let modeTxt = (downloadRemote) ? '' : '-g';
            let cmdPreview = `gallery-dl --cookies-from-browser firefox ${modeTxt} ${url}`;
            let cmd = `gallery-dl`;
            let args = (downloadRemote) ? ['--cookies-from-browser', 'firefox', url] : ['--cookies-from-browser', 'firefox', modeTxt, url];
            console.info(`[LOG][${tmpElem.typeTxt}][${url}] ${cmdPreview}`);

            let promise = new Promise((resolve, reject) => {
                const process = spawn(cmd, args);

                process.stdout.on('data', (data) => {
                    // console.log(`stdout:`, data.toString());
                    if (!downloadRemote) {
                        let dataStrArr = data.toString().replaceAll('| ', '').replace(/\r?\n/g, '<br>').split('<br>').filter(Boolean);
                        urlDatas[url].data = [...urlDatas[url].data, ...dataStrArr];
                    } else {
                        let dataStrArr = data.toString().replace(/\r?\n/g, '<br>').split('<br>').filter(Boolean);
                        urlDatas[url].data = [...urlDatas[url].data, ...dataStrArr];
                    }
                });

                // process.stderr.on('data', (data) => {
                //     console.log(`stderr:`, data.toString());
                // });

                process.on('close', (code) => {
                    console.log(`${url} Done, code:${code}`);
                    urlDatas[url].isDone = true;
                    resolve(urlDatas[url]);
                });

                process.on('error', (err) => {
                    console.error(`${url} error: ${err.message}`);
                    urlDatas[url].isDone = true;
                    reject(err);
                });
            });

            let result = await promise;
            results.push(result);
            await sleep(Math.floor(Math.random() * (2500 - 500 + 1)) + 500);
        }
        return results;
    } catch (error) {
        return new Promise(function (resolve, reject) {
            reject(error);
        });
    }
}

async function getVideo(urlData) {
    try {
        let url = urlData.target;
        let cmd = `yt-dlp`;
        let args = [],
            cookiesTxt = '',
            cookiesTxt2 = '',
            outputTxt = '',
            outputTxt2 = '';

        if (urlData.type == TYPE_X) {
            cookiesTxt = '--cookies-from-browser';
            cookiesTxt2 = 'firefox';
            outputTxt = '-o';
            outputTxt2 = '%(uploader_id)s_%(id)s_%(upload_date>%y%m%d|0)s.%(ext)s';
            args = [cookiesTxt, cookiesTxt2, outputTxt, outputTxt2, url];
        } else if (urlData.type == TYPE_STREAM || urlData.type == TYPE_M3U8) {
            cookiesTxt = '--cookies-from-browser';
            cookiesTxt2 = 'firefox';
            args = [cookiesTxt, cookiesTxt2, url];
        } else {
            args = [url];
        }
        let cmdPreview = `yt-dlp ${cookiesTxt} ${cookiesTxt2} ${outputTxt} ${outputTxt2} ${url}`;
        console.info(`[LOG][${urlData.typeTxt}][${url}] ${cmdPreview}`);

        await bot.editMessageText(`${url}\n\n開始下載...`, { is_disabled: true, chat_id: urlData.chatId, message_id: urlData.replyMsgId });

        const process = spawn(cmd, args);
        urlData.process = process;
        let vidFormat = '';
        let progressFlag = false;
        let currentProgress = 0;
        let streamStart = false;
        process.stdout.on('data', async (data) => {
            let dataStr = data.toString();
            // console.log(`stdout:`, dataStr);
            if (urlData.type == TYPE_YT || urlData.type == TYPE_X) {
                // 先獲取影片格式
                if (vidFormat == '') {
                    let tmpVidF = dataStr.match(/format\(s\):\s(\S+)\+/);
                    if (tmpVidF != null) {
                        vidFormat = tmpVidF[1];
                    }
                // 有影片格式但是目標影片還沒開始下載
                } else if (progressFlag == false) {
                    let tmpVidF = dataStr.match(/\.f(\S+)\./);
                    if (tmpVidF != null) {
                        progressFlag = (tmpVidF[1] == vidFormat);
                    }
                // 開始下載
                } else if (currentProgress <= 100) {
                    let tmpProgress = dataStr.match(/(\d+\.\d+)% /);
                    if (tmpProgress != null) {
                        let tmpCurrentProgress = Math.round(parseFloat(tmpProgress[1]) / 10) * 10;
                        if (currentProgress < tmpCurrentProgress) {
                            currentProgress = tmpCurrentProgress;
                            let progress = await getProgressEmoji(currentProgress);
                            await bot.editMessageText(`${url}\n\n下載進度：[${progress}]`, { is_disabled: true, chat_id: urlData.chatId, message_id: urlData.replyMsgId });

                            if (currentProgress == 100) {
                                await bot.editMessageText(`${url}\n\n下載進度：[${progress}]\n\n下載即將完成，請稍候...`, { is_disabled: true, chat_id: urlData.chatId, message_id: urlData.replyMsgId });
                            }
                        }
                    }
                }
            }
        });

        process.stderr.on('data', async (data) => {
            let dataStr = data.toString();
            // console.log(`stderr:`, dataStr);
            if (/^ERROR:/.test(dataStr)) {
                console.log(`${url} Error: ${dataStr}}`);
                await bot.editMessageText(`${url}\n\n下載發生錯誤：${dataStr}`, { is_disabled: true, chat_id: urlData.chatId, message_id: urlData.replyMsgId });
            }

            if (urlData.type == TYPE_STREAM || urlData.type == TYPE_M3U8) {
                if (streamStart == false) {
                    let tmpStreamStart = /frame= /.test(dataStr);
                    if (tmpStreamStart == true) {
                        streamStart = true;
                        await bot.editMessageText(`${url}\n\n直播下載中...`, { is_disabled: true, chat_id: urlData.chatId, message_id: urlData.replyMsgId });
                    }
                }
            }
        });

        process.on('close', async (code) => {
            // console.log(`${url} Done, code:${code}`);
            if (code == 0) {
                let progress = (urlData.type == TYPE_STREAM || urlData.type == TYPE_M3U8) ? '' : `下載進度：[${await getProgressEmoji(100)}]\n\n`;
                await bot.editMessageText(`${url}\n\n${progress}下載完成！`, { is_disabled: true, chat_id: urlData.chatId, message_id: urlData.replyMsgId });
            }

            if (urlData.type == TYPE_STREAM || urlData.type == TYPE_M3U8) {
                streamRunningQueue.pop();
                if (streamQueue.length > 0) {
                    let tmpData = streamQueue.shift();
                    streamRunningQueue.push(tmpData);
                    getVideo(tmpData);
                }
            } else {
                for (const k in videoRunningQueue) {
                    if (videoRunningQueue[k].target == url) {
                        videoRunningQueue.splice(k, 1);

                        if (videoQueue.length > 0) {
                            let tmpData = videoQueue.shift();
                            videoRunningQueue.push(tmpData);
                            getVideo(tmpData);
                        }
                        break;
                    }
                }
            }
        });

        process.on('error', async (err) => {
            // console.error(`${url} error: ${err.message}`);
            await bot.editMessageText(`${url}\n\n下載發生錯誤：${err}`, { is_disabled: true, chat_id: urlData.chatId, message_id: urlData.replyMsgId });
            if (urlData.type == TYPE_STREAM || urlData.type == TYPE_M3U8) {
                streamRunningQueue.shift();
                if (streamQueue.length > 0) {
                    let tmpData = streamQueue.shift();
                    streamRunningQueue.push(tmpData);
                    getVideo(tmpData);
                }
            } else {
                for (const k in videoRunningQueue) {
                    if (videoRunningQueue[k].target == url) {
                        videoRunningQueue.splice(k, 1);
                        if (videoQueue.length > 0) {
                            let tmpData = videoQueue.shift();
                            videoRunningQueue.push(tmpData);
                            getVideo(tmpData);
                        }
                        break;
                    }
                }
            }
        });

        if (urlData.type == TYPE_STREAM || urlData.type == TYPE_M3U8) {
            for (const k in streamRunningQueue) {
                if (streamRunningQueue[k].target == url) {
                    streamRunningQueue[k].process = process;
                }
            }
        }
    } catch (error) {
        console.error(`error:`, error);
        return;
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getProgressEmoji(progress) {
    let progressInt = Math.round(parseInt(progress)/10);
    let res = '';
    for (let i = 0; i < 10; i++) {
        res += (i < progressInt) ? doneEmpji : unDoneEmpji;
    }
    return new Promise(function (resolve, reject) {
        resolve(res);
    });
}

async function checkCanUse(chatId, msgId, logName, chatMsg) {
    return new Promise(async (resolve, reject) => {
        if (!adminId.includes(chatId)) {
            console.info(`[LOG][${chatId}][${logName}] Not Admin - ${chatMsg}`);
            await bot.sendMessage(chatId, `
親愛的 ${logName} 您好，本 bot 目前不開放所有人使用
請將 <strong>「${chatId}」</strong> 私訊給本 bot 作者來獲取使用權限，謝謝`, { reply_to_message_id: msgId, allow_sending_without_reply: true, parse_mode: 'HTML' });

            resolve(false);
        } else {
            resolve(true);
        }
    });

}
