const spawn = require('child_process').spawn;

function ydl(urls) {
    let urls = urls.split('\n');
    urls.forEach(url => {
        let cmd = `youtube-dl`;
        let args = [url];
        let proc = spawn(cmd, args);

        proc.stdout.on('data', function (data) {
            console.log(`stdout: ${data}`);
        });

        proc.stderr.setEncoding("utf8")
        proc.stderr.on('data', function (data) {
            console.log(`stderr: ${data}`);
        });

        proc.on('close', function () {
            console.log('Done');
        });
    });
}

module.exports = {
    ydl: ydl
};
