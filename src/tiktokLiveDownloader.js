'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { sleep } = require('./utils');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';
const REFERER = 'https://www.tiktok.com/';

// 直播間狀態
const ROOM_STATUS_LIVE = 2;

// flv_pull_url 備援時的畫質優先序
const FLV_QUALITY_ORDER = ['FULL_HD1', 'HD1', 'SD2', 'SD1'];

// 連續快速失敗達此次數即中止（避免無限重試）
const MAX_FAST_FAILURES = 3;
// ffmpeg 執行不足此秒數視為快速失敗
const FAST_FAILURE_SECONDS = 15;

/**
 * TikTok 直播下載器
 * 流程: username → api-live/user/room 取得 room_id
 *       → webcast/room/info 取得串流連結（HEVC > H264，m3u8 > flv）
 *       → ffmpeg 錄製 .ts，結束後 remux 成 .mp4
 */
class TikTokLiveDownloader {
    constructor(downloadDir) {
        this.downloadDir = downloadDir;
        this.stopping = false;
    }

    /** 收到 Ctrl+C 時呼叫：讓當前 ffmpeg 結束後不再重連 */
    requestStop() {
        this.stopping = true;
    }

    async _apiGet(url) {
        const res = await fetch(url, {
            headers: { 'User-Agent': UA, 'Referer': REFERER },
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} for ${url}`);
        }
        return res.json();
    }

    /**
     * 解析輸入來源，取得 username 或 room_id
     * 支援: @username / username / 直播網址 / 純數字 room_id
     */
    parseInput(input) {
        if (/^\d{15,}$/.test(input)) {
            return { roomId: input, username: null };
        }
        const urlMatch = input.match(/tiktok\.com\/@([^\/\?]+)/i);
        if (urlMatch) {
            return { roomId: null, username: urlMatch[1] };
        }
        return { roomId: null, username: input.replace(/^@/, '') };
    }

    /**
     * 由 username 查詢 room_id 與直播狀態
     */
    async resolveRoomId(username) {
        const url = `https://www.tiktok.com/api-live/user/room/?aid=1988&sourceType=54&uniqueId=${encodeURIComponent(username)}`;
        const json = await this._apiGet(url);
        const user = json?.data?.user;
        if (!user || !user.roomId) {
            throw new Error(`查無用戶或未開播: @${username}`);
        }
        return { roomId: user.roomId, status: user.status };
    }

    /**
     * 取得直播間資訊
     */
    async fetchRoomInfo(roomId) {
        // device_type=web_h265 會解鎖完整畫質階梯（origin/uhd 1080p、HEVC、HLS）
        const url = `https://webcast.tiktok.com/webcast/room/info/?aid=1988&room_id=${roomId}&device_type=web_h265`;
        const json = await this._apiGet(url);
        if (json.status_code !== 0 || !json.data) {
            throw new Error(`room/info 回應異常 (status_code=${json.status_code})`);
        }
        return json.data;
    }

    _isHevc(vcodec) {
        const c = (vcodec || '').toLowerCase();
        return c.includes('265') || c.includes('bytevc');
    }

    /**
     * 從 stream_url 挑選最佳串流連結
     * 優先級: 畫質（解析度）> HEVC > H264 > m3u8 > flv，最後以位元率決勝
     * @returns {{url: string, format: string, codec: string, quality: string}|null}
     */
    selectStream(streamUrl) {
        if (!streamUrl) return null;

        // 1. 首選 live_core_sdk_data.pull_data.stream_data（含編碼資訊）
        const rawStreamData = streamUrl.live_core_sdk_data?.pull_data?.stream_data;
        if (rawStreamData) {
            try {
                const candidates = [];
                const data = JSON.parse(rawStreamData).data || {};
                for (const [quality, entry] of Object.entries(data)) {
                    if (quality === 'ao') continue; // 純音訊
                    const main = entry.main || {};
                    if (!main.hls && !main.flv) continue;
                    let sdkParams = {};
                    try { sdkParams = JSON.parse(main.sdk_params || '{}'); } catch (e) {}
                    const resolution = sdkParams.resolution || '';
                    const resMatch = resolution.match(/(\d+)x(\d+)/);
                    candidates.push({
                        quality,
                        hls: main.hls || null,
                        flv: main.flv || null,
                        isHevc: this._isHevc(sdkParams.VCodec),
                        vbitrate: sdkParams.vbitrate || 0,
                        resolution,
                        pixels: resMatch ? parseInt(resMatch[1], 10) * parseInt(resMatch[2], 10) : 0,
                    });
                }

                if (candidates.length > 0) {
                    // 畫質（像素數）> HEVC > m3u8 > 位元率
                    candidates.sort((a, b) => {
                        if (a.pixels !== b.pixels) return b.pixels - a.pixels;
                        if (a.isHevc !== b.isHevc) return a.isHevc ? -1 : 1;
                        if (!!a.hls !== !!b.hls) return a.hls ? -1 : 1;
                        return b.vbitrate - a.vbitrate;
                    });
                    const best = candidates[0];
                    return {
                        url: best.hls || best.flv,
                        format: best.hls ? 'm3u8' : 'flv',
                        codec: best.isHevc ? 'hevc' : 'h264',
                        quality: `${best.quality}${best.resolution ? ' ' + best.resolution : ''}`,
                    };
                }
            } catch (err) {
                console.error(`[ERROR][TTLIVE] stream_data 解析失敗: ${err.message}`);
            }
        }

        // 2. 備援: hls_pull_url > flv_pull_url
        if (streamUrl.hls_pull_url) {
            return { url: streamUrl.hls_pull_url, format: 'm3u8', codec: 'h264', quality: 'default' };
        }
        const flvMap = streamUrl.flv_pull_url || {};
        for (const key of FLV_QUALITY_ORDER) {
            if (flvMap[key]) {
                return { url: flvMap[key], format: 'flv', codec: 'h264', quality: key };
            }
        }
        const firstFlv = Object.values(flvMap)[0];
        if (firstFlv) {
            return { url: firstFlv, format: 'flv', codec: 'h264', quality: 'unknown' };
        }

        return null;
    }

    _dateStamp() {
        const d = new Date();
        const pad = (n) => String(n).padStart(2, '0');
        return `${String(d.getFullYear()).slice(-2)}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
    }

    /**
     * 產生輸出檔路徑: <YYMMDD>_<頻道名>_tiktok.ts
     * 同名檔案（含 .mp4）已存在時自動加 _2, _3... 序號
     */
    _buildOutputPath(owner) {
        const safeOwner = String(owner).replace(/[\/\\:*?"<>|\s]/g, '_');
        const base = `${this._dateStamp()}_${safeOwner}_tiktok`;
        let name = base;
        for (let i = 2; ; i++) {
            const tsPath = path.join(this.downloadDir, `${name}.ts`);
            const mp4Path = path.join(this.downloadDir, `${name}.mp4`);
            if (!fs.existsSync(tsPath) && !fs.existsSync(mp4Path)) {
                return tsPath;
            }
            name = `${base}_${i}`;
        }
    }

    /**
     * 以 ffmpeg 錄製串流到 .ts（中斷也不會壞檔）
     * @returns {Promise<number>} ffmpeg exit code
     */
    _runFfmpeg(streamUrl, tsPath) {
        return new Promise((resolve, reject) => {
            const args = [
                '-hide_banner',
                '-loglevel', 'warning',
                '-stats',
                '-user_agent', UA,
                '-headers', `Referer: ${REFERER}\r\n`,
                '-reconnect', '1',
                '-reconnect_streamed', '1',
                '-reconnect_delay_max', '5',
                '-rw_timeout', '15000000',
                '-i', streamUrl,
                '-c', 'copy',
                '-f', 'mpegts',
                tsPath,
            ];

            console.log(`[LOG][TTLIVE] 開始錄製: ${tsPath}`);
            console.log('[LOG][TTLIVE] 按 q 或 Ctrl+C 停止錄製');
            const proc = spawn('ffmpeg', args, { stdio: 'inherit' });

            proc.on('close', (code) => resolve(code));
            proc.on('error', (err) => reject(new Error(`ffmpeg 啟動失敗: ${err.message}`)));
        });
    }

    /**
     * remux .ts → .mp4，成功後刪除 .ts
     * @returns {Promise<string>} 最終檔案路徑
     */
    _remuxToMp4(tsPath) {
        return new Promise((resolve) => {
            const mp4Path = tsPath.replace(/\.ts$/, '.mp4');
            const args = [
                '-hide_banner', '-loglevel', 'error', '-y',
                '-i', tsPath,
                '-c', 'copy',
                '-movflags', '+faststart',
                mp4Path,
            ];

            const proc = spawn('ffmpeg', args, { stdio: 'inherit' });
            proc.on('close', (code) => {
                if (code === 0 && fs.existsSync(mp4Path) && fs.statSync(mp4Path).size > 0) {
                    fs.unlinkSync(tsPath);
                    console.log(`[LOG][TTLIVE] 轉封裝完成: ${mp4Path}`);
                    resolve(mp4Path);
                } else {
                    console.error('[ERROR][TTLIVE] 轉封裝失敗，保留原始 .ts 檔');
                    resolve(tsPath);
                }
            });
            proc.on('error', () => {
                console.error('[ERROR][TTLIVE] 轉封裝失敗，保留原始 .ts 檔');
                resolve(tsPath);
            });
        });
    }

    /**
     * 主流程：解析輸入 → 錄製直到直播結束或使用者中止
     * 直播中斷（ffmpeg 退出但直播間仍在線）會自動重連續錄新檔
     * @returns {Promise<Array<{file: string, success: boolean}>>}
     */
    async run(input) {
        const { roomId: inputRoomId, username } = this.parseInput(input);

        let roomId = inputRoomId;
        if (!roomId) {
            console.log(`[LOG][TTLIVE] 查詢 @${username} 的直播間...`);
            const resolved = await this.resolveRoomId(username);
            roomId = resolved.roomId;
            if (resolved.status !== ROOM_STATUS_LIVE) {
                throw new Error(`@${username} 目前未開播 (status=${resolved.status})`);
            }
        }
        console.log(`[LOG][TTLIVE] room_id: ${roomId}`);

        const results = [];
        let fastFailures = 0;

        while (!this.stopping) {
            const roomInfo = await this.fetchRoomInfo(roomId);
            if (roomInfo.status !== ROOM_STATUS_LIVE) {
                console.log(`[LOG][TTLIVE] 直播已結束 (status=${roomInfo.status})`);
                break;
            }

            const stream = this.selectStream(roomInfo.stream_url);
            if (!stream) {
                throw new Error('找不到可用的串流連結');
            }
            console.log(`[LOG][TTLIVE] 標題: ${roomInfo.title || '(無標題)'}`);
            console.log(`[LOG][TTLIVE] 串流: codec=${stream.codec} format=${stream.format} quality=${stream.quality}`);
            console.log(`[LOG][TTLIVE] URL: ${stream.url}`);

            const owner = roomInfo.owner?.display_id || username || roomId;
            const tsPath = this._buildOutputPath(owner);

            const startedAt = Date.now();
            const code = await this._runFfmpeg(stream.url, tsPath);
            const elapsedSec = (Date.now() - startedAt) / 1000;
            console.log(`[LOG][TTLIVE] ffmpeg 結束 (code=${code}, 錄製 ${Math.round(elapsedSec)}s)`);

            if (fs.existsSync(tsPath) && fs.statSync(tsPath).size > 0) {
                const finalPath = await this._remuxToMp4(tsPath);
                results.push({ file: finalPath, success: true });
            } else {
                if (fs.existsSync(tsPath)) fs.unlinkSync(tsPath);
                results.push({ file: tsPath, success: false });
            }

            if (this.stopping) break;

            // 快速失敗保護：連線一直失敗就中止
            if (elapsedSec < FAST_FAILURE_SECONDS) {
                fastFailures++;
                if (fastFailures >= MAX_FAST_FAILURES) {
                    console.error(`[ERROR][TTLIVE] 連續 ${MAX_FAST_FAILURES} 次快速失敗，中止`);
                    break;
                }
            } else {
                fastFailures = 0;
            }

            // 直播可能只是短暫中斷，稍等後確認狀態並重連
            console.log('[LOG][TTLIVE] 檢查直播是否仍在線...');
            await sleep(5000);
        }

        return results;
    }

    formatResults(results) {
        const lines = ['📺 TikTok 直播錄製結束'];
        if (results.length === 0) {
            lines.push('未產生任何錄影檔');
        }
        for (const r of results) {
            lines.push(`${r.success ? '✅' : '❌'} ${r.file}`);
        }
        return lines.join('\n');
    }
}

module.exports = TikTokLiveDownloader;
