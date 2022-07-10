const TelegramBot = require('node-telegram-bot-api');
var app = require('./app');
const token = require('./config.js')[app.get('env')].telegramToken;
const bot = new TelegramBot(token, { polling: true });
const adminId = require('./config.js')[app.get('env')].adminId;
const maintenceMode = require('./config.js')[app.get('env')].maintenceMode;
const crawler = require('./crawler.js');

const TEXT_CD = new Map();

const puppeteer = require('puppeteer');
const puppeteerfunc = require('./puppeteer.js');
let browserWSEndpoint = null;
const userAgent = require('./config.js')[app.get('env')].ua;
const waitUntilMain = 'networkidle0';
const waitUntilMinor = 'domcontentloaded';
const insEmail = require('./config.js')[app.get('env')].insEmail;
const insPass = require('./config.js')[app.get('env')].insPass;
const usernameSelector = 'input[name="username"]';
const passwordSelector = 'input[name="password"]';
const loginBtn = 'button[type="submit"]';
const sendVerifyBtn = `#react-root > section > main > div > div > div > div > div > div:nth-child(2) > div > div:nth-child(2) > div`;
const verifyInputSelector = `#react-root > section > main > div > div > div > div > div > div > div > div:nth-child(3) > div > div > input`;
const verifyInputBtn = `#react-root > section > main > div > div > div > div > div > div > div > div:nth-child(4) > div > div:nth-child(1)`;
const confirmDataBtn = `#react-root > section > main > div > div > div > div > div > div:nth-child(2) > div > div:nth-child(3) > div > div:nth-child(1) > div > div:nth-child(2) > div:nth-child(1) > div > span`;

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
        let isPup = (chatMsg.match(/-pup/i) !== null) ? true : false;
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
        let resp = await crawler.getImage(target, isPup, forceUpdate, logName);

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
                    if (/mp4|jpe?g|png/.test(resArr[i])) {
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
                    } else {
                        await bot.sendMessage(chatId, resArr[i], { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
                    }
                }
            }
        } else {
            bot.sendMessage(chatId, '沒東西啦 !!', { reply_to_message_id: msg.message_id, allow_sending_without_reply: true });
        }
    } catch (error) {
        console.log(`[ERROR] ${error}`);
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

bot.onText(/\/relogin/, async (msg) => {
    const chatId = msg.chat.id;

    try {
        let loginUrl = `https://www.instagram.com/accounts/login/`;

        browserWSEndpoint = await puppeteerfunc.getBrowser();
        const browser = await puppeteer.connect({ browserWSEndpoint });

        const page = await browser.newPage();
        await page.setUserAgent(userAgent);
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.resourceType() === 'image' || request.resourceType() === 'font' || request.resourceType() === 'media') request.abort();
            else request.continue();
        });

        await page.goto(loginUrl, { waitUntil: waitUntilMain });

        console.log(`[LOG] Start Login`);
        await page.click(usernameSelector);
        await page.keyboard.type(insEmail);
        await page.click(passwordSelector);
        await page.keyboard.type(insPass);
        await page.click(loginBtn).catch(e => e).then(() => page.waitForNavigation({ waitUntil: waitUntilMinor }));

        currentPage = await page.url();
        if (currentPage.search(/\/challenge\//) !== -1) {
            await page.click(sendVerifyBtn);
            bot.sendMessage(chatId, `請到信箱 (${insEmail}) 收取驗證碼並輸入以下指令\n\\verify [驗證碼]`);
            return;
        }

        let cookies = await page.cookies();
        let res = '';
        for (const cookie of cookies) {
            if (cookie.name == 'sessionid') {
                res = cookie.value;
                break
            }
        }
        await page.close();

        bot.sendMessage(chatId, res);
    } catch (error) {
        console.log(error);
        bot.sendMessage(chatId, `登入失敗`);
    }
});

bot.onText(/\/verify/, async (msg) => {
    const chatId = msg.chat.id;
    let text = msg.text;
    let code = text.replace(/\/verify/, '');

    try {
        await puppeteerfunc.getBrowser();
        const browser = await puppeteer.connect({ browserWSEndpoint });

        const pages = await browser.pages();
        const page = pages[1];
        await page.setUserAgent(userAgent);
        await page.setRequestInterception(true);
        page.on('request', (request) => {
            if (request.resourceType() === 'image' || request.resourceType() === 'font' || request.resourceType() === 'media') request.abort();
            else request.continue();
        });

        await page.click(verifyInputSelector);
        await page.keyboard.type(code);
        await page.click(verifyInputBtn).catch(e => e).then(() => page.waitForNavigation({ waitUntil: waitUntilMinor }));

        await page.click(confirmDataBtn).catch(e => e).then(() => page.waitForNavigation({ waitUntil: waitUntilMinor }));

        currentPage = await page.url();
        if (currentPage.search(/\/accounts\/edit\//) == -1) {
            const html = await page.content();
            console.log(html);

            bot.sendMessage(chatId, `登入失敗`);
            return;
        }

        let cookies = await page.cookies();
        let res = '';
        for (const cookie of cookies) {
            if (cookie.name == 'sessionid') {
                res = cookie.value;
                break
            }
        }
        await page.close();

        bot.sendMessage(chatId, res);
    } catch (error) {
        console.log(error);
        await page.close();
        bot.sendMessage(chatId, `登入失敗`);
    }
});
