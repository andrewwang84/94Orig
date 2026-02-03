/**
 * 94Orig - Telegram Bot for Downloading Media from Instagram, Twitter/X, YouTube, etc.
 *
 * 主程式入口
 */

const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const dns = require('dns').promises;
const config = require('./config.js')[process.env.NODE_ENV === 'production' ? 'production' : 'development'];
const { initializeFiles } = require('./src/fileInit');
const { DownloadQueue, VideoDownloader } = require('./src/downloader');
const MessageHandler = require('./src/messageHandler');
const CommandHandler = require('./src/commandHandler');
const DownloadCache = require('./src/downloadCache');

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

    // 初始化 Telegram Bot，增加重試和超時設定
    bot = new TelegramBot(config.telegramToken, {
        polling: true, request: {
            agentOptions: {
                keepAlive: true,
                family: 4
            }
        }
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

    // 錯誤處理
    bot.on('polling_error', (error) => {
        pollingErrorCount++;
        console.error(`[ERROR] Polling error (${pollingErrorCount}/${MAX_POLLING_ERRORS}):`, error.message || error);

        // 如果是網路相關錯誤，嘗試重啟 polling
        if (error.code === 'EFATAL' || error.message?.includes('AggregateError')) {
            console.log('[LOG] Network error detected, will retry polling...');

            if (pollingErrorCount >= MAX_POLLING_ERRORS) {
                console.error('[ERROR] Too many polling errors, stopping bot...');
                try {
                    bot.stopPolling();
                    if (downloadCache) {
                        downloadCache.close();
                    }
                } catch (e) {
                    console.error('[ERROR] Error during cleanup:', e);
                }
                process.exit(1);
            }

            // 短暫延遲後繼續（polling 會自動重試）
            setTimeout(() => {
                console.log('[LOG] Continuing polling...');
                pollingErrorCount = Math.max(0, pollingErrorCount - 1); // 逐漸減少錯誤計數
            }, 5000);
        }
    });

    bot.on('error', (error) => {
        console.error('[ERROR] Bot error:', error.message || error);
    });

    // 成功接收訊息時重置錯誤計數
    bot.on('message', () => {
        if (pollingErrorCount > 0) {
            pollingErrorCount = 0;
        }
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
