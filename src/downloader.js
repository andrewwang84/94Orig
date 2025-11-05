const { spawn } = require('child_process');
const { MEDIA_TYPES } = require('./constants');
const { sleep, getProgressEmoji, getRandomDelay } = require('./utils');

/**
 * 下載隊列管理
 */
class DownloadQueue {
    constructor() {
        this.videoQueue = [];
        this.streamQueue = [];
        this.videoRunningQueue = [];
        this.streamRunningQueue = [];
    }

    getVideoQueue() { return this.videoQueue; }
    getStreamQueue() { return this.streamQueue; }
    getVideoRunningQueue() { return this.videoRunningQueue; }
    getStreamRunningQueue() { return this.streamRunningQueue; }
}

/**
 * 圖片下載處理器
 */
class ImageDownloader {
    constructor(downloadCache = null) {
        this.downloadCache = downloadCache;
    }

    /**
     * 下載圖片（支援快取）
     * @param {Object} urlDatas - URL 數據對象
     * @param {boolean} downloadRemote - 是否下載到遠端（已棄用，全部下載到本地）
     * @returns {Promise<Array>}
     */
    async download(urlDatas, downloadRemote = false) {
        try {
            const results = [];

            for (const url in urlDatas) {
                const urlData = urlDatas[url];

                // 先檢查快取（同步版本）
                if (this.downloadCache) {
                    const cached = this.downloadCache.get(url);
                    if (cached && cached.file_paths && cached.file_paths.length > 0) {
                        console.log(`[LOG][Cache] 使用快取: ${url} (${cached.file_paths.length} 個檔案)`);
                        urlData.isDone = true;
                        urlData.data = cached.file_paths;
                        urlData.fromCache = true;
                        urlData.localFiles = cached.file_paths;
                        urlData.cachedFileIds = cached.file_ids || [];
                        urlData.originalUrls = cached.file_paths.map(() => url);
                        results.push(urlData);
                        continue;
                    }
                }

                // 全部改為下載到本地
                const cmd = 'gallery-dl';
                const args = ['--cookies-from-browser', 'firefox', url];

                console.info(`[LOG][${urlData.typeTxt}][${url}] gallery-dl --cookies-from-browser firefox ${url}`);

                const result = await this._executeDownload(cmd, args, url, urlDatas[url]);

                // 為每個本地檔案添加對應的原始 URL
                if (result.localFiles && result.localFiles.length > 0) {
                    result.originalUrls = result.localFiles.map(() => url);
                }

                results.push(result);

                // 儲存到快取（同步版本，同一 URL 的多個檔案一起儲存）
                if (this.downloadCache && result.isDone && result.localFiles && result.localFiles.length > 0) {
                    this.downloadCache.setBatch(url, result.localFiles);
                }

                // 隨機延遲，避免請求過於頻繁
                await sleep(getRandomDelay());
            }

            return results;
        } catch (error) {
            throw error;
        }
    }

    /**
     * 執行下載命令（下載到本地並捕獲檔案路徑）
     * @private
     */
    _executeDownload(cmd, args, url, urlData) {
        return new Promise((resolve, reject) => {
            const process = spawn(cmd, args);
            const localFiles = [];

            process.stdout.on('data', (data) => {
                const dataStr = data.toString();
                const lines = dataStr.split(/\r?\n/).filter(Boolean);

                for (const line of lines) {
                    // 捕獲檔案路徑（gallery-dl 下載時會輸出完整路徑）
                    // 例如: /path/to/file.jpg 或 # /path/to/file.jpg
                    if (line.includes('/') && !line.includes('|')) {
                        // 移除可能的 # 前綴和空格
                        let trimmedLine = line.trim().replace(/^#\s*/, '');

                        // 檢查是否為檔案路徑（包含檔案副檔名）
                        if (/\.(jpg|jpeg|png|gif|mp4|webm|webp)$/i.test(trimmedLine)) {
                            localFiles.push(trimmedLine);
                        }
                    }
                }

                urlData.data = [...urlData.data, ...lines];
            });

            process.on('close', (code) => {
                console.log(`${url} Done, code:${code}`);

                // 檢查下載是否成功
                if (code === 0 && localFiles.length > 0) {
                    urlData.isDone = true;
                    urlData.localFiles = localFiles;
                    console.log(`[LOG] 下載了 ${localFiles.length} 個檔案`);
                } else {
                    urlData.isDone = false;
                    urlData.localFiles = [];
                    urlData.errorCode = code;
                    console.log(`[ERROR] 下載失敗，exit code: ${code}`);
                }

                resolve(urlData);
            });

            process.on('error', (err) => {
                console.error(`${url} error: ${err.message}`);
                urlData.isDone = true;
                urlData.localFiles = [];
                reject(err);
            });
        });
    }
}

/**
 * 影片下載處理器
 */
class VideoDownloader {
    constructor(bot, downloadQueue) {
        this.bot = bot;
        this.downloadQueue = downloadQueue;
    }

