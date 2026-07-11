/**
 * 文字叠加模块（纯显示，不参与图片处理）
 *
 * 职责：在 PuzzleCanvas 上叠加用户添加的文字
 * 下载时文字会一并导出（与相框不同，文字属于编辑内容）
 *
 * 使用系统默认字体，不加载任何第三方字体资源
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
    fontSize: 36,
    color: '#FFFFFF',
    x: 0.5,   // 相对坐标 0-1
    y: 0.5,
  };
}

/**
 * 在Canvas上绘制所有文字叠加层
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} texts - 文字配置数组
 * @param {number} canvasW - 画布宽度
 * @param {number} canvasH - 画布高度
 * @param {string|null} selectedId - 选中文字的id（用于显示选中边框）
 */
export function renderTexts(ctx, texts, canvasW, canvasH, selectedId) {
  if (!texts || texts.length === 0) return;

  const fontFamily = getFontFamily();

  texts.forEach(t => {
    if (!t.content || !t.content.trim()) return;

    const x = t.x * canvasW;
    const y = t.y * canvasH;
    const fontSize = t.fontSize * (canvasW / 400);
    const isSelected = selectedId && t.id === selectedId;

    ctx.save();
    ctx.translate(x, y);

    ctx.font = `${Math.round(fontSize)}px ${fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 选中状态：绘制虚线边框
    if (isSelected) {
      const metrics = ctx.measureText(t.content);
      const tw = metrics.width;
      const th = fontSize;
      const pad = 8;
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = '#5ce5e5';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(-tw / 2 - pad, -th / 2 - pad, tw + pad * 2, th + pad * 2);
      ctx.setLineDash([]);
      ctx.restore();
      // 恢复之前的save/restore状态同步
      ctx.save();
      ctx.translate(x, y);
      ctx.font = `${Math.round(fontSize)}px ${fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
    }

    // 文字阴影（提升可读性）
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    ctx.fillStyle = t.color || '#FFFFFF';
    ctx.fillText(t.content, 0, 0);

    ctx.restore();
  });
}

/**
 * 获取文字在画布上的渲染尺寸（用于命中检测等）
 */
export function getTextRenderSize(ctx, text, fontSize, canvasW) {
  const fs = fontSize * (canvasW / 400);
  ctx.font = `${Math.round(fs)}px ${getFontFamily()}`;
  const metrics = ctx.measureText(text);
  return {
    width: metrics.width,
    height: fs,
    halfWidth: metrics.width / 2,
    halfHeight: fs / 2,
  };
}

/**
 * 文本度量：测量文字在当前画布尺寸下的渲染大小
 */
export function measureText(ctx, text, fontSize, canvasW) {
  const fs = fontSize * (canvasW / 400);
  ctx.font = `${Math.round(fs)}px ${getFontFamily()}`;
  const metrics = ctx.measureText(text);
  return {
    width: metrics.width,
    height: fs * 1.2,
  };
}

function getFontFamily() {
  return '"PingFang SC", "Microsoft YaHei", sans-serif';
}
