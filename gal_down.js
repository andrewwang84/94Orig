#!/usr/bin/env node
/**
 * 獨立下載腳本 - 支援從檔案讀取 URL 並使用快取
 * 使用方式: node gal_down.js [url-list-file] [--no-cookie]
 * 範例: node gal_down.js
 *       node gal_down.js /e/User/Documents/BackupDoc/custom.txt
 *       node gal_down.js --no-cookie
 *       node gal_down.js /e/User/Documents/BackupDoc/custom.txt --no-cookie
 *
 * 如果不提供檔案路徑，會使用 config 中的 galleryDlListPath
 * 使用 --no-cookie 參數時不會從瀏覽器讀取 cookies
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const config = require('./config.js')[process.env.NODE_ENV === 'production' ? 'production' : 'development'];
const DownloadCache = require('./src/downloadCache.js');

/**
 * 檢查 URL 是否為 Instagram
 */
function isInstagramUrl(url) {
    return /instagram\.com/i.test(url);
}

/**
 * 檢查 URL 是否為 X/Twitter
 */
function isTwitterUrl(url) {
    return /(twitter\.com|x\.com)/i.test(url);
}

/**
 * 檢查 URL 是否為 Weibo
 */
function isWeiboUrl(url) {
    return /(m\.)?weibo\.(com|cn)|video\.weibo\.com/i.test(url);
}

/**
 * 主函數
 */
