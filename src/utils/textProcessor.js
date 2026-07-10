/**
 * 文字叠加模块（纯显示，不参与图片处理）
 *
 * 职责：在 PuzzleCanvas 上叠加用户添加的文字
 * 下载时文字会一并导出（与相框不同，文字属于编辑内容）
 */

/** 生成唯一ID */
let _id = 0;
export function genTextId() {
  return 'txt_' + (++_id) + '_' + Date.now();
}

/** 默认文字配置 */
export function createDefaultText() {
  return {
    id: genTextId(),
    content: '输入文字',
    font: 'sans-serif',
    fontSize: 36,
    scale: 1,
    color: '#FFFFFF',
    x: 0.5,   // 相对坐标 0-1
    y: 0.5,
    selected: false,
  };
}

/**
 * 在Canvas上绘制所有文字叠加层
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} texts - 文字配置数组
 * @param {number} canvasW - 画布宽度
 * @param {number} canvasH - 画布高度
 * @param {string} selectedId - 当前选中的文字ID
 */
export function renderTexts(ctx, texts, canvasW, canvasH, selectedId = null) {
  if (!texts || texts.length === 0) return;

  texts.forEach(t => {
    if (!t.content || !t.content.trim()) return;

    const x = t.x * canvasW;
    const y = t.y * canvasH;
    const baseFontSize = t.fontSize * (canvasW / 400);
    const fontSize = baseFontSize * (t.scale || 1);
    const fontFamily = getFontFamily(t.font);
    const isSelected = selectedId === t.id;

    ctx.save();
    ctx.translate(x, y);

    ctx.font = `${Math.round(fontSize)}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 文字阴影（提升可读性）
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = t.color || '#FFFFFF';
    ctx.fillText(t.content, 0, 0);

    // 选中状态：显示边框
    if (isSelected) {
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#2196F3';
      ctx.lineWidth = 2;
      const metrics = ctx.measureText(t.content);
      const padding = 8;
      ctx.strokeRect(
        -metrics.width / 2 - padding,
        -fontSize / 2 - padding,
        metrics.width + padding * 2,
        fontSize + padding * 2
      );
    }

    ctx.restore();
  });
}

/**
 * 获取文字的边界框（用于命中检测）
 * @param {Object} text - 文字对象
 * @param {number} canvasW - 画布宽度
 * @param {number} canvasH - 画布高度
 * @param {CanvasRenderingContext2D} ctx - Canvas上下文（用于测量）
 * @returns {Object} 边界框 {left, right, top, bottom, centerX, centerY}
 */
export function getTextBounds(text, canvasW, canvasH, ctx) {
  const x = text.x * canvasW;
  const y = text.y * canvasH;
  const baseFontSize = text.fontSize * (canvasW / 400);
  const fontSize = baseFontSize * (text.scale || 1);
  const fontFamily = getFontFamily(text.font);

  ctx.font = `${Math.round(fontSize)}px ${fontFamily}`;
  const metrics = ctx.measureText(text.content);
  const padding = 10; // 增加点击区域

  return {
    left: x - metrics.width / 2 - padding,
    right: x + metrics.width / 2 + padding,
    top: y - fontSize / 2 - padding,
    bottom: y + fontSize / 2 + padding,
    centerX: x,
    centerY: y,
    width: metrics.width + padding * 2,
    height: fontSize + padding * 2
  };
}

/**
 * 检查点是否在文字边界框内
 * @param {number} x - 点的x坐标
 * @param {number} y - 点的y坐标
 * @param {Object} bounds - 文字边界框
 * @returns {boolean}
 */
export function isPointInText(x, y, bounds) {
  return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
}

/**
 * 在指定位置查找文字（用于命中检测）
 * @param {number} x - 画布x坐标
 * @param {number} y - 画布y坐标
 * @param {Array} texts - 文字数组
 * @param {number} canvasW - 画布宽度
 * @param {number} canvasH - 画布高度
 * @param {CanvasRenderingContext2D} ctx - Canvas上下文
 * @returns {Object|null} 命中的文字对象及其索引 {text, index, bounds}
 */
export function hitTestText(x, y, texts, canvasW, canvasH, ctx) {
  // 从顶层到底层遍历（后添加的在上层）
  for (let i = texts.length - 1; i >= 0; i--) {
    const t = texts[i];
    if (!t.content || !t.content.trim()) continue;

    const bounds = getTextBounds(t, canvasW, canvasH, ctx);
    if (isPointInText(x, y, bounds)) {
      return { text: t, index: i, bounds };
    }
  }
  return null;
}

function getFontFamily(font) {
  return 'sans-serif';
}