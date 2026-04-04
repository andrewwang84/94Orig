const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * 從 Firefox cookies.sqlite 提取指定 domain 的 cookies
 */
class FirefoxCookies {
    constructor(profilePath = null) {
        this.profilePath = profilePath || this._findDefaultProfile();
    }

    /**
     * 自動尋找 Firefox 預設 profile 目錄
     * @private
     * @returns {string|null}
     */
    _findDefaultProfile() {
        const appData = process.env.APPDATA;
        if (!appData) return null;

        const profilesDir = path.join(appData, 'Mozilla', 'Firefox', 'Profiles');
        if (!fs.existsSync(profilesDir)) return null;

        const entries = fs.readdirSync(profilesDir);
        // 優先從 profiles.ini 讀取 Install 區段的 Default
        const iniPath = path.join(appData, 'Mozilla', 'Firefox', 'profiles.ini');
        if (fs.existsSync(iniPath)) {
            const ini = fs.readFileSync(iniPath, 'utf-8');
            const installMatch = ini.match(/\[Install[^\]]*\]\s*\nDefault=Profiles\/(.+)/m);
            if (installMatch) {
                const matched = installMatch[1].trim();
                const found = entries.find(e => e === matched);
                if (found) return path.join(profilesDir, found);
            }
        }
        // fallback: 包含 .default-release，其次 .default
        const profile = entries.find(e => e.includes('.default-release'))
            || entries.find(e => e.endsWith('.default'));

        return profile ? path.join(profilesDir, profile) : null;
    }

    /**
     * 取得指定 hostname 的 cookie 字串（Cookie header 格式）
     * 會自動包含所有父域名的 cookie
     * @param {string} hostname - 例如 'www.w.oncejapan.com'
     * @returns {string} cookie header 字串
     */
    getCookiesForDomain(hostname) {
        if (!this.profilePath) {
            console.error('[ERROR][FirefoxCookies] 找不到 Firefox profile 目錄');
            return '';
        }

        const cookiesDb = path.join(this.profilePath, 'cookies.sqlite');
        if (!fs.existsSync(cookiesDb)) {
            console.error('[ERROR][FirefoxCookies] 找不到 cookies.sqlite:', cookiesDb);
            return '';
        }

        // 複製到臨時檔避免鎖定
        const tmpDb = path.join(os.tmpdir(), `firefox_cookies_${Date.now()}.sqlite`);
        try {
            fs.copyFileSync(cookiesDb, tmpDb);

            // 也複製 WAL 和 SHM 檔案（如果存在）
            const walFile = cookiesDb + '-wal';
            const shmFile = cookiesDb + '-shm';
            if (fs.existsSync(walFile)) {
                fs.copyFileSync(walFile, tmpDb + '-wal');
            }
            if (fs.existsSync(shmFile)) {
                fs.copyFileSync(shmFile, tmpDb + '-shm');
            }

            const db = new Database(tmpDb, { readonly: true });

            // 建立所有可能匹配的 host 清單（含所有父域名）
            const bareName = hostname.startsWith('.') ? hostname.slice(1) : hostname;
            const hosts = [bareName, '.' + bareName];
            const parts = bareName.split('.');
            for (let i = 1; i < parts.length - 1; i++) {
                const parent = parts.slice(i).join('.');
                hosts.push(parent);
                hosts.push('.' + parent);
            }

            const now = Math.floor(Date.now() / 1000);
            const placeholders = hosts.map(() => '?').join(',');
            const stmt = db.prepare(`
                SELECT name, value FROM moz_cookies
                WHERE host IN (${placeholders})
                AND (expiry > ? OR expiry = 0)
            `);

            const rows = stmt.all(...hosts, now);
            db.close();

            // 去除重複 cookie name（子域名優先）
            const seen = new Set();
            const unique = rows.filter(r => {
                if (seen.has(r.name)) return false;
                seen.add(r.name);
                return true;
            });
            const cookieStr = unique.map(r => `${r.name}=${r.value}`).join('; ');
            if (cookieStr) {
                console.log(`[LOG][FirefoxCookies] ${bareName}: 取得 ${unique.length} 個 cookie`);
            } else {
                console.warn(`[WARN][FirefoxCookies] ${bareName}: 沒有找到有效 cookie`);
            }
            return cookieStr;
        } catch (err) {
            console.error('[ERROR][FirefoxCookies] 提取 cookie 失敗:', err.message);
            return '';
        } finally {
            // 清理臨時檔
            try {
                if (fs.existsSync(tmpDb)) fs.unlinkSync(tmpDb);
                if (fs.existsSync(tmpDb + '-wal')) fs.unlinkSync(tmpDb + '-wal');
                if (fs.existsSync(tmpDb + '-shm')) fs.unlinkSync(tmpDb + '-shm');
            } catch (e) { /* ignore cleanup errors */ }
        }
    }

    /**
     * 取得所有 ONCE JAPAN 相關站點的 cookies
     * @returns {{ wMember: string, onceJapan: string, spTwice: string }}
     */
    getAllOjCookies() {
        return {
            wMember: this.getCookiesForDomain('www.w.oncejapan.com'),
            onceJapan: this.getCookiesForDomain('oncejapan.com'),
            spTwice: this.getCookiesForDomain('sp.twicejapan.com'),
        };
    }
}

module.exports = FirefoxCookies;
