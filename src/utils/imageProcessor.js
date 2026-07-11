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
 * 计算智能适配缩放值（object-fit: cover 算法）
 * 使图片完整覆盖拼图区域，不留白边，保持比例，居中显示
 * @param {number} imgW - 图片原始宽度 (naturalWidth)
 * @param {number} imgH - 图片原始高度 (naturalHeight)
 * @param {number} canvasW - 目标画布宽度
 * @param {number} canvasH - 目标画布高度
 * @param {number} rotation - 当前旋转角度 (0/90/180/270)
 * @returns {{ zoom: number, offsetX: number, offsetY: number }}
 */
export function calculateCoverZoom(imgW, imgH, canvasW, canvasH, rotation) {
  const nr = rotation % 180 !== 0;
  const effW = nr ? imgH : imgW;
  const effH = nr ? imgW : imgH;
  const imgAspect = effW / effH;
  const targetAspect = canvasW / canvasH;

  let zoom;
  if (imgAspect > targetAspect) {
    // 图片比画布更宽 → 以高度为约束
    // zoom=100 时 imgH = canvasH, imgW < canvasW
    // 需要 imgW ≥ canvasW → zoom = (canvasW / imgW_at_100) * 100
    zoom = Math.round((canvasH * imgAspect) / canvasW * 100);
  } else {
    // 图片比画布更高 → 以宽度为约束
    // zoom=100 时 imgW = canvasW, imgH < canvasH
    // 需要 imgH ≥ canvasH → zoom = (canvasH / imgH_at_100) * 100
    zoom = Math.round(canvasW / (canvasH * imgAspect) * 100);
  }

  // 确保缩放范围合理（与 ZOOM_RANGE 保持一致）
  zoom = Math.max(50, Math.min(300, zoom));
  return { zoom, offsetX: 0, offsetY: 0 };
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
