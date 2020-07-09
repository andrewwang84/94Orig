const request = require('request');
const fs = require('fs');
const unzip = require('unzip2');
const sharp = require('sharp');
const cheerio = require('cheerio');
const TelegramBot = require('node-telegram-bot-api');

const emojis = [
    '😊',
    '🙂',
    '😋',
    '😺',
    '🐶',
    '🐱',
    '🐰',
    '🦊',
    '🐻',
    '🐼',
    '🐨',
    '🐯',
    '🦁',
    '🐮',
    '🐷',
    '🐵',
    '🐧',
    '🐔',
    '🦋',
];

const langs = [
    'zh-Hant',
    'ja',
    'zh-Hans',
    'en',
    'ko'
];

var app = require('./app');
const token = require('./config.js')[app.get('env')].telegramToken;
const botName = require('./config.js')[app.get('env')].botName;
const bot = new TelegramBot(token, { polling: true });

const pendingStickers = {};

bot.onText(/line\.me\//, async (msg, match) => {
    const target = match.input;

    if (/[0-9a-f]{24}/.test(target)) {
        let lid = target.match(/[0-9a-f]{24}/);
        const result = await bot.sendMessage(msg.chat.id, '準備下載表情貼', {
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id,
        });

        msg.msgId = result.message_id;
        downloadSticon(msg, lid)
            .catch((error) => {
                console.error('dl sticon', error);
                bot.editMessageText(error, {
                    chat_id: msg.chat.id,
                    message_id: msg.msgId,
                    parse_mode: 'HTML'
                });
            });

        return;
    } else if (/\d{3,}/.test(target)) {
        let lid = target.match(/\d{3,}/);
        if (!fs.existsSync(__dirname + '/files/' + lid)) {
            fs.mkdirSync(__dirname + '/files/' + lid, { recursive: true });
        }

        var text = '準備下載 <a href="https://store.line.me/stickershop/product/' + lid + '/zh-Hant">此貼圖</a>...';
        bot.sendMessage(msg.chat.id, text, {
            parse_mode: 'HTML',
            reply_to_message_id: msg.message_id,
            disable_web_page_preview: true
        }).then((result) => {
            msg.msgId = result.message_id;
            downloadPack(msg, lid);
        });
    }
});

// 貼圖
async function downloadPack(msg, lid) {
    try {
        const dir = await downloadZip(lid);

        fs.appendFile(dir + '/download-pack-' + Date.now(), JSON.stringify(msg), (error) => { console.error(error) });
        console.log('downloadPack unzip', dir);

        const meta = JSON.parse(fs.readFileSync(dir + '/metadata', 'utf8'));

        const sid = meta.stickers[0].id;

        try {
            const sticker = await resizePng(dir, sid);

            console.log('downloadPack resized', sticker);
            if (msg.timestamp > Date.now())
                return;

            const stickerStream = fs.createReadStream(sticker);
            const fileOptions = {
                filename: 'andrewwang-' + sid + '.png',
                contentType: 'image/png',
            };

            try {
                const result = await bot.createNewStickerSet(msg.from.id, meta.name, meta.title + "  By" + botName, stickerStream, meta.emoji, {}, fileOptions);

                fs.writeFileSync(dir + '/metadata', JSON.stringify(meta));

                uploadBody(msg, lid);
            } catch (error) {
                if (error.message.includes('sticker set name is already occupied')) {
                    var text = '發生錯誤，嘗試添加至現有貼圖包\n';
                    text += '編號: <code>' + lid + '</code> \n';
                    text += '詳細報告: createNewStickerSet\n';
                    text += '<pre>' + enHTML(JSON.stringify(error)) + '</pre>';
                    bot.editMessageText(text, {
                        chat_id: msg.chat.id,
                        message_id: msg.msgId,
                        disable_web_page_preview: true,
                        parse_mode: 'HTML'
                    });
                    uploadBody(msg, lid, 1);
                    return;
                }

                console.error('downloadPack createNewStickerSet err', lid, error);
                var text = '發生錯誤，已中斷下載\n';
                text += '編號: <code>' + lid + '</code> \n';
                text += '詳細報告: createNewStickerSet\n';
                text += '<pre>' + enHTML(JSON.stringify(error)) + '</pre>';
                bot.editMessageText(text, {
                    chat_id: msg.chat.id,
                    message_id: msg.msgId,
                    disable_web_page_preview: true,
                    parse_mode: 'HTML'
                });
            }
        } catch (error) {
            bot.editMessageText(error, {
                chat_id: msg.chat.id,
                message_id: msg.msgId,
                parse_mode: 'HTML'
            });
        }
    } catch (error) {
        bot.editMessageText(error, {
            chat_id: msg.chat.id,
            message_id: msg.msgId,
            parse_mode: 'HTML'
        });
    }
}

