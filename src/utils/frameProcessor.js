/**
 * Frame Display 模块（纯显示模块）
 *
 * 职责：负责透明PNG相框效果预览
 *
 * 绝对不能：
 *   - 调用 renderImage() 或任何图片处理函数
 *   - 重新计算图片缩放、偏移、旋转、裁剪
 *   - 修改图片内容
 *
 * 唯一允许的操作：
 *   ① 接收 PuzzleCanvas
 *   ② Bitmap Scale — 将 PuzzleCanvas 整体缩放至内框尺寸
 *   ③ drawImage PuzzleCanvas → 内框区域
 *   ④ drawImage 透明PNG相框 → 最上层
 */

// ============================
// 内框坐标配置（人工测量，禁止修改）
// ============================
export const FRAME_CONFIG = {
  '35_h': { frameWidth: 2276, frameHeight: 1696, innerLeft: 428, innerTop: 389, innerWidth: 1410, innerHeight: 957 },
  '35_v': { frameWidth: 1792, frameHeight: 2400, innerLeft: 422, innerTop: 532, innerWidth: 948, innerHeight: 1420 },
  '70_h': { frameWidth: 2346, frameHeight: 1792, innerLeft: 431, innerTop: 367, innerWidth: 1506, innerHeight: 1106 },
  '70_v': { frameWidth: 1792, frameHeight: 2400, innerLeft: 391, innerTop: 473, innerWidth: 1070, innerHeight: 1413 },
  '120_h': { frameWidth: 2304, frameHeight: 1856, innerLeft: 356, innerTop: 297, innerWidth: 1593, innerHeight: 1278 },
  '120_v': { frameWidth: 1792, frameHeight: 2400, innerLeft: 254, innerTop: 363, innerWidth: 1285, innerHeight: 1635 },
  '200_h': { frameWidth: 2348, frameHeight: 1728, innerLeft: 257, innerTop: 229, innerWidth: 1838, innerHeight: 1296 },
  '200_v': { frameWidth: 1792, frameHeight: 2400, innerLeft: 284, innerTop: 308, innerWidth: 1247, innerHeight: 1800 },
  '300_h': { frameWidth: 2293, frameHeight: 1696, innerLeft: 272, innerTop: 249, innerWidth: 1766, innerHeight: 1209 },
  '300_v': { frameWidth: 1792, frameHeight: 2400, innerLeft: 300, innerTop: 292, innerWidth: 1225, innerHeight: 1800 },
};

/** 尺寸索引 → 名称映射 */
const SIZE_NAMES = ['35', '70', '120', '200', '300'];

/** 相框PNG路径 */
const FRAME_PATHS = {
  '35_h': 'frames/h/35.png',
  '35_v': 'frames/v/35.png',
  '70_h': 'frames/h/70.png',
  '70_v': 'frames/v/70.png',
  '120_h': 'frames/h/120.png',
  '120_v': 'frames/v/120.png',
  '200_h': 'frames/h/200.png',
  '200_v': 'frames/v/200.png',
  '300_h': 'frames/h/300.png',
  '300_v': 'frames/v/300.png',
};

/** 已加载相框图片缓存 */
const frameCache = {};

/**
 * 生成相框配置键
 * @param {number} sizeIndex - 尺寸索引 (0-4)
 * @param {boolean} isLandscape - 是否是横版 (true=横, false=竖)
 * @returns {string} 如 '35_h', '70_v'
 */
export function getFrameKey(sizeIndex, isLandscape) {
  const orientation = isLandscape ? 'h' : 'v';
  return `${SIZE_NAMES[sizeIndex]}_${orientation}`;
}

/**
 * 加载相框PNG图片
 * @param {string} sizeKey - 相框配置键
 * @returns {Promise<HTMLImageElement>}
 */
export function loadFrameImage(sizeKey) {
  if (frameCache[sizeKey]) {
    return Promise.resolve(frameCache[sizeKey]);
  }
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      frameCache[sizeKey] = img;
      resolve(img);
    };
    img.onerror = () => {
      reject(new Error(`相框加载失败: ${sizeKey}`));
    };
    img.src = FRAME_PATHS[sizeKey];
  });
}

