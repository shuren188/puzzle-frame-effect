import { SIZES, QUALITIES, PRESET_COLORS, DEFAULTS, DRAG_SENSITIVITY } from '../constants.js';
import { renderImage, loadImage, getPreviewSize } from '../utils/imageProcessor.js';
import { downloadImage, getOutputFilename } from '../utils/download.js';
import { ColorPicker } from './ColorPicker.js';
import { renderFrame, loadFrameImage, getFrameKey, getFrameDisplaySize } from '../utils/frameProcessor.js';

const PINCH_SENSITIVITY = 0.45;

export class App {
  constructor() {
    this.els = {};
    this.cacheDOM();
    this.state = {
      image: null, originalFile: null,
      selectedSize: SIZES[DEFAULTS.sizeIndex],
      quality: DEFAULTS.quality,
      fillColor: DEFAULTS.fillColor,
      zoom: DEFAULTS.zoom,
      offsetX: DEFAULTS.offsetX,
      offsetY: DEFAULTS.offsetY,
      rotation: DEFAULTS.rotation,
      isDragging: false, dragStartX: 0, dragStartY: 0, dragStartOffsetX: 0, dragStartOffsetY: 0,
      isPinching: false, pinchStartDist: 0, pinchStartZoom: 100,
      touchStartTime: 0, touchMoved: false,
      frameEnabled: false, frameImages: {}, currentFrameKey: null,
    };
    this.renderTimer = null;
    this.init();
  }

  cacheDOM() {
    this.els.app = document.getElementById('app');
    this.els.uploadArea = document.getElementById('uploadArea');
    this.els.uploadPlaceholder = document.getElementById('uploadPlaceholder');
    this.els.previewContainer = document.getElementById('previewContainer');
    this.els.previewCanvas = document.getElementById('previewCanvas');
    this.els.canvasWrapper = document.getElementById('canvasWrapper');
    this.els.dragHint = document.getElementById('dragHint');
    this.els.fileInput = document.getElementById('fileInput');
    this.els.reUploadBtn = document.getElementById('reUploadBtn');
    this.els.resetBtn = document.getElementById('resetBtn');
    this.els.controlsSection = document.getElementById('controlsSection');
    this.els.sizeScroll = document.getElementById('sizeScroll');
    this.els.qualityGroup = document.getElementById('qualityGroup');
    this.els.colorGrid = document.getElementById('colorGrid');
    this.els.downloadBtn = document.getElementById('downloadBtn');
    this.els.tabBtns = document.querySelectorAll('.tab-btn');
    this.els.panelAdjust = document.getElementById('panelAdjust');
    this.els.panelColor = document.getElementById('panelColor');
    this.els.adjustDetails = document.getElementById('adjustDetails');
    this.els.adjustSummaryText = document.getElementById('adjustSummaryText');
    this.els.zoomSlider = document.getElementById('zoomSlider');
    this.els.zoomValue = document.getElementById('zoomValue');
    this.els.offsetXSlider = document.getElementById('offsetXSlider');
    this.els.offsetXValue = document.getElementById('offsetXValue');
    this.els.offsetYSlider = document.getElementById('offsetYSlider');
    this.els.offsetYValue = document.getElementById('offsetYValue');
    this.els.rotateLeftBtn = document.getElementById('rotateLeftBtn');
    this.els.rotateRightBtn = document.getElementById('rotateRightBtn');
    this.els.pinchHint = document.getElementById('pinchHint');
    this.els.panelFrame = document.getElementById('panelFrame');
    this.els.frameToggle = document.getElementById('frameToggle');
    this.els.frameInfo = document.getElementById('frameInfo');
  }

  init() {
    this.renderSizeButtons();
    this.renderQualityButtons();
    this.renderColorButtons();
    this.bindEvents();
  }

  renderSizeButtons() {
    this.els.sizeScroll.innerHTML = SIZES.map((s, i) =>
      `<button class="size-btn${i===DEFAULTS.sizeIndex?' active':''}" data-index="${i}"><span class="size-label">${s.name}</span><span class="size-dim">${s.label}</span></button>`
    ).join('');
  }

