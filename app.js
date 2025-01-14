const TelegramBot = require('node-telegram-bot-api');
const token = require('./config.js')['development'].telegramToken;
const bot = new TelegramBot(token, { polling: true });
const adminId = require('./config.js')['development'].adminId;
const myId = require('./config.js')['development'].myId;
const { spawn } = require('child_process');

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
        if (!adminId.includes(chatId)) {
            console.info(`[LOG][${chatId}][${logName}] Not Admin - ${chatMsg}`);
            await bot.sendMessage(chatId, `
親愛的 ${logName} 您好，本 bot 目前不開放所有人使用
請將 <strong>「${chatId}」</strong> 私訊給本 bot 作者來獲取使用權限，謝謝`, { reply_to_message_id: msgId, allow_sending_without_reply: true, parse_mode: 'HTML' });
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
                    if (intType == TYPE_IG_NORMAL || intType == TYPE_IG_STORY || intType == TYPE_IG_STORY) {
                        imgTargets[target] = tmpData;
                    } else if (intType == TYPE_STREAM) {
                        let replyMsg = await bot.sendMessage(chatId, `${target}\n\n即將開始下載......`, { is_disabled: true, reply_to_message_id: msgId, allow_sending_without_reply: true });
                        let replyMsgId = replyMsg.message_id;
                        tmpData['chatId'] = chatId;
                        tmpData['replyMsgId'] = replyMsgId;
                        if (streamRunningQueue.length >= 1) {
                            console.log('streamRunningQueue:', streamRunningQueue);
                            streamQueue.push(tmpData);
                        } else {
                            streamRunningQueue.push(tmpData);
                            getVideo(tmpData);
                        }
                        streamTargets[target] = tmpData;
                    } else {
                        let replyMsg = await bot.sendMessage(chatId, `${target}\n\n即將開始下載......`, { is_disabled: true, reply_to_message_id: msgId, allow_sending_without_reply: true });
                        let replyMsgId = replyMsg.message_id;
                        tmpData['chatId'] = chatId;
                        tmpData['replyMsgId'] = replyMsgId;
                        if (videoRunningQueue.length >= 2) {
                            console.log('videoRunningQueue:', videoRunningQueue);
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

- 一次傳入多個連結請用「<strong>換行</strong>」分開`, { parse_mode: 'HTML' });
});

async function sendMessages(msg, datas, downloadRemote = false, urlOnly = false) {
    const chatId = msg.chat.id;
    const msgId = msg.message_id;
    if (chatId != myId) {
        await bot.sendMessage(chatId, '嗚吱！');
    }
    if (downloadRemote) {
        let resTxt = '';
        for (const data of datas) {
            if (data.isDone && data.data.length > 0) {
                resTxt += `${data.target} 下載完成\n`;
            } else {
                resTxt += `${data.target} 下載失敗\n`;
            }
        }

        await bot.sendMessage(chatId, resTxt, {is_disabled: true, reply_to_message_id: msgId, allow_sending_without_reply: true });
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
                let replyMsg = await bot.sendMessage(chatId, `${data.target}\n\n即將開始下載......`, { is_disabled: true, reply_to_message_id: msgId, allow_sending_without_reply: true });
                let replyMsgId = replyMsg.message_id;
                data['chatId'] = chatId;
                data['replyMsgId'] = replyMsgId;
                if (videoRunningQueue.length >= 2) {
                    console.log('videoRunningQueue:', videoRunningQueue);
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

bot.onText(/\/get_my_id/, async (msg) => {
    const chatId = msg.chat.id;
    console.log('msg', msg);
    let replyMsg = await bot.sendMessage(chatId, chatId, { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
    console.log('replyMsg', replyMsg);
});

async function getImage(urlDatas, downloadRemote = false) {
    try {
        let promises = [];
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

            promises.push(promise);
            await sleep(500);
        }

        return Promise.all(promises);
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
        } else if (urlData.type == TYPE_STREAM) {
            cookiesTxt = '--cookies-from-browser';
            cookiesTxt2 = 'firefox';
            args = [cookiesTxt, cookiesTxt2, url];
        } else {
            args = [url];
        }
        let cmdPreview = `yt-dlp ${cookiesTxt} ${cookiesTxt2} ${outputTxt} ${outputTxt2} ${url}`;
        console.info(`[LOG][${urlData.typeTxt}][${url}] ${cmdPreview}`);

        await bot.editMessageText(`${urlData.target}\n\n開始下載......`, { chat_id: urlData.chatId, message_id: urlData.replyMsgId });

        return new Promise((resolve, reject) => {
            const process = spawn(cmd, args);

            let vidFormat = '';
            let progressFlag = false;
            let currentProgress = 0;
            process.stdout.on('data', async (data) => {
                console.log(`stdout:`, data.toString());
                let dataStr = data.toString();
                if (urlData.type == TYPE_YT) {
                    // 先獲取影片格式
                    if (vidFormat == '') {
                        let tmpVidF = dataStr.match(/:\s(\d+)\+/);
                        if (tmpVidF != null) {
                            vidFormat = tmpVidF[1];
                        }
                    // 有影片格式但是目標影片還沒開始下載
                    } else if (progressFlag == false) {
                        let tmpVidF = dataStr.match(/\.f(\d+)\./);
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
                                console.log(`currentProgress:`, currentProgress);
                                let progress = await getProgressEmoji(currentProgress);
                                await bot.editMessageText(`${urlData.target}\n\n下載進度：[${progress}]`, { chat_id: urlData.chatId, message_id: urlData.replyMsgId });
                            }
                        }
                    }
                } else if (urlData.type == TYPE_X) {

                } else {

                }
            });

            // process.stderr.on('data', (data) => {
            //     console.log(`stderr:`, data.toString());
            // });

            process.on('close', async (code) => {
                console.log(`${url} Done, code:${code}`);
                let progress = (urlData.type == TYPE_STREAM) ? '' : `下載進度：[${ await getProgressEmoji(100) }]\n\n`;
                await bot.editMessageText(`${urlData.target}\n\n${progress}下載完成！`, { chat_id: urlData.chatId, message_id: urlData.replyMsgId });
            });

            process.on('error', async (err) => {
                console.error(`${url} error: ${err.message}`);
                await bot.editMessageText(`${urlData.target}\n\n下載發生錯誤：${err}`, { chat_id: urlData.chatId, message_id: urlData.replyMsgId });
            });
        });
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
