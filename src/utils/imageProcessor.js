/**
 * 核心图片处理模块
 * 将上传的图片适配到目标拼图尺寸（pad模式）
 */

/**
 * 绘制处理后的图片到 Canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {HTMLImageElement} img - 源图片
 * @param {number} targetW - 目标宽度
 * @param {number} targetH - 目标高度
 * @param {object} opts - 处理选项
 * @param {number} opts.zoom - 缩放百分比 (50-150)
 * @param {number} opts.offsetX - 水平偏移百分比 (-100~100)
 * @param {number} opts.offsetY - 垂直偏移百分比 (-100~100)
 * @param {number} opts.rotation - 旋转角度 (0/90/180/270)
 * @param {string} opts.fillColor - 填充背景色 (#hex)
 * @param {number} quality - 输出倍率 (1/2/4)
 */
export function renderImage(ctx, img, targetW, targetH, opts, quality = 1) {
  const q = quality || 1;
  const canvas = ctx.canvas;
  const w = targetW * q;
  const h = targetH * q;

  // 设置 canvas 尺寸（调用方已处理好旋转的宽高交换）
  canvas.width = w;
  canvas.height = h;

  // 填充背景
  ctx.fillStyle = opts.fillColor || '#FFFFFF';
  ctx.fillRect(0, 0, w, h);

  // 计算图片在目标区域内的适配尺寸（pad模式：保持完整，添加白边）
  // 原理：图片完整显示在画布内，剩余空间用背景色填充
  const imgAspect = img.naturalWidth / img.naturalHeight;
  const targetAspect = targetW / targetH;

  let imgW, imgH;
  if (imgAspect > targetAspect) {
    // 图片更宽：以宽度为基准，高度等比缩放（上下加白边）
    imgW = w;
    imgH = w / imgAspect;
  } else {
    // 图片更高：以高度为基准，宽度等比缩放（左右加白边）
    imgH = h;
    imgW = h * imgAspect;
  }

  // 应用缩放
  const zoomFactor = (opts.zoom || 100) / 100;
  imgW *= zoomFactor;
  imgH *= zoomFactor;

  // 计算偏移 (百分比 → 像素)
  const maxOffsetX = (imgW - w) / 2;
  const maxOffsetY = (imgH - h) / 2;
  const offsetXPx = maxOffsetX * ((opts.offsetX || 0) / 100);
  const offsetYPx = maxOffsetY * ((opts.offsetY || 0) / 100);

  // 绘制位置（居中 + 偏移）
  const drawX = (w - imgW) / 2 + offsetXPx;
  const drawY = (h - imgH) / 2 + offsetYPx;

  // 处理旋转
  ctx.save();
  if (opts.rotation % 360 !== 0) {
    const cx = w / 2;
    const cy = h / 2;
    ctx.translate(cx, cy);
    ctx.rotate((opts.rotation * Math.PI) / 180);
    ctx.translate(-cx, -cy);
  }

  // 绘制图片
  ctx.drawImage(img, drawX, drawY, imgW, imgH);
  ctx.restore();
}

/**
 * 为预览创建缩放后的尺寸
 * 预览 canvas 固定高度 260px，按比例缩放目标尺寸
 */
export function getPreviewSize(targetW, targetH, maxHeight = 260) {
  const ratio = targetW / targetH;
  let pvw, pvh;
  if (ratio > 1) {
    // 横向图
    pvh = maxHeight;
    pvw = pvh * ratio;
    if (pvw > 480) {
      pvw = 480;
      pvh = pvw / ratio;
    }
  } else {
    pvh = maxHeight;
    pvw = pvh * ratio;
  }
  return { width: Math.round(pvw), height: Math.round(pvh) };
}

/**
 * 加载图片为 HTMLImageElement
 */
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve(img);
      // 用完后释放 URL
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片加载失败'));
    };
    img.src = url;
  });
}

/**
 * 检查图片是否在可视区域内可拖拽
 */
export function getDragBounds(imgW, imgH, canvasW, canvasH) {
  const maxOffX = (imgW - canvasW) / 2;
  const maxOffY = (imgH - canvasH) / 2;
  return { maxOffX: Math.max(0, maxOffX), maxOffY: Math.max(0, maxOffY) };
}
