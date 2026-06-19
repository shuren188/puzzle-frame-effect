/**
 * Photoshop 风格可视化颜色选择器
 * 含 Hue/Saturation/Value 面板 + HEX 输入
 */

/**
 * HSV → RGB 转换
 */
function hsvToRgb(h, s, v) {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r, g, b;
  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255),
  };
}

/**
 * RGB → HSV 转换
 */
function rgbToHsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  const s = max === 0 ? 0 : d / max;
  const v = max;
  if (max !== min) {
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) * 60; break;
      case g: h = ((b - r) / d + 2) * 60; break;
      case b: h = ((r - g) / d + 4) * 60; break;
    }
  }
  return { h: Math.round(h), s: Math.round(s * 100), v: Math.round(v * 100) };
}

/**
 * HEX → RGB
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : { r: 255, g: 255, b: 255 };
}

/**
 * RGB → HEX
 */
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(c => Math.min(255, Math.max(0, Math.round(c))).toString(16).padStart(2, '0')).join('');
}

export class ColorPicker {
  constructor(options = {}) {
    this.onConfirm = options.onConfirm || (() => {});
    this.onCancel = options.onCancel || (() => {});
    this.initialColor = options.initialColor || '#FFFFFF';

    // 解析初始颜色
    const rgb = hexToRgb(this.initialColor);
    const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
    this.hue = hsv.h;
    this.saturation = hsv.s / 100;
    this.value = hsv.v / 100;

    this.svWidth = 260;
    this.svHeight = 180;
    this.hueWidth = 260;

    this._isDraggingSV = false;
    this._isDraggingHue = false;

    this._build();
  }

