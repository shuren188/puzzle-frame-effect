/**
 * 相框安全显示区域（Frame Safe Area Overlay）
 *
 * 职责：在编辑界面绘制虚线安全区域辅助层
 * - 仅相框开启时显示
 * - 安全区域 = 图片四周 8mm（根据拼图物理尺寸换算为 Canvas 像素）
 * - 虚线以内为安全显示区，虚线外约 8mm 会被相框遮挡
 * - 导出图片时不包含此辅助层
 */

/**
 * 计算 8mm 在当前 Canvas 中对应的像素距离
 * @param {number} canvasW - 画布宽度 (px)
 * @param {number} canvasH - 画布高度 (px)
 * @param {number} physW - 拼图物理宽度 (cm)
 * @param {number} physH - 拼图物理高度 (cm)
 * @returns {{ insetX: number, insetY: number }}
 */
export function calcSafeAreaInset(canvasW, canvasH, physW, physH) {
  const pxPerMmX = canvasW / (physW * 10);
  const pxPerMmY = canvasH / (physH * 10);
  return {
    insetX: Math.round(8 * pxPerMmX),
    insetY: Math.round(8 * pxPerMmY),
  };
}

/**
 * 绘制安全区域辅助层
 * 虚线以内表示安全显示区域，虚线外表示被相框遮挡区域
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} canvasW - 画布宽度 (px)
 * @param {number} canvasH - 画布高度 (px)
 * @param {number} physW - 拼图物理宽度 (cm)
 * @param {number} physH - 拼图物理高度 (cm)
 */
export function renderSafeArea(ctx, canvasW, canvasH, physW, physH) {
  const { insetX, insetY } = calcSafeAreaInset(canvasW, canvasH, physW, physH);

  if (insetX <= 0 || insetY <= 0) return;

  const l = insetX;
  const t = insetY;
  const r = canvasW - insetX;
  const b = canvasH - insetY;

  if (l >= r || t >= b) return;

  // 半透明灰色蒙版——遮挡虚线外区域
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.15)';

  // 上
  ctx.fillRect(0, 0, canvasW, t);
  // 下
  ctx.fillRect(0, b, canvasW, canvasH - b);
  // 左
  ctx.fillRect(0, t, l, b - t);
  // 右
  ctx.fillRect(r, t, canvasW - r, b - t);

  // 青色虚线框——标记安全区域边界
  ctx.strokeStyle = 'rgba(92,229,229,0.5)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(l, t, r - l, b - t);
  ctx.setLineDash([]);

  ctx.restore();
}