    /**
     * 下載影片
     * @param {Object} urlData - URL 數據對象
     */
    async download(urlData) {
        try {
            const { url, cmd, args } = this._prepareDownloadCommand(urlData);

            console.info(`[LOG][${urlData.typeTxt}][${url}] ${this._getCmdPreview(urlData)}`);

            await this.bot.editMessageText(
                `${url}\n\n開始下載...`,
                {
                    is_disabled: true,
                    chat_id: urlData.chatId,
                    message_id: urlData.replyMsgId
                }
            );

            const process = spawn(cmd, args);
            urlData.process = process;

            this._setupProcessHandlers(process, urlData, url);

        } catch (error) {
            console.error(`error:`, error);
        }
    }

    /**
     * 準備下載命令
     * @private
     */
    _prepareDownloadCommand(urlData) {
        const url = urlData.target;
        const cmd = 'yt-dlp';
        let args = [url];

        return { url, cmd, args };
    }

    /**
     * 獲取命令預覽字串
     * @private
     */
    _getCmdPreview(urlData) {
        const url = urlData.target;
        return `yt-dlp ${url}`;
    }

    /**
     * 設置進程處理器
     * @private
     */
    _setupProcessHandlers(process, urlData, url) {
        let vidFormat = '';
        let progressFlag = false;
        let currentProgress = 0;
        let streamStart = false;

        process.stdout.on('data', async (data) => {
            const dataStr = data.toString();

            if (urlData.type === MEDIA_TYPES.YT) {
                await this._handleVideoProgress(dataStr, urlData, vidFormat, progressFlag, currentProgress);
            }
        });

        process.stderr.on('data', async (data) => {
            const dataStr = data.toString();

            if (/^ERROR:/.test(dataStr)) {
                console.log(`${url} Error: ${dataStr}`);
                await this.bot.editMessageText(
                    `${url}\n\n下載發生錯誤：${dataStr}`,
                    {
                        is_disabled: true,
                        chat_id: urlData.chatId,
                        message_id: urlData.replyMsgId
                    }
                );
            }

            if (urlData.type === MEDIA_TYPES.STREAM || urlData.type === MEDIA_TYPES.M3U8) {
                if (!streamStart && /frame= /.test(dataStr)) {
                    streamStart = true;
                    await this.bot.editMessageText(
                        `${url}\n\n直播下載中...`,
                        {
                            is_disabled: true,
                            chat_id: urlData.chatId,
                            message_id: urlData.replyMsgId
                        }
                    );
                }
            }
        });

        process.on('close', async (code) => {
            await this._handleDownloadComplete(code, urlData, url);
        });

        process.on('error', async (err) => {
            await this._handleDownloadError(err, urlData, url);
        });

        // 將進程保存到運行隊列
        if (urlData.type === MEDIA_TYPES.STREAM || urlData.type === MEDIA_TYPES.M3U8) {
            const streamRunningQueue = this.downloadQueue.getStreamRunningQueue();
            for (const k in streamRunningQueue) {
                if (streamRunningQueue[k].target === url) {
                    streamRunningQueue[k].process = process;
                }
            }
        }
    }

