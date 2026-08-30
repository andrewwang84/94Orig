const fs = require('fs');
const path = require('path');

// 以設定檔本身的位置為基準，避免受 pm2 daemon 的 cwd 影響
// （pm2 對相對路徑的 log 位置是相對於行程 cwd，不是這個檔案）
const LOG_DIR = path.join(__dirname, 'logs');

// pm2 不會自動建立不存在的 log 目錄，這裡先確保它在
fs.mkdirSync(LOG_DIR, { recursive: true });

/**
 * 產生某個 app 的三個 log 路徑
 * log_file 是 stdout + stderr 合併檔，另外兩個是分流檔
 */
const logsFor = (name) => ({
    log_file: path.join(LOG_DIR, `${name}.log`),
    out_file: path.join(LOG_DIR, `${name}-out.log`),
    error_file: path.join(LOG_DIR, `${name}-error.log`),
});

module.exports = {
    apps: [
        {
            name: "94Orig",
            script: "./app.js",
            ...logsFor("94Orig"),
            watch: false,
            ignore_watch: [
                '^(?!app\.js$).+',
                'data/**',
                'data',
                'logs/**',
                'logs',
            ],
            // 開機自動重啟相關設定
            autorestart: true,
            max_restarts: 10,
            min_uptime: "10s",
            restart_delay: 5000,
            // 錯誤重啟設定
            exp_backoff_restart_delay: 100,
        },
        {
            name: "gal-down-cron",
            script: "./gal_down.js",
            args: "--no-cookie",
            ...logsFor("gal-down-cron"),
            watch: false,
            // 每 8 小時執行一次（00:00、08:00、16:00）
            cron_restart: "0 */8 * * *",
            // 腳本執行完畢正常退出後不自動重啟，等待下次 cron 觸發
            autorestart: false,
        },
    ]
};