  renderQualityButtons() {
    this.els.qualityGroup.innerHTML = QUALITIES.map((q, i) =>
      `<button class="quality-btn${i===0?' active':''}" data-scale="${q.scale}"><span class="q-name">${q.name}</span><span class="q-dpi">${q.sub}</span></button>`
    ).join('');
  }

  renderColorButtons() {
    const btns = PRESET_COLORS.map((c, i) =>
      `<button class="color-btn${c.hex===DEFAULTS.fillColor?' active':''}" data-color="${c.hex}" style="background:${c.hex}" title="${c.name}"></button>`
    ).join('');
    this.els.colorGrid.innerHTML = btns + '<button class="color-btn custom-btn" id="customColorBtn" title="自定义颜色">+</button>';
  }

  bindEvents() {
    this.els.uploadPlaceholder.addEventListener('click', () => this.els.fileInput.click());
    this.els.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.els.uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); this.els.uploadPlaceholder.classList.add('drag-over'); });
    this.els.uploadArea.addEventListener('dragleave', () => this.els.uploadPlaceholder.classList.remove('drag-over'));
    this.els.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault(); this.els.uploadPlaceholder.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) this.processFile(file);
    });
    this.els.reUploadBtn.addEventListener('click', () => this.resetToUpload());
    this.els.resetBtn.addEventListener('click', () => this.resetImage());

    this.els.sizeScroll.addEventListener('click', (e) => {
      const btn = e.target.closest('.size-btn');
      if (!btn) return;
      this.els.sizeScroll.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.state.selectedSize = SIZES[parseInt(btn.dataset.index)];
      if (this.state.frameEnabled) this.preloadCurrentFrame();
      this.scheduleRender();
    });

    this.els.qualityGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.quality-btn');
      if (!btn) return;
      this.els.qualityGroup.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.state.quality = parseInt(btn.dataset.scale);
      this.scheduleRender();
    });

    this.els.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.els.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.els.panelAdjust.classList.toggle('active', btn.dataset.tab === 'adjust');
        this.els.panelColor.classList.toggle('active', btn.dataset.tab === 'color');
        this.els.panelFrame.classList.toggle('active', btn.dataset.tab === 'frame');
      });
    });

    // 相框开关
    this.els.frameToggle.addEventListener('change', (e) => {
      this.state.frameEnabled = e.target.checked;
      this.updateFrameInfo();
      if (this.state.frameEnabled) this.preloadCurrentFrame();
      this.scheduleRender();
    });

    this.els.zoomSlider.addEventListener('input', () => {
      const val = parseInt(this.els.zoomSlider.value);
      this.state.zoom = val;
      this.els.zoomValue.textContent = val + '%';
      this.updateAdjustSummary();
      this.scheduleRender();
    });
    this.els.offsetXSlider.addEventListener('input', () => {
      const val = parseInt(this.els.offsetXSlider.value);
      this.state.offsetX = val;
      this.els.offsetXValue.textContent = val + '%';
      this.scheduleRender();
    });
    this.els.offsetYSlider.addEventListener('input', () => {
      const val = parseInt(this.els.offsetYSlider.value);
      this.state.offsetY = val;
      this.els.offsetYValue.textContent = val + '%';
      this.scheduleRender();
    });

    const rotateLeft = () => {
      this.state.rotation = (this.state.rotation - 90 + 360) % 360;
      this.els.rotateLeftBtn.classList.add('btn-clicked');
      setTimeout(() => this.els.rotateLeftBtn.classList.remove('btn-clicked'), 200);
      if (this.state.frameEnabled) this.preloadCurrentFrame();
      this.scheduleRender();
    };
    const rotateRight = () => {
      this.state.rotation = (this.state.rotation + 90) % 360;
      this.els.rotateRightBtn.classList.add('btn-clicked');
      setTimeout(() => this.els.rotateRightBtn.classList.remove('btn-clicked'), 200);
      if (this.state.frameEnabled) this.preloadCurrentFrame();
      this.scheduleRender();
    };
    this.els.rotateLeftBtn.addEventListener('click', rotateLeft);
    this.els.rotateRightBtn.addEventListener('click', rotateRight);

    this.els.colorGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.color-btn');
      if (!btn) return;
      if (btn.id === 'customColorBtn') { this.openColorPicker(); return; }
      this.setActiveColor(btn.dataset.color);
    });

    this.els.downloadBtn.addEventListener('click', () => this.handleDownload());

    this.els.canvasWrapper.addEventListener('mousedown', (e) => this.startDrag(e));
    this.els.canvasWrapper.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    document.addEventListener('mouseup', () => this.endDrag());
    document.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    this.els.canvasWrapper.addEventListener('click', (e) => {
      if (this.state.image && !this.state.isDragging) this.openFullscreenPreview(e);
    });
  }

  openColorPicker() {
    new ColorPicker({
      initialColor: this.state.fillColor,
      onConfirm: (color) => this.setActiveColor(color),
    });
  }

  setActiveColor(color) {
    this.state.fillColor = color;
    this.els.colorGrid.querySelectorAll('.color-btn:not(.custom-btn)').forEach(b => {
      b.classList.toggle('active', b.dataset.color.toLowerCase() === color.toLowerCase());
    });
    this.scheduleRender();
  }

  startDrag(e) {
    if (!this.state.image) return;
    const pt = e.touches ? e.touches[0] : e;
    if (!this.isTouchOnImage(pt)) return;
    this.state.isDragging = true;
    this.els.canvasWrapper.classList.add('dragging');
    const pos = { x: pt.clientX, y: pt.clientY };
    this.state.dragStartX = pos.x;
    this.state.dragStartY = pos.y;
    this.state.dragStartOffsetX = this.state.offsetX;
    this.state.dragStartOffsetY = this.state.offsetY;
  }

  onDrag(e) {
    if (!this.state.isDragging) return;
    const pos = e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
    const dx = (pos.x - this.state.dragStartX) * DRAG_SENSITIVITY;
    const dy = (pos.y - this.state.dragStartY) * DRAG_SENSITIVITY;
    const pw = this.els.previewCanvas.width, ph = this.els.previewCanvas.height;
    const size = this.state.selectedSize;
    const nr = this.state.rotation % 180 !== 0;
    const tw = nr ? size.heightCm : size.widthCm, th = nr ? size.widthCm : size.heightCm;
    const ia = this.state.image.naturalWidth / this.state.image.naturalHeight, ta = tw / th;
    let iw, ih;
    if (ia > ta) { ih = ph; iw = ih * ia; } else { iw = pw; ih = iw / ia; }
    const zf = this.state.zoom / 100;
    iw *= zf; ih *= zf;
    const mw = (iw - pw) / 2, mh = (ih - ph) / 2;
    const px = mw > 0 ? (dx / mw) * 100 : 0, py = mh > 0 ? (dy / mh) * 100 : 0;
    this.state.offsetX = Math.round(Math.max(-100, Math.min(100, this.state.dragStartOffsetX + px)));
    this.state.offsetY = Math.round(Math.max(-100, Math.min(100, this.state.dragStartOffsetY + py)));
    this.els.offsetXSlider.value = this.state.offsetX;
    this.els.offsetYSlider.value = this.state.offsetY;
    this.els.offsetXValue.textContent = this.state.offsetX + '%';
    this.els.offsetYValue.textContent = this.state.offsetY + '%';
    this.scheduleRender();
  }

  endDrag() {
    if (this.state.isDragging) { this.state.isDragging = false; this.els.canvasWrapper.classList.remove('dragging'); }
  }

  getTouchDistance(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  isTouchOnImage(pos) {
    if (!this.state.image) return false;
    const c = this.els.previewCanvas, r = c.getBoundingClientRect();
    const cw = c.width, ch = c.height;
    const scale = Math.min(r.width / cw, r.height / ch);
    const rw = cw * scale, rh = ch * scale;
    const ox = (r.width - rw) / 2, oy = (r.height - rh) / 2;
    const cx = (pos.clientX - r.left - ox) / scale, cy = (pos.clientY - r.top - oy) / scale;
    if (cx < 0 || cx > cw || cy < 0 || cy > ch) return false;
    const ia = this.state.image.naturalWidth / this.state.image.naturalHeight;
    const s = this.state.selectedSize;
    const nr = this.state.rotation % 180 !== 0;
    const tw = nr ? s.heightCm : s.widthCm, th = nr ? s.widthCm : s.heightCm;
    const ta = tw / th;
    let iw, ih;
    if (ia > ta) { iw = cw; ih = cw / ia; } else { ih = ch; iw = ch * ia; }
    const zf = this.state.zoom / 100; iw *= zf; ih *= zf;
    const mx = (iw - cw) / 2, my = (ih - ch) / 2;
    const dx = mx * (this.state.offsetX / 100), dy = my * (this.state.offsetY / 100);
    const ddx = (cw - iw) / 2 + dx, ddy = (ch - ih) / 2 + dy;
    return cx >= ddx && cx <= ddx + iw && cy >= ddy && cy <= ddy + ih;
  }

  handleTouchStart(e) {
    if (e.touches.length >= 2) {
      if (!this.isTouchOnImage(e.touches[0]) || !this.isTouchOnImage(e.touches[1])) return;
      e.preventDefault();
      this.state.isPinching = true;
      this.state.pinchStartDist = this.getTouchDistance(e);
      this.state.pinchStartZoom = this.state.zoom;
      this.state.isDragging = false;
      this.els.canvasWrapper.classList.remove('dragging');
    } else if (e.touches.length === 1) {
      this.state.isPinching = false;
      this.state.touchStartTime = Date.now();
      this.state.touchMoved = false;
      this.startDrag(e);
    }
  }

  handleTouchMove(e) {
    if (this.state.isPinching && e.touches.length >= 2) {
      e.preventDefault();
      const dist = this.getTouchDistance(e);
      const sd = (dist - this.state.pinchStartDist) * PINCH_SENSITIVITY;
      const nz = Math.round(this.state.pinchStartZoom * (1 + sd / this.state.pinchStartDist));
      const clamped = Math.max(50, Math.min(150, nz));
      this.state.zoom = clamped;
      this.els.zoomSlider.value = clamped;
      this.els.zoomValue.textContent = clamped + '%';
      this.updateAdjustSummary();
      this.scheduleRender();
    } else if (!this.state.isPinching) {
      if (e.touches.length === 1) {
        const dx = Math.abs(e.touches[0].clientX - this.state.dragStartX);
        const dy = Math.abs(e.touches[0].clientY - this.state.dragStartY);
        if (dx > 5 || dy > 5) this.state.touchMoved = true;
      }
      this.onDrag(e);
    }
  }

  handleTouchEnd(e) {
    if (this.state.isPinching) { this.state.isPinching = false; this.endDrag(); return; }
    const elapsed = Date.now() - this.state.touchStartTime;
    if (!this.state.touchMoved && elapsed < 300 && this.state.image) this.openFullscreenPreview(e);
    this.endDrag();
  }

  openFullscreenPreview() {
    if (!this.state.image) return;
    const s = this.state.selectedSize;
    const nr = this.state.rotation % 180 !== 0;
    const cmW = nr ? s.heightCm : s.widthCm, cmH = nr ? s.widthCm : s.heightCm;
    const ta = cmW / cmH;
    let pvw = 480, pvh = Math.round(pvw / ta);
    if (pvh > 680) { pvh = 680; pvw = Math.round(pvh * ta); }

    // 生成全屏 PuzzleCanvas（同组参数，始终调用一次 renderImage）
    const puzzleCanvas = document.createElement('canvas');
    const pcCtx = puzzleCanvas.getContext('2d');
    renderImage(pcCtx, this.state.image, pvw, pvh, {
      zoom: this.state.zoom, offsetX: this.state.offsetX, offsetY: this.state.offsetY,
      rotation: this.state.rotation, fillColor: this.state.fillColor,
    });

    // 计算最终显示用的画布和dataUrl
    let displayCanvas = puzzleCanvas;
    if (this.state.frameEnabled) {
      const frameKey = this.state.currentFrameKey;
      const frameImg = this.state.frameImages[frameKey];
      if (frameImg && frameKey) {
        const fsCanvas = document.createElement('canvas');
        const fsCtx = fsCanvas.getContext('2d');
        renderFrame(fsCtx, puzzleCanvas, frameKey, frameImg);
        displayCanvas = fsCanvas;
      }
    }
    const dataUrl = displayCanvas.toDataURL('image/png');

    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;align-items:center;justify-content:center;z-index:99998;padding:16px;backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);touch-action:none;';
    overlay.onclick = (e) => { if (e.target === overlay) document.body.removeChild(overlay); };

    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;transition:transform 0.15s ease;';
    img.style.transform = 'scale(1)';

    const closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = 'position:fixed;top:16px;right:16px;width:38px;height:38px;border:none;border-radius:50%;background:rgba(255,255,255,0.1);color:#fff;font-size:1.2rem;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;-webkit-tap-highlight-color:transparent;';
    closeBtn.onclick = () => document.body.removeChild(overlay);

    const fsHint = document.createElement('div');
    fsHint.textContent = '👉👈 双指缩放查看细节';
    fsHint.style.cssText = 'position:fixed;bottom:40px;left:50%;transform:translateX(-50%);z-index:2;background:rgba(0,0,0,0.5);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);color:rgba(255,255,255,0.6);font-size:13px;padding:5px 14px;border-radius:16px;border:1px solid rgba(255,255,255,0.05);pointer-events:none;transition:opacity 1s ease;';
    setTimeout(() => { fsHint.style.opacity = '0'; }, 3000);

    let fsDist = 0, fsScale = 1;
    overlay.addEventListener('touchstart', (e) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        fsDist = Math.sqrt(dx*dx + dy*dy);
        fsScale = parseFloat(img.style.transform.replace('scale(','').replace(')','')) || 1;
      }
    }, { passive: false });
    overlay.addEventListener('touchmove', (e) => {
      if (e.touches.length >= 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const d = Math.sqrt(dx*dx + dy*dy);
        let s = fsScale * (1 + (d / fsDist - 1) * 0.4);
        s = Math.max(0.5, Math.min(5, s));
        img.style.transform = `scale(${s})`;
      }
    }, { passive: false });

    overlay.appendChild(img);
    overlay.appendChild(fsHint);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
  }

  handleFileSelect(e) { const file = e.target.files[0]; if (file) this.processFile(file); }

  async processFile(file) {
    try {
      this.showLoading();
      const img = await loadImage(file);
      this.state.image = img;
      this.state.originalFile = file;
      this.state.zoom = DEFAULTS.zoom;
      this.state.offsetX = DEFAULTS.offsetX;
      this.state.offsetY = DEFAULTS.offsetY;
      this.state.rotation = DEFAULTS.rotation;
      this.state.fillColor = DEFAULTS.fillColor;
      this.els.zoomSlider.value = DEFAULTS.zoom;
      this.els.zoomValue.textContent = DEFAULTS.zoom + '%';
      this.els.offsetXSlider.value = DEFAULTS.offsetX;
      this.els.offsetXValue.textContent = DEFAULTS.offsetX + '%';
      this.els.offsetYSlider.value = DEFAULTS.offsetY;
      this.els.offsetYValue.textContent = DEFAULTS.offsetY + '%';
      this.updateAdjustSummary();
      this.setActiveColor(DEFAULTS.fillColor);
      this.els.uploadPlaceholder.style.display = 'none';
      this.els.previewContainer.style.display = 'flex';
      this.els.controlsSection.style.display = 'flex';
      const cards = this.els.controlsSection.querySelectorAll('.card');
      cards.forEach((card, i) => {
        card.classList.remove('anim-fade-in-up');
        void card.offsetWidth;
        card.classList.add('anim-fade-in-up');
        card.style.setProperty('--anim-delay', `${(i + 1) * 0.12}s`);
      });
      this.hideLoading();
      this.renderPreview();
      this.preloadCurrentFrame();
    } catch (err) {
      this.hideLoading();
      this.showToast('图片加载失败，请重试');
      console.error('图片加载失败:', err);
    }
  }

  resetToUpload() {
    this.state.image = null;
    this.state.originalFile = null;
    this.state.puzzleCanvas = null;
    this.state.frameEnabled = false;
    this.state.frameImages = {};
    this.state.currentFrameKey = null;
    this.els.uploadPlaceholder.style.display = 'flex';
    this.els.previewContainer.style.display = 'none';
    this.els.controlsSection.style.display = 'none';
    this.els.fileInput.value = '';
    this.els.frameToggle.checked = false;
    this.els.controlsSection.querySelectorAll('.card').forEach(c => c.classList.remove('anim-fade-in-up'));
  }

  resetImage() {
    if (!this.state.image) return;
    this.state.zoom = DEFAULTS.zoom;
    this.state.offsetX = DEFAULTS.offsetX;
    this.state.offsetY = DEFAULTS.offsetY;
    this.state.rotation = DEFAULTS.rotation;
    this.state.puzzleCanvas = null;
    this.els.zoomSlider.value = DEFAULTS.zoom;
    this.els.zoomValue.textContent = DEFAULTS.zoom + '%';
    this.els.offsetXSlider.value = DEFAULTS.offsetX;
    this.els.offsetXValue.textContent = DEFAULTS.offsetX + '%';
    this.els.offsetYSlider.value = DEFAULTS.offsetY;
    this.els.offsetYValue.textContent = DEFAULTS.offsetY + '%';
    this.updateAdjustSummary();
    this.scheduleRender();
    this.showToast('已重置');
  }

  scheduleRender() {
    if (this.renderTimer) cancelAnimationFrame(this.renderTimer);
    this.els.canvasWrapper.classList.add('updating');
    this.renderTimer = requestAnimationFrame(() => this.renderPreview());
  }

  renderPreview() {
    if (!this.state.image) return;
    const size = this.state.selectedSize;
    const nr = this.state.rotation % 180 !== 0;
    const cmW = nr ? size.heightCm : size.widthCm, cmH = nr ? size.widthCm : size.heightCm;
    const ps = getPreviewSize(cmW, cmH, 200);

    // Step 1: 生成PuzzleCanvas（唯一一次renderImage调用）
    const pc = this.state.puzzleCanvas || (this.state.puzzleCanvas = document.createElement('canvas'));
    pc.width = ps.width;
    pc.height = ps.height;
    renderImage(pc.getContext('2d'), this.state.image, ps.width, ps.height, {
      zoom: this.state.zoom, offsetX: this.state.offsetX, offsetY: this.state.offsetY,
      rotation: this.state.rotation, fillColor: this.state.fillColor,
    });

    // Step 2: 显示（带相框或不带）
    if (this.state.frameEnabled) {
      this.renderFramePreview(pc);
    } else {
      this.renderNormalPreview(pc);
    }
    this.els.canvasWrapper.classList.remove('updating');
  }

  renderNormalPreview(pc) {
    const canvas = this.els.previewCanvas;
    // 清除可能残留的相框模式内联样式
    canvas.style.width = '';
    canvas.style.height = '';
    const ctx = canvas.getContext('2d');
    canvas.width = pc.width;
    canvas.height = pc.height;
    this.els.canvasWrapper.style.height = pc.height + 'px';
    ctx.drawImage(pc, 0, 0);
  }

  renderFramePreview(pc) {
    const frameKey = this.state.currentFrameKey;
    const frameImg = this.state.frameImages[frameKey];
    if (!frameImg || !frameKey) {
      this.renderNormalPreview(pc);
      return;
    }
    const ds = getFrameDisplaySize(frameKey, 200);
    const canvas = this.els.previewCanvas;
    const ctx = canvas.getContext('2d');
    // 清除之前的transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    renderFrame(ctx, pc, frameKey, frameImg, ds.width, ds.height);
    this.els.canvasWrapper.style.height = ds.height + 'px';
  }

  async handleDownload() {
    if (!this.state.image) return;
    try {
      this.els.downloadBtn.disabled = true;
      this.els.downloadBtn.textContent = '处理中...';
      const size = this.state.selectedSize;
      const mode = this.state.quality; // 0=原图(1x), 2=高清(2x)

      const nr = this.state.rotation % 180 !== 0;
      const cmW = nr ? size.heightCm : size.widthCm, cmH = nr ? size.widthCm : size.heightCm;
      const targetAspect = cmW / cmH;

      // 基于图片原始分辨率计算输出尺寸
      const imgW = this.state.image.naturalWidth;
      const imgH = this.state.image.naturalHeight;
      let pxW, pxH;
      if (imgW / imgH > targetAspect) {
        pxW = Math.round(imgW);
        pxH = Math.round(imgW / targetAspect);
      } else {
        pxH = Math.round(imgH);
        pxW = Math.round(imgH * targetAspect);
      }

      // 高清模式: 2倍分辨率
      const multiplier = mode > 0 ? mode : 1;
      pxW = Math.round(pxW * multiplier);
      pxH = Math.round(pxH * multiplier);

      // 安全上限
      const MAX = 4096;
      if (pxW > MAX || pxH > MAX) {
        const ratio = Math.min(MAX / pxW, MAX / pxH);
        pxW = Math.round(pxW * ratio);
        pxH = Math.round(pxH * ratio);
      }

      const offscreen = document.createElement('canvas');
      const ctx = offscreen.getContext('2d');
      renderImage(ctx, this.state.image, pxW, pxH, {
        zoom: this.state.zoom, offsetX: this.state.offsetX, offsetY: this.state.offsetY,
        rotation: this.state.rotation, fillColor: this.state.fillColor,
      });
      const filename = getOutputFilename(size.name, mode);
      await new Promise(r => setTimeout(r, 50));
      downloadImage(offscreen, filename);
      this.showToast('图片已生成，开始下载');
    } catch (err) {
      this.showToast('下载失败，请重试');
      console.error('下载失败:', err);
    } finally {
      this.els.downloadBtn.disabled = false;
      this.els.downloadBtn.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> 下载图片';
    }
  }

  updateAdjustSummary() { this.els.adjustSummaryText.textContent = `缩放 ${this.state.zoom}% · 位置微调`; }

  updateFrameInfo() {
    const key = this.state.currentFrameKey;
    const on = this.state.frameEnabled;
    if (!on) {
      this.els.frameInfo.textContent = '当前：未开启相框效果';
      return;
    }
    const parts = (key || '').split('_');
    const size = parts[0] || '';
    const orient = parts[1] === 'h' ? '横版' : parts[1] === 'v' ? '竖版' : '';
    this.els.frameInfo.textContent = `当前：${size}片 ${orient}相框`;
  }

  async preloadCurrentFrame() {
    if (!this.state.image) return;
    try {
      const sizeIndex = SIZES.indexOf(this.state.selectedSize);
      if (sizeIndex < 0) return;
      const nr = this.state.rotation % 180 !== 0;
      const pcW = nr ? this.state.selectedSize.heightCm : this.state.selectedSize.widthCm;
      const pcH = nr ? this.state.selectedSize.widthCm : this.state.selectedSize.heightCm;
      const isLandscape = pcW >= pcH;
      const frameKey = getFrameKey(sizeIndex, isLandscape);
      this.state.currentFrameKey = frameKey;
      if (!this.state.frameImages[frameKey]) {
        const img = await loadFrameImage(frameKey);
        this.state.frameImages[frameKey] = img;
      }
      this.updateFrameInfo();
    } catch (e) {
      console.warn('相框预加载失败:', e);
    }
  }

  showLoading() {
    this.hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = '<div class="spinner"></div>';
    this.els.uploadArea.appendChild(overlay);
  }

  hideLoading() { const existing = document.getElementById('loadingOverlay'); if (existing) existing.remove(); }

  showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.add('show');
      setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 2000);
    });
  }
}
