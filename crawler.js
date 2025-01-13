const { spawn } = require('child_process');
const TYPE_IG_NORMAL = 1;
const TYPE_IG_STORY = 2;
const TYPE_X = 3;
const TYPE_YT = 4;
const TYPE_STREAM = 5;

let getImage = async (urlDatas, downloadRemote = false, forceYtDlp = false) => {
    try {
        let promises = [];
        for (const url in urlDatas) {
            let tmpElem = urlDatas[url];

            let modeTxt = (downloadRemote) ? '' : '-g';
            let cmdPreview = `gallery-dl --cookies-from-browser firefox ${modeTxt} ${url}`;
            let cmd = `gallery-dl`;
            let args = (downloadRemote) ? ['--cookies-from-browser', 'firefox', url] : ['--cookies-from-browser', 'firefox', modeTxt, url];
            let isYtdlp = (forceYtDlp || tmpElem.type == TYPE_YT || tmpElem.type == TYPE_STREAM);
            if (isYtdlp) {
                let cookiesTxt = '';
                let cookiesTxt2 = '';
                let outputTxt = '';
                let outputTxt2 = '';
                cmd = `yt-dlp`;
                if (tmpElem.type == TYPE_X) {
                    cookiesTxt = '--cookies-from-browser';
                    cookiesTxt2 = 'firefox';
                    outputTxt = '-o';
                    outputTxt2 ='%(uploader_id)s_%(id)s_%(upload_date>%y%m%d|0)s.%(ext)s';
                    args = [cookiesTxt, cookiesTxt2, outputTxt, outputTxt2, url];
                } else if (tmpElem.type == TYPE_STREAM) {
                    cookiesTxt = '--cookies-from-browser';
                    cookiesTxt2 = 'firefox';
                    args = [cookiesTxt, cookiesTxt2, url];
                } else {
                    args = [url];
                }
                cmdPreview = `yt-dlp ${cookiesTxt} ${cookiesTxt2} ${outputTxt} ${outputTxt2} ${url}`;
            }
            console.info(`[LOG][${tmpElem.typeTxt}][${url}] ${cmdPreview}`);

            let promise = new Promise((resolve, reject) => {
                const process = spawn(cmd, args);

                process.stdout.on('data', (data) => {
                    // console.log(`stdout:`, data.toString());
                    if (isYtdlp) {
                        if (/\[download\] Destination/.test(data.toString()) || /has already been downloaded/.test(data.toString())) {
                            urlDatas[url].data = ['Done'];
                        }
                    } else {
                        if (!downloadRemote) {
                            let dataStrArr = data.toString().replaceAll('| ', '').replace(/\r?\n/g, '<br>').split('<br>').filter(Boolean);
                            urlDatas[url].data = [...urlDatas[url].data, ...dataStrArr];
                        } else {
                            let dataStrArr = data.toString().replace(/\r?\n/g, '<br>').split('<br>').filter(Boolean);
                            urlDatas[url].data = [...urlDatas[url].data, ...dataStrArr];
                        }
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
