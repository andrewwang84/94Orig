const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');

/**
 * app.fans 媒體下載器
 * 透過 app.fans GraphQL API (ClipDetails) 取得圖片並下載最高畫質版本
 */
class AppFansDownloader {
    constructor() {
        this.userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:149.0) Gecko/20100101 Firefox/149.0';
        this.apiUrl = 'https://api.app.fans/graphql';
        this.baseDirectory = 'E:\\AndrewWang\\00\\Celeb\\tmp\\IG & Offical\\___FANS';

        // ClipDetails GraphQL query
        this.clipDetailsQuery = `query ClipDetails($mediaSlug: String!) {
  clip(filter: {slug_Exact: $mediaSlug}) {
    id
    title
    body
    isPremiumOnly
    firstActivatedAt
    category
    group {
      id
      code
      name
      __typename
    }
    images {
      ... on Image {
        key
        mime
        width
        height
        thumbnailUrl(mode: THUMBNAIL, width: 800)
        url
        __typename
      }
      __typename
    }
    __typename
  }
}`;
    }

    /**
     * 下載 app.fans 媒體的所有圖片
     * @param {string} mediaUrl - app.fans 媒體 URL
     * @returns {Promise<Object>} - { success, filePaths[], error? }
     */
    async downloadMedia(mediaUrl) {
        try {
            const { groupCode, mediaSlug } = this._extractFromUrl(mediaUrl);
            if (!groupCode || !mediaSlug) {
                throw new Error('無法從 URL 提取 groupCode 或 mediaSlug');
            }

            console.log(`[LOG][AppFans] 開始下載: ${mediaUrl} (group: ${groupCode}, slug: ${mediaSlug})`);

            // 取得 clip 資料
            const clipData = await this._fetchClipDetails(mediaSlug);
            if (!clipData) {
                throw new Error('無法取得 clip 資料');
            }

            // 檢查是否為 premium 限定
            if (clipData.isPremiumOnly) {
                console.log('[LOG][AppFans] 此內容為 Premium 限定，可能無法取得完整媒體');
            }

            // 提取圖片項目
            const mediaItems = this._extractMediaItems(clipData, groupCode);
            if (!mediaItems || mediaItems.length === 0) {
                throw new Error('沒有找到圖片');
            }

            console.log(`[LOG][AppFans] 找到 ${mediaItems.length} 張圖片`);

            // 決定儲存資料夾名稱：優先用 clip title，fallback 用 mediaSlug
            const folderName = this._getFolderName(clipData.title, mediaSlug);

            // 下載所有圖片
            const filePaths = [];
            for (const item of mediaItems) {
                const filePath = await this._downloadFile(item.url, item.filename, folderName);
                if (filePath) {
                    filePaths.push(filePath);
                }
            }

            if (filePaths.length === 0) {
                throw new Error('所有圖片下載失敗');
            }

            return { success: true, filePaths };
        } catch (error) {
            console.error('[ERROR][AppFans] 下載失敗:', error.message);
            return { success: false, error: error.message, filePaths: [] };
        }
    }

    /**
     * 從 URL 提取 groupCode 和 mediaSlug
     * @private
     */
    _extractFromUrl(url) {
        const match = url.match(/app\.fans\/community\/([\w-]+)\/media\/([\w-]+)/);
        if (!match) return { groupCode: null, mediaSlug: null };
        return { groupCode: match[1], mediaSlug: match[2] };
    }

    /**
     * 呼叫 ClipDetails GraphQL API
     * @private
     */
    async _fetchClipDetails(mediaSlug) {
        try {
            const body = JSON.stringify({
                operationName: 'ClipDetails',
                variables: { mediaSlug },
                query: this.clipDetailsQuery
            });

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': '*/*',
                    'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Referer': 'https://app.fans/',
                    'Content-Type': 'application/json',
                    'j-language': 'zh',
                    'j-guid': crypto.randomUUID(),
                    'j-timezone': 'Asia/Taipei',
                    'j-context': 'web',
                    'j-client-version': '2.2614.2',
                    'j-country-code': 'TW',
                    'j-operation-type': 'query',
                    'Origin': 'https://app.fans',
                    'DNT': '1',
                    'Connection': 'keep-alive',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-site',
                },
                body
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const clip = data?.data?.clip;

            if (!clip) {
                console.error('[ERROR][AppFans] API 回應中沒有 clip 資料');
                return null;
            }

            return clip;
        } catch (error) {
            console.error('[ERROR][AppFans] API 請求失敗:', error.message);
            return null;
        }
    }

    /**
     * 從 clip 資料中提取圖片項目
     * @private
     */
    _extractMediaItems(clipData, groupCode) {
        const items = [];

        if (!clipData.images || !Array.isArray(clipData.images) || clipData.images.length === 0) {
            return items;
        }

        const dateStr = this._formatDate(clipData.firstActivatedAt);
        const clipId = clipData.id || 'unknown';

        for (let i = 0; i < clipData.images.length; i++) {
            const image = clipData.images[i];

            // 優先使用 url（已是完整解析度），fallback 用 thumbnailUrl 轉換
            let imageUrl = image.url;
            if (!imageUrl && image.thumbnailUrl) {
                imageUrl = this._convertToFullResolution(image.thumbnailUrl);
            }
            if (!imageUrl && image.key) {
                // 最後手段：用 key 組裝 URL
                imageUrl = `https://img.app.fans/${image.key}`;
            }

            if (!imageUrl) continue;

            // 若 url 本身帶有 resize hash，也做轉換
            imageUrl = this._convertToFullResolution(imageUrl);

            const ext = this._getExtFromUrl(imageUrl, '.jpg');
            // 從 URL 取得原始檔名 stem（最後一個 / 到副檔名之間的部分）
            const urlStem = this._getFilenameStem(imageUrl);
            const filename = `${groupCode}_${dateStr}_${clipId}_${ i + 1 }_${urlStem}${ext}`;

            items.push({
                url: imageUrl,
                filename,
                type: 'image',
                width: image.width,
                height: image.height,
            });
        }

        return items;
    }

    /**
     * 將圖片 URL 轉換為最高畫質版本
     * 移除 URL 中間的 resize hash 段和 query string
     *
     * 範例:
     * 輸入: https://img.app.fans/ad/gAAAAABp.../f576...hash.../375197...filename.jpg?800x0t
     * 輸出: https://img.app.fans/ad/gAAAAABp.../375197...filename.jpg
     *
     * URL 結構: https://img.app.fans/{可能有 ad/}{key}/{可能有 resize_hash/}{filename}{可能有 ?query}
     * - key: gAAAAA 開頭的加密 token
     * - resize_hash: 中間那段長 hex（用於指定尺寸），需移除
     * - filename: 最後一段 hex.ext
     * @private
     */
    _convertToFullResolution(url) {
        if (!url) return url;

        // 移除 query string
        let cleanUrl = url.split('?')[0];

        // 解析 URL 路徑段
        try {
            const urlObj = new URL(cleanUrl);
            const pathParts = urlObj.pathname.split('/').filter(p => p);

            // 找出 key 段（gAAAAA 開頭）和 filename 段（最後帶副檔名的）
            // 路徑可能是:
            //   /key/hash/filename.ext (3 段，需移除 hash)
            //   /ad/key/hash/filename.ext (4 段，需移除 hash)
            //   /key/filename.ext (2 段，已是完整)
            //   /ad/key/filename.ext (3 段，已是完整)

            // 找到 key 的位置（gAAAAA 開頭）
            let keyIndex = -1;
            for (let i = 0; i < pathParts.length; i++) {
                if (pathParts[i].startsWith('gAAAAA')) {
                    keyIndex = i;
                    break;
                }
            }

            if (keyIndex === -1) {
                // 沒找到 key，原樣回傳
                return cleanUrl;
            }

            // filename 是最後一段（帶副檔名）
            const filenameIndex = pathParts.length - 1;

            // 如果 key 和 filename 之間有多餘的段（resize hash），移除它們
            if (filenameIndex - keyIndex > 1) {
                // 保留 key 之前的段 + key + filename
                const newParts = [
                    ...pathParts.slice(0, keyIndex + 1),
                    pathParts[filenameIndex]
                ];
                return `${urlObj.origin}/${newParts.join('/')}`;
            }

            return cleanUrl;
        } catch (e) {
            // URL 解析失敗，直接移除 query string 回傳
            return cleanUrl;
        }
    }

    /**
     * 決定儲存資料夾名稱
     * 優先使用 clip title（清理不合法字元），fallback 用 mediaSlug
     * @private
     */
    _getFolderName(title, mediaSlug) {
        if (title && title.trim()) {
            const sanitized = this._sanitizeFolderName(title.trim());
            if (sanitized) {
                return sanitized;
            }
        }
        return mediaSlug;
    }

    /**
     * 清理資料夾名稱中不合法的字元
     * 保留 emoji 和一般 Unicode，移除 Windows 不允許的字元
     * @private
     */
    _sanitizeFolderName(name) {
        // 移除 Windows 不允許的檔名字元: < > : " / \ | ? *
        // 以及控制字元 (0x00-0x1F)
        let sanitized = name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '');
        // 移除頭尾空白和點號（Windows 不允許資料夾名稱以點號結尾）
        sanitized = sanitized.trim().replace(/\.+$/, '');
        return sanitized || null;
    }

    /**
     * 格式化日期為 YYMMDD
     * @private
     */
    _formatDate(dateStr) {
        if (!dateStr) return 'unknown';
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return 'unknown';
            const y = String(date.getFullYear()).slice(-2);
            const m = String(date.getMonth() + 1).padStart(2, '0');
            const d = String(date.getDate()).padStart(2, '0');
            return `${y}${m}${d}`;
        } catch {
            return 'unknown';
        }
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
            if (['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(ext)) {
                return ext;
            }
        }
        return fallback;
    }

    /**
     * 從 URL 取得檔名 stem（不含副檔名）
     * 例: .../375197e3fe434292e35af615a634e66333b28f8a.jpg → 375197e3fe434292e35af615a634e66333b28f8a
     * @private
     */
    _getFilenameStem(url) {
        if (!url) return 'unknown';
        const cleanUrl = url.split('?')[0];
        const lastSegment = cleanUrl.split('/').pop() || 'unknown';
        const dotIndex = lastSegment.lastIndexOf('.');
        return dotIndex !== -1 ? lastSegment.slice(0, dotIndex) : lastSegment;
    }

    /**
     * 下載單一檔案到本地
     * @private
     */
    async _downloadFile(url, filename, folderName) {
        try {
            const outputDir = path.join(this.baseDirectory, folderName);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const filePath = path.join(outputDir, filename);

            // 如果檔案已存在，直接回傳
            if (fs.existsSync(filePath)) {
                console.log(`[LOG][AppFans] 檔案已存在: ${filename}`);
                return filePath;
            }

            console.log(`[LOG][AppFans] 下載中: ${filename}`);

            const response = await fetch(url, {
                headers: {
                    'User-Agent': this.userAgent,
                    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                    'Referer': 'https://app.fans/',
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

            console.log(`[LOG][AppFans] 下載完成: ${filename}`);
            return filePath;
        } catch (error) {
            console.error(`[ERROR][AppFans] 下載檔案失敗 ${filename}:`, error.message);
            return null;
        }
    }
}

module.exports = AppFansDownloader;
