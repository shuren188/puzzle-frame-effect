import { SIZES, QUALITIES, PRESET_COLORS, DEFAULTS, DRAG_SENSITIVITY } from '../constants.js';
import { renderImage, loadImage, getPreviewSize } from '../utils/imageProcessor.js';
import { downloadImage, getOutputFilename } from '../utils/download.js';
import { ColorPicker } from './ColorPicker.js';
import { renderFrame, loadFrameImage, getFrameKey, getFrameDisplaySize } from '../utils/frameProcessor.js';

const PINCH_SENSITIVITY = 0.45;

export class App {
  constructor() {
    this.els = {};
    this.activeTool = null;
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
      frameEnabled: false, frameImages: {}, currentFrameKey: null, puzzleCanvas: null,
    };
    this.renderTimer = null;
    this.cacheDOM();
    this.init();
  }

  cacheDOM() {
    const $ = (id) => document.getElementById(id);
    this.els.uploadArea = $('uploadArea');
    this.els.uploadPlaceholder = $('uploadPlaceholder');
    this.els.fileInput = $('fileInput');
    this.els.editorArea = $('editorArea');
    this.els.topBar = $('topBar');
    this.els.resetBtn = $('resetBtn');
    this.els.reUploadBtn = $('reUploadBtn');
    this.els.downloadBtn = $('downloadBtn');
    this.els.infoText = $('infoText');
    this.els.canvasWrapper = $('canvasWrapper');
    this.els.previewCanvas = $('previewCanvas');
    this.els.dragHint = $('dragHint');
    this.els.toolBar = $('toolBar');
    this.els.toolBtns = this.els.toolBar.querySelectorAll('.tool-btn');
    this.els.toolSheet = $('toolSheet');
    this.els.sheetTitle = $('sheetTitle');
    this.els.sheetBody = $('sheetBody');
    this.els.sheetClose = $('sheetClose');
  }

  init() {
    // 上传区域
    this.els.uploadPlaceholder.addEventListener('click', () => this.els.fileInput.click());
    this.els.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.els.uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); this.els.uploadPlaceholder.classList.add('drag-over'); });
    this.els.uploadArea.addEventListener('dragleave', () => this.els.uploadPlaceholder.classList.remove('drag-over'));
    this.els.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault(); this.els.uploadPlaceholder.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) this.processFile(file);
    });

    // 顶栏
    this.els.resetBtn.addEventListener('click', () => this.resetImage());
    this.els.reUploadBtn.addEventListener('click', () => this.resetToUpload());
    this.els.downloadBtn.addEventListener('click', () => this.handleDownload());

    // 底部工具栏
    this.els.toolBtns.forEach(btn => {
      btn.addEventListener('click', () => this.toggleTool(btn.dataset.tool));
    });

    // 面板关闭
    this.els.sheetClose.addEventListener('click', () => this.closeSheet());

    // 触摸拖拽
    this.els.canvasWrapper.addEventListener('mousedown', (e) => this.startDrag(e));
    this.els.canvasWrapper.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    document.addEventListener('mouseup', () => this.endDrag());
    document.addEventListener('touchend', (e) => this.handleTouchEnd(e));
    this.els.canvasWrapper.addEventListener('click', (e) => {
      if (this.state.image && !this.state.isDragging && !this.isSheetOpen()) this.openFullscreenPreview(e);
    });
  }

  /** 工具切换 */
  toggleTool(tool) {
    if (this.activeTool === tool && this.els.toolSheet.classList.contains('open')) {
      this.closeSheet();
      return;
    }
    this.activeTool = tool;
    this.els.toolBtns.forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
    this.renderSheetContent(tool);
    this.els.sheetTitle.textContent = this.getToolTitle(tool);
    requestAnimationFrame(() => this.els.toolSheet.classList.add('open'));
  }

  closeSheet() {
    this.els.toolSheet.classList.remove('open');
    this.els.toolBtns.forEach(b => b.classList.remove('active'));
    this.activeTool = null;
  }

  isSheetOpen() {
    return this.els.toolSheet.classList.contains('open');
  }

  getToolTitle(tool) {
    const titles = { size: '选择尺寸', quality: '输出质量', adjust: '调整', color: '填充颜色', frame: '相框效果' };
    return titles[tool] || tool;
  }

  /** 渲染面板内容 */
  renderSheetContent(tool) {
    const body = this.els.sheetBody;
    switch (tool) {
      case 'size': this.renderSizePanel(body); break;
      case 'quality': this.renderQualityPanel(body); break;
      case 'adjust': this.renderAdjustPanel(body); break;
      case 'color': this.renderColorPanel(body); break;
      case 'frame': this.renderFramePanel(body); break;
    }
  }

  renderSizePanel(container) {
    container.innerHTML = `
      <div class="size-scroll" id="sheetSizeScroll">
        ${SIZES.map((s, i) => `
          <button class="size-btn${i === SIZES.indexOf(this.state.selectedSize) ? ' active' : ''}" data-index="${i}">
            <span class="size-label">${s.name}</span>
            <span class="size-dim">${s.label}</span>
          </button>
        `).join('')}
      </div>
    `;
    container.querySelector('.size-scroll').addEventListener('click', (e) => {
      const btn = e.target.closest('.size-btn');
      if (!btn) return;
      container.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.state.selectedSize = SIZES[parseInt(btn.dataset.index)];
      if (this.state.frameEnabled) this.preloadCurrentFrame();
      this.updateInfoBar();
      this.scheduleRender();
      // 自动关闭面板
      setTimeout(() => this.closeSheet(), 200);
    });
  }

  renderQualityPanel(container) {
    container.innerHTML = `
      <div class="quality-group" id="sheetQualityGroup">
        ${QUALITIES.map((q) => `
          <button class="quality-btn${q.scale === this.state.quality ? ' active' : ''}" data-scale="${q.scale}">
            <span class="q-name">${q.name}</span>
            <span class="q-dpi">${q.sub}</span>
          </button>
        `).join('')}
      </div>
    `;
    container.querySelector('.quality-group').addEventListener('click', (e) => {
      const btn = e.target.closest('.quality-btn');
      if (!btn) return;
      container.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.state.quality = parseInt(btn.dataset.scale);
      this.scheduleRender();
      setTimeout(() => this.closeSheet(), 200);
    });
  }

  renderAdjustPanel(container) {
    const nr = this.state.rotation % 180 !== 0;
    container.innerHTML = `
      <div class="slider-group">
        <label class="slider-label"><span>缩放</span><span class="slider-value" id="sZoomVal">${this.state.zoom}%</span></label>
        <input type="range" class="slider" id="sZoomSlider" min="50" max="150" value="${this.state.zoom}" step="1" />
      </div>
      <div class="slider-group">
        <label class="slider-label"><span>水平偏移</span><span class="slider-value" id="sOffsetXVal">${this.state.offsetX}%</span></label>
        <input type="range" class="slider" id="sOffsetXSlider" min="-100" max="100" value="${this.state.offsetX}" step="1" />
      </div>
      <div class="slider-group">
        <label class="slider-label"><span>垂直偏移</span><span class="slider-value" id="sOffsetYVal">${this.state.offsetY}%</span></label>
        <input type="range" class="slider" id="sOffsetYSlider" min="-100" max="100" value="${this.state.offsetY}" step="1" />
      </div>
      <div class="rotate-group">
        <button class="rotate-btn" id="sRotateLeft">↺ 左转90°</button>
        <button class="rotate-btn" id="sRotateRight">↻ 右转90°</button>
      </div>
    `;

    const bindSlider = (id, valId, key) => {
      const slider = container.querySelector(id);
      const valEl = container.querySelector(valId);
      slider.addEventListener('input', () => {
        const v = parseInt(slider.value);
        this.state[key] = v;
        valEl.textContent = v + '%';
        this.updateInfoBar();
        this.scheduleRender();
      });
    };
    bindSlider('#sZoomSlider', '#sZoomVal', 'zoom');
    bindSlider('#sOffsetXSlider', '#sOffsetXVal', 'offsetX');
    bindSlider('#sOffsetYSlider', '#sOffsetYVal', 'offsetY');

    container.querySelector('#sRotateLeft').addEventListener('click', () => {
      this.state.rotation = (this.state.rotation - 90 + 360) % 360;
      if (this.state.frameEnabled) this.preloadCurrentFrame();
      this.updateInfoBar();
      this.scheduleRender();
    });
    container.querySelector('#sRotateRight').addEventListener('click', () => {
      this.state.rotation = (this.state.rotation + 90) % 360;
      if (this.state.frameEnabled) this.preloadCurrentFrame();
      this.updateInfoBar();
      this.scheduleRender();
    });
  }

  renderColorPanel(container) {
    const btns = PRESET_COLORS.map((c, i) =>
      `<button class="color-btn${c.hex === this.state.fillColor ? ' active' : ''}" data-color="${c.hex}" style="background:${c.hex}" title="${c.name}"></button>`
    ).join('');
    container.innerHTML = `<div class="color-grid">${btns}<button class="color-btn custom" id="sCustomColor">+</button></div>`;
    container.querySelector('.color-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.color-btn');
      if (!btn) return;
      if (btn.id === 'sCustomColor') {
        new ColorPicker({
          initialColor: this.state.fillColor,
          onConfirm: (color) => this.setActiveColor(color),
        });
        return;
      }
      this.setActiveColor(btn.dataset.color);
    });
  }

  renderFramePanel(container) {
    const active = this.state.frameEnabled;
    const key = this.state.currentFrameKey || '';
    const parts = key.split('_');
    const info = key ? `${parts[0]}片 ${parts[1] === 'h' ? '横版' : '竖版'}相框` : '未选择';
    container.innerHTML = `
      <div class="frame-toggle-row">
        <span class="frame-toggle-label">相框效果</span>
        <label class="switch">
          <input type="checkbox" id="sFrameToggle" ${active ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>
      </div>
      <div class="frame-info" id="sFrameInfo">${active ? '当前：' + info : '开启后预览将叠加装饰相框'}</div>
    `;
    container.querySelector('#sFrameToggle').addEventListener('change', (e) => {
      this.state.frameEnabled = e.target.checked;
      if (this.state.frameEnabled) this.preloadCurrentFrame();
      this.updateInfoBar();
      this.scheduleRender();
    });
  }

  setActiveColor(color) {
    this.state.fillColor = color;
    const body = this.els.sheetBody;
    body.querySelectorAll('.color-btn:not(.custom)').forEach(b => {
      b.classList.toggle('active', b.dataset.color.toLowerCase() === color.toLowerCase());
    });
    this.scheduleRender();
  }

  // ===================== 拖拽 =====================
  startDrag(e) {
    if (!this.state.image) return;
    const pt = e.touches ? e.touches[0] : e;
    if (!this.isTouchOnImage(pt)) return;
    this.state.isDragging = true;
    this.els.canvasWrapper.classList.add('dragging');
    this.state.dragStartX = pt.clientX;
    this.state.dragStartY = pt.clientY;
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
    this.state.offsetX = Math.round(Math.max(-100, Math.min(100, this.state.dragStartOffsetX + (mw > 0 ? (dx / mw) * 100 : 0))));
    this.state.offsetY = Math.round(Math.max(-100, Math.min(100, this.state.dragStartOffsetY + (mh > 0 ? (dy / mh) * 100 : 0))));
    // 更新sheet内的滑块（如果打开）
    if (this.activeTool === 'adjust') {
      const sOffX = this.els.sheetBody.querySelector('#sOffsetXSlider');
      const sOffY = this.els.sheetBody.querySelector('#sOffsetYSlider');
      const vOffX = this.els.sheetBody.querySelector('#sOffsetXVal');
      const vOffY = this.els.sheetBody.querySelector('#sOffsetYVal');
      if (sOffX) { sOffX.value = this.state.offsetX; vOffX.textContent = this.state.offsetX + '%'; }
      if (sOffY) { sOffY.value = this.state.offsetY; vOffY.textContent = this.state.offsetY + '%'; }
    }
    this.scheduleRender();
  }

  endDrag() {
    if (this.state.isDragging) {
      this.state.isDragging = false;
      this.els.canvasWrapper.classList.remove('dragging');
    }
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

  // ===================== 触摸 =====================
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
      if (this.activeTool === 'adjust') {
        const sZoom = this.els.sheetBody.querySelector('#sZoomSlider');
        const vZoom = this.els.sheetBody.querySelector('#sZoomVal');
        if (sZoom) { sZoom.value = clamped; vZoom.textContent = clamped + '%'; }
      }
      this.updateInfoBar();
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
    if (!this.state.touchMoved && elapsed < 300 && this.state.image && !this.isSheetOpen()) this.openFullscreenPreview(e);
    this.endDrag();
  }

  // ===================== 文件处理 =====================
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
      this.state.puzzleCanvas = null;
      this.state.frameEnabled = false;
      this.setActiveColor(DEFAULTS.fillColor);

      this.els.uploadArea.style.display = 'none';
      this.els.editorArea.style.display = 'flex';
      this.updateInfoBar();
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
    this.closeSheet();
    this.els.uploadArea.style.display = 'flex';
    this.els.editorArea.style.display = 'none';
    this.els.fileInput.value = '';
  }

  resetImage() {
    if (!this.state.image) return;
    this.state.zoom = DEFAULTS.zoom;
    this.state.offsetX = DEFAULTS.offsetX;
    this.state.offsetY = DEFAULTS.offsetY;
    this.state.rotation = DEFAULTS.rotation;
    this.state.puzzleCanvas = null;
    this.updateInfoBar();
    this.scheduleRender();
    this.showToast('已重置');
  }

  // ===================== 预览渲染 =====================
  scheduleRender() {
    if (this.renderTimer) cancelAnimationFrame(this.renderTimer);
    this.els.previewCanvas.classList.add('updating');
    this.renderTimer = requestAnimationFrame(() => this.renderPreview());
  }

  renderPreview() {
    if (!this.state.image) return;
    const size = this.state.selectedSize;
    const nr = this.state.rotation % 180 !== 0;
    const cmW = nr ? size.heightCm : size.widthCm;
    const cmH = nr ? size.widthCm : size.heightCm;

    // 计算预览尺寸：基于可用空间
    const wrapper = this.els.canvasWrapper;
    const wrapperW = wrapper.clientWidth;
    const wrapperH = wrapper.clientHeight;
    // 目标比例
    const aspect = cmW / cmH;
    let pvw, pvh;
    if (wrapperW / wrapperH > aspect) {
      pvh = Math.round(wrapperH * 0.92);
      pvw = Math.round(pvh * aspect);
    } else {
      pvw = Math.round(wrapperW * 0.92);
      pvh = Math.round(pvw / aspect);
    }
    // 限制最大尺寸（性能）
    const MAX_PREV = 800;
    if (pvw > MAX_PREV) { pvw = MAX_PREV; pvh = Math.round(pvw / aspect); }
    if (pvh > MAX_PREV) { pvh = MAX_PREV; pvw = Math.round(pvh * aspect); }

    // Step 1: PuzzleCanvas
    const pc = this.state.puzzleCanvas || (this.state.puzzleCanvas = document.createElement('canvas'));
    pc.width = pvw;
    pc.height = pvh;
    renderImage(pc.getContext('2d'), this.state.image, pvw, pvh, {
      zoom: this.state.zoom, offsetX: this.state.offsetX, offsetY: this.state.offsetY,
      rotation: this.state.rotation, fillColor: this.state.fillColor,
    });

    // Step 2: 显示
    if (this.state.frameEnabled) {
      this.renderFramePreview(pc);
    } else {
      this.renderNormalPreview(pc);
    }
    this.els.previewCanvas.classList.remove('updating');
  }

  renderNormalPreview(pc) {
    const canvas = this.els.previewCanvas;
    const ctx = canvas.getContext('2d');
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.width = pc.width;
    canvas.height = pc.height;
    ctx.drawImage(pc, 0, 0);
  }

  renderFramePreview(pc) {
    const frameKey = this.state.currentFrameKey;
    const frameImg = this.state.frameImages[frameKey];
    if (!frameImg || !frameKey) {
      this.renderNormalPreview(pc);
      return;
    }
    const ds = getFrameDisplaySize(frameKey, 260);
    const canvas = this.els.previewCanvas;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    renderFrame(ctx, pc, frameKey, frameImg, ds.width, ds.height);
  }

  // ===================== 全屏预览 =====================
  openFullscreenPreview() {
    if (!this.state.image) return;
    const s = this.state.selectedSize;
    const nr = this.state.rotation % 180 !== 0;
    const cmW = nr ? s.heightCm : s.widthCm, cmH = nr ? s.widthCm : s.heightCm;
    const ta = cmW / cmH;
    let pvw = 480, pvh = Math.round(pvw / ta);
    if (pvh > 680) { pvh = 680; pvw = Math.round(pvh * ta); }

    const puzzleCanvas = document.createElement('canvas');
    const pcCtx = puzzleCanvas.getContext('2d');
    renderImage(pcCtx, this.state.image, pvw, pvh, {
      zoom: this.state.zoom, offsetX: this.state.offsetX, offsetY: this.state.offsetY,
      rotation: this.state.rotation, fillColor: this.state.fillColor,
    });

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
    img.style.cssText = 'max-width:100%;max-height:100%;object-fit:contain;border-radius:6px;';

    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
    closeBtn.style.cssText = 'position:fixed;top:20px;right:20px;width:40px;height:40px;border:none;border-radius:50%;background:rgba(255,255,255,0.08);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2;-webkit-tap-highlight-color:transparent;';
    closeBtn.onclick = () => document.body.removeChild(overlay);

    overlay.appendChild(img);
    overlay.appendChild(closeBtn);
    document.body.appendChild(overlay);
  }

  // ===================== 下载 =====================
  async handleDownload() {
    if (!this.state.image) return;
    try {
      this.els.downloadBtn.disabled = true;
      this.els.downloadBtn.innerHTML = '<span style="font-size:14px">...</span>';
      const size = this.state.selectedSize;
      const mode = this.state.quality;
      const nr = this.state.rotation % 180 !== 0;
      const cmW = nr ? size.heightCm : size.widthCm, cmH = nr ? size.widthCm : size.heightCm;
      const targetAspect = cmW / cmH;
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
      const multiplier = mode > 0 ? mode : 1;
      pxW = Math.round(pxW * multiplier);
      pxH = Math.round(pxH * multiplier);
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
      this.els.downloadBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`;
    }
  }

  // ===================== 信息栏 =====================
  updateInfoBar() {
    const size = this.state.selectedSize;
    const nr = this.state.rotation % 180 !== 0;
    const cmW = nr ? size.heightCm : size.widthCm;
    const cmH = nr ? size.widthCm : size.heightCm;
    const frameText = this.state.frameEnabled ? ' · 相框开' : '';
    this.els.infoText.textContent = `${size.name} · ${cmW}×${cmH}cm · 缩放${this.state.zoom}%${frameText}`;
  }

  // ===================== 相框 =====================
  updateFrameInfo() {
    const key = this.state.currentFrameKey;
    const on = this.state.frameEnabled;
    const infoEl = this.els.sheetBody.querySelector('#sFrameInfo');
    if (!infoEl) return;
    if (!on) {
      infoEl.textContent = '开启后预览将叠加装饰相框';
      return;
    }
    const parts = (key || '').split('_');
    const size = parts[0] || '';
    const orient = parts[1] === 'h' ? '横版' : parts[1] === 'v' ? '竖版' : '';
    infoEl.textContent = `当前：${size}片 ${orient}相框`;
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

  // ===================== 工具UI =====================
  showLoading() {
    this.hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = '<div class="spinner"></div>';
    this.els.uploadArea.appendChild(overlay);
  }

  hideLoading() { const el = document.getElementById('loadingOverlay'); if (el) el.remove(); }

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
