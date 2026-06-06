const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');

/**
 * Threads 媒體下載器
 * 透過 Threads GraphQL API 取得最高畫質圖片/影片
 */
class ThreadsDownloader {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
        this.appId = '238260118697367';
        // Threads 媒體下載根目錄
        this.baseDirectory = 'E:\\User\\Downloads\\Threads';
        // 暫存 HTML 供 LSD token 提取使用，避免重複 fetch
        this._cachedHtml = null;
    }

    /**
     * 下載 Threads 貼文的所有媒體
     * @param {string} postUrl - Threads 貼文 URL
     * @returns {Promise<Object>} - { success, filePaths[], error? }
     */
    async downloadPost(postUrl) {
        try {
            const shortcode = this._extractShortcodeFromUrl(postUrl);
            if (!shortcode) {
                throw new Error('無法從 URL 提取 shortcode');
            }

            console.log(`[LOG][Threads] 開始下載: ${postUrl} (shortcode: ${shortcode})`);

            // 取得貼文資料（先嘗試 HTML 嵌入資料，再 fallback 到 GraphQL）
            let mediaItems = await this._fetchMediaFromHtml(postUrl, shortcode);

            if (!mediaItems || mediaItems.length === 0) {
                console.log('[LOG][Threads] HTML 解析無結果，嘗試 GraphQL API...');
                mediaItems = await this._fetchMediaFromGraphQL(postUrl, shortcode);
            }

            if (!mediaItems || mediaItems.length === 0) {
                throw new Error('無法取得媒體資料');
            }

            console.log(`[LOG][Threads] 找到 ${mediaItems.length} 個媒體項目`);

            // 從 URL 提取 username
            const username = this._extractUsernameFromUrl(postUrl);

            // 將檔名前綴從 threads_ 改為 {username}_
            for (const item of mediaItems) {
                item.filename = item.filename.replace(/^threads_/, `${username}_`);
            }

            // 下載所有媒體
            const filePaths = [];
            for (let i = 0; i < mediaItems.length; i++) {
                const item = mediaItems[i];
                const filePath = await this._downloadFile(item.url, item.filename, username);
                if (filePath) {
                    filePaths.push(filePath);
                }
            }

            if (filePaths.length === 0) {
                throw new Error('所有媒體下載失敗');
            }

            return { success: true, filePaths };
        } catch (error) {
            console.error('[ERROR][Threads] 下載失敗:', error.message);
            return { success: false, error: error.message, filePaths: [] };
        }
    }

    /**
     * 從 URL 提取 shortcode
     * @private
     */
    _extractShortcodeFromUrl(url) {
        const match = url.match(/threads\.(?:net|com)\/@[\w.-]+\/post\/([\w-]+)/);
        return match ? match[1] : null;
    }

    /**
     * 從 URL 提取 username
     * @private
     */
    _extractUsernameFromUrl(url) {
        const match = url.match(/threads\.(?:net|com)\/@([\w.-]+)\/post\//);
        return match ? match[1] : 'unknown';
    }

    /**
     * 從 shortcode 轉換為 post ID (與 Instagram 相同的 base64 編碼)
     * @private
     */
    _shortcodeToPostId(shortcode) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        let postId = BigInt(0);
        for (const char of shortcode) {
            postId = postId * BigInt(64) + BigInt(alphabet.indexOf(char));
        }
        return postId.toString();
    }

    /**
     * 格式化日期為 YYYYMMDD
     * @private
     */
    _formatDate(timestamp) {
        if (!timestamp) return 'unknown';
        const date = new Date(typeof timestamp === 'number' && timestamp < 1e12
            ? timestamp * 1000
            : timestamp);
        if (isNaN(date.getTime())) return 'unknown';
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}${m}${d}`;
    }

    /**
     * 從 HTML 頁面提取媒體資料
     * Threads 頁面包含 JSON 嵌入資料 (Server-Side Rendered)
     * @private
     */
    async _fetchMediaFromHtml(postUrl, shortcode) {
        try {
            const response = await fetch(postUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const html = await response.text();

            // 暫存 HTML 供後續 LSD token 提取使用
            this._cachedHtml = html;

            // 方法 1: 從 <script type="application/json"> 提取嵌入 JSON
            const mediaItems = this._parseMediaFromHtml(html, shortcode);
            if (mediaItems && mediaItems.length > 0) {
                return mediaItems;
            }

            // 方法 2: 從 meta og:image / og:video 標籤提取
            return this._parseMediaFromMetaTags(html, shortcode);
        } catch (error) {
            console.error('[ERROR][Threads] HTML 解析失敗:', error.message);
            return null;
        }
    }

    /**
     * 從 HTML 中的嵌入 JSON 解析媒體
     * @private
     */
    _parseMediaFromHtml(html, shortcode) {
        const mediaItems = [];

        try {
            // Threads 頁面在 script 標籤中嵌入了 post 資料
            // 尋找包含 post 媒體資料的 JSON
            const scriptRegex = /<script[^>]*type="application\/json"[^>]*>([\s\S]*?)<\/script>/g;
            let match;

            while ((match = scriptRegex.exec(html)) !== null) {
                try {
                    const jsonStr = match[1];
                    const data = JSON.parse(jsonStr);
                    const items = this._extractMediaFromJsonTree(data, shortcode);
                    if (items && items.length > 0) {
                        return items;
                    }
                } catch (e) {
                    // 跳過無法解析的 JSON
                }
            }

            // 嘗試 __NEXT_DATA__ 格式
            const nextDataMatch = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
            if (nextDataMatch) {
                try {
                    const data = JSON.parse(nextDataMatch[1]);
                    const items = this._extractMediaFromJsonTree(data, shortcode);
                    if (items && items.length > 0) {
                        return items;
                    }
                } catch (e) {
                    // 跳過
                }
            }
        } catch (error) {
            console.error('[ERROR][Threads] JSON 解析失敗:', error.message);
        }

        return mediaItems.length > 0 ? mediaItems : null;
    }

    /**
     * 遞迴搜尋 JSON tree 中的媒體資料
     * 尋找 Instagram/Threads 風格的 image_versions2 和 video_versions
     * @private
     */
    _extractMediaFromJsonTree(obj, shortcode, depth = 0) {
        if (depth > 20 || !obj || typeof obj !== 'object') return null;

        // 優先檢查 carousel_media（輪播），因為輪播貼文的 parent 也會有 image_versions2（封面）
        if (obj.carousel_media && Array.isArray(obj.carousel_media)) {
            const parentTakenAt = obj.taken_at || obj.taken_at_timestamp;
            const items = [];
            obj.carousel_media.forEach((item, index) => {
                const extracted = this._extractMediaFromItem(item, shortcode, index + 1, parentTakenAt);
                if (extracted) items.push(...extracted);
            });
            if (items.length > 0) return items;
        }

        // 檢查是否為包含媒體的 post 物件（單張/單影片）
        if (obj.image_versions2 || obj.video_versions) {
            return this._extractMediaFromItem(obj, shortcode, 1);
        }

        // 檢查 post 包裝結構
        if (obj.post && typeof obj.post === 'object') {
            const result = this._extractMediaFromJsonTree(obj.post, shortcode, depth + 1);
            if (result) return result;
        }

        // 檢查 media 包裝結構
        if (obj.media && typeof obj.media === 'object' && !Array.isArray(obj.media)) {
            const result = this._extractMediaFromJsonTree(obj.media, shortcode, depth + 1);
            if (result) return result;
        }

        // 檢查 thread_items 結構 (Threads 特有)
        if (obj.thread_items && Array.isArray(obj.thread_items)) {
            for (const threadItem of obj.thread_items) {
                if (threadItem.post) {
                    const result = this._extractMediaFromJsonTree(threadItem.post, shortcode, depth + 1);
                    if (result) return result;
                }
            }
        }

        // 檢查 containing_thread 結構
        if (obj.containing_thread && typeof obj.containing_thread === 'object') {
            const result = this._extractMediaFromJsonTree(obj.containing_thread, shortcode, depth + 1);
            if (result) return result;
        }

        // 遞迴搜尋所有子項
        if (Array.isArray(obj)) {
            for (const item of obj) {
                const result = this._extractMediaFromJsonTree(item, shortcode, depth + 1);
                if (result) return result;
            }
        } else {
            for (const key of Object.keys(obj)) {
                const result = this._extractMediaFromJsonTree(obj[key], shortcode, depth + 1);
                if (result) return result;
            }
        }

        return null;
    }

    /**
     * 從單一媒體項目提取 URL
     * @private
     */
    _extractMediaFromItem(item, shortcode, index, parentTakenAt = null) {
        const mediaItems = [];

        // 嘗試從 item 中取得 taken_at 時間戳，fallback 到 parent 的時間戳
        const takenAt = item.taken_at || item.taken_at_timestamp || parentTakenAt;
        const dateStr = this._formatDate(takenAt);

        // 影片
        if (item.video_versions && item.video_versions.length > 0) {
            const bestVideo = this._pickBestVideo(item.video_versions);
            if (bestVideo) {
                const ext = this._getExtFromUrl(bestVideo.url, '.mp4');
                const mediaId = item.pk || item.id || shortcode;
                mediaItems.push({
                    url: bestVideo.url,
                    filename: `threads_${dateStr}_${mediaId}_${index}${ext}`,
                    type: 'video',
                    width: bestVideo.width,
                    height: bestVideo.height,
                });
            }
        }
        // 圖片
        else if (item.image_versions2 && item.image_versions2.candidates) {
            const bestImage = this._pickBestImage(item.image_versions2.candidates);
            if (bestImage) {
                const ext = this._getExtFromUrl(bestImage.url, '.jpg');
                const mediaId = item.pk || item.id || shortcode;
                mediaItems.push({
                    url: bestImage.url,
                    filename: `threads_${dateStr}_${mediaId}_${index}${ext}`,
                    type: 'image',
                    width: bestImage.width,
                    height: bestImage.height,
                });
            }
        }

        return mediaItems.length > 0 ? mediaItems : null;
    }

    /**
     * 從 HTML meta 標籤提取媒體 (fallback)
     * @private
     */
    _parseMediaFromMetaTags(html, shortcode) {
        const items = [];

        // og:video
        const videoMatch = html.match(/<meta\s+property="og:video"\s+content="([^"]+)"/);
        if (videoMatch) {
            const url = videoMatch[1].replace(/&amp;/g, '&');
            const ext = this._getExtFromUrl(url, '.mp4');
            items.push({
                url,
                filename: `threads_unknown_${shortcode}_1${ext}`,
                type: 'video',
            });
        }

        // og:image（如果沒有影片才取圖片）
        if (items.length === 0) {
            const imageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
            if (imageMatch) {
                const url = imageMatch[1].replace(/&amp;/g, '&');
                const ext = this._getExtFromUrl(url, '.jpg');
                items.push({
                    url,
                    filename: `threads_unknown_${shortcode}_1${ext}`,
                    type: 'image',
                });
            }
        }

        return items.length > 0 ? items : null;
    }

    /**
     * 透過 GraphQL API 取得貼文媒體
     * @private
     */
    async _fetchMediaFromGraphQL(postUrl, shortcode) {
        try {
            // 從已快取的 HTML 提取 LSD token，避免重複 fetch 頁面
            const lsdToken = this._extractLsdFromHtml(this._cachedHtml) || await this._fetchLsdToken(postUrl);
            if (!lsdToken) {
                throw new Error('無法取得 LSD token');
            }

            const postId = this._shortcodeToPostId(shortcode);
            console.log(`[LOG][Threads] GraphQL 查詢 postId: ${postId}`);

            // 嘗試多個已知的 doc_id
            const docIds = [
                '25531498899829322',   // BarcelonaPostPageQuery (2024+)
                '7803498756374880',    // another known variant
                '5587632691339264',    // threads-api (2023)
            ];

            for (const docId of docIds) {
                try {
                    const result = await this._graphqlRequest(lsdToken, postId, docId);
                    if (result) return result;
                } catch (e) {
                    console.log(`[LOG][Threads] doc_id ${docId} 失敗: ${e.message}`);
                }
                // doc_id 之間加延遲，避免觸發 rate limit
                await new Promise(resolve => setTimeout(resolve, 500));
            }

            return null;
        } catch (error) {
            console.error('[ERROR][Threads] GraphQL 查詢失敗:', error.message);
            return null;
        }
    }

    /**
     * 執行 GraphQL 請求
     * @private
     */
    async _graphqlRequest(lsdToken, postId, docId) {
        const variables = JSON.stringify({ postID: postId });

        const body = new URLSearchParams({
            lsd: lsdToken,
            variables,
            doc_id: docId,
        });

        const response = await fetch('https://www.threads.net/api/graphql', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': this.userAgent,
                'X-FB-LSD': lsdToken,
                'X-IG-App-ID': this.appId,
                'Sec-Fetch-Dest': 'empty',
                'Sec-Fetch-Mode': 'cors',
                'Sec-Fetch-Site': 'same-origin',
                'Origin': 'https://www.threads.net',
                'Referer': 'https://www.threads.net/',
            },
            body: body.toString(),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const data = await response.json();

        // 嘗試從各種回應結構中提取媒體
        const postData =
            data?.data?.data?.containing_thread?.thread_items?.[0]?.post ||
            data?.data?.data?.containing_thread?.thread_items?.[0]?.media ||
            data?.data?.containing_thread?.thread_items?.[0]?.post ||
            data?.data?.mediaData?.threads?.[0]?.thread_items?.[0]?.post ||
            null;

        if (!postData) {
            return null;
        }

        // 取得 shortcode（用於檔案命名）
        const shortcode = postData.code || postData.shortcode || 'unknown';

        // 檢查輪播
        if (postData.carousel_media && Array.isArray(postData.carousel_media)) {
            const parentTakenAt = postData.taken_at || postData.taken_at_timestamp;
            const items = [];
            postData.carousel_media.forEach((item, index) => {
                const extracted = this._extractMediaFromItem(item, shortcode, index + 1, parentTakenAt);
                if (extracted) items.push(...extracted);
            });
            if (items.length > 0) return items;
        }

        // 單一媒體
        return this._extractMediaFromItem(postData, shortcode, 1);
    }

    /**
     * 從已快取的 HTML 提取 LSD token（不發請求）
     * @private
     */
    _extractLsdFromHtml(html) {
        if (!html) return null;

        const patterns = [
            /"LSD",\[\],\{"token":"(\w+)"\}/,
            /"lsd_token":"(\w+)"/,
            /name="lsd"\s+value="(\w+)"/,
            /"LSD"[^}]*"token":"(\w+)"/,
        ];

        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match) {
                console.log(`[LOG][Threads] 從快取 HTML 取得 LSD token: ${match[1].substring(0, 8)}...`);
                return match[1];
            }
        }

        return null;
    }

    /**
     * 從頁面取得 LSD token（fallback，重新 fetch）
     * @private
     */
    async _fetchLsdToken(postUrl) {
        try {
            const response = await fetch(postUrl, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                    'Sec-Fetch-Dest': 'document',
                    'Sec-Fetch-Mode': 'navigate',
                    'Sec-Fetch-Site': 'none',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const html = await response.text();

            // 嘗試多種 LSD token 提取模式
            const patterns = [
                /"LSD",\[\],\{"token":"(\w+)"\}/,
                /"lsd_token":"(\w+)"/,
                /name="lsd"\s+value="(\w+)"/,
                /"LSD"[^}]*"token":"(\w+)"/,
            ];

            for (const pattern of patterns) {
                const match = html.match(pattern);
                if (match) {
                    console.log(`[LOG][Threads] 取得 LSD token: ${match[1].substring(0, 8)}...`);
                    return match[1];
                }
            }

            // 如果找不到 LSD token，生成隨機 token 嘗試
            console.log('[LOG][Threads] 未找到 LSD token，使用隨機 token');
            return '';
        } catch (error) {
            console.error('[ERROR][Threads] 取得 LSD token 失敗:', error.message);
            return null;
        }
    }

    /**
     * 從 image candidates 中選擇最高畫質
     * @private
     */
    _pickBestImage(candidates) {
        if (!candidates || candidates.length === 0) return null;
        return candidates.reduce((best, current) => {
            const bestArea = (best.width || 0) * (best.height || 0);
            const currentArea = (current.width || 0) * (current.height || 0);
            return currentArea > bestArea ? current : best;
        });
    }

    /**
     * 從 video versions 中選擇最高畫質
     * @private
     */
    _pickBestVideo(versions) {
        if (!versions || versions.length === 0) return null;
        return versions.reduce((best, current) => {
            const bestArea = (best.width || 0) * (best.height || 0);
            const currentArea = (current.width || 0) * (current.height || 0);
            return currentArea > bestArea ? current : best;
        });
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
            // 確保是合法的媒體副檔名
            if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.webm', '.mov'].includes(ext)) {
                return ext;
            }
        }
        return fallback;
    }

    /**
     * 下載單一檔案到本地
     * @private
     */
    async _downloadFile(url, filename, username = 'unknown') {
        try {
            // 比照 gallery-dl instagram 路徑: {base-directory}/{username}/{filename}
            const outputDir = path.join(this.baseDirectory, username);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const filePath = path.join(outputDir, filename);

            // 如果檔案已存在，直接回傳
            if (fs.existsSync(filePath)) {
                console.log(`[LOG][Threads] 檔案已存在: ${filename}`);
                return filePath;
            }

            console.log(`[LOG][Threads] 下載中: ${filename}`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': this.userAgent,
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

            console.log(`[LOG][Threads] 下載完成: ${filename}`);
            return filePath;
        } catch (error) {
            console.error(`[ERROR][Threads] 下載檔案失敗 ${filename}:`, error.message);
            return null;
        }
    }
}

module.exports = ThreadsDownloader;
