#!/usr/bin/env node
/**
 * OJ/OJM 影片下載腳本
 * 使用方式: node ojv.js
 *           npm run ojv
 */

if (process.platform === 'win32') {
    require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
}

const config = require('./config.js')[process.env.NODE_ENV === 'production' ? 'production' : 'development'];
const DownloadCache = require('./src/downloadCache.js');
const OjVideoDownloader = require('./src/ojVideoDownloader.js');

async function main() {
    const downloadDir = config.ojDownloadPath || 'E:/User/Downloads';
    const downloadCache = new DownloadCache();
    const downloader = new OjVideoDownloader(downloadCache, downloadDir);

    console.log(`[LOG][OJV] 下載目錄: ${downloadDir}`);

    const progressCallback = (title) => {
        console.log(`[LOG][OJV] 處理中: ${title}`);
    };

    try {
        const allResults = await downloader.run(progressCallback);
        console.log('\n' + downloader.formatResults(allResults));
    } finally {
        downloadCache.close();
    }
}

main().catch((err) => {
    console.error('[ERROR][OJV]', err);
    process.exit(1);
});