async function uploadBody(msg, lid, seq = 2) {
    const meta = JSON.parse(fs.readFileSync(__dirname + '/files/' + lid + '/metadata', 'utf8'));
    if (meta.emoji === undefined) {
        meta.emoji = emojis[0];
    }

    if (pendingStickers[lid] === undefined) {
        pendingStickers[lid] = {
            cd: 0,
            msg: msg
        };
    }

    if (msg.timestamp === undefined) {
        msg.timestamp = Date.now();
    }

    const dir = __dirname + '/files/' + lid;
    for (; seq <= meta.stickers.length; seq++) {
        try {
            const sid = meta.stickers[seq - 1].id;
            const sticker = await resizePng(dir, sid);

            const stickerStream = fs.createReadStream(sticker);
            const fileOptions = {
                filename: 'andrewwang-' + sid + '.png',
                contentType: 'image/png',
            };

            try {
                const result = await bot.addStickerToSet(msg.from.id, meta.name, stickerStream, meta.emoji, {}, fileOptions);

                if (seq == meta.stickers.length) {
                    var text = '上傳完成!\n';
                    text += '共 <b>' + meta.stickers.length + '</b> 張貼圖\n';
                    text += '安裝連結: <a href="https://t.me/addstickers/' + meta.name + '">' + enHTML(meta.title) + '</a>\n';

                    bot.editMessageText(text, {
                        chat_id: msg.chat.id,
                        message_id: msg.msgId,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: '點我安裝',
                                        url: 'https://t.me/addstickers/' + meta.name
                                    }
                                ]
                            ]
                        }
                    });

                    delete pendingStickers[lid];
                    meta.okay = true;
                    fs.writeFileSync(__dirname + '/files/' + lid + '/metadata', JSON.stringify(meta), (error) => { if (error) console.error(error) });
                } else if (Date.now() - msg.timestamp > 300) {
                    msg.timestamp = Date.now();
                    var text = '上傳 <a href="https://store.line.me/stickershop/product/' + lid + '/' + meta['lang'] + '">' + enHTML(meta.title) + '</a> 中...\n';
                    text += prog(seq, meta.stickers.length);
                    if (seq / meta.stickers.length >= 0.7) {
                        text += '預覽連結: <a href="https://t.me/addstickers/' + meta.name + '">' + enHTML(meta.title) + '</a>\n';
                    }
                    bot.editMessageText(text, {
                        chat_id: msg.chat.id,
                        message_id: msg.msgId,
                        parse_mode: 'HTML'
                    });
                }
            } catch (error) {
                console.log('uploadBody addStickerToSet err', lid, sid, error.message);

                var opt = {
                    chat_id: msg.chat.id,
                    message_id: msg.msgId,
                    parse_mode: 'HTML'
                };

                console.log('uploadBody addStickerToSet error msg', error.message);
                if (error.message.includes('retry after')) {
                    text = '上傳速度太快啦，TG 伺服器要冷卻一下\n';
                    text += '將會自動重試\n';
                    text += '貼圖包連結: <a href="https://t.me/addstickers/' + meta.name + '">' + enHTML(meta.title) + '</a>\n';
                    sec = error.message.substr(46) + 3;

                    text += '\n詳細報告: addStickerToSet\n';
                    text += '<pre>' + enHTML(JSON.stringify(error)) + '</pre>';
                    bot.editMessageText(text, opt);
                } else if (error.message.includes('STICKERS_TOO_MUCH')) {
                    text = '貼圖數量衝破天際啦~\n';
                    text += '貼圖包連結: <a href="https://t.me/addstickers/' + meta.name + '">' + enHTML(meta.title) + '</a>\n';
                    text += '\n詳細報告: addStickerToSet\n';
                    text += '<pre>' + enHTML(JSON.stringify(error)) + '</pre>';
                    bot.editMessageText(text, opt);
                } else if (error.message.includes('STICKERSET_INVALID')) {
                    console.log('uploadBody invalid set', lid);

                    text = '貼圖包疑似被刪除了\n';
                    text += '貼圖包連結: <a href="https://t.me/addstickers/' + meta.name + '">' + enHTML(meta.title) + '</a>\n';
                    text += '\n詳細報告: addStickerToSet\n';
                    text += '<pre>' + enHTML(JSON.stringify(error)) + '</pre>';
                    bot.editMessageText(text, opt);

                    downloadPack(msg, lid);
                } else {
                    text = '發生錯誤，已中斷下載\n';
                    text += '編號: <code>' + lid + '</code> \n';
                    text += '\n詳細報告: addStickerToSet\n';
                    text += '<pre>' + enHTML(JSON.stringify(error)) + '</pre>';
                    bot.editMessageText(text, opt);
                }

                return;
            } // addStickerToSet
        } catch (error) {
            console.log('uploadBody resizePng err', error);
            bot.editMessageText(error, {
                chat_id: msg.chat.id,
                message_id: msg.msgId,
                parse_mode: 'HTML'
            });

            return;
        } // resizePng
    } // for
}

