import { SIZES, QUALITIES, PRESET_COLORS, DEFAULTS, TEXT, DRAG_SENSITIVITY } from '../constants.js';
import { renderImage, loadImage, getPreviewSize } from '../utils/imageProcessor.js';
import { downloadImage, getOutputFilename, isWeChat } from '../utils/download.js';
import { ColorPicker } from './ColorPicker.js';

/**
 * 主应用控制器
 * 管理所有 UI 交互和图片处理流程
 */
export class App {
  constructor() {
    // DOM 引用
    this.els = {};
    this.cacheDOM();

    // 状态
    this.state = {
      image: null,            // 当前加载的图片 (HTMLImageElement)
      originalFile: null,     // 原始文件
      selectedSize: SIZES[DEFAULTS.sizeIndex],
      quality: DEFAULTS.quality,
      fillColor: DEFAULTS.fillColor,
      zoom: DEFAULTS.zoom,
      offsetX: DEFAULTS.offsetX,
      offsetY: DEFAULTS.offsetY,
      rotation: DEFAULTS.rotation,
      isDragging: false,
      dragStartX: 0,
      dragStartY: 0,
      dragStartOffsetX: 0,
      dragStartOffsetY: 0,
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
    this.els.controlsSection = document.getElementById('controlsSection');
    this.els.sizeScroll = document.getElementById('sizeScroll');
    this.els.qualityGroup = document.getElementById('qualityGroup');
    this.els.colorGrid = document.getElementById('colorGrid');
    this.els.downloadBtn = document.getElementById('downloadBtn');

    // Tab 切换
    this.els.tabBtns = document.querySelectorAll('.tab-btn');
    this.els.panelAdjust = document.getElementById('panelAdjust');
    this.els.panelColor = document.getElementById('panelColor');

    // 调整面板
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
  }

  init() {
    this.renderSizeButtons();
    this.renderQualityButtons();
    this.renderColorButtons();
    this.bindEvents();
  }

  // ===================== 渲染 UI =====================

  renderSizeButtons() {
    this.els.sizeScroll.innerHTML = SIZES.map((size, i) => `
      <button class="size-btn${i === DEFAULTS.sizeIndex ? ' active' : ''}" data-index="${i}">
        <span class="size-label">${size.name}</span>
        <span class="size-dim">${size.label}</span>
      </button>
    `).join('');
  }

  renderQualityButtons() {
    this.els.qualityGroup.innerHTML = QUALITIES.map((q, i) => `
      <button class="quality-btn${i === 0 ? ' active' : ''}" data-value="${q.value}">
        <span class="q-name">${q.name}</span>
      </button>
    `).join('');
  }

  renderColorButtons() {
    const btns = PRESET_COLORS.map((c, i) => `
      <button class="color-btn${c.hex === DEFAULTS.fillColor ? ' active' : ''}"
              data-color="${c.hex}"
              style="background:${c.hex}"
              title="${c.name}"></button>
    `).join('');
    this.els.colorGrid.innerHTML = btns + `
      <button class="color-btn custom-btn" id="customColorBtn" title="自定义颜色">+</button>
    `;
  }

  // ===================== 事件绑定 =====================

  bindEvents() {
    // 上传 - 点击
    this.els.uploadPlaceholder.addEventListener('click', () => this.els.fileInput.click());
    this.els.fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

    // 上传 - 拖拽
    this.els.uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.els.uploadPlaceholder.classList.add('drag-over');
    });
    this.els.uploadArea.addEventListener('dragleave', () => {
      this.els.uploadPlaceholder.classList.remove('drag-over');
    });
    this.els.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      this.els.uploadPlaceholder.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith('image/')) {
        this.processFile(file);
      }
    });

    // 重新上传
    this.els.reUploadBtn.addEventListener('click', () => this.resetToUpload());

    // 尺寸选择（事件委托）
    this.els.sizeScroll.addEventListener('click', (e) => {
      const btn = e.target.closest('.size-btn');
      if (!btn) return;
      this.els.sizeScroll.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const idx = parseInt(btn.dataset.index);
      this.state.selectedSize = SIZES[idx];
      this.scheduleRender();
    });

    // 质量选择（事件委托）
    this.els.qualityGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.quality-btn');
      if (!btn) return;
      this.els.qualityGroup.querySelectorAll('.quality-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      this.state.quality = parseInt(btn.dataset.value);
      this.scheduleRender();
    });

    // Tab 切换
    this.els.tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        this.els.tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        this.els.panelAdjust.classList.toggle('active', tab === 'adjust');
        this.els.panelColor.classList.toggle('active', tab === 'color');
      });
    });

    // 缩放
    this.els.zoomSlider.addEventListener('input', () => {
      const val = parseInt(this.els.zoomSlider.value);
      this.state.zoom = val;
      this.els.zoomValue.textContent = val + '%';
      this.updateAdjustSummary();
      this.scheduleRender();
    });

    // 水平偏移
    this.els.offsetXSlider.addEventListener('input', () => {
      const val = parseInt(this.els.offsetXSlider.value);
      this.state.offsetX = val;
      this.els.offsetXValue.textContent = val + '%';
      this.scheduleRender();
    });

    // 垂直偏移
    this.els.offsetYSlider.addEventListener('input', () => {
      const val = parseInt(this.els.offsetYSlider.value);
      this.state.offsetY = val;
      this.els.offsetYValue.textContent = val + '%';
      this.scheduleRender();
    });

    // 旋转
    this.els.rotateLeftBtn.addEventListener('click', () => {
      this.state.rotation = (this.state.rotation - 90 + 360) % 360;
      this.scheduleRender();
    });
    this.els.rotateRightBtn.addEventListener('click', () => {
      this.state.rotation = (this.state.rotation + 90) % 360;
      this.scheduleRender();
    });

    // 颜色选择（事件委托）
    this.els.colorGrid.addEventListener('click', (e) => {
      const btn = e.target.closest('.color-btn');
      if (!btn) return;

      if (btn.id === 'customColorBtn') {
        this.openColorPicker();
        return;
      }

      this.setActiveColor(btn.dataset.color);
    });

    // 下载按钮
    this.els.downloadBtn.addEventListener('click', () => this.handleDownload());

    // 拖拽调整位置（canvas 内）
    this.els.canvasWrapper.addEventListener('mousedown', (e) => this.startDrag(e));
    this.els.canvasWrapper.addEventListener('touchstart', (e) => this.startDrag(e), { passive: false });
    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('touchmove', (e) => this.onDrag(e), { passive: false });
    document.addEventListener('mouseup', () => this.endDrag());
    document.addEventListener('touchend', () => this.endDrag());
  }

  // ===================== 颜色处理 =====================

  openColorPicker() {
    new ColorPicker({
      initialColor: this.state.fillColor,
      onConfirm: (color) => {
        this.setActiveColor(color);
      },
      onCancel: () => {
        // 不做任何操作
      },
    });
  }

  setActiveColor(color) {
    this.state.fillColor = color;
    this.els.colorGrid.querySelectorAll('.color-btn:not(.custom-btn)').forEach(b => {
      b.classList.toggle('active', b.dataset.color.toLowerCase() === color.toLowerCase());
    });
    this.scheduleRender();
  }

  // ===================== 拖拽逻辑 =====================

  startDrag(e) {
    if (!this.state.image) return;
    this.state.isDragging = true;
    this.els.canvasWrapper.classList.add('dragging');

    const pos = e.touches ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : { x: e.clientX, y: e.clientY };
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

    // 将像素移动映射到百分比偏移
    const previewW = this.els.previewCanvas.width;
    const previewH = this.els.previewCanvas.height;
    const size = this.state.selectedSize;
    const needsRotation = this.state.rotation % 180 !== 0;
    const tw = needsRotation ? size.height : size.width;
    const th = needsRotation ? size.width : size.height;

    // 计算预览中的图片实际绘制尺寸
    const imgAspect = this.state.image.naturalWidth / this.state.image.naturalHeight;
    const targetAspect = tw / th;
    let imgW, imgH;
    if (imgAspect > targetAspect) {
      imgH = previewH;
      imgW = imgH * imgAspect;
    } else {
      imgW = previewW;
      imgH = imgW / imgAspect;
    }
    const zoomFactor = this.state.zoom / 100;
    imgW *= zoomFactor;
    imgH *= zoomFactor;

    // 将像素偏移转为百分比
    const maxPxOffset = (imgW - previewW) / 2;
    const maxPyOffset = (imgH - previewH) / 2;
    const pctX = maxPxOffset > 0 ? (dx / maxPxOffset) * 100 : 0;
    const pctY = maxPyOffset > 0 ? (dy / maxPyOffset) * 100 : 0;

    let newOffsetX = this.state.dragStartOffsetX + pctX;
    let newOffsetY = this.state.dragStartOffsetY + pctY;
    newOffsetX = Math.max(-100, Math.min(100, newOffsetX));
    newOffsetY = Math.max(-100, Math.min(100, newOffsetY));

    this.state.offsetX = Math.round(newOffsetX);
    this.state.offsetY = Math.round(newOffsetY);
    this.els.offsetXSlider.value = this.state.offsetX;
    this.els.offsetYSlider.value = this.state.offsetY;
    this.els.offsetXValue.textContent = this.state.offsetX + '%';
    this.els.offsetYValue.textContent = this.state.offsetY + '%';

    this.scheduleRender();
  }

  endDrag() {
    if (this.state.isDragging) {
      this.state.isDragging = false;
      this.els.canvasWrapper.classList.remove('dragging');
    }
  }

  // ===================== 文件处理 =====================

  handleFileSelect(e) {
    const file = e.target.files[0];
    if (file) this.processFile(file);
  }

  async processFile(file) {
    try {
      this.showLoading();
      const img = await loadImage(file);
      this.state.image = img;
      this.state.originalFile = file;

      // 重置调整参数
      this.state.zoom = DEFAULTS.zoom;
      this.state.offsetX = DEFAULTS.offsetX;
      this.state.offsetY = DEFAULTS.offsetY;
      this.state.rotation = DEFAULTS.rotation;
      this.state.fillColor = DEFAULTS.fillColor;

      // 重置 UI 控件
      this.els.zoomSlider.value = DEFAULTS.zoom;
      this.els.zoomValue.textContent = DEFAULTS.zoom + '%';
      this.els.offsetXSlider.value = DEFAULTS.offsetX;
      this.els.offsetXValue.textContent = DEFAULTS.offsetX + '%';
      this.els.offsetYSlider.value = DEFAULTS.offsetY;
      this.els.offsetYValue.textContent = DEFAULTS.offsetY + '%';
      this.updateAdjustSummary();
      this.setActiveColor(DEFAULTS.fillColor);

      // 切换 UI 状态
      this.els.uploadPlaceholder.style.display = 'none';
      this.els.previewContainer.style.display = 'flex';
      this.els.controlsSection.style.display = 'flex';

      this.hideLoading();
      this.renderPreview();
    } catch (err) {
      this.hideLoading();
      this.showToast('图片加载失败，请重试');
      console.error('图片加载失败:', err);
    }
  }

  resetToUpload() {
    this.state.image = null;
    this.state.originalFile = null;
    this.els.uploadPlaceholder.style.display = 'flex';
    this.els.previewContainer.style.display = 'none';
    this.els.controlsSection.style.display = 'none';
    this.els.fileInput.value = '';
  }

  // ===================== 渲染预览 =====================

  scheduleRender() {
    if (this.renderTimer) cancelAnimationFrame(this.renderTimer);
    this.renderTimer = requestAnimationFrame(() => this.renderPreview());
  }

  renderPreview() {
    if (!this.state.image) return;

    const canvas = this.els.previewCanvas;
    const ctx = canvas.getContext('2d');
    const size = this.state.selectedSize;

    // 处理旋转导致的宽高交换
    const needsRotation = this.state.rotation % 180 !== 0;
    const targetW = needsRotation ? size.height : size.width;
    const targetH = needsRotation ? size.width : size.height;

    // 计算预览尺寸
    const previewSize = getPreviewSize(targetW, targetH, 260);
    const wrapper = this.els.canvasWrapper;

    // 更新 canvas 尺寸（逻辑像素）
    canvas.width = previewSize.width;
    canvas.height = previewSize.height;

    // 更新 wrapper 样式以保持比例
    wrapper.style.height = previewSize.height + 'px';

    // 渲染到预览
    renderImage(ctx, this.state.image, targetW, targetH, {
      zoom: this.state.zoom,
      offsetX: this.state.offsetX,
      offsetY: this.state.offsetY,
      rotation: this.state.rotation,
      fillColor: this.state.fillColor,
    }, 1);
  }

  // ===================== 下载 =====================

  async handleDownload() {
    if (!this.state.image) return;

    try {
      this.els.downloadBtn.disabled = true;
      this.els.downloadBtn.textContent = '处理中...';

      const size = this.state.selectedSize;
      const q = this.state.quality;

      // 创建离屏 canvas 进行高质量渲染
      const offscreen = document.createElement('canvas');
      const ctx = offscreen.getContext('2d');

      const needsRotation = this.state.rotation % 180 !== 0;
      const targetW = needsRotation ? size.height : size.width;
      const targetH = needsRotation ? size.width : size.height;

      renderImage(ctx, this.state.image, targetW, targetH, {
        zoom: this.state.zoom,
        offsetX: this.state.offsetX,
        offsetY: this.state.offsetY,
        rotation: this.state.rotation,
        fillColor: this.state.fillColor,
      }, q);

      // 确定输出格式
      const format = 'image/png';
      const filename = getOutputFilename(size.name, q);

      // 小延迟让 UI 更新
      await new Promise(r => setTimeout(r, 50));

      downloadImage(offscreen, filename, format, 0.95);
      this.showToast('图片已生成，开始下载');
    } catch (err) {
      this.showToast('下载失败，请重试');
      console.error('下载失败:', err);
    } finally {
      this.els.downloadBtn.disabled = false;
      this.els.downloadBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
        下载高清图片
      `;
    }
  }

  // ===================== 工具方法 =====================

  updateAdjustSummary() {
    this.els.adjustSummaryText.textContent = `缩放 ${this.state.zoom}% · 位置微调`;
  }

  showLoading() {
    // 移除旧的 loading
    this.hideLoading();
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.id = 'loadingOverlay';
    overlay.innerHTML = '<div class="spinner"></div>';
    this.els.uploadArea.appendChild(overlay);
  }

  hideLoading() {
    const existing = document.getElementById('loadingOverlay');
    if (existing) existing.remove();
  }

  showToast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = msg;
    document.body.appendChild(toast);

    // 强制回流后添加 show
    requestAnimationFrame(() => {
      toast.classList.add('show');
      setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
      }, 2000);
    });
  }
}
