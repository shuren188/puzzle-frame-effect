/**
 * 核心图片处理模块
 * 将上传的图片适配到目标拼图尺寸（pad模式）
 */

/**
 * 绘制处理后的图片到 Canvas
 * @param {CanvasRenderingContext2D} ctx - Canvas 上下文
 * @param {HTMLImageElement} img - 源图片
 * @param {number} canvasW - 画布宽度（像素）
 * @param {number} canvasH - 画布高度（像素）
 * @param {object} opts - 处理选项
 * @param {number} opts.zoom - 缩放百分比 (50-150)
 * @param {number} opts.offsetX - 水平偏移百分比 (-100~100)
 * @param {number} opts.offsetY - 垂直偏移百分比 (-100~100)
 * @param {number} opts.rotation - 旋转角度 (0/90/180/270)
 * @param {string} opts.fillColor - 填充背景色 (#hex)
 */
export function renderImage(ctx, img, canvasW, canvasH, opts) {
  const canvas = ctx.canvas;
  canvas.width = canvasW;
  canvas.height = canvasH;

  // 填充背景
  ctx.fillStyle = opts.fillColor || '#FFFFFF';
  ctx.fillRect(0, 0, canvasW, canvasH);

  // 计算图片在目标区域内的适配尺寸（pad模式：保持完整，添加白边）
  const imgAspect = img.naturalWidth / img.naturalHeight;
  let imgW, imgH;

  if (opts.rotation % 180 !== 0) {
    // 90°/270° 旋转：绘制后宽高会互换，需要反向约束
    imgH = Math.min(canvasW, canvasH / imgAspect);
    imgW = imgH * imgAspect;
  } else {
    const targetAspect = canvasW / canvasH;
    if (imgAspect > targetAspect) {
      imgW = canvasW;
      imgH = canvasW / imgAspect;
    } else {
      imgH = canvasH;
      imgW = canvasH * imgAspect;
    }
  }

  // 应用缩放
  const zoomFactor = (opts.zoom || 100) / 100;
  imgW *= zoomFactor;
  imgH *= zoomFactor;

  // 计算偏移 (百分比 → 像素)
  const maxOffsetX = (imgW - canvasW) / 2;
  const maxOffsetY = (imgH - canvasH) / 2;
  const offsetXPx = maxOffsetX * ((opts.offsetX || 0) / 100);
  const offsetYPx = maxOffsetY * ((opts.offsetY || 0) / 100);

  // 绘制位置（居中 + 偏移）
  const drawX = (canvasW - imgW) / 2 + offsetXPx;
  const drawY = (canvasH - imgH) / 2 + offsetYPx;

  // 处理旋转
  ctx.save();
  if (opts.rotation % 360 !== 0) {
    const cx = canvasW / 2;
    const cy = canvasH / 2;
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
 * 按比例缩放目标尺寸，默认最大高度200px
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