  _build() {
    // 遮罩层
    this.overlay = document.createElement('div');
    this.overlay.className = 'color-picker-overlay';
    this.overlay.innerHTML = `
      <div class="color-picker-modal">
        <div class="color-picker-header">
          <span>选择颜色</span>
          <button class="color-picker-close" id="cpClose">✕</button>
        </div>
        <div class="color-picker-body">
          <!-- SV 面板 -->
          <div class="cp-sv-wrap">
            <canvas class="cp-sv-canvas" id="cpSvCanvas" width="${this.svWidth}" height="${this.svHeight}"></canvas>
            <div class="cp-sv-cursor" id="cpSvCursor"></div>
          </div>
          <!-- 色相条 -->
          <div class="cp-hue-wrap">
            <canvas class="cp-hue-canvas" id="cpHueCanvas" width="${this.hueWidth}" height="14"></canvas>
            <div class="cp-hue-cursor" id="cpHueCursor"></div>
          </div>
          <!-- 预览 + HEX输入 -->
          <div class="cp-bottom">
            <div class="cp-preview" id="cpPreview"></div>
            <div class="cp-hex-group">
              <label class="cp-hex-label">HEX</label>
              <input class="cp-hex-input" id="cpHexInput" type="text" maxlength="7" value="${this.initialColor}" />
            </div>
            <button class="cp-done-btn" id="cpDoneBtn">确定</button>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(this.overlay);
    this._cacheDOM();
    this._initCanvases();
    this._bindEvents();
  }

  _cacheDOM() {
    this.svCanvas = this.overlay.querySelector('#cpSvCanvas');
    this.svCtx = this.svCanvas.getContext('2d');
    this.svCursor = this.overlay.querySelector('#cpSvCursor');
    this.hueCanvas = this.overlay.querySelector('#cpHueCanvas');
    this.hueCtx = this.hueCanvas.getContext('2d');
    this.hueCursor = this.overlay.querySelector('#cpHueCursor');
    this.preview = this.overlay.querySelector('#cpPreview');
    this.hexInput = this.overlay.querySelector('#cpHexInput');
    this.closeBtn = this.overlay.querySelector('#cpClose');
    this.doneBtn = this.overlay.querySelector('#cpDoneBtn');
  }

  _initCanvases() {
    this._renderHueBar();
    this._renderSvPanel();
    this._updateCursorPositions();
    this._updatePreview();
  }

  /**
   * 渲染色相条（横向彩虹渐变）
   */
  _renderHueBar() {
    const ctx = this.hueCtx;
    const w = this.hueWidth;
    const h = 14;
    for (let x = 0; x < w; x++) {
      const hue = (x / w) * 360;
      const rgb = hsvToRgb(hue, 1, 1);
      ctx.fillStyle = `rgb(${rgb.r},${rgb.g},${rgb.b})`;
      ctx.fillRect(x, 0, 1, h);
    }
    // 圆角遮罩
    ctx.fillStyle = 'transparent';
  }

  /**
   * 渲染 SV 面板（基于当前色相）
   * 水平 = 饱和度 (0~1)，垂直 = 明度 (1~0)
   */
  _renderSvPanel() {
    const ctx = this.svCtx;
    const w = this.svWidth;
    const h = this.svHeight;
    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const s = x / w;
        const v = 1 - y / h;
        const rgb = hsvToRgb(this.hue, s, v);
        const idx = (y * w + x) * 4;
        data[idx] = rgb.r;
        data[idx + 1] = rgb.g;
        data[idx + 2] = rgb.b;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }

  _updateCursorPositions() {
    // SV 游标
    const sx = this.saturation * this.svWidth;
    const sy = (1 - this.value) * this.svHeight;
    this.svCursor.style.left = sx + 'px';
    this.svCursor.style.top = sy + 'px';

    // 色相游标
    const hx = (this.hue / 360) * this.hueWidth;
    this.hueCursor.style.left = hx + 'px';
  }

  _updatePreview() {
    const rgb = hsvToRgb(this.hue, this.saturation, this.value);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    this.preview.style.background = hex;
    this.hexInput.value = hex;
  }

  getColor() {
    const rgb = hsvToRgb(this.hue, this.saturation, this.value);
    return rgbToHex(rgb.r, rgb.g, rgb.b);
  }

  // ===================== 事件绑定 =====================

  _bindEvents() {
    // SV 面板拖拽
    this.svCanvas.addEventListener('mousedown', (e) => this._startSvDrag(e));
    this.svCanvas.addEventListener('touchstart', (e) => this._startSvDrag(e), { passive: false });

    // 色相条拖拽
    this.hueCanvas.addEventListener('mousedown', (e) => this._startHueDrag(e));
    this.hueCanvas.addEventListener('touchstart', (e) => this._startHueDrag(e), { passive: false });

    // 全局拖拽跟随
    document.addEventListener('mousemove', (e) => this._onDrag(e));
    document.addEventListener('touchmove', (e) => this._onDrag(e), { passive: false });
    document.addEventListener('mouseup', () => this._endDrag());
    document.addEventListener('touchend', () => this._endDrag());

    // HEX 输入
    this.hexInput.addEventListener('input', () => this._onHexInput());

    // 按钮
    this.closeBtn.addEventListener('click', () => this.destroy(false));
    this.doneBtn.addEventListener('click', () => this.destroy(true));

    // 点击遮罩关闭
    this.overlay.addEventListener('click', (e) => {
      if (e.target === this.overlay) this.destroy(false);
    });
  }

  _getSvPos(e) {
    const rect = this.svCanvas.getBoundingClientRect();
    const pos = e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
    let x = pos.x - rect.left;
    let y = pos.y - rect.top;
    // 限制范围内
    x = Math.max(0, Math.min(this.svWidth, x));
    y = Math.max(0, Math.min(this.svHeight, y));
    return { x, y };
  }

  _getHuePos(e) {
    const rect = this.hueCanvas.getBoundingClientRect();
    const pos = e.touches ? { x: e.touches[0].clientX } : { x: e.clientX };
    let x = pos.x - rect.left;
    x = Math.max(0, Math.min(this.hueWidth, x));
    return x;
  }

  _startSvDrag(e) {
    e.preventDefault();
    this._isDraggingSV = true;
    const pos = this._getSvPos(e);
    this.saturation = pos.x / this.svWidth;
    this.value = 1 - pos.y / this.svHeight;
    this._updateCursorPositions();
    this._updatePreview();
  }

  _startHueDrag(e) {
    e.preventDefault();
    this._isDraggingHue = true;
    const x = this._getHuePos(e);
    this.hue = (x / this.hueWidth) * 360;
    this._renderSvPanel();
    this._updateCursorPositions();
    this._updatePreview();
  }

  _onDrag(e) {
    if (this._isDraggingSV) {
      e.preventDefault();
      const pos = this._getSvPos(e);
      this.saturation = pos.x / this.svWidth;
      this.value = 1 - pos.y / this.svHeight;
      this._updateCursorPositions();
      this._updatePreview();
    } else if (this._isDraggingHue) {
      e.preventDefault();
      const x = this._getHuePos(e);
      this.hue = (x / this.hueWidth) * 360;
      this._renderSvPanel();
      this._updateCursorPositions();
      this._updatePreview();
    }
  }

  _endDrag() {
    this._isDraggingSV = false;
    this._isDraggingHue = false;
  }

  _onHexInput() {
    let val = this.hexInput.value.trim();
    if (val.length === 6 && !val.startsWith('#')) val = '#' + val;
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      const rgb = hexToRgb(val);
      const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
      this.hue = hsv.h;
      this.saturation = hsv.s / 100;
      this.value = hsv.v / 100;
      this._renderSvPanel();
      this._updateCursorPositions();
      this._updatePreview();
    }
  }

  /**
   * 销毁拾色器
   */
  destroy(confirmed = false) {
    if (confirmed) {
      this.onConfirm(this.getColor());
    } else {
      this.onCancel();
    }
    this.overlay.remove();
  }
}
