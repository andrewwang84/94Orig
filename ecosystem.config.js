module.exports = {
    apps: [
        {
            name: "94Orig",
            script: "./app.js",
            log_file: "E:\\User\\Documents\\pm2.log",
            watch: false,
            ignore_watch: [
                '^(?!app\.js$).+',
                'data/**',
                'data',
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
            log_file: "E:\\User\\Documents\\pm2.log",
            watch: false,
            // 每 8 小時執行一次（00:00、08:00、16:00）
            cron_restart: "0 */8 * * *",
            // 腳本執行完畢正常退出後不自動重啟，等待下次 cron 觸發
            autorestart: false,
        },
    ]
};
