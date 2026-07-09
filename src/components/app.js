import { SIZES, QUALITIES, PRESET_COLORS, DEFAULTS, ZOOM_RANGE } from '../constants.js';
import { renderImage, loadImage } from '../utils/imageProcessor.js';
import { downloadImage, getOutputFilename } from '../utils/download.js';
import { ColorPicker } from './ColorPicker.js';
import { renderFrame, loadFrameImage, getFrameKey, getFrameDisplaySize, FRAME_CONFIG } from '../utils/frameProcessor.js';
import { renderTexts, createDefaultText, genTextId } from '../utils/textProcessor.js';

const PINCH_SENSITIVITY = 0.45;

export class App {
  constructor() {
    this.els = {};
    this.activeTool = 'size';
    this.state = {
      image: null, originalFile: null,
      selectedSize: SIZES[DEFAULTS.sizeIndex],
      quality: DEFAULTS.quality,
      fillColor: DEFAULTS.fillColor,
      zoom: DEFAULTS.zoom,
      rotation: DEFAULTS.rotation,
      isDragging: false, dragStartX: 0, dragStartY: 0,
      isPinching: false, pinchStartDist: 0, pinchStartZoom: 100,
      touchStartTime: 0, touchMoved: false,
      frameEnabled: false, frameImages: {}, currentFrameKey: null, puzzleCanvas: null,
      texts: [], editText: null, draggingText: null,
      // 双指操作文字
      pinchTextId: null, pinchTextStartSize: 36, pinchTextStartRot: 0, pinchTextStartAngle: 0,
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
    this.els.resetBtn = $('resetBtn');
    this.els.reUploadBtn = $('reUploadBtn');
    this.els.downloadBtn = $('downloadBtn');
    this.els.infoText = $('infoText');
    this.els.canvasWrapper = $('canvasWrapper');
    this.els.previewCanvas = $('previewCanvas');
    this.els.dragHint = $('dragHint');
    this.els.frameToggle = $('frameToggle');
    this.els.toolBar = $('toolBar');
    this.els.toolBtns = this.els.toolBar.querySelectorAll('.tool-btn');
    this.els.toolContentInner = $('toolContentInner');
  }

  init() {
    this.els.uploadPlaceholder.addEventListener('click', () => this.els.fileInput.click());
    this.els.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    this.els.uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); this.els.uploadPlaceholder.classList.add('drag-over'); });
    this.els.uploadArea.addEventListener('dragleave', () => this.els.uploadPlaceholder.classList.remove('drag-over'));
    this.els.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault(); this.els.uploadPlaceholder.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) this.processFile(file);
    });

    this.els.resetBtn.addEventListener('click', () => this.resetImage());
    this.els.reUploadBtn.addEventListener('click', () => this.resetToUpload());
    this.els.downloadBtn.addEventListener('click', () => this.handleDownload());

    // 相框开关
    this.els.frameToggle.addEventListener('change', (e) => {
      this.state.frameEnabled = e.target.checked;
      if (this.state.frameEnabled) {
        this.preloadCurrentFrame().then(() => {
          if (this.state.frameEnabled) this.refreshDisplay();
        });
      }
      this.updateInfoBar();
      this.refreshDisplay();
    });

    this.els.toolBtns.forEach(btn => {
      btn.addEventListener('click', () => this.switchTool(btn.dataset.tool));
    });

    this.els.canvasWrapper.addEventListener('mousedown', (e) => this.startDrag(e));
    this.els.canvasWrapper.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    document.addEventListener('mouseup', () => this.endDrag());
    document.addEventListener('touchend', (e) => this.handleTouchEnd(e));

    this.renderToolContent('size');
    this.loadFonts();
  }

  async loadFonts() {
    try {
      await document.fonts.load('16px "SiYuanHei"');
    } catch (e) {}
  }

  // ===================== 工具切换 =====================
  switchTool(tool) {
    if (tool === this.activeTool) return;
    this.activeTool = tool;
    this.els.toolBtns.forEach(b => {
      b.classList.toggle('active', b.dataset.tool === tool);
      if (b.dataset.tool === tool) {
        b.classList.add('tool-btn-pop');
        setTimeout(() => b.classList.remove('tool-btn-pop'), 250);
      }
    });
    this.renderToolContent(tool);
  }

  renderToolContent(tool) {
    const inner = this.els.toolContentInner;
    inner.style.opacity = '0';
    inner.style.transform = 'translateY(6px)';
    setTimeout(() => {
      switch (tool) {
        case 'size': this.renderSizePanel(inner); break;
        case 'quality': this.renderQualityPanel(inner); break;
        case 'adjust': this.renderAdjustPanel(inner); break;
        case 'color': this.renderColorPanel(inner); break;
        case 'text': this.renderTextPanel(inner); break;
      }
      requestAnimationFrame(() => {
        inner.style.transition = 'opacity .25s, transform .25s';
        inner.style.opacity = '1';
        inner.style.transform = 'translateY(0)';
      });
    }, 120);
  }

  renderSizePanel(container) {
    container.innerHTML = `
      <div class="size-scroll">
        ${SIZES.map((s, i) => `<button class="size-btn${i === SIZES.indexOf(this.state.selectedSize) ? ' active' : ''}" data-index="${i}"><span class="size-label">${s.name}</span><span class="size-dim">${s.label}</span></button>`).join('')}
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
    });
  }

  renderQualityPanel(container) {
    container.innerHTML = `
      <div class="quality-group">${QUALITIES.map((q) => `<button class="quality-btn${q.scale === this.state.quality ? ' active' : ''}" data-scale="${q.scale}"><span class="q-name">${q.name}</span><span class="q-dpi">${q.sub}</span></button>`).join('')}</div>
    `;
    container.querySelector('.quality-group').addEventListener('click', (e) => {
      const btn = e.target.closest('.quality-btn');
      if (!btn) return;
      container.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.state.quality = parseInt(btn.dataset.scale);
    });
  }

  renderAdjustPanel(container) {
    container.innerHTML = `
      <div class="slider-group"><label class="slider-label"><span>缩放比例</span><span class="slider-value" id="sZoomVal">${this.state.zoom}%</span></label><input type="range" class="slider" id="sZoomSlider" min="${ZOOM_RANGE.min}" max="${ZOOM_RANGE.max}" value="${this.state.zoom}" step="${ZOOM_RANGE.step}" /></div>
      <div class="rotate-group"><button class="rotate-btn" id="sRotateLeft">↺ 左转90°</button><button class="rotate-btn" id="sRotateRight">↻ 右转90°</button></div>
    `;
    container.querySelector('#sZoomSlider').addEventListener('input', () => {
      const v = parseInt(container.querySelector('#sZoomSlider').value);
      this.state.zoom = v; container.querySelector('#sZoomVal').textContent = v + '%';
      this.updateInfoBar(); this.scheduleRender();
    });
    container.querySelector('#sRotateLeft').addEventListener('click', () => {
      this.state.rotation = (this.state.rotation - 90 + 360) % 360;
      if (this.state.frameEnabled) this.preloadCurrentFrame();
      this.updateInfoBar(); this.scheduleRender();
    });
    container.querySelector('#sRotateRight').addEventListener('click', () => {
      this.state.rotation = (this.state.rotation + 90) % 360;
      if (this.state.frameEnabled) this.preloadCurrentFrame();
      this.updateInfoBar(); this.scheduleRender();
    });
  }

  renderColorPanel(container) {
    const btns = PRESET_COLORS.map((c) => `<button class="color-btn${c.hex === this.state.fillColor ? ' active' : ''}" data-color="${c.hex}" style="background:${c.hex}" title="${c.name}"></button>`).join('');
    container.innerHTML = `<div class="color-grid">${btns}<button class="color-btn custom" id="sCustomColor">+</button></div>`;
    container.querySelector('.color-grid').addEventListener('click', (e) => {
      const btn = e.target.closest('.color-btn');
      if (!btn) return;
      if (btn.id === 'sCustomColor') { new ColorPicker({ initialColor: this.state.fillColor, onConfirm: (color) => this.setActiveColor(color) }); return; }
      this.setActiveColor(btn.dataset.color);
    });
  }

  setActiveColor(color) {
    this.state.fillColor = color;
    // sync all color btn instances (both fill panel and text panel)
    document.querySelectorAll('.color-btn:not(.custom)').forEach(b => {
      const match = b.dataset.color && b.dataset.color.toLowerCase() === color.toLowerCase();
      b.classList.toggle('active', match);
    });
    this.scheduleRender();
  }

  // ===================== 文字工具 =====================
  renderTextPanel(container) {
    const edit = this.state.editText || createDefaultText();
    this.state.editText = edit;

    container.innerHTML = `
      <div class="text-editor">
        <input class="text-input" id="textContent" type="text" value="${edit.content.replace(/"/g,'&quot;')}" placeholder="输入文字内容" maxlength="50" />
        <div class="text-info-row">思源黑体 · 拖拽移动 · 双指缩放大小</div>
        <div class="text-actions">
          <button class="text-btn-primary" id="textAddBtn">${this.state.texts.find(t => t.id === edit.id) ? '更新文字' : '添加文字'}</button>
          <button class="text-btn-danger" id="textDelBtn" style="${this.state.texts.length ? '' : 'display:none'}">删除</button>
        </div>
        <div class="text-list" id="textList">${this.state.texts.map(t => '<div class="text-list-item' + (edit && edit.id === t.id ? ' active' : '') + '" data-tid="' + t.id + '"><span class="text-list-preview">' + t.content + '</span><button class="text-list-del" data-tid="' + t.id + '">✕</button></div>').join('')}</div>
      </div>
    `;

    container.querySelector('#textContent').addEventListener('input', (e) => {
      edit.content = e.target.value; this.state.editText = edit;
    });
    container.querySelector('#textAddBtn').addEventListener('click', () => {
      if (!edit.content.trim()) return;
      const existing = this.state.texts.find(t => t.id === edit.id);
      if (existing) { Object.assign(existing, { content: edit.content, fontSize: edit.fontSize }); }
      else { this.state.texts.push({ id: genTextId(), content: edit.content, font: 'SiYuanHei', fontSize: 36, color: '#FFFFFF', rotation: 0, x: 0.5, y: 0.5 }); }
      this.state.editText = null; this.renderTextPanel(container); this.refreshDisplay();
    });
    container.querySelector('#textDelBtn').addEventListener('click', () => {
      this.state.texts = this.state.texts.filter(t => t.id !== edit.id); this.state.editText = null; this.renderTextPanel(container); this.refreshDisplay();
    });
    container.querySelector('#textList').addEventListener('click', (e) => {
      const item = e.target.closest('.text-list-item'); const delBtn = e.target.closest('.text-list-del');
      if (delBtn) { this.state.texts = this.state.texts.filter(t => t.id !== delBtn.dataset.tid); this.state.editText = null; this.renderTextPanel(container); this.refreshDisplay(); return; }
      if (item) { const t = this.state.texts.find(tx => tx.id === item.dataset.tid); if (t) { this.state.editText = { ...t }; this.renderTextPanel(container); } }
    });
  }

  syncColorBtns(color) {
    document.querySelectorAll('.text-color-group .color-btn:not(.custom)').forEach(b => {
      b.classList.toggle('active', b.dataset.tc && b.dataset.tc.toLowerCase() === color.toLowerCase());
    });
  }

  getTextAtPos(cx, cy, canvas) {
    const pcw = canvas.width; const pch = canvas.height;
    for (let i = this.state.texts.length - 1; i >= 0; i--) {
      const t = this.state.texts[i];
      const tx = t.x * pcw; const ty = t.y * pch;
      const hit = Math.max(t.fontSize * 0.8, 24);
      if (Math.abs(cx - tx) < hit && Math.abs(cy - ty) < hit) return { text: t, index: i };
    }
    return null;
  }

  // ===================== 触摸/拖拽 =====================
  startDrag(e) {
    if (!this.state.image) return;
    const pt = e.touches ? e.touches[0] : e;
    const r = this.els.canvasWrapper.getBoundingClientRect();
    const cx = (pt.clientX - r.left) / r.width;

    // 检查是否点击到文字
    const canvas = this.els.previewCanvas;
    const hit = this.getTextAtPos(cx * canvas.width, pt.clientY * (canvas.height / r.height), canvas);
    if (hit) {
      this.state.draggingText = hit.text;
      this.state.dragStartX = pt.clientX;
      this.state.dragStartY = pt.clientY;
      this.state.touchMoved = false;
      return;
    }

    this.state.isDragging = true;
    this.state.draggingText = null;
    this.els.canvasWrapper.classList.add('dragging');
    this.state.dragStartX = pt.clientX;
    this.state.dragStartY = pt.clientY;
  }

  onDrag(e) {
    if (!this.state.image) return;
    const pos = e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };

    if (this.state.draggingText) {
      const r = this.els.canvasWrapper.getBoundingClientRect();
      this.state.draggingText.x = (pos.x - r.left) / r.width;
      this.state.draggingText.y = (pos.y - r.top) / r.height;
      this.state.draggingText.x = Math.max(0.05, Math.min(0.95, this.state.draggingText.x));
      this.state.draggingText.y = Math.max(0.05, Math.min(0.95, this.state.draggingText.y));
      this.refreshDisplay();
      return;
    }

    const dx = Math.abs(pos.x - this.state.dragStartX);
    const dy = Math.abs(pos.y - this.state.dragStartY);
    if (dx > 5 || dy > 5) this.state.touchMoved = true;
  }

  endDrag() {
    this.state.draggingText = null;
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

  getTouchAngle(e) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    return Math.atan2(dy, dx) * (180 / Math.PI);
  }

  /** 找到第一个手指位置对应的文字 */
  findTextUnderFinger(pt) {
    const r = this.els.canvasWrapper.getBoundingClientRect();
    const cw = this.els.previewCanvas.width;
    const ch = this.els.previewCanvas.height;
    const cx = ((pt.clientX - r.left) / r.width) * cw;
    const cy = ((pt.clientY - r.top) / r.height) * ch;
    const hit = this.getTextAtPos(cx, cy, this.els.previewCanvas);
    return hit;
  }

  handleTouchStart(e) {
    if (e.touches.length >= 2) {
      e.preventDefault();
      const hit = this.findTextUnderFinger(e.touches[0]);
      if (hit) {
        this.state.pinchTextId = hit.text.id;
        this.state.pinchTextStartSize = hit.text.fontSize;
        this.state.pinchTextStartRot = hit.text.rotation;
        this.state.pinchTextStartAngle = this.getTouchAngle(e);
      } else {
        this.state.pinchTextId = null;
      }
      this.state.isPinching = true;
      this.state.pinchStartDist = this.getTouchDistance(e);
      this.state.pinchStartZoom = this.state.zoom;
      this.state.isDragging = false;
      this.els.canvasWrapper.classList.remove('dragging');
    } else if (e.touches.length === 1) {
      this.state.isPinching = false;
      this.state.pinchTextId = null;
      this.state.touchStartTime = Date.now();
      this.state.touchMoved = false;
      this.startDrag(e);
    }
  }

  handleTouchMove(e) {
    if (this.state.isPinching && e.touches.length >= 2) {
      e.preventDefault();
      const dist = this.getTouchDistance(e);

      if (this.state.pinchTextId) {
        const text = this.state.texts.find(t => t.id === this.state.pinchTextId);
        if (text) {
          // 缩放
          const ratio = dist / this.state.pinchStartDist;
          let newSize = Math.round(this.state.pinchTextStartSize * (1 + (ratio - 1) * 1.5));
          text.fontSize = Math.max(12, Math.min(200, newSize));
          this.refreshDisplay();
        }
      } else {
        const nz = Math.round(this.state.pinchStartZoom * (1 + ((dist - this.state.pinchStartDist) * PINCH_SENSITIVITY) / this.state.pinchStartDist));
        const clamped = Math.max(ZOOM_RANGE.min, Math.min(ZOOM_RANGE.max, nz));
        this.state.zoom = clamped;
        if (this.activeTool === 'adjust') {
          const sZoom = this.els.toolContentInner.querySelector('#sZoomSlider');
          const vZoom = this.els.toolContentInner.querySelector('#sZoomVal');
          if (sZoom) { sZoom.value = clamped; vZoom.textContent = clamped + '%'; }
        }
        this.updateInfoBar();
        this.scheduleRender();
      }
    } else if (!this.state.isPinching && e.touches.length === 1) {
      const dx = Math.abs(e.touches[0].clientX - this.state.dragStartX);
      const dy = Math.abs(e.touches[0].clientY - this.state.dragStartY);
      if (dx > 5 || dy > 5) this.state.touchMoved = true;
      this.onDrag(e);
    }
  }

  handleTouchEnd(e) {
    if (this.state.isPinching) { this.state.isPinching = false; this.state.pinchTextId = null; this.endDrag(); return; }
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
      this.state.rotation = DEFAULTS.rotation;
      this.state.fillColor = DEFAULTS.fillColor;
      this.state.puzzleCanvas = null;
      this.state.frameEnabled = false;
      this.setActiveColor(DEFAULTS.fillColor);

      this.els.uploadArea.style.display = 'none';
      this.els.editorArea.style.display = 'flex';
      this.els.frameToggle.checked = false;
      this.activeTool = 'size';
      this.els.toolBtns.forEach(b => b.classList.toggle('active', b.dataset.tool === 'size'));
      this.renderToolContent('size');
      this.updateInfoBar();
      this.hideLoading();
      this.scheduleRender();
      this.preloadAllFrames();
    } catch (err) {
      this.hideLoading();
      this.showToast('图片加载失败，请重试');
    }
  }

  resetToUpload() {
    this.state.image = null;
    this.state.originalFile = null;
    this.state.puzzleCanvas = null;
    this.state.frameEnabled = false;
    this.state.frameImages = {};
    this.state.currentFrameKey = null;
    this.state.texts = [];
    this.els.uploadArea.style.display = 'flex';
    this.els.editorArea.style.display = 'none';
    this.els.fileInput.value = '';
  }

  resetImage() {
    if (!this.state.image) return;
    this.state.zoom = DEFAULTS.zoom;
    this.state.rotation = DEFAULTS.rotation;
    this.state.puzzleCanvas = null;
    this.updateInfoBar();
    this.scheduleRender();
    this.showToast('已重置');
  }

  // ===================== 分层渲染 =====================
  scheduleRender() {
    if (this.renderTimer) cancelAnimationFrame(this.renderTimer);
    this.els.previewCanvas.classList.add('updating');
    this.renderTimer = requestAnimationFrame(() => {
      this.rebuildPuzzle();
      this.refreshDisplay();
      this.els.previewCanvas.classList.remove('updating');
    });
  }

  rebuildPuzzle() {
    if (!this.state.image) return;
    const size = this.state.selectedSize;
    const nr = this.state.rotation % 180 !== 0;
    const cmW = nr ? size.heightCm : size.widthCm;
    const cmH = nr ? size.widthCm : size.heightCm;
    const wrapper = this.els.canvasWrapper;
    const wrapperW = wrapper.clientWidth;
    const wrapperH = wrapper.clientHeight;
    const aspect = cmW / cmH;
    let pvw, pvh;
    if (wrapperW / wrapperH > aspect) {
      pvh = Math.round(wrapperH * 0.95);
      pvw = Math.round(pvh * aspect);
    } else {
      pvw = Math.round(wrapperW * 0.95);
      pvh = Math.round(pvw / aspect);
    }
    const MAX_PREV = window.innerWidth < 480 ? 600 : 1000;
    if (pvw > MAX_PREV) { pvw = MAX_PREV; pvh = Math.round(pvw / aspect); }
    if (pvh > MAX_PREV) { pvh = MAX_PREV; pvw = Math.round(pvh * aspect); }

    const pc = this.state.puzzleCanvas || (this.state.puzzleCanvas = document.createElement('canvas'));
    pc.width = pvw;
    pc.height = pvh;
    renderImage(pc.getContext('2d'), this.state.image, pvw, pvh, {
      zoom: this.state.zoom, offsetX: 0, offsetY: 0,
      rotation: this.state.rotation, fillColor: this.state.fillColor,
    });
    this._baseDim = { w: pvw, h: pvh };
  }

  /** 刷新显示：叠加相框 + 叠加文字 */
  refreshDisplay() {
    if (!this.state.image || !this._baseDim) return;
    const canvas = this.els.previewCanvas;
    const ctx = canvas.getContext('2d');
    const pc = this.state.puzzleCanvas;
    const { w: pvw, h: pvh } = this._baseDim;

    if (this.state.frameEnabled) {
      const frameKey = this.state.currentFrameKey;
      const frameImg = this.state.frameImages[frameKey];
      if (!frameImg || !frameKey) { this.drawBaseOnly(canvas, ctx, pc, pvw, pvh); this.drawTexts(canvas); return; }
      const cfg = FRAME_CONFIG[frameKey];
      const wrapper = this.els.canvasWrapper;
      const wrapW = wrapper.clientWidth;
      const wrapH = wrapper.clientHeight;
      const frameAspect = cfg.frameWidth / cfg.frameHeight;
      const margin = 0.94;
      let dsW, dsH;
      if ((wrapW * margin) / (wrapH * margin) > frameAspect) {
        dsH = Math.round(wrapH * margin); dsW = Math.round(dsH * frameAspect);
      } else {
        dsW = Math.round(wrapW * margin); dsH = Math.round(dsW / frameAspect);
      }
      canvas.classList.add('frame-active');
      canvas.width = dsW;
      canvas.height = dsH;
      canvas.style.width = '';
      canvas.style.height = '';
      renderFrame(ctx, pc, frameKey, frameImg, dsW, dsH);
    } else {
      this.drawBaseOnly(canvas, ctx, pc, pvw, pvh);
    }
    // 文字在相框之上
    renderTexts(ctx, this.state.texts, canvas.width, canvas.height);
  }

  drawBaseOnly(canvas, ctx, pc, pvw, pvh) {
    canvas.classList.remove('frame-active');
    canvas.style.width = '';
    canvas.style.height = '';
    canvas.width = pvw;
    canvas.height = pvh;
    ctx.drawImage(pc, 0, 0);
  }

  drawTexts(canvas) {
    const ctx = canvas.getContext('2d');
    renderTexts(ctx, this.state.texts, canvas.width, canvas.height);
  }

  // ===================== 下载 =====================
  async handleDownload() {
    if (!this.state.image) return;
    try {
      this.els.downloadBtn.disabled = true;
      this.els.downloadBtn.style.opacity = '.5';
      const size = this.state.selectedSize;
      const mode = this.state.quality;
      const nr = this.state.rotation % 180 !== 0;
      const cmW = nr ? size.heightCm : size.widthCm, cmH = nr ? size.widthCm : size.heightCm;
      const aspect = cmW / cmH;
      const imgW = this.state.image.naturalWidth;
      const imgH = this.state.image.naturalHeight;
      let pxW, pxH;
      if (imgW / imgH > aspect) { pxW = Math.round(imgW); pxH = Math.round(imgW / aspect); }
      else { pxH = Math.round(imgH); pxW = Math.round(imgH * aspect); }
      const mul = mode > 0 ? mode : 1;
      pxW = Math.round(pxW * mul); pxH = Math.round(pxH * mul);
      const MAX = 4096;
      if (pxW > MAX || pxH > MAX) { const r = Math.min(MAX / pxW, MAX / pxH); pxW = Math.round(pxW * r); pxH = Math.round(pxH * r); }

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      renderImage(ctx, this.state.image, pxW, pxH, {
        zoom: this.state.zoom, offsetX: 0, offsetY: 0,
        rotation: this.state.rotation, fillColor: this.state.fillColor,
      });
      // 叠加用户文字到下载图
      if (this.state.texts.length > 0) {
        renderTexts(ctx, this.state.texts, pxW, pxH);
      }
      const filename = getOutputFilename(size.name, mode);
      await new Promise(r => setTimeout(r, 50));
      downloadImage(canvas, filename);
      this.showToast('图片已生成，开始下载');
    } catch (err) { this.showToast('下载失败，请重试');
    } finally {
      this.els.downloadBtn.disabled = false;
      this.els.downloadBtn.style.opacity = '1';
    }
  }

  // ===================== 信息栏 =====================
  updateInfoBar() {
    const size = this.state.selectedSize;
    const nr = this.state.rotation % 180 !== 0;
    const cmW = nr ? size.heightCm : size.widthCm;
    const cmH = nr ? size.widthCm : size.heightCm;
    const ft = this.state.frameEnabled ? ' · 相框已开启' : '';
    this.els.infoText.textContent = `${size.name} · ${cmW}×${cmH}cm · 缩放${this.state.zoom}%${ft}`;
  }

  // ===================== 相框 =====================
  preloadCurrentFrame() {
    if (!this.state.image) return Promise.resolve();
    const sizeIndex = SIZES.indexOf(this.state.selectedSize);
    if (sizeIndex < 0) return Promise.resolve();
    const nr = this.state.rotation % 180 !== 0;
    const pcW = nr ? this.state.selectedSize.heightCm : this.state.selectedSize.widthCm;
    const pcH = nr ? this.state.selectedSize.widthCm : this.state.selectedSize.heightCm;
    const isLandscape = pcW >= pcH;
    const frameKey = getFrameKey(sizeIndex, isLandscape);
    this.state.currentFrameKey = frameKey;
    if (this.state.frameImages[frameKey]) return Promise.resolve();
    return loadFrameImage(frameKey).then(img => { this.state.frameImages[frameKey] = img; }).catch(e => console.warn('相框加载失败:', e));
  }

  preloadAllFrames() {
    const ALL_KEYS = ['35_h','35_v','70_h','70_v','120_h','120_v','200_h','200_v','300_h','300_v'];
    ALL_KEYS.forEach(key => {
      if (!this.state.frameImages[key]) { loadFrameImage(key).then(img => { this.state.frameImages[key] = img; }).catch(() => {}); }
    });
  }

  // ===================== UI =====================
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
