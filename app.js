/**
 * 94Orig - Telegram Bot for Downloading Media from Instagram, Twitter/X, YouTube, etc.
 *
 * 主程式入口
 */

const TelegramBot = require('node-telegram-bot-api');
const config = require('./config.js')[process.env.NODE_ENV === 'production' ? 'production' : 'development'];
const { initializeFiles } = require('./src/fileInit');
const { DownloadQueue, VideoDownloader } = require('./src/downloader');
const MessageHandler = require('./src/messageHandler');
const CommandHandler = require('./src/commandHandler');
const DownloadCache = require('./src/downloadCache');

// 全局變數以便在關閉時使用
let downloadCache = null;

/**
 * 初始化應用程式
 */
function initializeApp() {
    console.log('[LOG] Starting 94Orig Bot...');

    // 初始化文件路徑
    const filePaths = initializeFiles(config);

    // 初始化下載快取資料庫
    downloadCache = new DownloadCache('./data/download_cache.db');

    // 初始化 Telegram Bot
    const bot = new TelegramBot(config.telegramToken, { polling: true });

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
        console.error('[ERROR] Polling error:', error);
    });

    bot.on('error', (error) => {
        console.error('[ERROR] Bot error:', error);
    });

    console.log('[LOG] 94Orig Bot is running!');
}

// 啟動應用程式
try {
    initializeApp();
} catch (error) {
    console.error('[ERROR] Failed to start application:', error);
    process.exit(1);
}

// 優雅關閉
process.on('SIGINT', () => {
    console.log('\n[LOG] Shutting down gracefully...');

    // 關閉資料庫連接
    try {
        if (downloadCache) {
            downloadCache.close();
        }
    } catch (error) {
        console.error('[ERROR] Error closing cache:', error);
    }

    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n[LOG] Shutting down gracefully...');

    // 關閉資料庫連接
    try {
        if (downloadCache) {
            downloadCache.close();
        }
    } catch (error) {
        console.error('[ERROR] Error closing cache:', error);
    }

    process.exit(0);
});
