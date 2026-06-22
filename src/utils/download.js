export function isWeChat() {
  return /MicroMessenger/i.test(navigator.userAgent);
}

export function isAliApp() {
  return /Alibaba|AliApp|TB|TM|QN|ANBOT/i.test(navigator.userAgent);
}

export function downloadImage(canvas, filename) {
  const dataUrl = canvas.toDataURL('image/png');
  if (isWeChat() || isAliApp()) {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.95);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;padding:20px;';
    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = 'max-width:100%;max-height:80vh;object-fit:contain;border-radius:4px;';
    const tip = document.createElement('p');
    tip.textContent = '长按图片保存到相册';
    tip.style.cssText = 'color:rgba(255,255,255,0.7);font-size:14px;margin-top:16px;';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '关闭';
    closeBtn.style.cssText = 'margin-top:12px;padding:8px 24px;border:1px solid rgba(255,255,255,0.3);border-radius:6px;background:transparent;color:white;font-size:14px;cursor:pointer;';
    closeBtn.onclick = () => document.body.removeChild(overlay);
    overlay.appendChild(img);
    overlay.appendChild(tip);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
  } else {
    const bin = atob(dataUrl.split(',')[1]);
    const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    const blob = new Blob([buf], { type: 'image/png' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

export function getOutputFilename(sizeName, quality) {
  const ts = Date.now();
  const suffix = quality > 0 ? '_2x' : '';
  const safeName = sizeName.replace(/[/\\?%*:|"<>]/g, '_');
  return `puzzle_${safeName}${suffix}_${ts}.png`;
}
