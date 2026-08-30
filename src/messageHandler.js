const { fromPath } = require('node-telegram-bot-api/node');
const { MEDIA_TYPES, getContentType } = require('./constants');
const TikTokDownloader = require('./tiktokDownloader');

/**
 * 回覆原訊息用的 reply_parameters
 * （v2 移除了 reply_to_message_id / allow_sending_without_reply 這組舊欄位）
 */
function replyTo(msgId) {
    return { message_id: msgId, allow_sending_without_reply: true };
}

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
        this.tiktokDownloader = new TikTokDownloader();
    }

    /**
     * 發送下載結果消息
     * @param {Object} msg - Telegram 訊息對象
     * @param {Array} datas - 數據數組
     * @param {boolean} downloadRemote - 是否下載到遠端
     */
    async sendMessages(msg, datas, downloadRemote = false) {
        const chatId = msg.chat.id;
        const msgId = msg.message_id;

        // 向非管理員用戶發送確認消息
        if (chatId !== this.myId) {
            await this.bot.api.sendMessage({ chat_id: chatId, text: '🐵:嗚吱！' });
        }

        if (downloadRemote) {
            await this._handleRemoteDownload(chatId, msgId, datas);
        } else {
            await this._handleLocalDownload(chatId, msgId, datas);
        }
    }

    /**
     * 處理遠端下載
     * @private
     */
    async _handleRemoteDownload(chatId, msgId, datas) {
        for (const data of datas) {
            // TikTok 影片特殊處理
            if (data.type === MEDIA_TYPES.TIKTOK_VIDEO) {
                await this._handleTikTokVideoRemote(chatId, msgId, data);
                continue;
            }
        }

        // 處理其他類型的遠端下載結果
        let resultText = '';
        for (const data of datas) {
            if (data.type === MEDIA_TYPES.TIKTOK_VIDEO) {
                continue; // 已經處理過了
            }
            if (data.isDone && data.data.length > 0) {
                resultText += `${data.target} 下載完成\n`;
            } else {
                resultText += `${data.target} 下載失敗\n`;
            }
        }

        if (resultText.trim() !== '') {
            await this.bot.api.sendMessage({
                chat_id: chatId,
                text: resultText,
                link_preview_options: { is_disabled: true },
                reply_parameters: replyTo(msgId)
            });
        } else {
            console.log('[WARNING] resultText 為空，不發送訊息');
        }
    }

    /**
     * 處理本地下載（發送到 Telegram）
     * @private
     */
    async _handleLocalDownload(chatId, msgId, datas) {
        for (const data of datas) {
            // 處理 TikTok 影片（上傳到 Telegram）
            if (data.type === MEDIA_TYPES.TIKTOK_VIDEO) {
                await this._handleTikTokVideoUpload(chatId, msgId, data);
                continue;
            }

            // 處理直播指令回傳
            if (data.type === MEDIA_TYPES.TIKTOK_LIVE || data.type === MEDIA_TYPES.TWITCH_LIVE) {
                await this._handleLiveStreamCommand(chatId, msgId, data);
                continue;
            }

            if (data.isDone) {
                // 如果有本地檔案或從快取來的
                if (data.localFiles && data.localFiles.length > 0) {
                    await this._sendLocalFiles(chatId, msgId, data);
                } else if (data.fromCache && data.data.length > 0) {
                    // 從快取來的檔案路徑在 data 陣列中
                    await this._sendLocalFiles(chatId, msgId, { ...data, localFiles: data.data });
                } else if (data.data.length > 0) {
                    // 舊的 URL 模式（向後兼容）
                    await this._sendMediaFiles(chatId, data);
                } else {
                    // 沒有檔案可發送
                    await this.bot.api.sendMessage({
                        chat_id: chatId,
                        text: `⚠️ ${data.target} 沒有找到可下載的內容`,
                        link_preview_options: { is_disabled: true },
                        reply_parameters: replyTo(msgId)
                    });
                }
            } else {
                // 下載失敗
                const errorMsg = data.errorCode
                    ? `❌ ${data.target} 下載失敗 (exit code: ${data.errorCode})`
                    : `❌ ${data.target} 下載失敗`;

                await this.bot.api.sendMessage({
                    chat_id: chatId,
                    text: errorMsg,
                    link_preview_options: { is_disabled: true },
                    reply_parameters: replyTo(msgId)
                });
            }
        }
    }

    /**
     * 發送本地檔案
     * @private
     */
    async _sendLocalFiles(chatId, msgId, data) {
        const fs = require('fs');
        const path = require('path');
        const uploadedFileIds = [];
        const url = data.originalUrls ? data.originalUrls[0] : null;
        const hasFileIds = data.cachedFileIds && data.cachedFileIds.length > 0;
        const hasLocalFiles = data.localFiles && data.localFiles.length > 0;
        let fileIdFailed = false;
        let localFileFailed = false;

        const count = hasFileIds ? data.cachedFileIds.length : (hasLocalFiles ? data.localFiles.length : 0);

        for (let i = 0; i < count; i++) {
            let sent = false;

            // 優先嘗試 fileId
            if (hasFileIds && data.cachedFileIds[i]) {
                try {
                    console.log(`[LOG][Cache] 使用 fileId[${i}]: ${data.cachedFileIds[i]}`);
                    // file_id 是字串，直接上線傳送，不需要包成 InputFile
                    await this.bot.api.sendDocument({
                        chat_id: chatId,
                        document: data.cachedFileIds[i]
                    });
                    sent = true;
                } catch (error) {
                    console.log(`[ERROR] fileId 發送失敗 ${data.cachedFileIds[i]}: ${error}`);
                    fileIdFailed = true;
                }
            }

            // fileId 失敗或沒有 fileId，fallback 到本地檔案
            if (!sent && hasLocalFiles && data.localFiles[i]) {
                const filePath = data.localFiles[i];
                try {
                    if (!fs.existsSync(filePath)) {
                        throw new Error(`檔案不存在: ${filePath}`);
                    }

                    console.log(`[LOG] 上傳檔案: ${filePath}`);

                    const contentType = getContentType(filePath);

                    // 本地檔案：v2 不做路徑猜測，要用 fromPath 包成 InputFile 才會上傳
                    const sentMessage = await this.bot.api.sendDocument({
                        chat_id: chatId,
                        document: await fromPath(filePath, { contentType })
                    });
                    sent = true;

                    if (sentMessage && sentMessage.document && sentMessage.document.file_id) {
                        console.log(`[LOG] 獲得 fileId[${i}]: ${sentMessage.document.file_id}`);
                        uploadedFileIds.push(sentMessage.document.file_id);
                    }
                } catch (error) {
                    console.log(`[ERROR] 本地檔案發送失敗 ${filePath}: ${error}`);
                    localFileFailed = true;
                }
            }

            // 兩者都失敗，通知使用者
            if (!sent) {
                const label = (hasFileIds && data.cachedFileIds[i])
                    ? data.cachedFileIds[i]
                    : (hasLocalFiles && data.localFiles[i] ? path.basename(data.localFiles[i]) : 'unknown');
                await this.bot.api.sendMessage({
                    chat_id: chatId,
                    text: `❌ 發送失敗: ${label}`,
                    reply_parameters: replyTo(msgId)
                });
            }
        }

        // 根據失敗情形更新快取
        if (this.downloadCache && url) {
            if (fileIdFailed && localFileFailed) {
                console.log(`[LOG][Cache] fileId 和本地檔案都失敗，刪除快取: ${url}`);
                this.downloadCache.delete(url);
            } else if (fileIdFailed) {
                console.log(`[LOG][Cache] fileId 失敗，清除 fileId 資料: ${url}`);
                if (uploadedFileIds.length > 0) {
                    this.downloadCache.updateFileIds(url, uploadedFileIds);
                } else {
                    this.downloadCache.clearFileIds(url);
                }
            } else if (localFileFailed) {
                console.log(`[LOG][Cache] 本地檔案失敗，清除 filePaths 資料: ${url}`);
                this.downloadCache.clearFilePaths(url);
            } else if (uploadedFileIds.length > 0) {
                this.downloadCache.updateFileIds(url, uploadedFileIds);
            }
        }
    }

    /**
     * 發送媒體文件（URL 模式 - 向後兼容）
     * @private
     */
    async _sendMediaFiles(chatId, data) {
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

            try {
                // link 是遠端網址，字串直傳讓 Telegram 自己去抓。
                // v1 的第 4 參數 contentType 只在 multipart 上傳時有用，走 URL 時用不到。
                await this.bot.api.sendDocument({
                    chat_id: chatId,
                    document: link
                });
            } catch (error) {
                console.log(`[ERROR] sendDocument error: ${error}`);
                await this.bot.api.sendMessage({ chat_id: chatId, text: link });
            }
        }
    }

    /**
     * 處理 TikTok 影片下載並上傳到 Telegram
     * @private
     */
    async _handleTikTokVideoUpload(chatId, msgId, data) {
        try {
            await this.bot.api.sendMessage({
                chat_id: chatId,
                text: `${data.target}\n\n開始下載 TikTok 影片...`,
                reply_parameters: replyTo(msgId)
            });

            const result = await this.tiktokDownloader.downloadVideo(data.target);

            if (result.success && result.filePath) {
                const caption = result.videoInfo && result.videoInfo.title ? result.videoInfo.title : data.target;
                await this.bot.api.sendVideo({
                    chat_id: chatId,
                    video: await fromPath(result.filePath),
                    caption: caption,
                    reply_parameters: replyTo(msgId)
                });
            } else {
                await this.bot.api.sendMessage({
                    chat_id: chatId,
                    text: `${data.target}\n\n下載失敗: ${result.error || '未知錯誤'}`,
                    reply_parameters: replyTo(msgId)
                });
            }
        } catch (error) {
            console.error('[ERROR] TikTok 影片處理失敗:', error);
            await this.bot.api.sendMessage({
                chat_id: chatId,
                text: `${data.target}\n\n下載失敗: ${error.message}`,
                reply_parameters: replyTo(msgId)
            });
        }
    }

    /**
     * 處理 TikTok 影片下載（僅遠端下載）
     * @private
     */
    async _handleTikTokVideoRemote(chatId, msgId, data) {
        try {
            console.log(`[LOG] 開始遠端下載 TikTok 影片: ${JSON.stringify(data)}`);

            const result = await this.tiktokDownloader.downloadVideo(data.target);
            console.log(`[LOG] TikTok 影片下載結果: ${JSON.stringify(result)}`);

            if (result.success && result.filePath) {
                await this.bot.api.sendMessage({
                    chat_id: chatId,
                    text: `${data.target}\n\n✅ 下載完成！\n檔案: ${require('path').basename(result.filePath)}`,
                    reply_parameters: replyTo(msgId)
                });
            } else {
                await this.bot.api.sendMessage({
                    chat_id: chatId,
                    text: `${data.target}\n\n❌ 下載失敗: ${result.error || '未知錯誤'}`,
                    reply_parameters: replyTo(msgId)
                });
            }
        } catch (error) {
            console.error('[ERROR] TikTok 影片遠端下載失敗:', error);
            await this.bot.api.sendMessage({
                chat_id: chatId,
                text: `${data.target}\n\n❌ 下載失敗: ${error.message}`,
                reply_parameters: replyTo(msgId)
            });
        }
    }

    /**
     * 處理直播指令回傳
     * @private
     */
    async _handleLiveStreamCommand(chatId, msgId, data) {
        const today = new Date();
        const dateStr = `${(today.getMonth() + 1).toString().padStart(2, '0')}${today.getDate().toString().padStart(2, '0')}${today.getHours().toString().padStart(2, '0')}`;

        let command = '';

        if (data.type === MEDIA_TYPES.TWITCH_LIVE) {
            // Twitch 直播
            const channelMatch = data.target.match(/twitch\.tv\/([\w-]+)/);
            const channel = channelMatch ? channelMatch[1] : 'channel';
            command = `streamlink --retry-streams 5 --retry-max 100 --retry-open 500 --stream-segment-attempts 10 --twitch-disable-ads "${data.target}" best -o "${dateStr} ${channel} twitch.ts"`;
        } else if (data.type === MEDIA_TYPES.TIKTOK_LIVE) {
            // TikTok 直播
            const userMatch = data.target.match(/tiktok\.com\/@([\w.-]+)/);
            const username = userMatch ? userMatch[1] : 'user';
            command = `streamlink --retry-streams 5 --retry-max 100 --retry-open 100 --stream-segment-attempts 10 "${data.target}" best -o "${dateStr} @${username} tiktok.ts"`;
        }

        if (command) {
            await this.bot.api.sendMessage({
                chat_id: chatId,
                text: `\`${command}\``,
                parse_mode: 'Markdown',
                reply_parameters: replyTo(msgId)
            });
        }
    }
}

module.exports = MessageHandler;