async function downloadZip(lid) {
    return new Promise(function (resolve, reject) {
        const dir = __dirname + '/files/' + lid;
        const zipname = dir + '/file.zip';

        request('http://dl.stickershop.line.naver.jp/products/0/0/1/' + lid + '/iphone/stickers@2x.zip')
            .on('error', function (err) {
                var text = '發生錯誤，已中斷下載\n';
                text += '編號: <code>' + lid + '</code> \n';
                text += '詳細報告: NodeJS <b>request</b> onError\n';
                text += '<pre>' + enHTML(JSON.stringify(err)) + '</pre>';
                return reject(text);
            })
            .pipe(fs.createWriteStream(zipname))
            .on('finish', (result) => {
                const zipStat = fs.statSync(zipname);
                if (zipStat.size < 69) {
                    const zipText = fs.readFileSync(zipname);
                    var text = '發生錯誤，已中斷下載\n';
                    text += '詳細報告: LINE 伺服器提供檔案不正常\n';
                    text += '下載內容:\n'
                    text += '<pre>' + enHTML(zipText) + '</pre>';
                    return reject(text);
                }

                fs.createReadStream(zipname)
                    .pipe(unzip.Parse())
                    .on('entry', function (entry) {
                        var fileName = entry.path;

                        if (fileName == 'productInfo.meta') {
                            entry.pipe(fs.createWriteStream(dir + '/metadata'));
                            return;
                        }

                        if (/\d+@2x.png/.test(fileName)) {
                            entry.pipe(fs.createWriteStream(dir + '/origin-' + fileName.replace('@2x', '')));
                            return;
                        }

                        if (/(\d+_key|tab_(on|off))@2x.png/.test(fileName)) {
                            entry.autodrain();
                            return;
                        }

                        entry.pipe(fs.createWriteStream(dir + '/UNKNOWN-' + fileName));
                    })
                    .on('close', () => {
                        // build metadata
                        if (!fs.existsSync(dir + '/metadata')) {
                            var text = '發生錯誤，已中斷下載\n';
                            text += '問題來源: 找不到 <b>metadata</b> (中繼資料) 檔案\n';
                            text += '編號: <code>' + lid + '</code> \n';
                            return reject(text);
                        }

                        const meta = JSON.parse(fs.readFileSync(dir + '/metadata', 'utf8'));

                        meta.name = 'line' + lid + '_by_' + botName;
                        meta.emoji = emojis[Math.floor(Math.random() * emojis.length)];

                        if (meta.origin_title === undefined) {
                            langs.some(function (val) {
                                if (meta['title'][val] !== undefined) {
                                    meta['lang'] = val;
                                    return true;
                                }
                            });

                            meta.origin_title = meta.title;
                            meta.title = meta['title'][meta.lang];
                        }

                        fs.writeFileSync(dir + '/metadata', JSON.stringify(meta));

                        return resolve(dir);
                    })
                    .on("error", (err) => {
                        var text = '發生錯誤，已中斷下載\n';
                        text += '編號: <code>' + lid + '</code> \n';
                        text += '詳細報告: fs <b>createReadStream</b> onError\n';
                        text += '<pre>' + enHTML(JSON.stringify(err)) + '</pre>';
                        return reject(text);
                    });
            });
    });
}