async function main() {
    // 解析命令行參數
    const args = process.argv.slice(2);
    let inputFile = null;
    let useCookie = true;

    for (const arg of args) {
        if (arg === '--no-cookie') {
            useCookie = false;
        } else if (!arg.startsWith('--')) {
            inputFile = arg;
        }
    }

    // 使用提供的檔案路徑或使用 config 中的預設路徑
    inputFile = inputFile || config.galleryDlListPath;

    // 檢查檔案是否存在
    if (!fs.existsSync(inputFile)) {
        console.error(`❌ 錯誤: 檔案不存在: ${inputFile}`);
        process.exit(1);
    }

    console.log('開始處理 URL 列表...');
    console.log(`輸入檔案: ${inputFile}`);
    console.log('');

    // 初始化快取
    const downloadCache = new DownloadCache(path.join(__dirname, 'data', 'download_cache.db'));

    // 讀取檔案
    const content = fs.readFileSync(inputFile, 'utf-8');
    const lines = content.split('\n');

    const modifiedLines = [];
    let totalUrls = 0;
    let cachedCount = 0;
    let xSkipCount = 0;
    let processCount = 0;

    // 處理每一行
    for (const line of lines) {
        const trimmed = line.trim();

        // 跳過空行和註解
        if (!trimmed || trimmed.startsWith('#')) {
            modifiedLines.push(line);
            continue;
        }

        // 檢查是否為 URL
        if (!trimmed.startsWith('http')) {
            modifiedLines.push(line);
            continue;
        }

        totalUrls++;

        const normalizedUrl = trimmed.replace(/\/$/, '');

        // X/Twitter 的 URL 不檢查快取，直接加入
        if (isTwitterUrl(normalizedUrl)) {
            console.log(`[X/Twitter] ${normalizedUrl}`);
            console.log(`   ⏭️  跳過快取檢查 (X 連結不使用快取)`);
            modifiedLines.push(normalizedUrl);
            xSkipCount++;
            processCount++;
            continue;
        }

        // Weibo 的 URL 不檢查快取，直接加入
        if (isWeiboUrl(normalizedUrl)) {
            console.log(`[Weibo] ${normalizedUrl}`);
            console.log(`   ⏭️  跳過快取檢查 (Weibo 連結不使用快取)`);
            modifiedLines.push(normalizedUrl);
            xSkipCount++;
            processCount++;
            continue;
        }

        // Instagram 的 URL 檢查快取
        if (isInstagramUrl(normalizedUrl)) {
            const cached = downloadCache.get(normalizedUrl);
            if (cached && cached.file_paths && cached.file_paths.length > 0) {
                // 快取存在且檔案都存在，註解此行
                console.log(`[Instagram] ${normalizedUrl}`);
                console.log(`   ✅ 已在快取 (${cached.file_paths.length} 個檔案)`);
                cached.file_paths.forEach((fp, idx) => {
                    console.log(`      ${idx + 1}. ${path.basename(fp)}`);
                });
                modifiedLines.push(`# ${normalizedUrl}`);
                cachedCount++;
                continue;
            } else {
                console.log(`[Instagram] ${normalizedUrl}`);
                console.log(`   ⬇️  需要下載`);
                modifiedLines.push(normalizedUrl);
                processCount++;
                continue;
            }
        }

        // 其他 URL 直接加入
        console.log(`[Other] ${normalizedUrl}`);
        modifiedLines.push(normalizedUrl);
        processCount++;
    }

    // 直接寫回原檔案
    fs.writeFileSync(inputFile, modifiedLines.join('\n'), 'utf-8');

    console.log('');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`統計:`);
    console.log(`   總 URL 數: ${totalUrls}`);
    console.log(`   Instagram 快取命中: ${cachedCount}`);
    console.log(`   X/Twitter (跳過快取): ${xSkipCount}`);
    console.log(`   待下載: ${processCount}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    const galleryDlArgs = useCookie
        ? ['--cookies-from-browser', 'firefox', '-I', inputFile]
        : ['-I', inputFile];
    console.log(`   指令: gallery-dl ${galleryDlArgs.join(' ')}`);
    console.log('');

    const downloadedFiles = [];
    const activeUrls = [];

    // 讀取待下載的 URL
    for (const line of modifiedLines) {
        const trimmed = line.trim();
        if (trimmed && trimmed.startsWith('http') && !line.trim().startsWith('#')) {
            activeUrls.push(trimmed);
        }
    }

    const childProcess = spawn('gallery-dl', ['--cookies-from-browser', 'firefox', '-I', inputFile]);
    let stdoutBuffer = '';

    childProcess.stdout.on('data', (data) => {
        const dataStr = data.toString();
        stdoutBuffer += dataStr;

        const lines = stdoutBuffer.split(/\r?\n/);
        stdoutBuffer = lines.pop() || '';

        for (const line of lines) {
            if (!line.trim()) continue;

            // 輸出到終端
            console.log(line);

            // 捕獲檔案路徑
            if ((line.includes('/') || line.includes('\\')) && !line.includes('|')) {
                let filePath = line.trim().replace(/^#\s*/, '');
                if (/\.(jpg|jpeg|png|gif|mp4|webm|webp)$/i.test(filePath)) {
                    downloadedFiles.push(filePath);
                }
            }
        }
    });

    childProcess.stderr.on('data', (data) => {
        console.error(data.toString());
    });

    childProcess.on('close', (code) => {
        // 處理緩衝區剩餘資料
        if (stdoutBuffer.trim()) {
            const line = stdoutBuffer.trim();
            if ((line.includes('/') || line.includes('\\')) && !line.includes('|')) {
                let filePath = line.replace(/^#\s*/, '');
                if (/\.(jpg|jpeg|png|gif|mp4|webm|webp)$/i.test(filePath)) {
                    downloadedFiles.push(filePath);
                }
            }
        }

        console.log('');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log(`✅ gallery-dl 執行完成 (exit code: ${code})`);
        console.log(`下載檔案數: ${downloadedFiles.length}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // 儲存 Instagram URL 到快取
        if (code === 0 && downloadedFiles.length > 0 && activeUrls.length > 0) {
            console.log('');
            console.log('儲存 Instagram URL 到快取...');

            if (activeUrls.length === 1) {
                // 只有一個 URL，所有檔案都屬於它
                const url = activeUrls[0];
                if (isInstagramUrl(url)) {
                    downloadCache.setBatch(url, downloadedFiles);
                    console.log(`   ✅ ${url}`);
                    console.log(`      儲存了 ${downloadedFiles.length} 個檔案`);
                }
            } else {
                // 多個 URL，根據檔案路徑推斷
                const urlFileMap = new Map();

                for (const filePath of downloadedFiles) {
                    let matchedUrl = null;

                    for (const url of activeUrls) {
                        // 只處理 Instagram URL
                        if (!isInstagramUrl(url)) continue;

                        // Instagram: 檔案名包含貼文 ID
                        const igMatch = url.match(/instagram\.com\/p\/([^\/\?]+)/);
                        if (igMatch && filePath.includes(igMatch[1])) {
                            matchedUrl = url;
                            break;
                        }
                    }

                    if (matchedUrl) {
                        if (!urlFileMap.has(matchedUrl)) {
                            urlFileMap.set(matchedUrl, []);
                        }
                        urlFileMap.get(matchedUrl).push(filePath);
                    }
                }

                // 儲存到快取
                for (const [url, filePaths] of urlFileMap.entries()) {
                    if (filePaths.length > 0) {
                        downloadCache.setBatch(url, filePaths);
                        console.log(`   ✅ ${url}`);
                        console.log(`      儲存了 ${filePaths.length} 個檔案`);
                    }
                }
            }
        }

        // 關閉快取
        downloadCache.close();

        console.log('');
        console.log('✨ 完成！');
    });

    childProcess.on('error', (err) => {
        console.error('❌ 執行錯誤:', err.message);
        downloadCache.close();
        process.exit(1);
    });
}

// 執行主函數
main().catch(err => {
    console.error('❌ 發生錯誤:', err);
    process.exit(1);
});
