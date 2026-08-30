/**
 * node-telegram-bot-api v2 遷移驗證
 *
 * 起一個本機假 Bot API server，把 Bot 的 apiRoot 指過去
 * （v2 transport 的請求網址是 `${apiRoot}/bot${token}/${method}`），
 * 就能在不碰真 Telegram 的前提下，端對端驗證指令路由與送出的參數。
 *
 * 執行：node test/fakeTelegram.test.js
 */
'use strict';

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Bot } = require('node-telegram-bot-api');

const TOKEN = 'fake-token';

// ---------------------------------------------------------------- 假 API server

/**
 * @returns {{ url, calls, queue, close }}
 *   calls: 收到的 API 呼叫 [{ method, params, files }]
 *   queue: 推進去的假 update，getUpdates 會依序吐出
 */
async function startFakeTelegram() {
    const calls = [];
    const queue = [];
    let messageId = 1000;

    const server = http.createServer((req, res) => {
        const method = req.url.split('/').pop();
        const chunks = [];
        req.on('data', c => chunks.push(c));
        req.on('end', () => {
            const raw = Buffer.concat(chunks);
            const contentType = req.headers['content-type'] || '';
            let params = {};
            let files = {};

            if (contentType.includes('multipart/form-data')) {
                ({ params, files } = parseMultipart(raw, contentType));
            } else if (raw.length) {
                // v2 沒有檔案時用 application/x-www-form-urlencoded（見 dist/core/encode.cjs）
                for (const [k, v] of new URLSearchParams(raw.toString('utf8'))) {
                    params[k] = v;
                }
            }

            const json = (body) => {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(body));
            };

            if (method === 'getUpdates') {
                // 一次吐完排隊的 update，之後回空陣列（避免測試卡在長輪詢）
                const updates = queue.splice(0, queue.length);
                return json({ ok: true, result: updates });
            }

            calls.push({ method, params, files });

            if (method === 'sendMessage' || method === 'sendDocument' || method === 'sendVideo') {
                return json({
                    ok: true,
                    result: {
                        message_id: ++messageId,
                        chat: { id: Number(params.chat_id) || 1, type: 'private' },
                        date: Math.floor(Date.now() / 1000),
                        document: method === 'sendDocument' ? { file_id: 'FILEID_' + messageId } : undefined,
                    },
                });
            }
            return json({ ok: true, result: true });
        });
    });

    await new Promise(r => server.listen(0, '127.0.0.1', r));
    return {
        url: `http://127.0.0.1:${server.address().port}`,
        calls,
        queue,
        close: () => new Promise(r => server.close(r)),
    };
}

/** 極簡 multipart 解析：只取欄位名 → 值 / 檔案位元組 */
function parseMultipart(buf, contentType) {
    const boundary = '--' + contentType.split('boundary=')[1];
    const params = {};
    const files = {};
    for (const part of buf.toString('latin1').split(boundary)) {
        const sep = part.indexOf('\r\n\r\n');
        if (sep === -1) continue;
        const head = part.slice(0, sep);
        const nameMatch = head.match(/name="([^"]+)"/);
        if (!nameMatch) continue;
        const body = part.slice(sep + 4).replace(/\r\n$/, '');
        if (/filename="/.test(head)) {
            files[nameMatch[1]] = Buffer.from(body, 'latin1');
        } else {
            params[nameMatch[1]] = body;
        }
    }
    return { params, files };
}

/**
 * 先塞進 require 快取，讓之後 require 該模組的人拿到 stub。
 * 用來擋掉會真的連外的下載器。
 */
function stubModule(relPath, impl) {
    const resolved = require.resolve(relPath);
    require.cache[resolved] = {
        id: resolved,
        filename: resolved,
        loaded: true,
        exports: impl,
    };
}

// ---------------------------------------------------------------- 假 update

let updateId = 1;
function textUpdate(text, chatId, fromId = chatId) {
    return {
        update_id: updateId++,
        message: {
            message_id: 500 + updateId,
            date: Math.floor(Date.now() / 1000),
            chat: { id: chatId, type: 'private' },
            from: { id: fromId, is_bot: false, first_name: 'Tester', username: 'tester' },
            text,
        },
    };
}