async function resizePng(dir, name, q = 100) {
    return new Promise(function (resolve, reject) {
        if (q < 1) {
            var text = '發生錯誤，已中斷下載\n';
            text += '問題來源: resize webp\n';
            text += '編號: <code>' + dir + '</code>, <code>' + name + '</code> \n';
            text += '詳細報告: 檔案過大\n';
            return reject(text);
        }

        const origin = dir + '/origin-' + name + '.png';
        const sticker = dir + '/sticker-' + name + '-' + q + '.png';

        var format = 'webp';
        var tmpFile = dir + '/temp-' + name + '-' + q + '.webp';
        var size = 512;
        if (q < 64) {
            console.log('resize png comp', dir, name, q);
            format = 'jpg';
            tmpFile = dir + '/temp-' + name + '-' + q + '.jpg';
            size = 8 * q;
        }

        var errorF = false;

        sharp(origin)
            .toFormat(format, {
                quality: q
            })
            .resize(size, size)
            .max()
            .toFile(tmpFile)
            .catch((err) => {
                console.error('sharp err 1', dir, name, origin, err);
                errorF = true;

                var text = '發生錯誤，已中斷下載\n';
                text += '問題來源: NodeJS <b>sharp</b> (圖片轉檔工具)\n';
                text += '編號: <code>' + dir + '</code>, <code>' + name + '</code> \n';
                text += '詳細報告: resize webp\n';
                if (err.message != undefined)
                    text += '<pre>' + enHTML(err.message) + '</pre>';
                else
                    text += '<pre>' + enHTML(err) + '</pre>';
                return reject(text);
            })
            .then((result) => {
                if (errorF) {
                    console.error('resizePng', 'error = true', 'stage 1', result);
                    return;
                }

                sharp(tmpFile)
                    .resize(512, 512)
                    .max()
                    .png()
                    .toFile(sticker)
                    .then((result) => {
                        if (errorF) {
                            console.error('resizePng', 'error = true', 'stage 2', result);
                            return;
                        }

                        var stat = fs.statSync(sticker);
                        if (stat.size < 512 * 1000) {
                            return resolve(sticker);
                        }
                        resizePng(dir, name, Math.floor(q * 0.8))
                            .catch((err) => {
                                errorF = true;

                                return reject(err + '.');
                            })
                            .then((sticker) => {
                                if (errorF) {
                                    console.error('resizePng', 'error = true', 'stage 3', result);
                                    return;
                                }

                                return resolve(sticker);
                            });
                    })
                    .catch((err) => {
                        console.error('sharp err 2', dir, name, origin, tmpFile, err);
                        errorF = true;

                        var text = '發生錯誤，已中斷下載\n';
                        text += '問題來源: NodeJS <b>sharp</b> (圖片轉檔工具)\n';
                        text += '編號: <code>' + dir + '</code>, <code>' + name + '</code> \n';
                        text += '詳細報告: convert png\n';
                        text += '<pre>' + enHTML(err.message) + '</pre>';
                        return reject(text);
                    });
            })
    });
}

