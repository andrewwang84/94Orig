const { MEDIA_TYPES, MEDIA_TYPE_LABELS, URL_PATTERNS } = require('./constants');

/**
 * URL 解析器
 */
class UrlParser {
    /**
     * 從消息中解析 URL
     * @param {string} message - 消息內容
     * @returns {Object} 解析結果 { imgTargets, vidTargets, streamTargets }
     */
    parse(message) {
        const imgTargets = {};
        const vidTargets = {};
        const streamTargets = {};

        for (const [type, regex] of Object.entries(URL_PATTERNS)) {
            const intType = parseInt(type);
            const typeTxt = MEDIA_TYPE_LABELS[intType];

            if (regex.test(message)) {
                const matches = message.match(regex);

                for (const target of matches) {
                    const data = this._createTargetData(intType, typeTxt, target);

                    // 根據類型分類
                    if (this._isImageType(intType)) {
                        imgTargets[target] = data;
                    } else if (this._isStreamType(intType)) {
                        streamTargets[target] = data;
                    } else {
                        vidTargets[target] = data;
                    }
                }
            }
        }

        return { imgTargets, vidTargets, streamTargets };
    }

    /**
     * 創建目標數據對象
     * @private
     */
    _createTargetData(type, typeTxt, target) {
        return {
            type: type,
            typeTxt: typeTxt,
            target: target,
            isDone: false,
            data: []
        };
    }

    /**
     * 檢查是否為圖片類型
     * @private
     */
    _isImageType(type) {
        return type === MEDIA_TYPES.IG_NORMAL ||
               type === MEDIA_TYPES.IG_STORY ||
               type === MEDIA_TYPES.X ||
               type === MEDIA_TYPES.NAVER ||
               type === MEDIA_TYPES.TIKTOK_OTHER;
    }

    /**
     * 檢查是否為直播類型
     * @private
     */
    _isStreamType(type) {
        return type === MEDIA_TYPES.STREAM ||
               type === MEDIA_TYPES.M3U8 ||
               type === MEDIA_TYPES.TIKTOK_LIVE ||
               type === MEDIA_TYPES.TWITCH_LIVE;
    }

    /**
     * 檢查消息中是否有支援的 URL
     * @param {Object} parseResult - 解析結果
     * @returns {boolean}
     */
    hasValidUrls(parseResult) {
        const { imgTargets, vidTargets, streamTargets } = parseResult;
        return Object.keys(imgTargets).length > 0 ||
               Object.keys(vidTargets).length > 0 ||
               Object.keys(streamTargets).length > 0;
    }
}

module.exports = UrlParser;
