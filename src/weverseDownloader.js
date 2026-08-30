const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { MEDIA_EXT_DOTTED } = require('./constants');

/**
 * Weverse 媒體下載器
 *
 * Weverse 的貼文頁是純前端渲染，HTML 裡沒有媒體資料，
 * 必須改打其 gateway API（global.apis.naver.com/weverse/wevweb）。
 * 該 API 的每個請求都要帶 HMAC-SHA1 簽章（wmd / wmsgpad），
 * 簽章規則取自前端 bundle 的 HmacParam.generateHmacParams：
 *   payload = path(含 query，最多前 255 字元) + timestamp
 *   wmd     = urlencode(base64(HmacSHA1(payload, key)))
 * 公開的 artist 貼文不需要登入 token。
 */
class WeverseDownloader {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/151.0.0.0 Safari/537.36';
        this.apiBase = 'https://global.apis.naver.com/weverse/wevweb';
        this.appId = 'be4d79eb8fc7bd008ee82c8ec4ff6fd4';
        // 前端 bundle 內的 activeHmacKey
        this.hmacKey = '1b9cb6378d959b45714bec49971ade22e6e24e42';
        // Weverse 媒體下載根目錄
        this.baseDirectory = 'E:\\AndrewWang\\00\\Celeb\\TWICE_SELECT\\weverse';
    }

    /**
     * 下載 Weverse 貼文的所有媒體
     * @param {string} postUrl - Weverse 貼文 URL
     * @returns {Promise<Object>} - { success, filePaths[], error? }
     */
    async downloadPost(postUrl) {
        try {
            const parsed = this._parseUrl(postUrl);
            if (!parsed) {
                throw new Error('無法從 URL 提取 community / postId');
            }
            const { community, postId } = parsed;

            console.log(`[LOG][Weverse] 開始下載: ${postUrl} (community: ${community}, postId: ${postId})`);

            const post = await this._fetchPost(postId);
            if (!post) {
                throw new Error('無法取得貼文資料');
            }

            const mediaItems = this._extractMedia(post, community, postId);
            if (mediaItems.length === 0) {
                throw new Error('貼文中沒有可下載的媒體');
            }

            console.log(`[LOG][Weverse] 找到 ${mediaItems.length} 個媒體項目`);

            const filePaths = [];
            for (const item of mediaItems) {
                const filePath = await this._downloadFile(item.url, item.filename, community);
                if (filePath) {
                    filePaths.push(filePath);
                }
            }

            if (filePaths.length === 0) {
                throw new Error('所有媒體下載失敗');
            }

            return { success: true, filePaths };
        } catch (error) {
            console.error('[ERROR][Weverse] 下載失敗:', error.message);
            return { success: false, error: error.message, filePaths: [] };
        }
    }

    /**
     * 從 URL 提取 community urlPath 與 postId
     * 例：https://weverse.io/hearts2hearts/artist/1-165385071
     * @private
     */
    _parseUrl(url) {
        const match = url.match(/weverse\.io\/([\w.-]+)\/(?:artist|fanpost)\/([\d-]+)/);
        if (!match) return null;
        return { community: match[1], postId: match[2] };
    }

    /**
     * 產生帶 HMAC 簽章的完整 API URL
     *
     * 簽章的 payload 用的是「不含 /weverse/wevweb 前綴」的 path，
     * 且 query 參數必須依字母排序（前端用 query-string 預設排序）
     * @private
     */
    _buildSignedUrl(apiPath, params = {}) {
        const query = {
            appId: this.appId,
            language: 'en',
            os: 'WEB',
            platform: 'WEB',
            wpf: 'pc',
            ...params
        };

        const search = Object.keys(query)
            .sort()
            .map(k => `${k}=${encodeURIComponent(query[k])}`)
            .join('&');

        const pathWithQuery = `${apiPath}?${search}`;
        const timestamp = Date.now().toString();
        const payload = pathWithQuery.slice(0, 255) + timestamp;
        const wmd = crypto.createHmac('sha1', this.hmacKey).update(payload).digest('base64');

        return `${this.apiBase}${pathWithQuery}&wmd=${encodeURIComponent(wmd)}&wmsgpad=${timestamp}`;
    }

    /**
     * 呼叫 post API 取得貼文
     * @private
     */
    async _fetchPost(postId) {
        try {
            const url = this._buildSignedUrl(`/post/v1.0/post-${postId}`, { fieldSet: 'postV1' });

            const response = await fetch(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'application/json, text/plain, */*',
                    'Referer': 'https://weverse.io/',
                    'Origin': 'https://weverse.io',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            if (!data || !data.postId) {
                throw new Error('回應中沒有 postId');
            }

            // 確認拿到的是指定貼文，避免下載到其他貼文的媒體
            if (data.postId !== postId) {
                throw new Error(`回傳貼文不符 (期望 ${postId}，實際 ${data.postId})`);
            }

            return data;
        } catch (error) {
            console.error('[ERROR][Weverse] API 取得失敗:', error.message);
            return null;
        }
    }

    /**
     * 從貼文物件提取媒體
     *
     * orderedAttachments 保留了貼文中媒體的原始排列順序，
     * 舊格式的貼文只有 attachment map，因此兩者都要處理
     * @private
     */
    _extractMedia(post, community, postId) {
        const dateStr = this._formatDate(post.publishedAt);
        const attachments = [];

        if (Array.isArray(post.orderedAttachments) && post.orderedAttachments.length > 0) {
            for (const item of post.orderedAttachments) {
                if (item && item.data) {
                    attachments.push({ type: item.type, data: item.data });
                }
            }
        } else if (post.attachment && typeof post.attachment === 'object') {
            for (const type of Object.keys(post.attachment)) {
                const group = post.attachment[type];
                if (!group || typeof group !== 'object') continue;
                for (const key of Object.keys(group)) {
                    attachments.push({ type, data: group[key] });
                }
            }
        }

        const mediaItems = [];
        attachments.forEach((att, i) => {
            const url = this._pickUrl(att);
            if (!url) {
                console.log(`[LOG][Weverse] 略過不支援的附件類型: ${att.type}`);
                return;
            }
            const index = String(i + 1).padStart(2, '0');
            const ext = this._getExtFromUrl(url, att.type === 'video' ? '.mp4' : '.jpg');
            mediaItems.push({
                url,
                filename: `${community}_${dateStr}_${postId}_${index}${ext}`,
                type: att.type,
            });
        });

        return mediaItems;
    }

    /**
     * 取出附件的原圖／原始檔網址
     *
     * 圖片附件的 url 本身就是原圖，網頁上顯示時才另外加 ?type=w1414 縮圖參數，
     * 因此一律去掉 query string 拿最大尺寸。
     * 影片附件走 Naver VOD，沒有直接可下載的網址時只能略過。
     * @private
     */
    _pickUrl(att) {
        const data = att.data || {};

        if (att.type === 'photo') {
            return data.url ? data.url.split('?')[0] : null;
        }

        if (att.type === 'video') {
            // 少數影片附件帶有可直接下載的來源網址
            const direct = data.videoUrl || data.downloadUrl || (data.uploadInfo && data.uploadInfo.videoUrl);
            return direct ? direct.split('?')[0] : null;
        }

        return null;
    }

    /**
     * 格式化毫秒時間戳為 YYYYMMDD
     * @private
     */
    _formatDate(timestamp) {
        if (!timestamp) return 'unknown';
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) return 'unknown';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }

    /**
     * 從 URL 取得副檔名
     * @private
     */
    _getExtFromUrl(url, fallback) {
        if (!url) return fallback;
        const cleanUrl = url.split('?')[0];
        const match = cleanUrl.match(/\.([a-zA-Z0-9]+)$/);
        if (match) {
            const ext = `.${match[1].toLowerCase()}`;
            if (MEDIA_EXT_DOTTED.includes(ext)) {
                return ext;
            }
        }
        return fallback;
    }

    /**
     * 下載單一檔案到本地
     * @private
     */
    async _downloadFile(url, filename, community) {
        try {
            const outputDir = path.join(this.baseDirectory, community);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const filePath = path.join(outputDir, filename);

            if (fs.existsSync(filePath)) {
                console.log(`[LOG][Weverse] 檔案已存在: ${filename}`);
                return filePath;
            }

            console.log(`[LOG][Weverse] 下載中: ${filename}`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Referer': 'https://weverse.io/',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const readableStream = Readable.from(response.body);
            const fileStream = fs.createWriteStream(filePath);
            readableStream.pipe(fileStream);

            await new Promise((resolve, reject) => {
                fileStream.on('close', resolve);
                fileStream.on('error', reject);
            });

            console.log(`[LOG][Weverse] 下載完成: ${filename}`);
            return filePath;
        } catch (error) {
            console.error(`[ERROR][Weverse] 下載檔案失敗 ${filename}:`, error.message);
            return null;
        }
    }
}

module.exports = WeverseDownloader;
