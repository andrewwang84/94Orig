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
    NAVER: 7,
    TIKTOK_VIDEO: 8,
    TIKTOK_LIVE: 9,
    TWITCH_LIVE: 10,
    TIKTOK_OTHER: 11,  // 其他 TikTok 連結，使用 gallery-dl
    WEIBO: 12,  // Weibo 連結，使用 gallery-dl
    THREADS: 13,  // Threads 連結，使用自訂下載器
    KRSITE: 14,  // 韓國網站，使用 krsite-dl
    FACEBOOK: 15,  // Facebook，使用 gallery-dl
    PINTEREST: 16,  // Pinterest，使用 gallery-dl
    REDDIT: 17,  // Reddit，使用 gallery-dl
    APPFANS: 18  // app.fans，使用自訂下載器
};

/**
 * krsite-dl 支援的域名列表
 */
const KRSITE_DOMAINS = [
    'www.cosmopolitan.co.kr',
    'www.dazedkorea.com',
    'www.dispatch.co.kr',
    'www.elle.co.kr',
    'www.esquirekorea.co.kr',
    'www.genie.co.kr',
    'www.harpersbazaar.co.kr',
    'enews.imbc.com',
    'isplus.com',
    'tv.jtbc.co.kr',
    'k-odyssey.com',
    'www.lofficielkorea.com',
    'www.lofficielsingapore.com',
    'www.marieclairekorea.com',
    'with.mbc.co.kr',
    'www.melon.com',
    'nataliemu.com',
    'post.naver.com',
    'news.naver.com',
    'newsjamm.co.kr',
    'www.news1.kr',
    'www.newsen.com',
    'www.nonno.hpplus.jp',
    'mikan-incomplete.com',
    'osen.mt.co.kr',
    'programs.sbs.co.kr',
    'news.sbs.co.kr',
    'sbskpop.kr',
    'spur.hpplus.jp',
    'www.topstarnews.net',
    'tvreport.co.kr',
    'www.vivi.tv',
    'www.vogue.co.kr',
    'www.wkorea.com'
];

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
    [MEDIA_TYPES.NAVER]: 'IMG',
    [MEDIA_TYPES.TIKTOK_VIDEO]: 'TikTok Video',
    [MEDIA_TYPES.TIKTOK_LIVE]: 'TikTok Live',
    [MEDIA_TYPES.TWITCH_LIVE]: 'Twitch Live',
    [MEDIA_TYPES.TIKTOK_OTHER]: 'TikTok',
    [MEDIA_TYPES.WEIBO]: 'Weibo',
    [MEDIA_TYPES.THREADS]: 'Threads',
    [MEDIA_TYPES.KRSITE]: 'KRSite',
    [MEDIA_TYPES.FACEBOOK]: 'Facebook',
    [MEDIA_TYPES.PINTEREST]: 'Pinterest',
    [MEDIA_TYPES.REDDIT]: 'Reddit',
    [MEDIA_TYPES.APPFANS]: 'AppFans'
};

/**
 * 從 KRSITE_DOMAINS 動態建構 URL 正規表達式
 */
function _buildKrsiteRegex() {
    // 轉義域名中的點號，用 | 連接
    const domainPatterns = KRSITE_DOMAINS.map(d => d.replace(/\./g, '\\.'));
    // 加入 tistory.com 子域名模式（username.tistory.com）
    domainPatterns.push('[\\w-]+\\.tistory\\.com');
    return new RegExp(`https:\\/\\/(?:${domainPatterns.join('|')})\\/\\S*`, 'g');
}

/**
 * URL 匹配模式
 */
const URL_PATTERNS = {
    [MEDIA_TYPES.IG_NORMAL]: /https:\/\/www\.instagram\.com\/(?:[\w-]+\/)?(?:p|reels|reel)\/[\w-]+\/?/g,
    [MEDIA_TYPES.IG_STORY]: /https:\/\/www\.instagram\.com\/stories\/[\w.-]+(?:\/[\w-]+)?\/?/g,
    [MEDIA_TYPES.X]: /https:\/\/x\.com\/[\w-]+\/status\/[\d]+\/?/g,
    [MEDIA_TYPES.YT]: /https:\/\/(?:www\.youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)[\w-]+/g,
    [MEDIA_TYPES.STREAM]: /https:\/\/(?:www\.)?(kick\.com)\/([\w-]+)/g,
    [MEDIA_TYPES.M3U8]: /https:\/\/.+\.m3u8/g,
    [MEDIA_TYPES.NAVER]: /https:\/\/blog\.naver\.com\/\S+\/\d+/g,
    [MEDIA_TYPES.TIKTOK_VIDEO]: /https:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/g,
    [MEDIA_TYPES.TIKTOK_LIVE]: /https:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+\/live\/?/g,
    [MEDIA_TYPES.TWITCH_LIVE]: /https:\/\/(?:www\.)?twitch\.tv\/([\w-]+)/g,
    [MEDIA_TYPES.TIKTOK_OTHER]: /https:\/\/(?:www\.)?tiktok\.com\/(?!@[\w.-]+\/video\/\d+)(?!@[\w.-]+\/live).+/g,
    [MEDIA_TYPES.WEIBO]: /https:\/\/(?:m\.weibo\.cn\/detail\/\d+|weibo\.com\/\d+\/\d+|video\.weibo\.com\/show\?fid=[\w:]+)/g,
    [MEDIA_TYPES.THREADS]: /https:\/\/(?:www\.)?threads\.(?:net|com)\/@[\w.-]+\/post\/[\w-]+\/?/g,
    [MEDIA_TYPES.KRSITE]: _buildKrsiteRegex(),
    [MEDIA_TYPES.FACEBOOK]: /https:\/\/(?:www\.)?facebook\.com\/\S+/g,
    [MEDIA_TYPES.PINTEREST]: /https:\/\/(?:www\.)?pinterest\.(?:com|co\.uk|ca|fr|de|jp|co\.kr)\/\S+/g,
    [MEDIA_TYPES.REDDIT]: /https:\/\/(?:www\.)?reddit\.com\/\S+/g,
    [MEDIA_TYPES.APPFANS]: /https:\/\/(?:www\.)?app\.fans\/community\/[\w-]+\/media\/[\w-]+\/?/g
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
    KRSITE_DOMAINS,
    PROGRESS_EMOJI,
    DOWNLOAD_LIMITS
};
