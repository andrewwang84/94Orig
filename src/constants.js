/**
 * 媒體類型常數
 */
const MEDIA_TYPES = {
    IG_NORMAL: 1,
    IG_STORY: 2,
    X: 3,
    YT: 4,
    STREAM: 5,
    M3U8: 6,
    NAVER: 7
};

/**
 * 媒體類型對應的文字描述
 */
const MEDIA_TYPE_LABELS = {
    [MEDIA_TYPES.IG_NORMAL]: 'IG',
    [MEDIA_TYPES.IG_STORY]: 'IG Story',
    [MEDIA_TYPES.X]: 'X',
    [MEDIA_TYPES.YT]: 'YT',
    [MEDIA_TYPES.STREAM]: 'STREAM',
    [MEDIA_TYPES.M3U8]: 'M3U8',
    [MEDIA_TYPES.NAVER]: 'IMG'
};

/**
 * URL 匹配模式
 */
const URL_PATTERNS = {
    [MEDIA_TYPES.IG_NORMAL]: /https:\/\/www\.instagram\.com\/(?:[\w-]+\/)?(?:p|reel)\/[\w-]+\/?/g,
    [MEDIA_TYPES.IG_STORY]: /https:\/\/www\.instagram\.com\/stories\/[\w.-]+(?:\/[\w-]+)?\/?/g,
    [MEDIA_TYPES.X]: /https:\/\/x\.com\/[\w-]+\/status\/[\d]+\/?/g,
    [MEDIA_TYPES.YT]: /https:\/\/(?:www\.youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/g,
    [MEDIA_TYPES.STREAM]: /https:\/\/(?:www\.)?(kick\.com|twitch\.tv)\/([\w-]+)/g,
    [MEDIA_TYPES.M3U8]: /https:\/\/.+\.m3u8/g,
    [MEDIA_TYPES.NAVER]: /https:\/\/blog\.naver\.com\/\S+\/\d+/g
};

/**
 * 進度條 Emoji
 */
const PROGRESS_EMOJI = {
    DONE: '🟩',
    UNDONE: '⬜️'
};

/**
 * 並發下載限制
 */
const DOWNLOAD_LIMITS = {
    VIDEO: 2,
    STREAM: 1
};

module.exports = {
    MEDIA_TYPES,
    MEDIA_TYPE_LABELS,
    URL_PATTERNS,
    PROGRESS_EMOJI,
    DOWNLOAD_LIMITS
};
