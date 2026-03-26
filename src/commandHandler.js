const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const kill = require('kill-with-style');
const { checkCanUse, getUserLogName, getProgressEmoji } = require('./utils');
const UrlParser = require('./urlParser');
const { ImageDownloader } = require('./downloader');
const { DOWNLOAD_LIMITS } = require('./constants');

/**
 * Bot 命令處理器
 */
class CommandHandler {
    constructor(bot, config, filePaths, downloadQueue, videoDownloader, messageHandler, downloadCache = null) {
        this.bot = bot;
        this.config = config;
        this.filePaths = filePaths;
        this.downloadQueue = downloadQueue;
        this.videoDownloader = videoDownloader;
        this.messageHandler = messageHandler;
        this.downloadCache = downloadCache;
        this.urlParser = new UrlParser();
        this.imageDownloader = new ImageDownloader(downloadCache);
    }

    /**
     * 註冊所有命令處理器
     */
    registerHandlers() {
        this._registerUrlHandler();
        this._registerGalleryDlHandlers();
        this._registerYtDlpHandlers();
        this._registerStopHandler();
        this._registerHelpHandler();
        this._registerGetMyIdHandler();
    }

    /**
     * 註冊 URL 處理器（處理包含 https:// 的消息）
     * @private
     */
    _registerUrlHandler() {
        this.bot.onText(/https:\/\//, async (msg, match) => {
            const chatId = msg.chat.id;
            const msgId = msg.message_id;
            const logName = getUserLogName(msg);
            const chatMsg = match.input;

            try {
                // 忽略 /gal 和 /ytd 命令
                if (/\/gal/.test(chatMsg) || /\/ytd/.test(chatMsg)) {
                    return;
                }

                // 權限檢查
                if (!await checkCanUse(this.bot, chatId, msgId, logName, chatMsg, this.config.adminId)) {
                    return;
                }

                console.log(`[LOG][Telegram] ${logName}`);

                // 解析 URL
                const { imgTargets, vidTargets, streamTargets } = this.urlParser.parse(chatMsg);

                // 檢查是否有有效的 URL
                if (!this.urlParser.hasValidUrls({ imgTargets, vidTargets, streamTargets })) {
                    throw new Error(`[${logName}] 沒發現支援的網址 ${chatMsg}`);
                }

                // 解析選項
                const uploadToTg = /-u/i.test(chatMsg); // myId 專用：上傳到 TG

                // 如果是 myId 且沒有 -u 選項，則加入列表而不是下載
                if (chatId === this.config.myId && !uploadToTg) {
                    await this._addUrlsToLists(msg, chatId, msgId, imgTargets, vidTargets, streamTargets);
                    return;
                }

                // 一般使用者和 myId 使用 -u 時，都下載並上傳到 TG
                const downloadRemote = false; // 統一都上傳到 TG

                // 處理圖片下載
                if (Object.keys(imgTargets).length > 0) {
                    const results = await this.imageDownloader.download(imgTargets, downloadRemote);

                    if (results.length > 0) {
                        await this.messageHandler.sendMessages(msg, results, downloadRemote);
                    } else {
                        await this.bot.sendMessage(
                            chatId,
                            '沒東西啦 !!',
                            {
                                is_disabled: true,
                                reply_to_message_id: msgId,
                                allow_sending_without_reply: true
                            }
                        );
                    }
                }

                // 處理 TikTok 影片和直播、Twitch 直播（直接在此處理，不加入隊列）
                const tiktokVideos = {};
                const regularVideos = {};

                for (const target in vidTargets) {
                    const data = vidTargets[target];
                    if (data.type === 8) { // MEDIA_TYPES.TIKTOK_VIDEO
                        tiktokVideos[target] = data;
                    } else {
                        regularVideos[target] = data;
                    }
                }

                // 處理 TikTok 影片
                // downloadRemote 為 true 表示只下載到遠端（不上傳到 TG）
                if (Object.keys(tiktokVideos).length > 0) {
                    const tiktokResults = Object.values(tiktokVideos);
                    await this.messageHandler.sendMessages(msg, tiktokResults, downloadRemote);
                }

                // 處理一般影片下載
                await this._handleVideoDownloads(chatId, msgId, regularVideos);

                // 處理直播下載（TikTok Live 和 Twitch Live 返回指令）
                if (Object.keys(streamTargets).length > 0) {
                    const streamResults = Object.values(streamTargets);
                    await this.messageHandler.sendMessages(msg, streamResults, false);
                }

            } catch (error) {
                console.error(`[ERROR][Telegram] ${error}`);

                // 只對白名單用戶發送錯誤訊息
                if (this.config.adminId.includes(chatId)) {
                    try {
                        await this.bot.sendMessage(
                            chatId,
                            `出錯了: ${error}`,
                            {
                                reply_to_message_id: msgId,
                                allow_sending_without_reply: true
                            }
                        );
                    } catch (sendError) {
                        console.error(`[ERROR][Telegram] Failed to send error message: ${sendError.message}`);
                    }
                }
            }
        });
    }

    /**
     * 處理影片下載
     * @private
     */
    async _handleVideoDownloads(chatId, msgId, vidTargets) {
        for (const target in vidTargets) {
            const data = vidTargets[target];
            const replyMsg = await this.bot.sendMessage(
                chatId,
                `${target}\n\n即將開始下載...`,
                {
                    is_disabled: true,
                    reply_to_message_id: msgId,
                    allow_sending_without_reply: true
                }
            );

            data.chatId = chatId;
            data.replyMsgId = replyMsg.message_id;

            const videoRunningQueue = this.downloadQueue.getVideoRunningQueue();
            const videoQueue = this.downloadQueue.getVideoQueue();

            if (videoRunningQueue.length >= DOWNLOAD_LIMITS.VIDEO) {
                videoQueue.push(data);
            } else {
                videoRunningQueue.push(data);
                this.videoDownloader.download(data);
            }
        }
    }

    /**
     * 處理直播下載
     * @private
     */
    async _handleStreamDownloads(chatId, msgId, streamTargets) {
        for (const target in streamTargets) {
            const data = streamTargets[target];
            const replyMsg = await this.bot.sendMessage(
                chatId,
                `${target}\n\n即將開始下載...`,
                {
                    is_disabled: true,
                    reply_to_message_id: msgId,
                    allow_sending_without_reply: true
                }
            );

            data.chatId = chatId;
            data.replyMsgId = replyMsg.message_id;

            const streamRunningQueue = this.downloadQueue.getStreamRunningQueue();
            const streamQueue = this.downloadQueue.getStreamQueue();

            if (streamRunningQueue.length >= DOWNLOAD_LIMITS.STREAM) {
                streamQueue.push(data);
            } else {
                streamRunningQueue.push(data);
                this.videoDownloader.download(data);
            }
        }
    }

    /**
     * 將 URL 加入對應的下載列表（myId 專用）
     * @private
     */
    async _addUrlsToLists(msg, chatId, msgId, imgTargets, vidTargets, streamTargets) {
        const { MEDIA_TYPES } = require('./constants');
        let galCount = 0;
        let ytdCount = 0;
        let streamlinkCommands = [];

        // 將圖片類 URL 加入 gallery-dl 列表
        if (Object.keys(imgTargets).length > 0) {
            const galListStream = fs.createWriteStream(this.filePaths.absoluteGalleryDlListPath, { flags: 'a' });
            for (const url in imgTargets) {
                galListStream.write(`${url.split('?')[0].replace(/\/$/, '')}\n`);
                galCount++;
            }
            galListStream.end();
        }

        // 處理直播類 URL - 生成 streamlink 指令
        const today = new Date();
        const dateStr = `${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}${today.getHours().toString().padStart(2, '0')}`;

        for (const url in streamTargets) {
            const data = streamTargets[url];

            if (data.type === MEDIA_TYPES.TWITCH_LIVE) {
                // Twitch 直播
                const channelMatch = url.match(/twitch\.tv\/([\w-]+)/);
                const channel = channelMatch ? channelMatch[1] : 'channel';
                const cmd = `streamlink --retry-streams 5 --retry-max 100 --retry-open 500 --stream-segment-attempts 10 --twitch-disable-ads "${url}" best -o "${dateStr} ${channel} twitch.ts"`;
                streamlinkCommands.push(cmd);
            } else if (data.type === MEDIA_TYPES.TIKTOK_LIVE) {
                // TikTok 直播
                const userMatch = url.match(/tiktok\.com\/@([\w.-]+)/);
                const username = userMatch ? userMatch[1] : 'user';
                const cmd = `streamlink --retry-streams 5 --retry-max 100 --retry-open 100 --stream-segment-attempts 10 "${url}" best -o "${dateStr} @${username} tiktok.ts"`;
                streamlinkCommands.push(cmd);
            }
        }

        // 將影片類 URL 加入 yt-dlp 列表（排除 TikTok 影片）
        const regularVideos = Object.entries(vidTargets).filter(([url, data]) =>
            data.type !== MEDIA_TYPES.TIKTOK_VIDEO
        );

        // 處理 TikTok 影片（遠端下載）
        const tiktokVideos = Object.entries(vidTargets).filter(([url, data]) =>
            data.type === MEDIA_TYPES.TIKTOK_VIDEO
        );

        if (regularVideos.length > 0) {
            const ytdListStream = fs.createWriteStream(this.filePaths.absoluteYtDlListPath, { flags: 'a' });
            const ytd2ListStream = fs.createWriteStream(this.filePaths.absoluteYtDl2ListPath, { flags: 'a' });

            ytd2ListStream.write(`\n\n#${new Date().toLocaleDateString()}\n`);

            for (const [url, data] of regularVideos) {
                ytdListStream.write(`${url}\n`);
                ytd2ListStream.write(`${url}\n`);
                ytdCount++;
            }

            ytdListStream.end();
            ytd2ListStream.end();
        }

        // 處理 TikTok 影片：直接下載（不加入列表）
        if (tiktokVideos.length > 0) {
            for (const [url, data] of tiktokVideos) {
                // 異步下載 TikTok 影片
                this.messageHandler.sendMessages(msg, [data], true).catch(err => {
                    console.error(`[ERROR] TikTok 下載失敗: ${err}`);
                });
            }
        }

        // 發送確認消息
        let confirmMsg = '';
        if (galCount > 0) {
            confirmMsg += `✅ 網址已加入 gallery-dl 下載列表: ${galCount} 個網址\n`;
        }
        if (ytdCount > 0) {
            confirmMsg += `✅ 網址已加入 yt-dlp 下載列表: ${ytdCount} 個網址\n`;
        }
        if (tiktokVideos.length > 0) {
            confirmMsg += `🎵 開始下載 TikTok 影片: ${tiktokVideos.length} 個影片\n`;
        }
        if (streamlinkCommands.length > 0) {
            confirmMsg += `\n📺 直播指令:\n`;
            for (const cmd of streamlinkCommands) {
                confirmMsg += `\`${cmd}\`\n`;
            }
        }
        if (galCount > 0 || ytdCount > 0) {
            confirmMsg += '\n💡 使用 -u 參數可以立即下載並上傳';
        }

        if (confirmMsg.trim() !== '') {
            await this.bot.sendMessage(
                chatId,
                confirmMsg,
                {
                    parse_mode: 'Markdown',
                    reply_to_message_id: msgId,
                    allow_sending_without_reply: true
                }
            );
        }
    }

    /**
     * 註冊 gallery-dl 相關命令處理器
     * @private
     */
    _registerGalleryDlHandlers() {
        // /gal 命令：添加 URL 到列表
        this.bot.onText(/^\/gal\s/, async (msg, match) => {
            await this._handleListCommand(
                msg,
                match,
                'gal',
                this.filePaths.absoluteGalleryDlListPath,
                'gallery-dl'
            );
        });

        // /gal_get 命令：獲取列表內容
        this.bot.onText(/^\/gal_get$/, async (msg) => {
            await this._handleGetListCommand(
                msg,
                'gal_get',
                this.filePaths.absoluteGalleryDlListPath,
                'gallery-dl'
            );
        });

        // /gal_run 命令：執行下載
        this.bot.onText(/^\/gal_run$/, async (msg) => {
            await this._handleGalleryDlRun(msg);
        });
    }

    /**
     * 註冊 yt-dlp 相關命令處理器
     * @private
     */
    _registerYtDlpHandlers() {
        // /ytd 命令：添加 URL 到列表
        this.bot.onText(/^\/ytd\s/, async (msg, match) => {
            const chatId = msg.chat.id;
            const msgId = msg.message_id;
            const logName = getUserLogName(msg);
            const chatMsg = match.input;

            try {
                if (!await checkCanUse(this.bot, chatId, msgId, logName, chatMsg, this.config.adminId)) {
                    return;
                }

                console.log(`[LOG][Telegram][ytd] ${logName}`);

                const urls = chatMsg.match(/https?:\/\/[^\s]+/g);
                if (!urls || urls.length === 0) {
                    throw new Error(`[${logName}] 沒有發現任何網址`);
                }

                const ytDlListStream = fs.createWriteStream(this.filePaths.absoluteYtDlListPath, { flags: 'a' });
                const ytDl2ListStream = fs.createWriteStream(this.filePaths.absoluteYtDl2ListPath, { flags: 'a' });

                ytDl2ListStream.write(`\n\n#${new Date().toLocaleDateString()}\n`);

                let urlCount = 0;
                for (const url of urls) {
                    if (!/^https?:\/\//.test(url)) {
                        continue;
                    }
                    ytDlListStream.write(`${url}\n`);
                    ytDl2ListStream.write(`${url}\n`);
                    urlCount++;
                }

                await this.bot.sendMessage(
                    chatId,
                    `✅ 網址已加入 yt-dlp 下載列表: ${urlCount} 個網址\n💡 使用 /ytd_run 執行下載`,
                    {
                        reply_to_message_id: msgId,
                        allow_sending_without_reply: true
                    }
                );
            } catch (error) {
                console.error(error);
                if (this.config.adminId.includes(chatId)) {
                    try {
                        await this.bot.sendMessage(
                            chatId,
                            error.toString(),
                            {
                                reply_to_message_id: msgId,
                                allow_sending_without_reply: true
                            }
                        );
                    } catch (sendError) {
                        console.error(`[ERROR] Failed to send error message: ${sendError.message}`);
                    }
                }
            }
        });

        // /ytd_get 命令：獲取列表內容
        this.bot.onText(/^\/ytd_get$/, async (msg) => {
            await this._handleGetListCommand(
                msg,
                'ytd_get',
                this.filePaths.absoluteYtDlListPath,
                'yt-dlp'
            );
        });

        // /ytd_run 命令：執行下載
        this.bot.onText(/^\/ytd_run$/, async (msg) => {
            await this._handleYtDlpRun(msg);
        });

        // /ytd_purge 命令：清空列表
        this.bot.onText(/^\/ytd_purge$/, async (msg) => {
            await this._handlePurgeListCommand(
                msg,
                'ytd_purge',
                this.filePaths.absoluteYtDlListPath,
                'yt-dlp'
            );
        });
    }

    /**
     * 通用的列表命令處理器
     * @private
     */
    async _handleListCommand(msg, match, commandName, listPath, toolName) {
        const chatId = msg.chat.id;
        const msgId = msg.message_id;
        const logName = getUserLogName(msg);
        const chatMsg = match.input;

        try {
            if (!await checkCanUse(this.bot, chatId, msgId, logName, chatMsg, this.config.adminId)) {
                return;
            }

            console.log(`[LOG][Telegram][${commandName}] ${logName}`);

            const urls = chatMsg.match(/https?:\/\/[^\s]+/g);
            if (!urls || urls.length === 0) {
                throw new Error(`[${logName}] 沒有發現任何網址`);
            }

            const listStream = fs.createWriteStream(listPath, { flags: 'a' });
            let urlCount = 0;
            for (const url of urls) {
                if (!/^https?:\/\//.test(url)) {
                    continue;
                }
                listStream.write(`${url.split('?')[0].replace(/\/$/, '')}\n`);
                urlCount++;
            }

            await this.bot.sendMessage(
                chatId,
                `✅ 網址已加入 ${toolName} 下載列表: ${urlCount} 個網址\n💡 使用 /gal_run 或 /ytd_run 執行下載`,
                {
                    reply_to_message_id: msgId,
                    allow_sending_without_reply: true
                }
            );
        } catch (error) {
            console.error(error);
            if (this.config.adminId.includes(chatId)) {
                try {
                    await this.bot.sendMessage(
                        chatId,
                        error.toString(),
                        {
                            reply_to_message_id: msgId,
                            allow_sending_without_reply: true
                        }
                    );
                } catch (sendError) {
                    console.error(`[ERROR] Failed to send error message: ${sendError.message}`);
                }
            }
        }
    }

    /**
     * 通用的獲取列表命令處理器
     * @private
     */
    async _handleGetListCommand(msg, commandName, listPath, toolName) {
        const chatId = msg.chat.id;
        const msgId = msg.message_id;
        const logName = getUserLogName(msg);

        try {
            if (!await checkCanUse(this.bot, chatId, msgId, logName, '', this.config.adminId)) {
                return;
            }

            console.log(`[LOG][Telegram][${commandName}] ${logName}`);

            const fileContent = fs.readFileSync(listPath, { encoding: 'utf8', flag: 'r' });

            // 過濾掉以 # 開頭的行（註解或已下載的項目）
            const filteredLines = fileContent
                .split('\n')
                .filter(line => {
                    const trimmedLine = line.trim();
                    return trimmedLine.length > 0 && !trimmedLine.startsWith('#');
                })
                .join('\n');

            if (filteredLines.length === 0) {
                await this.bot.sendMessage(
                    chatId,
                    '目前沒有任何網址！',
                    {
                        reply_to_message_id: msgId,
                        allow_sending_without_reply: true
                    }
                );
                return;
            }

            await this.bot.sendMessage(
                chatId,
                filteredLines,
                {
                    reply_to_message_id: msgId,
                    allow_sending_without_reply: true
                }
            );
        } catch (error) {
            console.error(error);
            if (this.config.adminId.includes(chatId)) {
                try {
                    await this.bot.sendMessage(
                        chatId,
                        error.toString(),
                        {
                            reply_to_message_id: msgId,
                            allow_sending_without_reply: true
                        }
                    );
                } catch (sendError) {
                    console.error(`[ERROR] Failed to send error message: ${sendError.message}`);
                }
            }
        }
    }

    /**
     * 通用的清空列表命令處理器
     * @private
     */
    async _handlePurgeListCommand(msg, commandName, listPath, toolName) {
        const chatId = msg.chat.id;
        const msgId = msg.message_id;
        const logName = getUserLogName(msg);

        try {
            if (!await checkCanUse(this.bot, chatId, msgId, logName, '', this.config.adminId)) {
                return;
            }

            console.log(`[LOG][Telegram][${commandName}] ${logName}`);

            fs.writeFileSync(listPath, '');

            await this.bot.sendMessage(
                chatId,
                `✅ ${toolName} 下載列表已清空！`,
                {
                    reply_to_message_id: msgId,
                    allow_sending_without_reply: true
                }
            );
        } catch (error) {
            console.error(error);
            if (this.config.adminId.includes(chatId)) {
                try {
                    await this.bot.sendMessage(
                        chatId,
                        error.toString(),
                        {
                            reply_to_message_id: msgId,
                            allow_sending_without_reply: true
                        }
                    );
                } catch (sendError) {
                    console.error(`[ERROR] Failed to send error message: ${sendError.message}`);
                }
            }
        }
    }

    /**
     * 處理 gallery-dl 運行命令
     * @private
     */
    async _handleGalleryDlRun(msg) {
        const chatId = msg.chat.id;
        const msgId = msg.message_id;
        const logName = getUserLogName(msg);

        try {
            if (!await checkCanUse(this.bot, chatId, msgId, logName, '', this.config.adminId)) {
                return;
            }

            console.log(`[LOG][Telegram][gal_run] ${logName}`);

            // 讀取列表檔案並檢查快取
            const fs = require('fs');
            let cachedCount = 0;
            let totalUrls = 0;

            try {
                const content = fs.readFileSync(this.filePaths.absoluteGalleryDlListPath, 'utf-8');
                const lines = content.split('\n');
                const modifiedLines = [];

                for (const line of lines) {
                    const trimmed = line.trim();

                    // 檢查是否為 URL (非註解)
                    if (trimmed && trimmed.startsWith('http') && !line.trim().startsWith('#')) {
                        const normalizedUrl = trimmed.replace(/\/$/, '');
                        totalUrls++;

                        // 檢查快取
                        if (this.downloadCache) {
                            const cached = this.downloadCache.get(normalizedUrl);
                            if (cached && cached.file_paths && cached.file_paths.length > 0) {
                                // 快取存在且檔案都存在,註解此行
                                console.log(`[LOG][Cache] 跳過已下載: ${normalizedUrl}`);
                                modifiedLines.push(`# ${normalizedUrl}`);
                                cachedCount++;
                                continue;
                            }
                        }
                        modifiedLines.push(normalizedUrl);
                        continue;
                    }

                    // 保留原行
                    modifiedLines.push(line);
                }

                // 寫回修改後的列表
                fs.writeFileSync(this.filePaths.absoluteGalleryDlListPath, modifiedLines.join('\n'), 'utf-8');
            } catch (err) {
                console.error('[ERROR] 處理 gallery-dl 列表失敗:', err);
            }

            const cmd = 'gallery-dl';
            const args = ['--cookies-from-browser', 'firefox', '-I', this.filePaths.absoluteGalleryDlListPath];

            const cacheInfo = cachedCount > 0 ? `\n⏭️  跳過 ${cachedCount} 個已下載的 URL` : '';
            const startMsg = await this.bot.sendMessage(chatId, '⏳ gallery-dl 開始批次下載...' + cacheInfo);
            const startMsgId = startMsg.message_id;

            // 用於記錄每個 URL 下載的檔案路徑
            const urlFileMap = new Map(); // url -> [filePaths]
            const downloadedFiles = []; // 所有下載的檔案路徑
            let currentUrl = null; // 追蹤 gallery-dl 的 [N/M] URL 標記

            // 讀取列表中未註解的 URL
            const activeUrls = [];
            try {
                const listContent = fs.readFileSync(this.filePaths.absoluteGalleryDlListPath, 'utf-8');
                const listLines = listContent.split('\n');
                for (const line of listLines) {
                    const trimmed = line.trim();
                    if (trimmed && trimmed.startsWith('http') && !line.trim().startsWith('#')) {
                        activeUrls.push(trimmed.replace(/\/$/, ''));
                    }
                }
                console.log(`[LOG] 列表中有 ${activeUrls.length} 個待下載的 URL`);
            } catch (err) {
                console.error('[ERROR] 讀取活躍 URL 列表失敗:', err);
            }

            const process = spawn(cmd, args);
            let stdoutBuffer = ''; // 用於累積未完成的行
            let stderrBuffer = '';

            process.stdout.on('data', (data) => {
                const dataStr = data.toString();
                stdoutBuffer += dataStr;

                // 分割成行，保留最後一個未完成的行
                const lines = stdoutBuffer.split(/\r?\n/);
                stdoutBuffer = lines.pop() || ''; // 保留最後一個可能未完成的行

                for (const line of lines) {
                    if (!line.trim()) continue; // 跳過空行

                    // 去除 ANSI color codes
                    // eslint-disable-next-line no-control-regex
                    const cleanLine = line.replace(/\x1B\[\d+m/g, '').trim();

                    // 移除可能的 # 前綴
                    let filePath = cleanLine.replace(/^#\s*/, '');

                    // 檢查是否為檔案路徑(包含檔案副檔名)
                    // 放寬條件：只要是支援的副檔名結尾，且不包含 pipe
                    if (/\.(jpg|jpeg|png|gif|mp4|webm|webp)$/i.test(filePath) && !filePath.includes('|')) {
                        // 同步收集檔案,不更新 Telegram 訊息
                        downloadedFiles.push(filePath);
                        // 歸入當前 URL
                        if (currentUrl && urlFileMap.has(currentUrl)) {
                            urlFileMap.get(currentUrl).push(filePath);
                        }
                        console.log(`[LOG] 下載檔案: ${filePath}`);
                    }
                }
            });            process.stderr.on('data', async (data) => {
                const dataStr = data.toString();
                stderrBuffer += dataStr;

                const stderrLines = stderrBuffer.split(/\r?\n/);
                stderrBuffer = stderrLines.pop() || '';

                for (const sline of stderrLines) {
                    if (!sline.trim()) continue;

                    // 偵測 gallery-dl 的 [N/M] URL 標記行
                    const urlMarker = sline.trim().match(/^\[(\d+)\/(\d+)\]\s+(https?:\/\/.+)$/);
                    if (urlMarker) {
                        currentUrl = urlMarker[3].trim();
                        if (!urlFileMap.has(currentUrl)) {
                            urlFileMap.set(currentUrl, []);
                        }
                        console.log(`[LOG][marker] 偵測到 URL 標記: ${currentUrl}`);
                    }

                    console.error(sline);
                    if (/^ERROR:/.test(sline)) {
                        try {
                            await this.bot.editMessageText(
                                `❌ gallery-dl 下載發生錯誤：\n${sline}`,
                                { chat_id: chatId, message_id: startMsgId }
                            );
                        } catch (e) {
                            console.error('[ERROR] 無法更新錯誤訊息:', e.message);
                        }
                    }
                }
            });

            process.on('close', async (code) => {
                // 處理緩衝區中剩餘的資料
                if (stdoutBuffer.trim()) {
                    const line = stdoutBuffer.trim();
                    // eslint-disable-next-line no-control-regex
                    const cleanLine = line.replace(/\x1B\[\d+m/g, '').trim();
                    let filePath = cleanLine.replace(/^#\s*/, '');

                    if (/\.(jpg|jpeg|png|gif|mp4|webm|webp)$/i.test(filePath) && !filePath.includes('|')) {
                        downloadedFiles.push(filePath);
                        if (currentUrl && urlFileMap.has(currentUrl)) {
                            urlFileMap.get(currentUrl).push(filePath);
                        }
                        console.log(`[LOG] 下載檔案: ${filePath}`);
                    }
                }

                // 延遲一下,確保所有 stdout 事件都被處理完
                await new Promise(resolve => setTimeout(resolve, 100));

                console.log(`[LOG] /gal close，code: ${code}, 下載檔案數: ${downloadedFiles.length}, 活躍URL數: ${activeUrls.length}`);

                if (code === 0 && downloadedFiles.length > 0) {

                    // 策略: 如果只有一個 URL,將所有檔案關聯到該 URL
                    // 如果有多個 URL,嘗試根據檔案路徑推斷
                    let savedCount = 0;

                    if (this.downloadCache && activeUrls.length > 0) {
                        // 如果沒有偵測到 [N/M] 標記（只有 1 個 URL 時可能不輸出標記），
                        // 將所有檔案歸到唯一的 activeUrl
                        console.log(`[LOG][cache] urlFileMap.size: ${urlFileMap.size}, activeUrls: ${activeUrls.length}, downloadedFiles: ${downloadedFiles.length}`);
                        if (urlFileMap.size === 0 && activeUrls.length === 1) {
                            urlFileMap.set(activeUrls[0], downloadedFiles);
                        }

                        // 統一使用 urlFileMap 儲存快取
                        for (const [url, filePaths] of urlFileMap.entries()) {
                            if (filePaths.length > 0) {
                                this.downloadCache.setBatch(url, filePaths);
                                savedCount++;
                            }
                        }
                    }

                    // 最後一次更新訊息
                    let finalMsg = `✅ 列表下載完成！\n\n📦 總共下載: ${downloadedFiles.length} 個檔案\n`;

                    // 列出每個 URL 及其檔案
                    if (urlFileMap.size > 0) {
                        finalMsg += '\n━━━━━━━━━━━━━━━━\n';
                        for (const [url, filePaths] of urlFileMap.entries()) {
                            if (filePaths.length > 0) {
                                // 顯示完整 URL
                                finalMsg += `\n${url}\n`;

                                // 列出檔案名稱
                                filePaths.forEach(filePath => {
                                    const fileName = path.basename(filePath);
                                    finalMsg += `${fileName}\n`;
                                });
                            }
                        }
                    }

                    await this.bot.editMessageText(finalMsg, {
                        chat_id: chatId,
                        message_id: startMsgId
                    });
                } else if (code === 0) {
                    await this.bot.editMessageText(
                        '✅ 列表下載完成！(沒有新下載)',
                        { chat_id: chatId, message_id: startMsgId }
                    );
                } else {
                    // 非 0 的 exit code
                    console.error(`[ERROR] gallery-dl exit code: ${code}`);
                    await this.bot.editMessageText(
                        `❌ gallery-dl 執行失敗 (exit code: ${code})`,
                        { chat_id: chatId, message_id: startMsgId }
                    );
                }
            });            process.on('error', async (err) => {
                console.error(`[ERROR] gallery-dl process error: ${err.message}`);
                try {
                    await this.bot.editMessageText(
                        `❌ gallery-dl 執行錯誤：${err.message}`,
                        { chat_id: chatId, message_id: startMsgId }
                    );
                } catch (e) {
                    console.error('[ERROR] 無法更新錯誤訊息:', e.message);
                }
            });

        } catch (error) {
            console.error(error);
            if (this.config.adminId.includes(chatId)) {
                try {
                    await this.bot.sendMessage(
                        chatId,
                        error.toString(),
                        {
                            reply_to_message_id: msgId,
                            allow_sending_without_reply: true
                        }
                    );
                } catch (sendError) {
                    console.error(`[ERROR] Failed to send error message: ${sendError.message}`);
                }
            }
        }
    }

    /**
     * 處理 yt-dlp 運行命令
     * @private
     */
    async _handleYtDlpRun(msg) {
        const chatId = msg.chat.id;
        const msgId = msg.message_id;
        const logName = getUserLogName(msg);

        try {
            if (!await checkCanUse(this.bot, chatId, msgId, logName, '', this.config.adminId)) {
                return;
            }

            console.log(`[LOG][Telegram][ytd_run] ${logName}`);

            const cmd = 'yt-dlp';
            const args = ['-a', this.filePaths.absoluteYtDlListPath, '--mark-watched'];

            const startMsg = await this.bot.sendMessage(chatId, 'yt-dlp 開始下載...');
            const startMsgId = startMsg.message_id;

            let progressTxt = '下載進度:';
            let currentVid = '';
            let currentProgress = 0;

            const process = spawn(cmd, args);

            process.stdout.on('data', async (data) => {
                const dataStr = data.toString();

                // 新下載
                if (/\[info\] \S+: Downloading/.test(dataStr)) {
                    const videoId = dataStr.match(/\[info\] (\S+): Downloading/)[1];
                    currentVid = videoId;
                    progressTxt += `\n${videoId}: ${await getProgressEmoji(0)}`;
                    await this.bot.editMessageText(progressTxt, { chat_id: chatId, message_id: startMsgId });
                }
                // 下載進度
                else if (/\[download\]\s+\d+\.\d+% of/.test(dataStr) && currentProgress < 100) {
                    const tmpProgress = dataStr.match(/\[download\]\s+(\d+\.\d+)% of/);
                    if (tmpProgress) {
                        const tmpCurrentProgress = Math.round(parseFloat(tmpProgress[1]) / 10) * 10;
                        if (currentProgress < tmpCurrentProgress) {
                            currentProgress = tmpCurrentProgress;
                            const progress = await getProgressEmoji(currentProgress);
                            const tmpRegex = new RegExp(`\n${currentVid}: \\S+$`);
                            progressTxt = progressTxt.replace(tmpRegex, `\n${currentVid}: ${progress}`);

                            if (currentProgress === 100) {
                                progressTxt += ' 下載即將完成，影片合併中...';
                            }

                            await this.bot.editMessageText(progressTxt, { chat_id: chatId, message_id: startMsgId });
                        }
                    }
                }
                // 下載完成
                else if (new RegExp(`Deleting original file .*_(${currentVid})_`).test(dataStr) && currentProgress === 100) {
                    const tmpRegex = new RegExp(`\n${currentVid}: \\S+ \\S+$`);
                    progressTxt = progressTxt.replace(tmpRegex, `\n✅ ${currentVid}: ${await getProgressEmoji(100)}`);

                    currentVid = '';
                    currentProgress = 0;

                    await this.bot.editMessageText(progressTxt, { chat_id: chatId, message_id: startMsgId });
                }
                // 檔案已存在
                else if (new RegExp(`[download] .*_(${currentVid})_.* has already been downloaded`).test(dataStr)) {
                    const tmpRegex = new RegExp(`\n${currentVid}: \\S+$`);
                    progressTxt = progressTxt.replace(tmpRegex, `\n❌ ${currentVid}: 檔案已存在`);
                    currentVid = '';
                    currentProgress = 0;
                    await this.bot.editMessageText(progressTxt, { chat_id: chatId, message_id: startMsgId });
                }
            });

            process.stderr.on('data', async (data) => {
                const dataStr = data.toString();
                if (/^ERROR:/.test(dataStr)) {
                    console.log(dataStr);
                    await this.bot.editMessageText(
                        progressTxt + `\nyt-dlp 下載發生錯誤：${dataStr}`,
                        { is_disabled: true, chat_id: chatId, message_id: startMsgId }
                    );
                }
            });

            process.on('close', async (code) => {
                if (code === 0) {
                    await this.bot.editMessageText(
                        progressTxt + '\n\n列表下載完成！',
                        { is_disabled: true, chat_id: chatId, message_id: startMsgId }
                    );
                    progressTxt = '下載進度:';
                    currentVid = '';
                    currentProgress = 0;
                }
            });

            process.on('error', async (err) => {
                console.error(`${err.message}`);
                await this.bot.editMessageText(
                    progressTxt + `\nyt-dlp 下載發生錯誤：${err}`,
                    { is_disabled: true, chat_id: chatId, message_id: startMsgId }
                );
            });
        } catch (error) {
            console.error(error);
            if (this.config.adminId.includes(chatId)) {
                try {
                    await this.bot.sendMessage(
                        chatId,
                        error.toString(),
                        {
                            reply_to_message_id: msgId,
                            allow_sending_without_reply: true
                        }
                    );
                } catch (sendError) {
                    console.error(`[ERROR] Failed to send error message: ${sendError.message}`);
                }
            }
        }
    }

    /**
     * 註冊停止命令處理器
     * @private
     */
    _registerStopHandler() {
        this.bot.onText(/\/stop/, async (msg) => {
            const chatId = msg.chat.id;

            if (!msg.reply_to_message) {
                await this.bot.sendMessage(
                    chatId,
                    '找不到對應的下載！',
                    {
                        is_disabled: true,
                        reply_to_message_id: msg.message_id,
                        allow_sending_without_reply: true
                    }
                );
                return;
            }

            const stopChatId = msg.reply_to_message.message_id;
            const streamRunningQueue = this.downloadQueue.getStreamRunningQueue();

            for (const data of streamRunningQueue) {
                if (data.replyMsgId === stopChatId && data.process) {
                    kill(data.process.pid, {
                        signal: ['SIGINT', 'SIGKILL'],
                        retryCount: 1,
                        retryInterval: 120000,
                        timeout: 300000
                    }, async (err) => {
                        if (err) {
                            await this.bot.sendMessage(
                                chatId,
                                `停止 ${data.target} 下載失敗！`,
                                {
                                    is_disabled: true,
                                    reply_to_message_id: data.replyMsgId,
                                    allow_sending_without_reply: true
                                }
                            );
                        } else {
                            await this.bot.sendMessage(
                                chatId,
                                `已停止 ${data.target} 下載作業！`,
                                {
                                    is_disabled: true,
                                    reply_to_message_id: data.replyMsgId,
                                    allow_sending_without_reply: true
                                }
                            );
                        }
                    });
                    return;
                }
            }
        });
    }

    /**
     * 註冊幫助命令處理器
     * @private
     */
    _registerHelpHandler() {
        this.bot.onText(/\/help/, (msg) => {
            const chatId = msg.chat.id;
            const isMyId = chatId === this.config.myId;

            let helpText = `
- Instagram 照片、影片：
    - https://www.instagram.com/p/[貼文ID]/
    - https://www.instagram.com/reel/[貼文ID]/

- Instagram 限動：
    - https://www.instagram.com/stories/[用戶名稱]/
    - https://www.instagram.com/stories/[用戶名稱]/[貼文ID]/

- X(Twitter) 圖片、影片：
    - https://x.com/[用戶名稱]/status/[貼文ID]/
`;

            if (isMyId) {
                helpText += `
<strong>📋 管理員模式：</strong>
- 預設行為：直接發送網址會<strong>加入 /gal 下載列表</strong>
- 立即下載並上傳：訊息帶「-u」參數
`;
            } else {
                helpText += `
- 預設下載並上傳到 Telegram
`;
            }

            helpText += `
- 一次傳入多個連結請用「<strong>換行</strong>」分開

<strong>📝 列表管理命令：</strong>
- /gal [連結]：將連結寫入 gallery-dl 下載列表
- /ytd [連結]：將連結寫入 yt-dlp 下載列表`;

            this.bot.sendMessage(chatId, helpText, { parse_mode: 'HTML' });
        });
    }

    /**
     * 註冊獲取 ID 命令處理器
     * @private
     */
    _registerGetMyIdHandler() {
        this.bot.onText(/\/get_my_id/, async (msg) => {
            const chatId = msg.chat.id;
            console.log('msg', msg);

            const replyMsg = await this.bot.sendMessage(
                chatId,
                chatId.toString(),
                {
                    reply_to_message_id: msg.message_id,
                    allow_sending_without_reply: true
                }
            );

            console.log('replyMsg', replyMsg);
        });
    }
}

module.exports = CommandHandler;
