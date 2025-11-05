const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

/**
 * 下載快取資料庫管理
 * 用於儲存已下載的媒體資訊，避免重複下載
 */
class DownloadCache {
    constructor(dbPath = './download_cache.db') {
        this.dbPath = dbPath;
        this.db = null;
        this._initialize();
    }

    /**
     * 初始化資料庫
     * @private
     */
    _initialize() {
        try {
            // 確保目錄存在
            const dir = path.dirname(this.dbPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // 使用 better-sqlite3 同步 API
            this.db = new Database(this.dbPath);

            // 啟用 WAL 模式以提高性能
            this.db.pragma('journal_mode = WAL');

            this._createTable();
        } catch (err) {
            console.error('[ERROR] 無法開啟資料庫:', err);
        }
    }

    /**
     * 創建資料表
     * @private
     */
    _createTable() {
        try {
            const sql = `
                CREATE TABLE IF NOT EXISTS downloads (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    url TEXT UNIQUE NOT NULL,
                    file_paths TEXT NOT NULL,
                    file_ids TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    last_accessed DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `;

            this.db.exec(sql);
        } catch (err) {
            console.error('[ERROR] 無法創建資料表:', err);
        }
    }

    /**
     * 檢查 URL 是否應該被快取
     * Instagram Stories 沒有編號的不快取
     * @param {string} url - 完整 URL
     * @returns {boolean}
     */
    shouldCache(url) {
        // Instagram Stories 沒有特定貼文 ID 的不快取
        const storiesPattern = /^https:\/\/www\.instagram\.com\/stories\/[\w.-]+\/?$/;
        return !storiesPattern.test(url);
    }

    /**
     * 移除 URL 的 query string
     * @param {string} url - 完整 URL
     * @returns {string} 不含 query string 的 URL
     */
    cleanUrl(url) {
        return url.split('?')[0];
    }

    /**
     * 查詢快取（同步版本）
     * @param {string} url - 完整 URL
     * @returns {Object|null} 快取資料 { url, file_paths: [], file_ids: [] } 或 null
     */
    get(url) {
        if (!this.shouldCache(url)) {
            return null;
        }

        const cleanedUrl = this.cleanUrl(url);

        try {
            const stmt = this.db.prepare('SELECT * FROM downloads WHERE url = ?');
            const row = stmt.get(cleanedUrl);

            if (row) {
                // 解析 JSON 陣列
                let filePaths = [];
                let fileIds = [];

                try {
                    filePaths = JSON.parse(row.file_paths || '[]');
                    fileIds = row.file_ids ? JSON.parse(row.file_ids) : [];
                } catch (parseErr) {
                    console.error('[ERROR] 解析快取資料失敗:', parseErr);
                    this.delete(cleanedUrl);
                    return null;
                }

                // 檢查所有檔案是否都存在
                const allFilesExist = filePaths.every(fp => fs.existsSync(fp));

                if (allFilesExist && filePaths.length > 0) {
                    // 更新最後訪問時間
                    this._updateLastAccessed(cleanedUrl);

                    console.log(`[LOG][Cache HIT] ${cleanedUrl} (${filePaths.length} 個檔案)`);
                    return {
                        url: row.url,
                        file_paths: filePaths,
                        file_ids: fileIds,
                        created_at: row.created_at,
                        last_accessed: row.last_accessed
                    };
                } else {
                    console.log(`[LOG][Cache MISS - File Not Found] ${cleanedUrl}`);
                    // 檔案不存在，刪除快取記錄
                    this.delete(cleanedUrl);
                    return null;
                }
            } else {
                console.log(`[LOG][Cache MISS] ${cleanedUrl}`);
                return null;
            }
        } catch (err) {
            console.error('[ERROR] 查詢快取失敗:', err);
            return null;
        }
    }

    /**
     * 儲存快取（同步版本，支援多檔案）
     * @param {string} url - 完整 URL
     * @param {string|Array<string>} filePaths - 本地檔案路徑或路徑陣列
     * @param {string|Array<string>} fileIds - Telegram file ID 或 ID 陣列 (可選)
     */
    set(url, filePaths, fileIds = null) {
        if (!this.shouldCache(url)) {
            return;
        }

        const cleanedUrl = this.cleanUrl(url);

        // 確保都是陣列格式
        const pathArray = Array.isArray(filePaths) ? filePaths : [filePaths];
        const idArray = fileIds ? (Array.isArray(fileIds) ? fileIds : [fileIds]) : [];

        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO downloads (url, file_paths, file_ids, last_accessed)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `);

            stmt.run(
                cleanedUrl,
                JSON.stringify(pathArray),
                idArray.length > 0 ? JSON.stringify(idArray) : null
            );
        } catch (err) {
            console.error('[ERROR] 儲存快取失敗:', err);
        }
    }

    /**
     * 更新 fileIds（上傳到 Telegram 後）
     * @param {string} url - 完整 URL
     * @param {string|Array<string>} fileIds - Telegram file ID 或 ID 陣列
     */
    updateFileIds(url, fileIds) {
        if (!this.shouldCache(url)) {
            return;
        }

        const cleanedUrl = this.cleanUrl(url);
        const idArray = Array.isArray(fileIds) ? fileIds : [fileIds];

        try {
            const stmt = this.db.prepare(`
                UPDATE downloads
                SET file_ids = ?, last_accessed = CURRENT_TIMESTAMP
                WHERE url = ?
            `);

            stmt.run(JSON.stringify(idArray), cleanedUrl);
            console.log(`[LOG][Cache UPDATE] ${cleanedUrl} -> ${idArray.length} 個 fileId`);
        } catch (err) {
            console.error('[ERROR] 更新 fileIds 失敗:', err);
        }
    }

    /**
     * 更新單一 fileId（向後兼容）
     * @deprecated 請使用 updateFileIds
     */
    updateFileId(url, fileId) {
        this.updateFileIds(url, [fileId]);
    }

    /**
     * 批量儲存快取（使用事務，支援同一 URL 的多個檔案）
     * @param {string} url - URL
     * @param {Array<string>} filePaths - 檔案路徑陣列
     * @param {Array<string>} fileIds - Telegram file ID 陣列 (可選)
     */
    setBatch(url, filePaths, fileIds = null) {
        if (!this.shouldCache(url)) {
            return;
        }

        const cleanedUrl = this.cleanUrl(url);
        const pathArray = Array.isArray(filePaths) ? filePaths : [filePaths];
        const idArray = fileIds ? (Array.isArray(fileIds) ? fileIds : [fileIds]) : [];

        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO downloads (url, file_paths, file_ids, last_accessed)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            `);

            stmt.run(
                cleanedUrl,
                JSON.stringify(pathArray),
                idArray.length > 0 ? JSON.stringify(idArray) : null
            );
        } catch (err) {
            console.error('[ERROR] 批量儲存快取失敗:', err);
        }
    }

    /**
     * 刪除快取（同步版本）
     * @param {string} url - 完整 URL
     */
    delete(url) {
        const cleanedUrl = this.cleanUrl(url);

        try {
            const stmt = this.db.prepare('DELETE FROM downloads WHERE url = ?');
            stmt.run(cleanedUrl);
            console.log(`[LOG][Cache DELETE] ${cleanedUrl}`);
        } catch (err) {
            console.error('[ERROR] 刪除快取失敗:', err);
        }
    }

    /**
     * 更新最後訪問時間
     * @private
     * @param {string} url - 不含 query string 的 URL
     */
    _updateLastAccessed(url) {
        try {
            const stmt = this.db.prepare('UPDATE downloads SET last_accessed = CURRENT_TIMESTAMP WHERE url = ?');
            stmt.run(url);
        } catch (err) {
            console.error('[ERROR] 更新訪問時間失敗:', err);
        }
    }

    /**
     * 清理舊快取
     * @param {number} daysOld - 保留天數（預設 30 天）
     * @returns {number} 清理的記錄數
     */
    cleanup(daysOld = 30) {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM downloads
                WHERE last_accessed < datetime('now', '-' || ? || ' days')
            `);

            const info = stmt.run(daysOld);
            console.log(`[LOG] 清理了 ${info.changes} 筆舊快取記錄`);
            return info.changes;
        } catch (err) {
            console.error('[ERROR] 清理快取失敗:', err);
            return 0;
        }
    }

    /**
     * 獲取快取統計
     * @returns {Object}
     */
    getStats() {
        try {
            const stmt = this.db.prepare(`
                SELECT
                    COUNT(*) as total,
                    COUNT(CASE WHEN date(last_accessed) = date('now') THEN 1 END) as today_accessed
                FROM downloads
            `);

            return stmt.get();
        } catch (err) {
            console.error('[ERROR] 獲取統計失敗:', err);
            return { total: 0, today_accessed: 0 };
        }
    }

    /**
     * 關閉資料庫連接
     */
    close() {
        try {
            this.db.close();
            console.log('[LOG] 資料庫連接已關閉');
        } catch (err) {
            console.error('[ERROR] 關閉資料庫失敗:', err);
        }
    }
}

module.exports = DownloadCache;
