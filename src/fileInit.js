const fs = require('fs');
const path = require('path');

/**
 * 確保目錄和文件存在
 * @param {string} filePath - 文件路徑
 * @param {string} description - 文件描述（用於日誌）
 */
function ensureFileExists(filePath, description) {
    if (!fs.existsSync(filePath)) {
        console.log(`[LOG] ${description} path not exists, create it: ${filePath}`);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, '');
    }
}

/**
 * 初始化所有必要的文件路徑
 * @param {Object} config - 配置對象
 * @returns {Object} 絕對路徑對象
 */
function initializeFiles(config) {
    const { galleryDlListPath, ytDlListPath, ytDl2ListPath } = config;

    // 確保文件存在
    ensureFileExists(galleryDlListPath, 'gallery-dl list');
    ensureFileExists(ytDlListPath, 'yt-dlp list');
    ensureFileExists(ytDl2ListPath, 'yt-dlp list2');

    // 返回絕對路徑
    return {
        absoluteGalleryDlListPath: path.resolve(galleryDlListPath),
        absoluteYtDlListPath: path.resolve(ytDlListPath),
        absoluteYtDl2ListPath: path.resolve(ytDl2ListPath)
    };
}

module.exports = {
    ensureFileExists,
    initializeFiles
};
