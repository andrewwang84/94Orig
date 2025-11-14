const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

/**
 * TikTok 影片下載器
 */
class TikTokDownloader {
    /**
     * 從 TikTok 影片 URL 下載影片
     * @param {string} videoUrl - TikTok 影片 URL
     * @returns {Promise<Object>} - 返回 { success: boolean, filePath?: string, error?: string }
     */
    async downloadVideo(videoUrl) {
        try {
            // 第一步：提交下載任務
            const taskId = await this._submitTask(videoUrl);
            if (!taskId) {
                throw new Error('無法取得 task_id');
            }

            // 等待 1.5 秒讓服務器處理
            await this._delay(1500);

            // 第二步：獲取下載資訊
            const videoInfo = await this._getTaskResult(taskId, videoUrl);
            if (!videoInfo) {
                throw new Error('無法取得影片資訊');
            }

            // 第三步：下載影片
            const filePath = await this._downloadVideoFile(videoInfo);

            return {
                success: true,
                filePath: filePath,
                videoInfo: videoInfo
            };

        } catch (error) {
            console.error('[ERROR] TikTok 下載失敗:', error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * 提交下載任務
     * @private
     */
    async _submitTask(videoUrl) {
        const formData = new URLSearchParams();
        formData.append('url', videoUrl);
        formData.append('web', '1');

        const response = await fetch('https://www.tikwm.com/api/video/task/submit', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Referer': 'https://www.tikwm.com/originalDownloader.html'
            },
            body: formData.toString()
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.code !== 0) {
            throw new Error(data.msg || '提交任務失敗');
        }

        return data.data.task_id;
    }

    /**
     * 獲取任務結果
     * @private
     */
    async _getTaskResult(taskId, videoUrl) {
        const response = await fetch(
            `https://www.tikwm.com/api/video/task/result?task_id=${taskId}`,
            {
                headers: {
                    'Referer': 'https://www.tikwm.com/originalDownloader.html'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        if (data.code !== 0 || !data.data || !data.data.detail) {
            throw new Error('無法取得影片詳細資訊');
        }

        // 提取影片 ID
        const videoIdMatch = videoUrl.match(/\/video\/(\d+)/);
        const videoId = videoIdMatch ? videoIdMatch[1] : 'unknown';

        return {
            id: videoId,
            title: data.data.detail.title || 'untitled',
            link: data.data.detail.download_url || data.data.detail.play_url
        };
    }

    /**
     * 下載影片檔案
     * @private
     */
    async _downloadVideoFile(videoInfo) {
        const response = await fetch(videoInfo.link);

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const contentType = response.headers.get('content-type');
        if (contentType !== 'video/mp4' && contentType !== 'application/octet-stream') {
            throw new Error('URL 未返回影片內容');
        }

        // 清理檔案名稱
        let title = videoInfo.title
            .replace(/[^a-zA-Z0-9\-\_#\(\)\@ ]/gi, '')
            .replace(/\# /gi, ' ')
            .replace(/ {2,5}/gi, ' ')
            .replace(/ +\@ +/gi, '@')
            .trim();

        // 使用影片 ID 作為臨時檔名
        const tempFileName = `${videoInfo.id}.mp4`;
        const finalFileName = `${title}.mp4`;

        // 限制檔名長度
        let actualFileName = finalFileName;
        if (finalFileName.length > 200) {
            const overflow = finalFileName.length - 200;
            title = title.slice(0, -overflow);
            actualFileName = `${title}.mp4`;
        }

        const tempFilePath = path.join(process.cwd(), tempFileName);
        const finalFilePath = path.join(process.cwd(), actualFileName);

        // 檢查檔案是否已存在
        if (fs.existsSync(finalFilePath)) {
            console.log(`[LOG] 影片已存在: ${actualFileName}`);
            return finalFilePath;
        }

        // 下載檔案
        const readableStream = Readable.from(response.body);
        const fileStream = fs.createWriteStream(tempFilePath);

        readableStream.pipe(fileStream);

        // 等待寫入完成
        await new Promise((resolve, reject) => {
            fileStream.on('close', resolve);
            fileStream.on('error', reject);
        });

        // 重新命名檔案（如果檔名不同）
        if (tempFilePath !== finalFilePath) {
            fs.renameSync(tempFilePath, finalFilePath);
        }

        console.log(`[LOG] TikTok 影片下載完成: ${actualFileName}`);
        return finalFilePath;
    }

    /**
     * 延遲函數
     * @private
     */
    _delay(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }
}

module.exports = TikTokDownloader;