    /**
     * 處理影片下載進度
     * @private
     */
    async _handleVideoProgress(dataStr, urlData, vidFormat, progressFlag, currentProgress) {
        // 獲取影片格式
        if (vidFormat === '') {
            const tmpVidF = dataStr.match(/format\(s\):\s(\S+)\+/);
            if (tmpVidF) {
                vidFormat = tmpVidF[1];
            }
        }
        // 檢查是否開始下載目標影片
        else if (!progressFlag) {
            const tmpVidF = dataStr.match(/\.f(\S+)\./);
            if (tmpVidF) {
                progressFlag = (tmpVidF[1] === vidFormat);
            }
        }
        // 更新進度
        else if (currentProgress <= 100) {
            const tmpProgress = dataStr.match(/(\d+\.\d+)% /);
            if (tmpProgress) {
                const tmpCurrentProgress = Math.round(parseFloat(tmpProgress[1]) / 10) * 10;
                if (currentProgress < tmpCurrentProgress) {
                    currentProgress = tmpCurrentProgress;
                    const progress = await getProgressEmoji(currentProgress);

                    let message = `${urlData.target}\n\n下載進度：[${progress}]`;
                    if (currentProgress === 100) {
                        message += '\n\n下載即將完成，請稍候...';
                    }

                    await this.bot.editMessageText(
                        message,
                        {
                            is_disabled: true,
                            chat_id: urlData.chatId,
                            message_id: urlData.replyMsgId
                        }
                    );
                }
            }
        }
    }

    /**
     * 處理下載完成
     * @private
     */
    async _handleDownloadComplete(code, urlData, url) {
        if (code === 0) {
            const isStream = urlData.type === MEDIA_TYPES.STREAM || urlData.type === MEDIA_TYPES.M3U8;
            const progress = isStream ? '' : `下載進度：[${await getProgressEmoji(100)}]\n\n`;

            await this.bot.editMessageText(
                `${url}\n\n${progress}下載完成！`,
                {
                    is_disabled: true,
                    chat_id: urlData.chatId,
                    message_id: urlData.replyMsgId
                }
            );
        }

        this._processNextInQueue(urlData, url);
    }

    /**
     * 處理下載錯誤
     * @private
     */
    async _handleDownloadError(err, urlData, url) {
        await this.bot.editMessageText(
            `${url}\n\n下載發生錯誤：${err}`,
            {
                is_disabled: true,
                chat_id: urlData.chatId,
                message_id: urlData.replyMsgId
            }
        );

        this._processNextInQueue(urlData, url);
    }

    /**
     * 處理隊列中的下一個任務
     * @private
     */
    _processNextInQueue(urlData, url) {
        if (urlData.type === MEDIA_TYPES.STREAM || urlData.type === MEDIA_TYPES.M3U8) {
            const streamRunningQueue = this.downloadQueue.getStreamRunningQueue();
            const streamQueue = this.downloadQueue.getStreamQueue();

            streamRunningQueue.pop();
            if (streamQueue.length > 0) {
                const tmpData = streamQueue.shift();
                streamRunningQueue.push(tmpData);
                this.download(tmpData);
            }
        } else {
            const videoRunningQueue = this.downloadQueue.getVideoRunningQueue();
            const videoQueue = this.downloadQueue.getVideoQueue();

            for (const k in videoRunningQueue) {
                if (videoRunningQueue[k].target === url) {
                    videoRunningQueue.splice(k, 1);

                    if (videoQueue.length > 0) {
                        const tmpData = videoQueue.shift();
                        videoRunningQueue.push(tmpData);
                        this.download(tmpData);
                    }
                    break;
                }
            }
        }
    }
}

module.exports = {
    DownloadQueue,
    ImageDownloader,
    VideoDownloader
};
