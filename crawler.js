const { spawn } = require('child_process');

let getImage = async (urlDatas, downloadRemote = false) => {
    try {
        let promises = [];
        for (const url in urlDatas) {
            let tmpElem = urlDatas[url];

            let modeTxt = (downloadRemote) ? '' : '-g';
            let cmdPreview = `gallery-dl --cookies-from-browser firefox ${modeTxt} ${url}`;
            console.info(`[LOG][${tmpElem.typeTxt}][${url}] ${cmdPreview}`);
            let cmd = `gallery-dl`;
            let args = (downloadRemote) ? ['--cookies-from-browser', 'firefox', url] : ['--cookies-from-browser', 'firefox', modeTxt, url];

            let promise = new Promise((resolve, reject) => {
                const process = spawn(cmd, args);

                process.stdout.on('data', (data) => {
                    // console.log(`stdout:`, dataStrArr);
                    if (!downloadRemote) {
                        let dataStrArr = data.toString().replaceAll('| ', '').replace(/\r?\n/g, '<br>').split('<br>').filter(Boolean);
                        urlDatas[url].data = [...urlDatas[url].data, ...dataStrArr];
                    } else {
                        let dataStrArr = data.toString().replace(/\r?\n/g, '<br>').split('<br>').filter(Boolean);
                        urlDatas[url].data = [...urlDatas[url].data, ...dataStrArr];
                    }
                });

                // process.stderr.on('data', (data) => {
                //     console.log(`stderr:`, data.toString());
                // });

                process.on('close', (code) => {
                    console.log(`${url} Done, code:${code}`);
                    urlDatas[url].isDone = true;
                    resolve(urlDatas[url]);
                });

                process.on('error', (err) => {
                    console.error(`${url} error: ${err.message}`);
                    urlDatas[url].isDone = true;
                    reject(err);
                });
            });

            promises.push(promise);
            await sleep(500);
        }

        return Promise.all(promises);
    } catch (error) {
        return new Promise(function (resolve, reject) {
            reject(error);
        });
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
    getImage: getImage
};
