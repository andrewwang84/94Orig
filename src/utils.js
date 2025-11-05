const { PROGRESS_EMOJI } = require('./constants');

/**
 * 延遲執行
 * @param {number} ms - 毫秒數
 * @returns {Promise}
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 生成進度條 Emoji
 * @param {number} progress - 進度百分比 (0-100)
 * @returns {Promise<string>} 進度條字串
 */
function getProgressEmoji(progress) {
    const progressInt = Math.round(parseInt(progress) / 10);
    let result = '';

    for (let i = 0; i < 10; i++) {
        result += (i < progressInt) ? PROGRESS_EMOJI.DONE : PROGRESS_EMOJI.UNDONE;
    }

    return Promise.resolve(result);
}

/**
 * 檢查用戶是否有權限使用 bot
 * @param {TelegramBot} bot - Telegram bot 實例
 * @param {number} chatId - 聊天 ID
 * @param {number} msgId - 訊息 ID
 * @param {string} logName - 用戶名稱
 * @param {string} chatMsg - 訊息內容
 * @param {Array<number>} adminId - 管理員 ID 列表
 * @returns {Promise<boolean>}
 */
async function checkCanUse(bot, chatId, msgId, logName, chatMsg, adminId) {
    if (!adminId.includes(chatId)) {
        console.info(`[LOG][${chatId}][${logName}] Not Admin - ${chatMsg}`);
        await bot.sendMessage(chatId, `
親愛的 ${logName} 您好，本 bot 目前不開放所有人使用
請將 <strong>「${chatId}」</strong> 私訊給本 bot 作者來獲取使用權限，謝謝`,
            {
                reply_to_message_id: msgId,
                allow_sending_without_reply: true,
                parse_mode: 'HTML'
            }
        );
        return false;
    }
    return true;
}

/**
 * 從訊息中獲取用戶識別名稱
 * @param {Object} msg - Telegram 訊息對象
 * @returns {string}
 */
function getUserLogName(msg) {
    return msg.from.username || msg.from.first_name || msg.from.id;
}

/**
 * 生成隨機延遲時間 (500-2500ms)
 * @returns {number}
 */
function getRandomDelay() {
    return Math.floor(Math.random() * (2500 - 500 + 1)) + 500;
}

module.exports = {
    sleep,
    getProgressEmoji,
    checkCanUse,
    getUserLogName,
    getRandomDelay
};
