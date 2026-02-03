module.exports = {
    apps: [{
        name: "94Orig",
        script: "./app.js",
        log_file: "E:\\User\\Documents\\pm2.log",
        watch: true,
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
    }]
};
