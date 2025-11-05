const { MEDIA_TYPES } = require('./constants');

/**
 * 消息處理器
 */
class MessageHandler {
    constructor(bot, myId, videoDownloader, downloadQueue, downloadCache = null) {
        this.bot = bot;
        this.myId = myId;
        this.videoDownloader = videoDownloader;
        this.downloadQueue = downloadQueue;
        this.downloadCache = downloadCache;
    }

    /**
     * 發送下載結果消息
     * @param {Object} msg - Telegram 訊息對象
     * @param {Array} datas - 數據數組
     * @param {boolean} downloadRemote - 是否下載到遠端
     * @param {boolean} urlOnly - 是否僅發送 URL
     */
    async sendMessages(msg, datas, downloadRemote = false, urlOnly = false) {
        const chatId = msg.chat.id;
        const msgId = msg.message_id;

        // 向非管理員用戶發送確認消息
        if (chatId !== this.myId) {
            await this.bot.sendMessage(chatId, '🐵:嗚吱！');
        }

        if (downloadRemote) {
            await this._handleRemoteDownload(chatId, msgId, datas);
        } else {
            await this._handleLocalDownload(chatId, msgId, datas, urlOnly);
        }
    }

    /**
     * 處理遠端下載
     * @private
     */
    async _handleRemoteDownload(chatId, msgId, datas) {
        let resultText = '';

        for (const data of datas) {
            if (data.isDone && data.data.length > 0) {
                resultText += `${data.target} 下載完成\n`;
            } else {
                resultText += `${data.target} 下載失敗\n`;
            }
        }

        if (resultText !== '') {
            await this.bot.sendMessage(
                chatId,
                resultText,
                {
                    is_disabled: true,
                    reply_to_message_id: msgId,
                    allow_sending_without_reply: true
                }
            );
        }
    }

    /**
     * 處理本地下載（發送到 Telegram）
     * @private
     */
    async _handleLocalDownload(chatId, msgId, datas, urlOnly) {
        for (const data of datas) {
            if (data.isDone) {
                // 如果有本地檔案或從快取來的
                if (data.localFiles && data.localFiles.length > 0) {
                    await this._sendLocalFiles(chatId, msgId, data, urlOnly);
                } else if (data.fromCache && data.data.length > 0) {
                    // 從快取來的檔案路徑在 data 陣列中
                    await this._sendLocalFiles(chatId, msgId, { ...data, localFiles: data.data }, urlOnly);
                } else if (data.data.length > 0) {
                    // 舊的 URL 模式（向後兼容）
                    await this._sendMediaFiles(chatId, data, urlOnly);
                } else {
                    // 沒有檔案可發送
                    await this.bot.sendMessage(
                        chatId,
                        `⚠️ ${data.target} 沒有找到可下載的內容`,
                        {
                            is_disabled: true,
                            reply_to_message_id: msgId,
                            allow_sending_without_reply: true
                        }
                    );
                }
            } else {
                // 下載失敗
                const errorMsg = data.errorCode
                    ? `❌ ${data.target} 下載失敗 (exit code: ${data.errorCode})`
                    : `❌ ${data.target} 下載失敗`;

                await this.bot.sendMessage(
                    chatId,
                    errorMsg,
                    {
                        is_disabled: true,
                        reply_to_message_id: msgId,
                        allow_sending_without_reply: true
                    }
                );
            }
        }
    }

