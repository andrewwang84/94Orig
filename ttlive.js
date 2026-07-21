#!/usr/bin/env node
/**
 * TikTok 直播下載腳本
 * 使用方式: node ttlive.js <@username|直播網址|room_id> [輸出目錄]
 *           npm run ttlive -- <@username|直播網址|room_id>
 *
 * 串流優先級: HEVC > H264，m3u8 > flv
 * 錄製為 .ts（中斷不壞檔），結束後自動轉封裝為 .mp4
 * 直播短暫中斷會自動重連續錄；按 q 或 Ctrl+C 停止
 */

if (process.platform === 'win32') {
    require('child_process').execSync('chcp 65001', { stdio: 'ignore' });
}

const TikTokLiveDownloader = require('./src/tiktokLiveDownloader.js');

async function main() {
    const input = process.argv[2];
    if (!input) {
        console.log('使用方式: node ttlive.js <@username|直播網址|room_id> [輸出目錄]');
        process.exit(1);
    }

    const downloadDir = process.argv[3] || 'E:/User/Downloads';
    console.log(`[LOG][TTLIVE] 下載目錄: ${downloadDir}`);

    const downloader = new TikTokLiveDownloader(downloadDir);

    // Ctrl+C: 讓 ffmpeg 收到中斷並收尾（remux），不再自動重連
    process.on('SIGINT', () => {
        console.log('\n[LOG][TTLIVE] 收到中止訊號，錄製收尾中...');
        downloader.requestStop();
    });

    const results = await downloader.run(input);
    console.log('\n' + downloader.formatResults(results));
}

main().catch((err) => {
    console.error('[ERROR][TTLIVE]', err.message);
    process.exit(1);
});