/**
 * 预加载所有相框（后台加载，不阻塞）
 */
export function preloadAllFrames() {
  Object.keys(FRAME_PATHS).forEach(key => {
    if (!frameCache[key]) {
      const img = new Image();
      img.onload = () => { frameCache[key] = img; };
      img.src = FRAME_PATHS[key];
    }
  });
}

/**
 * 获取内框坐标配置
 * @param {string} sizeKey
 * @returns {object|null}
 */
export function getFrameConfig(sizeKey) {
  return FRAME_CONFIG[sizeKey] || null;
}

/**
 * 计算相框显示尺寸
 * @param {string} sizeKey - 相框配置键
 * @param {number} targetHeight - 目标显示高度
 * @returns {{ width: number, height: number }}
 */
export function getFrameDisplaySize(sizeKey, targetHeight) {
  const config = FRAME_CONFIG[sizeKey];
  if (!config) return { width: targetHeight, height: targetHeight };
  const aspect = config.frameWidth / config.frameHeight;
  return {
    width: Math.round(targetHeight * aspect),
    height: targetHeight,
  };
}

/**
 * 渲染相框效果（仅限显示，不参与图片处理）
 *
 * 符合规范的正确流程：
 *   Bitmap Scale → draw PuzzleCanvas → draw PNG Frame
 *
 * @param {CanvasRenderingContext2D} ctx - 目标Canvas上下文
 * @param {HTMLCanvasElement} puzzleCanvas - renderImage() 输出的 PuzzleCanvas
 * @param {string} sizeKey - 相框配置键 (如 '35_h')
 * @param {HTMLImageElement} frameImg - 已加载的相框PNG
 * @param {number} [displayWidth] - 目标显示宽度（默认取frameImg自然宽）
 * @param {number} [displayHeight] - 目标显示高度（默认取frameImg自然高）
 */
export function renderFrame(ctx, puzzleCanvas, sizeKey, frameImg, displayWidth, displayHeight) {
  const config = FRAME_CONFIG[sizeKey];
  if (!config || !frameImg) return;

  const canvas = ctx.canvas;
  const dpr = window.devicePixelRatio || 1;

  // 确定显示尺寸
  const dw = displayWidth || frameImg.naturalWidth;
  const dh = displayHeight || frameImg.naturalHeight;

  // 设置Canvas尺寸（考虑DPR）
  canvas.width = Math.round(dw * dpr);
  canvas.height = Math.round(dh * dpr);
  canvas.style.width = dw + 'px';
  canvas.style.height = dh + 'px';
  ctx.scale(dpr, dpr);

  // 计算缩放比例（Bitmap Scale — 整个Bitmap统一缩放）
  const scaleX = dw / config.frameWidth;
  const scaleY = dh / config.frameHeight;

  // 内框在显示坐标中的位置和尺寸
  const innerLeft = config.innerLeft * scaleX;
  const innerTop = config.innerTop * scaleY;
  const innerW = config.innerWidth * scaleX;
  const innerH = config.innerHeight * scaleY;

  // 将 PuzzleCanvas 等比例缩放到内框尺寸
  const pcW = puzzleCanvas.width;
  const pcH = puzzleCanvas.height;
  const pcAspect = pcW / pcH;
  const innerAspect = config.innerWidth / config.innerHeight;

  let drawW, drawH, drawX, drawY;
  if (pcAspect > innerAspect) {
    // PuzzleCanvas更宽 → 以宽度为基准
    drawW = innerW;
    drawH = innerW / pcAspect;
    drawX = innerLeft;
    drawY = innerTop + (innerH - drawH) / 2;
  } else {
    // PuzzleCanvas更高 → 以高度为基准
    drawH = innerH;
    drawW = innerH * pcAspect;
    drawX = innerLeft + (innerW - drawW) / 2;
    drawY = innerTop;
  }

  // 第一次 drawImage：绘制 PuzzleCanvas（整体缩放后的 Bitmap）
  ctx.drawImage(puzzleCanvas, 0, 0, pcW, pcH, drawX, drawY, drawW, drawH);

  // 第二次 drawImage：绘制透明 PNG 相框
  ctx.drawImage(frameImg, 0, 0, dw, dh);
}