// ---------------------------------------------------------------- 斷言工具

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
    if (cond) { console.log(`  ✅ ${name}`); pass++; }
    else { console.log(`  ❌ ${name} ${extra}`); fail++; }
}
function sent(calls, method) {
    return calls.filter(c => c.method === method);
}

// ---------------------------------------------------------------- 測試本體

async function main() {
    const fake = await startFakeTelegram();
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), '94orig-test-'));
    const galList = path.join(tmpDir, 'gal.txt');
    const ytdList = path.join(tmpDir, 'ytd.txt');
    fs.writeFileSync(galList, '');
    fs.writeFileSync(ytdList, '');

    const MY_ID = 123686308;

    // ⚠️ 這個測試只驗證「指令路由 + 送出的參數」，絕不能真的去跑下載。
    // OJ 下載器會開 puppeteer 連到 oncejapan.com 並嘗試登入，
    // 因此在 require commandHandler 之前先把這兩個模組換成 stub。
    stubModule('../src/ojVideoDownloader', class FakeOjVideoDownloader {
        async run() { return [{ site: 'OJ', results: [] }]; }
        async runSingle(url) { return [{ site: 'OJ', results: [{ title: url, date: '', success: true }] }]; }
        formatResults() { return '📽️ (stub) OJ 影片下載完成'; }
    });
    stubModule('../src/onceJapanDownloader', class FakeOnceJapanDownloader {
        async crawlAll() { return {}; }
        formatResults() { return '📸 (stub) ONCE JAPAN 下載完成'; }
    });

    const CommandHandler = require('../src/commandHandler');
    const MessageHandler = require('../src/messageHandler');
    const { DownloadQueue } = require('../src/downloader');

    const bot = new Bot(TOKEN, { apiRoot: fake.url });
    const config = {
        myId: MY_ID,
        adminId: [MY_ID],
        ojDownloadPath: tmpDir,
    };
    const filePaths = {
        absoluteGalleryDlListPath: galList,
        absoluteYtDlListPath: ytdList,
        absoluteYtDl2ListPath: ytdList,
    };
    const downloadQueue = new DownloadQueue();
    const messageHandler = new MessageHandler(bot, MY_ID, null, downloadQueue, null);
    const commandHandler = new CommandHandler(
        bot, config, filePaths, downloadQueue, null, messageHandler, null
    );

    // 模擬 app.js 的計數 middleware：必須呼叫 next() 才會走到後面的 handler
    let middlewareRan = 0;
    bot.use((ctx, next) => { middlewareRan++; return next(); });
    commandHandler.registerHandlers();

    const caught = [];
    bot.catch((err) => { caught.push(err); });

    /**
     * 丟一則訊息進去跑完整條 middleware chain。
     * 有些 handler（例如 /help）送訊息時沒有 await，所以多等一拍讓請求真的送達。
     */
    const feed = async (text) => {
        const before = fake.calls.length;
        await bot.handleUpdate(textUpdate(text, MY_ID));
        await new Promise(r => setTimeout(r, 150));
        return fake.calls.slice(before);
    };

    try {
        console.log('[1] /help → sendMessage 帶 parse_mode: HTML');
        {
            const calls = await feed('/help');
            const msgs = sent(calls, 'sendMessage');
            check('送出 sendMessage', msgs.length === 1, JSON.stringify(calls.map(c => c.method)));
            check('parse_mode 為 HTML', msgs[0] && msgs[0].params.parse_mode === 'HTML', JSON.stringify(msgs[0] && msgs[0].params));
            check('chat_id 正確', msgs[0] && Number(msgs[0].params.chat_id) === MY_ID);
        }

        console.log('\n[2] app.js 的計數 middleware 有呼叫 next()（後續 handler 仍會跑）');
        check('middleware 有被執行', middlewareRan === 1, `middlewareRan=${middlewareRan}`);

        console.log('\n[3] /gal <url> → 只進 gal handler，不落到 URL handler');
        {
            const calls = await feed('/gal https://x.com/someone/status/123');
            const msgs = sent(calls, 'sendMessage');
            check('只送出 1 則訊息（URL handler 沒有再送一則）', msgs.length === 1,
                JSON.stringify(msgs.map(m => m.params.text)));
            check('回覆內容是 gal 加入列表', msgs[0] && /加入 gallery-dl 下載列表/.test(msgs[0].params.text),
                msgs[0] && msgs[0].params.text);
            const listBody = fs.readFileSync(galList, 'utf8');
            check('網址已寫入列表檔', listBody.includes('https://x.com/someone/status/123'), JSON.stringify(listBody));
        }

        console.log('\n[4] reply_parameters 形狀正確，且不再出現 reply_to_message_id');
        {
            const calls = await feed('/gal_get');
            const msgs = sent(calls, 'sendMessage');
            const p = msgs[0] && msgs[0].params;
            check('有送出訊息', !!p);
            // reply_parameters 是結構化欄位，序列化後是 JSON 字串
            const rp = p && p.reply_parameters ? JSON.parse(p.reply_parameters) : null;
            check('帶有 reply_parameters', !!rp, JSON.stringify(p));
            check('reply_parameters.message_id 存在', rp && typeof rp.message_id === 'number', JSON.stringify(rp));
            check('reply_parameters.allow_sending_without_reply 為 true',
                rp && rp.allow_sending_without_reply === true, JSON.stringify(rp));
            check('沒有殘留 reply_to_message_id', p && p.reply_to_message_id === undefined);
            check('沒有殘留頂層 allow_sending_without_reply', p && p.allow_sending_without_reply === undefined);
        }

        console.log('\n[5] link_preview_options 是巢狀物件（原本的頂層 is_disabled 是無效欄位）');
        {
            // /stop 沒有 reply_to_message 時會回「找不到對應的下載！」，該則有帶 link_preview_options
            const calls = await feed('/stop');
            const p = sent(calls, 'sendMessage')[0] && sent(calls, 'sendMessage')[0].params;
            check('有送出訊息', !!p, JSON.stringify(calls.map(c => c.method)));
            check('沒有無效的頂層 is_disabled', p && p.is_disabled === undefined, JSON.stringify(p));
            const lpo = p && p.link_preview_options ? JSON.parse(p.link_preview_options) : null;
            check('link_preview_options.is_disabled 為 true', lpo && lpo.is_disabled === true, JSON.stringify(lpo));
        }

        console.log('\n[6] ojv 路由：hears 保留不加斜線寫法，ctx.match[1] 取得網址');
        {
            // 下載器已被 stub 掉，這裡只驗證路由與參數，不會有任何對外連線
            const calls = await feed('ojv https://oncejapan.com/movies/detail/123');
            const texts = sent(calls, 'sendMessage').map(m => m.params.text);
            const edits = sent(calls, 'editMessageText').map(m => m.params.text);
            check('不加斜線的 ojv 有觸發', texts.some(t => /OJ 單一影片下載開始/.test(t)),
                JSON.stringify(texts));
            check('走的是單一網址分支（代表 ctx.match[1] 有取到）',
                texts.some(t => t.includes('單一影片')), JSON.stringify(texts));
            check('結果透過 editMessageText 回報',
                edits.some(t => /stub\) OJ 影片下載完成/.test(t)), JSON.stringify(edits));
        }
        {
            const calls = await feed('/ojv');
            const texts = sent(calls, 'sendMessage').map(m => m.params.text);
            check('加斜線的 /ojv 也觸發，且走全站分支',
                texts.some(t => /^⏳ OJ 影片下載開始/.test(t)), JSON.stringify(texts));
        }

        console.log('\n[7] 純網址訊息 → 進入 URL handler');
        {
            const calls = await feed('https://www.instagram.com/p/ABC123/');
            check('有 API 呼叫（URL handler 有跑）', calls.length > 0,
                JSON.stringify(calls.map(c => c.method)));
        }

        console.log('\n[8] 未錨定 regex 已修正：訊息中間的 /stop 不再誤觸');
        {
            const calls = await feed('https://example.com/stop/here');
            const stopMsg = sent(calls, 'sendMessage').find(m => /找不到對應的下載/.test(m.params.text));
            check('沒有觸發 /stop handler', !stopMsg,
                JSON.stringify(sent(calls, 'sendMessage').map(m => m.params.text)));
        }

        console.log('\n[9] sendDocument 上傳分流：本地路徑走 multipart、遠端網址走字串');
        {
            const localFile = path.join(tmpDir, 'photo.jpg');
            const bytes = Buffer.from('FAKE-JPEG-BYTES-1234567890');
            fs.writeFileSync(localFile, bytes);

            const before = fake.calls.length;
            await messageHandler._sendLocalFiles(MY_ID, 1, { localFiles: [localFile], originalUrls: null });
            const localCalls = fake.calls.slice(before).filter(c => c.method === 'sendDocument');
            check('本地檔案送出 sendDocument', localCalls.length === 1);
            const uploaded = localCalls[0] && localCalls[0].files.document;
            check('multipart 內含實際檔案位元組',
                uploaded && uploaded.equals(bytes), uploaded ? uploaded.toString() : 'no file part');

            const before2 = fake.calls.length;
            await messageHandler._sendMediaFiles(MY_ID, { type: 99, data: ['https://cdn.example.com/a.jpg'] });
            const remote = fake.calls.slice(before2).filter(c => c.method === 'sendDocument')[0];
            check('遠端網址以字串直傳，不做 multipart',
                remote && remote.params.document === 'https://cdn.example.com/a.jpg' && !remote.files.document,
                JSON.stringify(remote && remote.params));

            const before3 = fake.calls.length;
            await messageHandler._sendLocalFiles(MY_ID, 1, { cachedFileIds: ['AgACFILEID'], originalUrls: null });
            const byId = fake.calls.slice(before3).filter(c => c.method === 'sendDocument')[0];
            check('file_id 以字串直傳', byId && byId.params.document === 'AgACFILEID',
                JSON.stringify(byId && byId.params));
        }

        console.log('\n[10] handler 內拋例外 → 交給 bot.catch，polling 不中斷');
        {
            const boom = new Bot(TOKEN, { apiRoot: fake.url });
            const errs = [];
            boom.catch((err) => { errs.push(err); });
            boom.command('boom', () => { throw new Error('炸了'); });
            await boom.handleUpdate(textUpdate('/boom', MY_ID));
            check('bot.catch 有接到例外', errs.length === 1 && /炸了/.test(errs[0].message),
                JSON.stringify(errs.map(e => e.message)));
        }

        console.log('\n[11] startPolling 能從假 server 取得 update 並派送');
        {
            const poller = new Bot(TOKEN, { apiRoot: fake.url });
            const seen = [];
            poller.command('ping', (ctx) => { seen.push(ctx.message.text); });
            fake.queue.push(textUpdate('/ping', MY_ID));
            const run = poller.startPolling(undefined, { timeout: 0 });
            await new Promise(r => setTimeout(r, 400));
            poller.stop();
            await run.catch(() => {});
            check('long poll 有收到並派送 update', seen.length === 1 && seen[0] === '/ping',
                JSON.stringify(seen));
        }

        console.log('\n[12] 全程沒有任何舊欄位外流');
        {
            const bad = fake.calls.filter(c =>
                c.params.reply_to_message_id !== undefined ||
                c.params.allow_sending_without_reply !== undefined ||
                c.params.is_disabled !== undefined
            );
            check('沒有任何呼叫帶著 v1 舊欄位', bad.length === 0,
                JSON.stringify(bad.map(b => ({ m: b.method, p: Object.keys(b.params) }))));
        }
    } catch (err) {
        console.error('\n測試本身爆掉:', err);
        fail++;
    } finally {
        await fake.close();
        try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) { /* ignore */ }
    }

    console.log(`\n===== 通過 ${pass} / 失敗 ${fail} =====`);
    process.exit(fail ? 1 : 0);
}

main();