// 表情貼
async function downloadSticonItem(eid, seq) {
    return new Promise(function (resolve, reject) {
        const dir = __dirname + '/files/' + eid;
        const seqStr = ('000' + seq).slice(-3);
        const origin = dir + '/origin-' + seqStr + '.png';
        const url = 'https://stickershop.line-scdn.net/sticonshop/v1/sticon/' + eid + '/iphone/' + seqStr + '.png';

        console.log('dl Sticon Item', eid, seq);

        request(url)
            .pipe(fs.createWriteStream(origin))
            .on('error', function (err) {
                console.error('downloadSticonItem req', err);
                var text = '發生錯誤，已中斷下載\n';
                text += '編號: <code>' + eid + '</code>, ' + seqStr + '\n';
                text += '詳細報告: NodeJS <b>request</b> onError\n';
                text += '<pre>' + enHTML(JSON.stringify(err)) + '</pre>';
                return reject(text);
            })
            .on('finish', (result) => {
                const stat = fs.statSync(origin);
                if (stat.size < 69) {
                    const context = fs.readFileSync(origin);
                    var text = '發生錯誤，已中斷下載\n';
                    text += '詳細報告: LINE 伺服器提供檔案不正常\n';
                    text += '下載內容:\n'
                    text += '<pre>' + enHTML(context) + '</pre>';
                    return reject(text);
                }
                resizePng(dir, seqStr)
                    .then((sticker) => {
                        return resolve(sticker);
                    })
                    .catch((err) => {
                        console.log('dl sticon res', err);
                        return reject(err.message);
                    });
            });
    });
}

async function uploadSticonBody(msg, eid, seq = 2) {
    const meta = JSON.parse(fs.readFileSync(__dirname + '/files/' + eid + '/metadata', 'utf8'));
    if (meta.emoji === undefined) {
        meta.emoji = emojis[0];
    }

    if (msg.timestamp === undefined) {
        msg.timestamp = Date.now();
    }

    const dir = __dirname + '/files/' + eid;
    for (; seq <= 40; seq++) {
        try {
            const sticker = await downloadSticonItem(eid, seq);

            const stickerStream = fs.createReadStream(sticker);
            const fileOptions = {
                filename: 'andrewwang-' + eid + '-' + seq + '.png',
                contentType: 'image/png',
            };

            try {
                const result = await bot.addStickerToSet(109780439, meta.name, stickerStream, meta.emoji, {}, fileOptions);

                if (seq == 40) {
                    var text = '上傳完成!\n';
                    text += '安裝連結: <a href="https://t.me/addstickers/' + meta.name + '">' + enHTML(meta.title) + '</a>\n';
                    bot.editMessageText(text, {
                        chat_id: msg.chat.id,
                        message_id: msg.msgId,
                        parse_mode: 'HTML',
                        reply_markup: {
                            inline_keyboard: [
                                [
                                    {
                                        text: '點我安裝',
                                        url: 'https://t.me/addstickers/' + meta.name
                                    },
                                    {
                                        text: '編輯表符',
                                        callback_data: 'edit_emoji_' + meta.name
                                    }
                                ],
                                [
                                    {
                                        text: '分享給朋友',
                                        url: 'https://t.me/share/url'
                                            + '?url=' + encodeURIComponent('https://t.me/addstickers/' + meta.name)
                                            + '&text=' + encodeURIComponent(meta.title + '\n剛出爐的呦~')
                                    }
                                ]
                            ]
                        }
                    });

                    meta.okay = true;
                    fs.writeFileSync(__dirname + '/files/' + eid + '/metadata', JSON.stringify(meta), (error) => { if (error) console.error(error) });
                } else {
                    var text = '上傳 <a href="https://store.line.me/emojishop/product/' + eid + '/zh-Hant">' + enHTML(meta.title) + '</a> 中...\n';
                    text += prog(seq, 40);
                    if (seq >= 30) {
                        text += '預覽連結: <a href="https://t.me/addstickers/' + meta.name + '">' + enHTML(meta.title) + '</a>\n';
                    }
                    bot.editMessageText(text, {
                        chat_id: msg.chat.id,
                        message_id: msg.msgId,
                        parse_mode: 'HTML'
                    });
                }
            } catch (error) {
                if (error.response != undefined && error.response.body != undefined)
                    console.log('sticon add sticker to set error response body', error.response.body);
                else
                    console.log('sticon add sticker to set error', error);

                var text = '發生錯誤，已中斷下載\n';
                text += '編號: <code>' + eid + '</code> \n';
                text += '詳細報告: sticon addStickerToSet\n';
                text += '<pre>' + enHTML(JSON.stringify(error)) + '</pre>';
                bot.editMessageText(text, {
                    chat_id: msg.chat.id,
                    message_id: msg.msgId,
                    disable_web_page_preview: true,
                    parse_mode: 'HTML'
                });

                if (error.message.includes('created sticker set not found')) {
                    console.error('created sticon set not found', eid);
                    return;
                }
            } // addStickerToSet
        } catch (error) {
            console.log('dl sticon item err', error);
            return;
        }
    }
}

