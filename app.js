/**
 * 94Orig - Telegram Bot for Downloading Media from Instagram, Twitter/X, YouTube, etc.
 *
 * 主程式入口
 */

const { Bot } = require('node-telegram-bot-api');
const path = require('path');
const dns = require('dns').promises;

// v2 走 fetch，沒有 v1 的 request.agentOptions.family: 4 可設定。
// 開機時 Windows 的 IPv6 常常還沒就緒，這裡改用 DNS 解析順序達到同樣效果。
require('dns').setDefaultResultOrder('ipv4first');
const config = require('./config.js')[process.env.NODE_ENV === 'production' ? 'production' : 'development'];
const { initializeFiles } = require('./src/fileInit');
const { DownloadQueue, VideoDownloader } = require('./src/downloader');
const MessageHandler = require('./src/messageHandler');
const CommandHandler = require('./src/commandHandler');
const DownloadCache = require('./src/downloadCache');

// 測試時可用 TELEGRAM_API_ROOT 指向本機假 Bot API server，避免連到真的 Telegram
const botOptions = process.env.TELEGRAM_API_ROOT
    ? { apiRoot: process.env.TELEGRAM_API_ROOT }
    : {};

// 全局變數以便在關閉時使用
let downloadCache = null;
let bot = null;
let pollingErrorCount = 0;
const MAX_POLLING_ERRORS = 5;

/**
 * 等待網路連線就緒
 * Windows 開機時網路服務可能尚未完全啟動
 */
async function waitForNetwork(maxAttempts = 30, delayMs = 2000) {
    console.log('[LOG] Checking network connectivity...');

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            // 嘗試解析 Telegram API 域名
            await dns.resolve('api.telegram.org');
            console.log('[LOG] Network is ready!');
            return true;
        } catch (error) {
            console.log(`[LOG] Network not ready (attempt ${attempt}/${maxAttempts}), waiting ${delayMs}ms...`);

            if (attempt === maxAttempts) {
                console.error('[ERROR] Network timeout - starting anyway, will retry on error');
                return false;
            }

            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }
}

/**
 * 初始化應用程式
 */
async function initializeApp() {
    console.log('[LOG] Starting 94Orig Bot...');

    // 等待網路就緒（Windows 開機時特別重要）
    await waitForNetwork();

    // 初始化文件路徑
    const filePaths = initializeFiles(config);

    // 初始化下載快取資料庫
    downloadCache = new DownloadCache(path.join(__dirname, 'data', 'download_cache.db'));

    // 初始化 Telegram Bot（v2：Bot 只負責路由與 API，polling 由 startPolling 啟動）
    bot = new Bot(config.telegramToken, botOptions);

    // 成功收到更新時重置 polling 錯誤計數。
    // v2 是 middleware chain，必須回傳 next() 才會繼續往下跑到各個命令 handler。
    bot.use((ctx, next) => {
        if (pollingErrorCount > 0) {
            pollingErrorCount = 0;
        }
        return next();
    });

    // 初始化下載隊列
    const downloadQueue = new DownloadQueue();

    // 初始化影片下載器
    const videoDownloader = new VideoDownloader(bot, downloadQueue);

    // 初始化消息處理器
    const messageHandler = new MessageHandler(bot, config.myId, videoDownloader, downloadQueue, downloadCache);

    // 初始化命令處理器
    const commandHandler = new CommandHandler(
        bot,
        config,
        filePaths,
        downloadQueue,
        videoDownloader,
        messageHandler,
        downloadCache
    );

    // 註冊所有命令處理器
    commandHandler.registerHandlers();

    // handler 內未捕捉的例外：記錄後繼續，不讓單一則訊息打斷 polling
    bot.catch((error, ctx) => {
        const updateId = ctx?.update?.update_id;
        console.error(`[ERROR] Bot handler error${updateId ? ` (update ${updateId})` : ''}:`, error.message || error);
    });

    // webhook 存在時 getUpdates 會回 409，polling 迴圈直接結束。
    // 啟動前先清掉 webhook（保留未處理的訊息），並記下被清掉的 URL 方便追查。
    const webhookInfo = await bot.api.getWebhookInfo();
    if (webhookInfo.url) {
        console.warn(`[WARN] Webhook is set to ${webhookInfo.url}, deleting it before polling...`);
        await bot.api.deleteWebhook({ drop_pending_updates: false });
    }

    // 啟動 long polling。startPolling 的 promise 要等到 stop() 才 resolve，
    // 所以這裡不能 await，否則 initializeApp 永遠不會回來。
    bot.startPolling(undefined, {
        // longPoll 只在可重試的錯誤（網路 / timeout / 5xx / 429）時呼叫 onError，
        // 對應 v1 的 polling_error，且它自己會重試，這裡只負責計數與熔斷。
        onError: (error) => {
            pollingErrorCount++;
            console.error(`[ERROR] Polling error (${pollingErrorCount}/${MAX_POLLING_ERRORS}):`, error.message || error);

            if (pollingErrorCount >= MAX_POLLING_ERRORS) {
                console.error('[ERROR] Too many polling errors, stopping bot...');
                try {
                    bot.stop();
                    if (downloadCache) {
                        downloadCache.close();
                    }
                } catch (e) {
                    console.error('[ERROR] Error during cleanup:', e);
                }
                process.exit(1);
            }
        },
    }).catch((error) => {
        console.error('[ERROR] Polling loop stopped unexpectedly:', error);
        process.exit(1);
    });

    console.log('[LOG] 94Orig Bot is running!');
}

// 啟動應用程式
(async () => {
    try {
        await initializeApp();
    } catch (error) {
        console.error('[ERROR] Failed to start application:', error);

        // 延遲後重試（給系統更多時間準備）
        console.log('[LOG] Will retry in 10 seconds...');
        setTimeout(async () => {
            try {
                await initializeApp();
            } catch (retryError) {
                console.error('[ERROR] Retry failed:', retryError);
                process.exit(1);
            }
        }, 10000);
    }
})();

// 優雅關閉
async function gracefulShutdown(signal) {
    console.log(`\n[LOG] Received ${signal}, shutting down gracefully...`);
    try {
        // 先停掉 polling 迴圈，再收資料庫
        if (bot && bot.isRunning()) {
            console.log('[LOG] Stopping polling...');
            bot.stop();
        }

        // 關閉資料庫連接
        if (downloadCache) {
            console.log('[LOG] Closing database connection...');
            downloadCache.close();
        }
    } catch (error) {
        console.error('[ERROR] Error closing cache:', error);
    }

    console.log('[LOG] Shutdown complete');
    process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// 處理未捕獲的錯誤
process.on('uncaughtException', (error) => {
    console.error('[ERROR] Uncaught Exception:', error);
    gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('[ERROR] Unhandled Rejection at:', promise, 'reason:', reason);
});
