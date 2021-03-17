const spawn = require('child_process').spawn;

function ydl(url) {
    return new Promise(function (resolve, reject) {
        let cmd = `youtube-dl`;
        let args = [url];
        let proc = spawn(cmd, args);

        // proc.stdout.on('data', function (data) {
        //     console.log(`stdout: ${data}`);
        // });

        proc.stderr.setEncoding("utf8")
        proc.stderr.on('data', function (data) {
            // console.log(`${url} stderr: ${data}`);
            reject(`[${url}] ${data}`);
        });

        proc.on('close', function () {
            console.log(`[${url}] Done`);
            resolve(`${url} Done`);
        });
    });
}

module.exports = {
    ydl: ydl
};
