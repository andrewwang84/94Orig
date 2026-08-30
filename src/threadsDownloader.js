const fs = require('fs');
const path = require('path');
const { Readable } = require('stream');
const FirefoxCookies = require('./firefoxCookies');
const { MEDIA_EXT_DOTTED } = require('./constants');

/**
 * Threads 媒體下載器
 * 優先從貼文頁的嵌入 JSON 匿名取得最高畫質圖片/影片，
 * 受限貼文才改用帶登入 cookie 的私有 API
 */
class ThreadsDownloader {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
        this.appId = '238260118697367';
        // Threads 媒體下載根目錄
        this.baseDirectory = 'E:\\User\\Downloads\\Threads';
        // 暫存 Firefox cookie，避免重複讀取 sqlite
        this._cachedCookie = null;
    }

    /**
     * 取得 Threads 登入 cookie（來自 Firefox）
     * 未登入時 Threads 會把貼文頁導向登入頁，必須帶 cookie 才拿得到內容
     * @private
     */
    _getCookies() {
        if (this._cachedCookie !== null) return this._cachedCookie;
        try {
            this._cachedCookie = new FirefoxCookies().getCookiesForDomain('www.threads.com') || '';
        } catch (error) {
            console.error('[ERROR][Threads] 讀取 Firefox cookie 失敗:', error.message);
            this._cachedCookie = '';
        }
        return this._cachedCookie;
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

            // 取得貼文資料：先走匿名的 HTML 嵌入資料（多數公開貼文即可取得），
            // 取不到目標貼文時才改用帶登入 cookie 的私有 API，降低觸發風控的機會
            let mediaItems = await this._fetchMediaFromHtml(postUrl, shortcode);

            if (!mediaItems || mediaItems.length === 0) {
                console.log('[LOG][Threads] 匿名 HTML 取不到目標貼文，改用登入 API...');
                mediaItems = await this._fetchMediaFromApi(shortcode);
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
     * 透過私有 API 取得貼文媒體，僅在匿名管道取不到目標貼文時才呼叫
     *
     * /api/v1/media/{pk}/info/ 以 pk 直接定址，回傳的必定是指定貼文；
     * 但此端點不接受匿名存取（會被導向 /login），因此一定要帶 cookie
     * @private
     */
    async _fetchMediaFromApi(shortcode) {
        try {
            const cookie = this._getCookies();
            if (!cookie) {
                console.log('[LOG][Threads] 沒有 Threads cookie，略過 API 管道');
                return null;
            }

            const postId = this._shortcodeToPostId(shortcode);
            const csrfToken = (cookie.match(/csrftoken=([^;]+)/) || [])[1] || '';

            const response = await fetch(`https://www.threads.com/api/v1/media/${postId}/info/`, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Cookie': cookie,
                    'X-IG-App-ID': this.appId,
                    'X-CSRFToken': csrfToken,
                    'Accept': '*/*',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-origin',
                    'Referer': 'https://www.threads.com/',
                }
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const post = data?.items?.[0];
            if (!post) {
                throw new Error('回應中沒有 items');
            }

            // 確認拿到的是指定貼文，避免下載到其他貼文的媒體
            if (post.code && post.code !== shortcode) {
                throw new Error(`回傳貼文不符 (期望 ${shortcode}，實際 ${post.code})`);
            }

            console.log(`[LOG][Threads] API 取得貼文 ${post.code || shortcode}`);
            return this._extractMediaFromPost(post, shortcode);
        } catch (error) {
            console.error('[ERROR][Threads] API 取得失敗:', error.message);
            return null;
        }
    }

    /**
     * 從貼文物件提取媒體（處理輪播與單一媒體）
     * @private
     */
    _extractMediaFromPost(post, shortcode) {
        if (post.carousel_media && Array.isArray(post.carousel_media)) {
            const parentTakenAt = post.taken_at || post.taken_at_timestamp;
            const items = [];
            post.carousel_media.forEach((item, index) => {
                const extracted = this._extractMediaFromItem(item, shortcode, index + 1, parentTakenAt);
                if (extracted) items.push(...extracted);
            });
            if (items.length > 0) return items;
        }

        return this._extractMediaFromItem(post, shortcode, 1);
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
     * 從 JSON tree 中取出「指定貼文」的媒體
     *
     * 貼文頁的嵌入 JSON 除了目標貼文外，還夾帶大量推薦／同作者的其他貼文；
     * 且未登入時 Threads 會回傳登入頁，裡面根本沒有目標貼文。
     * 因此必須先用 code/pk 定位到目標貼文，找不到就回傳 null，
     * 絕不能退而取用第一個找到的媒體，否則會下載到別篇貼文的內容。
     * @private
     */
    _extractMediaFromJsonTree(obj, shortcode, depth = 0) {
        const post = this._findPostNode(obj, shortcode, this._shortcodeToPostId(shortcode), depth);
        if (!post) return null;

        return this._extractMediaFromPost(post, shortcode);
    }

    /**
     * 遞迴搜尋 JSON tree，找出 code 或 pk 與目標相符且含媒體的貼文物件
     * @private
     */
    _findPostNode(obj, shortcode, expectedPk, depth = 0) {
        if (depth > 25 || !obj || typeof obj !== 'object') return null;

        if (!Array.isArray(obj)) {
            const isTarget = obj.code === shortcode
                || obj.shortcode === shortcode
                || (obj.pk != null && String(obj.pk) === expectedPk)
                || (obj.id != null && String(obj.id) === expectedPk);
            const hasMedia = obj.carousel_media || obj.image_versions2 || obj.video_versions;
            if (isTarget && hasMedia) return obj;
        }

        const children = Array.isArray(obj) ? obj : Object.keys(obj).map(k => obj[k]);
        for (const child of children) {
            const result = this._findPostNode(child, shortcode, expectedPk, depth + 1);
            if (result) return result;
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

        // 確認頁面確實是目標貼文：未登入時 Threads 會導向登入頁，
        // 其 og:image 是 Threads logo，og:url 則指向站台首頁
        const ogUrl = (html.match(/<meta\s+property="og:url"\s+content="([^"]+)"/) || [])[1];
        if (!ogUrl || !ogUrl.includes(shortcode)) {
            console.log('[LOG][Threads] meta 標籤非目標貼文（可能是登入頁），略過');
            return null;
        }

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