async function downloadSticon(msg, eid) {
    return new Promise(function (resolve, reject) {
        var meta;
        const dir = __dirname + '/files/' + eid;
        console.log('downloadSticon', eid);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir);
        }

        request('https://store.line.me/emojishop/product/' + eid + '/zh-Hant', (error, response, body) => {
            if (error || response.statusCode !== 200) {
                console.error('sticon meta req', error);
                return reject('err: ' + response.statusCode + error);
            }

            if (fs.existsSync(__dirname + '/files/' + eid + '/metadata')) {
                meta = JSON.parse(fs.readFileSync(__dirname + '/files/' + eid + '/metadata', 'utf8'));
            } else {
                meta = {
                    packageId: eid,
                    name: 'line_' + eid.slice(-6) + '_by_' + botName,
                    title: cheerio.load(body)("title").text().slice(0, -23),
                    emoji: emojis[Math.floor(Math.random() * emojis.length)]
                };
            }

            fs.writeFileSync(dir + '/metadata', JSON.stringify(meta));

            downloadSticonItem(eid, 1)
                .then((sticker) => {
                    const stickerStream = fs.createReadStream(sticker);
                    const fileOptions = {
                        filename: 'andrewwang-' + eid + '-001.png',
                        contentType: 'image/png',
                    };
                    bot.createNewStickerSet(109780439, meta.name, meta.title + "  By" + botName, stickerStream, meta.emoji, {}, fileOptions)
                        .then((result) => {
                            fs.writeFileSync(dir + '/metadata', JSON.stringify(meta));
                            var text = '建立 <a href="https://store.line.me/emojishop/product/' + eid + '/zh-Hant">' + enHTML(meta.title) + '</a> 中...\n';
                            bot.editMessageText(text, {
                                chat_id: msg.chat.id,
                                message_id: msg.msgId,
                                parse_mode: 'HTML'
                            });
                            uploadSticonBody(msg, eid);
                        })
                        .catch((error) => {
                            console.log('sticon new set err', error.response.body);

                            if (error.message.includes('sticker set name is already occupied')) {
                                var text = '發生錯誤，嘗試添加至現有貼圖包\n';
                                text += '編號: <code>' + eid + '</code> \n';
                                text += '詳細報告: createNewStickerSet\n';
                                text += '<pre>' + enHTML(JSON.stringify(error)) + '</pre>';
                                bot.editMessageText(text, {
                                    chat_id: msg.chat.id,
                                    message_id: msg.msgId,
                                    disable_web_page_preview: true,
                                    parse_mode: 'HTML'
                                });
                                uploadSticonBody(msg, eid, 1);
                                return;
                            }

                            var text = '發生錯誤，已中斷下載\n';
                            text += '編號: <code>' + eid + '</code> \n';
                            text += '詳細報告: createNewStickerSet\n';
                            text += '<pre>' + enHTML(JSON.stringify(error)) + '</pre>';
                            bot.editMessageText(text, {
                                chat_id: msg.chat.id,
                                message_id: msg.msgId,
                                disable_web_page_preview: true,
                                parse_mode: 'HTML'
                            });

                            if (error.message.includes('created sticker set not found')) {
                                console.error('created sticker set not found', eid);
                                return;
                            }
                        });
                })
                .catch((error) => {
                    console.log('dl sticon item err', error);
                    return reject(error);
                });
        });
    });
}

function enHTML(str) {
    var s = str + '';
    return s.replace('&', '&amp;')
        .replace('"', '&quot;')
        .replace('<', '&lt;')
        .replace('>', '&gt;');
}

function prog(current, total) {
    if (current > total) {
        current = total;
    }
    const count = 20;
    var str = '進度: <b>' + current + '</b>/' + total + '  <code>[';
    str += '█'.repeat(Math.round(current * count / total))
    str += '-'.repeat(count - Math.round(current * count / total))
    str += ']</code>\n'
    return str;
}