    /**
     * 發送本地檔案
     * @private
     */
    async _sendLocalFiles(chatId, msgId, data, urlOnly) {
        const fs = require('fs');
        const uploadedFileIds = []; // 儲存上傳後的 fileId
        const url = data.originalUrls ? data.originalUrls[0] : null; // 取得原始 URL

        for (let i = 0; i < data.localFiles.length; i++) {
            const filePath = data.localFiles[i];

            try {
                // 檢查是否有快取的 fileId (從 downloader 傳來的)
                let shouldUseFileId = false;
                let fileIdToUse = null;

                if (data.cachedFileIds && data.cachedFileIds[i]) {
                    shouldUseFileId = true;
                    fileIdToUse = data.cachedFileIds[i];
                    console.log(`[LOG][Cache] 使用 fileId[${i}]: ${fileIdToUse}`);
                }

                if (urlOnly) {
                    await this.bot.sendMessage(chatId, filePath);
                } else if (shouldUseFileId && fileIdToUse) {
                    // 直接使用 fileId 發送，不需要重新上傳
                    await this.bot.sendDocument(chatId, fileIdToUse);
                    uploadedFileIds.push(fileIdToUse);
                } else {
                    // 檢查檔案是否存在（這應該不會發生，因為下載器應該已經處理好）
                    if (!fs.existsSync(filePath)) {
                        console.log(`[ERROR] 下載檔案遺失: ${filePath}`);
                        throw new Error(`檔案不存在: ${filePath}`);
                    }

                    // 使用檔案路徑上傳
                    console.log(`[LOG] 上傳檔案: ${filePath}`);

                    // 根據副檔名判斷 content type
                    const path = require('path');
                    const ext = path.extname(filePath).toLowerCase();
                    let contentType = 'application/octet-stream';

                    if (['.jpg', '.jpeg'].includes(ext)) contentType = 'image/jpeg';
                    else if (ext === '.png') contentType = 'image/png';
                    else if (ext === '.gif') contentType = 'image/gif';
                    else if (ext === '.webp') contentType = 'image/webp';
                    else if (ext === '.mp4') contentType = 'video/mp4';
                    else if (ext === '.webm') contentType = 'video/webm';

                    const sentMessage = await this.bot.sendDocument(chatId, filePath, {}, { contentType });

                    // 上傳成功後，獲取 fileId
                    if (sentMessage && sentMessage.document && sentMessage.document.file_id) {
                        const fileId = sentMessage.document.file_id;
                        console.log(`[LOG] 獲得 fileId[${i}]: ${fileId}`);
                        uploadedFileIds.push(fileId);
                    }
                }
            } catch (error) {
                console.log(`[ERROR] 處理檔案失敗 ${filePath}: ${error}`);

                // 發送錯誤訊息
                const fileName = require('path').basename(filePath);
                await this.bot.sendMessage(
                    chatId,
                    `❌ 處理失敗: ${fileName}\n錯誤: ${error.message}`,
                    {
                        reply_to_message_id: msgId,
                        allow_sending_without_reply: true
                    }
                );
            }
        }

        // 所有檔案處理完後，統一更新快取的 fileIds
        if (this.downloadCache && url && uploadedFileIds.length > 0) {
            this.downloadCache.updateFileIds(url, uploadedFileIds);
        }
    }

    /**
     * 發送媒體文件（URL 模式 - 向後兼容）
     * @private
     */
    async _sendMediaFiles(chatId, data, urlOnly) {
        const sentTwitLinks = [];

        for (const link of data.data) {
            // Twitter 有多種大小，只發送唯一的鏈接
            if (data.type === MEDIA_TYPES.X) {
                const tmpLink = link.split('?')[0];
                if (sentTwitLinks.includes(tmpLink)) {
                    continue;
                }
                sentTwitLinks.push(tmpLink);
            }

            if (urlOnly) {
                await this.bot.sendMessage(chatId, link);
            } else {
                try {
                    // 根據 URL 判斷 content type
                    const urlLower = link.toLowerCase();
                    let contentType = 'application/octet-stream';

                    if (urlLower.match(/\.(jpg|jpeg)(\?|$)/)) contentType = 'image/jpeg';
                    else if (urlLower.match(/\.png(\?|$)/)) contentType = 'image/png';
                    else if (urlLower.match(/\.gif(\?|$)/)) contentType = 'image/gif';
                    else if (urlLower.match(/\.webp(\?|$)/)) contentType = 'image/webp';
                    else if (urlLower.match(/\.mp4(\?|$)/)) contentType = 'video/mp4';
                    else if (urlLower.match(/\.webm(\?|$)/)) contentType = 'video/webm';

                    await this.bot.sendDocument(chatId, link, {}, { contentType });
                } catch (error) {
                    console.log(`[ERROR] sendDocument error: ${error}`);
                    await this.bot.sendMessage(chatId, link);
                }
            }
        }
    }
}

module.exports = MessageHandler;
