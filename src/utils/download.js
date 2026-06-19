/**
 * 下载功能模块
 * 支持微信环境和普通浏览器
 */

/**
 * 检测是否在微信环境
 */
export function isWeChat() {
  return /MicroMessenger/i.test(navigator.userAgent);
}

/**
 * 检测是否在淘宝/千牛等阿里系应用
 */
export function isAliApp() {
  return /Alibaba|AliApp|TB|TM|QN|ANBOT/i.test(navigator.userAgent);
}

/**
 * 下载图片
 * @param {HTMLCanvasElement} canvas - 要导出的 Canvas
 * @param {string} filename - 下载文件名
 * @param {string} format - 图片格式 (image/png / image/jpeg)
 * @param {number} quality - JPEG 质量 (0-1)
 */
export function downloadImage(canvas, filename = 'puzzle-photo.png', format = 'image/png', quality = 0.95) {
  const dataUrl = canvas.toDataURL(format, quality);

  if (isWeChat() || isAliApp()) {
    // 微信/千牛等环境：弹窗显示图片，用户长按保存
    wechatDownload(dataUrl);
  } else {
    // 普通浏览器：使用 download 属性
    browserDownload(dataUrl, filename);
  }
}

/**
 * 普通浏览器下载
 */
function browserDownload(dataUrl, filename) {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * 微信/千牛等环境下载
 * 在新窗口/当前窗口显示图片，提示用户长按保存
 */
function wechatDownload(dataUrl) {
  // 创建全屏图片预览
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.95);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    z-index: 99999;
    padding: 20px;
  `;

  const img = document.createElement('img');
  img.src = dataUrl;
  img.style.cssText = `
    max-width: 100%;
    max-height: 80vh;
    object-fit: contain;
    border-radius: 4px;
  `;

  const tip = document.createElement('p');
  tip.textContent = '长按图片保存到相册';
  tip.style.cssText = `
    color: rgba(255,255,255,0.7);
    font-size: 14px;
    margin-top: 16px;
  `;

  const closeBtn = document.createElement('button');
  closeBtn.textContent = '关闭';
  closeBtn.style.cssText = `
    margin-top: 12px;
    padding: 8px 24px;
    border: 1px solid rgba(255,255,255,0.3);
    border-radius: 6px;
    background: transparent;
    color: white;
    font-size: 14px;
    cursor: pointer;
  `;
  closeBtn.onclick = () => document.body.removeChild(overlay);

  overlay.appendChild(img);
  overlay.appendChild(tip);
  overlay.appendChild(closeBtn);
  document.body.appendChild(overlay);
}

/**
 * 获取输出文件名
 */
export function getOutputFilename(sizeName, quality) {
  const ts = Date.now();
  const qStr = quality > 1 ? `@${quality}x` : '';
  return `puzzle_${sizeName}${qStr}_${ts}.png`;
}
