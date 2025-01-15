module.exports = {
    apps: [{
        name: "94Orig",
        script: "./app.js",
        log_file: "E:\\User\\Documents\\pm2.log",
        watch: true,
        ignore_watch: [
            '^(?!app\.js$).+',
        ],
    }]
};
