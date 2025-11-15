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

        try {
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
        } catch (error) {
            throw error;
        }
    }

    /**
     * 獲取任務結果
     * @private
     */
    async _getTaskResult(taskId, videoUrl) {
        try {
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
            const videoId = videoIdMatch ? videoIdMatch[1] : data.data.detail.id;

            return {
                id: videoId,
                title: data.data.detail.title || 'untitled',
                link: data.data.detail.download_url || data.data.detail.play_url,
                author: {
                    unique_id: data.data.detail.author.unique_id
                },
                create_time: data.data.detail.create_time
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * 下載影片檔案
     * @private
     */
    async _downloadVideoFile(videoInfo) {
        try {
            const response = await fetch(videoInfo.link);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const contentType = response.headers.get('content-type');
            if (contentType !== 'video/mp4' && contentType !== 'application/octet-stream') {
                throw new Error('URL 未返回影片內容');
            }

            // Convert timestamp to YYYYMMDD format
            const date = new Date(videoInfo.create_time * 1000);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const dateStr = `${year}${month}${day}`;

            const fileName = `${videoInfo.author.unique_id}_${videoInfo.id}_${dateStr}.mp4`;
            const filePath = path.join('E:/User/Downloads/ff', fileName);

            // 檢查檔案是否已存在
            if (fs.existsSync(filePath)) {
                console.log(`[LOG] 影片已存在: ${fileName}`);
                return filePath;
            }

            // 下載檔案
            const readableStream = Readable.from(response.body);
            const fileStream = fs.createWriteStream(filePath);

            readableStream.pipe(fileStream);

            // 等待寫入完成
            await new Promise((resolve, reject) => {
                fileStream.on('close', resolve);
                fileStream.on('error', reject);
            });

            console.log(`[LOG] TikTok 影片下載完成: ${fileName}`);
            return filePath;
        } catch (error) {
            throw error;
        }
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
