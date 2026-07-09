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
    font: 'NotoSansSC',
    fontSize: 36,
    color: '#FFFFFF',
    rotation: 0,
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
 */
export function renderTexts(ctx, texts, canvasW, canvasH) {
  if (!texts || texts.length === 0) return;

  texts.forEach(t => {
    if (!t.content || !t.content.trim()) return;

    const x = t.x * canvasW;
    const y = t.y * canvasH;
    const fontSize = t.fontSize * (canvasW / 400); // 相对缩放
    const fontFamily = getFontFamily(t.font);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((t.rotation * Math.PI) / 180);

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

    ctx.restore();
  });
}

/**
 * 文本度量：测量文字在当前画布尺寸下的渲染大小
 */
export function measureText(ctx, text, font, fontSize, canvasW) {
  const fs = fontSize * (canvasW / 400);
  ctx.font = `${Math.round(fs)}px ${getFontFamily(font)}`;
  const metrics = ctx.measureText(text);
  return {
    width: metrics.width,
    height: fs * 1.2,
  };
}

function getFontFamily(font) {
  const map = {
    'NotoSansSC': '"NotoSansSC", "PingFang SC", "Microsoft YaHei", sans-serif',
    'SiYuanHei': '"SiYuanHei", "PingFang SC", "Microsoft YaHei", sans-serif',
    'QingChaKaiTi': '"QingChaKaiTi", "KaiTi", "STKaiti", serif',
  };
  return map[font] || '"NotoSansSC", sans-serif';
}
