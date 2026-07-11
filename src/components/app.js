import { SIZES, QUALITIES, PRESET_COLORS, DEFAULTS, ZOOM_RANGE } from '../constants.js';
import { renderImage, loadImage, calculateCoverZoom } from '../utils/imageProcessor.js';
import { downloadImage, getOutputFilename } from '../utils/download.js';
import { ColorPicker } from './ColorPicker.js';
import { renderFrame, loadFrameImage, getFrameKey, getFrameDisplaySize, FRAME_CONFIG } from '../utils/frameProcessor.js';
import { renderTexts, createDefaultText, genTextId, hitTestText, getCornerScreenPos } from '../utils/textProcessor.js';
import { renderSafeArea, calcSafeAreaInset } from '../utils/safeAreaProcessor.js';

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
      dragTextStartPos: null, // { x, y } 文字拖动开始时原始位置
      dragCachedRect: null,   // 拖动开始时缓存的wrapper尺寸
      isPinching: false, pinchStartDist: 0, pinchStartZoom: 100,
      touchStartTime: 0, touchMoved: false,
      frameEnabled: false, frameImages: {}, currentFrameKey: null, puzzleCanvas: null,
      smartEnabled: false,
      texts: [], editText: null, draggingText: null,
      selectedTextId: null, clickCandidateTextId: null,
      pinchTextId: null, pinchTextStartSize: 36,
      // 角控件拖动（旋转+缩放）
      cornerDrag: null, // { textId, startAngle, startRotation, startDist, startFontSize }
      // 文字输入弹窗
      isTextInputOpen: false,
      editingTextId: null,
      textJustCreated: false,
      // 图层菜单
      layerMenuTarget: null,
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
    this.els.textInputOverlay = $('textInputOverlay');
    this.els.layerMenu = $('layerMenu');
    this.els.safeAreaHint = $('safeAreaHint');
    this.els.frameDisclaimer = $('frameDisclaimer');
    this.els.smartToggle = $('smartToggle');
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
      // 切换安全区域提示 / 相框声明（同一位置，根据相框开关切换）
      if (this.els.safeAreaHint && this.els.frameDisclaimer) {
        this.els.safeAreaHint.classList.toggle('visible', !this.state.frameEnabled);
        this.els.frameDisclaimer.classList.toggle('visible', this.state.frameEnabled);
      }
      this.updateInfoBar();
      this.refreshDisplay();
    });

    // 工具栏按钮
    this.els.toolBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.tool === 'text') {
          this.switchTool('text');
          if (this.state.image) this.createNewText();
        } else {
          this.switchTool(btn.dataset.tool);
        }
      });
    });

    this.els.canvasWrapper.addEventListener('mousedown', (e) => this.startDrag(e));
    this.els.canvasWrapper.addEventListener('touchstart', (e) => this.handleTouchStart(e), { passive: false });
    document.addEventListener('mousemove', (e) => this.onDrag(e));
    document.addEventListener('touchmove', (e) => this.handleTouchMove(e), { passive: false });
    document.addEventListener('mouseup', () => this.endDrag());
    document.addEventListener('touchend', (e) => this.handleTouchEnd(e));

    // 智能适配开关
    this.els.smartToggle.addEventListener('change', (e) => {
      this.state.smartEnabled = e.target.checked;
      if (this.state.smartEnabled) {
        this.smartAdapt();
      } else {
        // 关闭智能适配 → 恢复默认缩放
        this.state.zoom = DEFAULTS.zoom;
        this.state.puzzleCanvas = null;
        this.updateInfoBar();
        this.scheduleRender();
        this.showToast('已恢复默认');
      }
    });

    // 图层菜单
    this.els.layerMenu.addEventListener('click', (e) => {
      const item = e.target.closest('.layer-menu-item');
      if (!item) return;
      const action = item.dataset.action;
      const textId = this.state.layerMenuTarget;
      if (textId) this.moveLayer(textId, action === 'up' ? 1 : -1);
      this.closeLayerMenu();
    });

    this.renderToolContent('size');
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
    document.querySelectorAll('.color-btn:not(.custom)').forEach(b => {
      const match = b.dataset.color && b.dataset.color.toLowerCase() === color.toLowerCase();
      b.classList.toggle('active', match);
    });
    this.scheduleRender();
  }

  // ===================== 文字工具面板 =====================
  renderTextPanel(container) {
    if (this.state.texts.length === 0) {
      container.innerHTML = `<div class="text-panel-empty">点击下方「添加文字」<br/>在图片上创建文字</div>`;
      return;
    }

    const selected = this.state.texts.find(t => t.id === this.state.selectedTextId);
    const edit = selected || this.state.texts[this.state.texts.length - 1];

    container.innerHTML = `
      <div class="text-panel">
        <div class="text-panel-row">
          <div class="text-color-group">
            ${['#FFFFFF','#FF0000','#FFEB3B','#EC4899'].map(c =>
              `<button class="color-btn${edit.color===c?' active':''}" data-tc="${c}" style="background:${c}" title="${c}"></button>`
            ).join('')}
            <button class="color-btn custom" id="panelCustomColor">+</button>
          </div>
          <div class="text-action-group">
            <button class="text-action-btn" id="layerUpBtn" title="上移一层">↑</button>
            <button class="text-action-btn" id="layerDownBtn" title="下移一层">↓</button>
            <button class="text-action-btn danger" id="panelDelBtn" title="删除">✕</button>
          </div>
        </div>
        <div class="text-list" id="textList">
          ${this.state.texts.map(t =>
            `<div class="text-list-item${edit.id===t.id?' active':''}" data-tid="${t.id}">
              <span class="text-list-preview">${t.content || '空'}</span>
            </div>`
          ).join('')}
        </div>
      </div>
    `;

    container.querySelector('.text-color-group').addEventListener('click', (e) => {
      const btn = e.target.closest('.color-btn'); if (!btn) return;
      if (btn.id === 'panelCustomColor') {
        new ColorPicker({ initialColor: edit.color, onConfirm: (c) => {
          edit.color = c; this.state.editText = { ...edit };
          this.syncColorBtns(c); this.refreshDisplay();
        }});
        return;
      }
      const c = btn.dataset.tc;
      edit.color = c; this.state.editText = { ...edit };
      this.syncColorBtns(c);
      this.refreshDisplay();
    });

    container.querySelector('#layerUpBtn').addEventListener('click', () => {
      this.moveLayer(edit.id, 1);
    });
    container.querySelector('#layerDownBtn').addEventListener('click', () => {
      this.moveLayer(edit.id, -1);
    });
    container.querySelector('#panelDelBtn').addEventListener('click', () => {
      this.state.texts = this.state.texts.filter(t => t.id !== edit.id);
      this.state.selectedTextId = this.state.texts.length > 0 ? this.state.texts[this.state.texts.length - 1].id : null;
      this.renderTextPanel(container); this.refreshDisplay();
    });
    container.querySelector('#textList').addEventListener('click', (e) => {
      const item = e.target.closest('.text-list-item');
      if (item) {
        const t = this.state.texts.find(tx => tx.id === item.dataset.tid);
        if (t) { this.state.selectedTextId = t.id; this.renderTextPanel(container); this.refreshDisplay(); }
      }
    });
  }

  syncColorBtns(color) {
    document.querySelectorAll('.text-color-group .color-btn:not(.custom)').forEach(b => {
      b.classList.toggle('active', b.dataset.tc && b.dataset.tc.toLowerCase() === color.toLowerCase());
    });
  }

  syncInputColors(color) {
    document.querySelectorAll('.input-color-btn').forEach(b => {
      const match = b.dataset.tc && b.dataset.tc.toLowerCase() === color.toLowerCase();
      b.classList.toggle('active', match);
    });
  }

  // ===================== 文字创建 & 输入弹窗 =====================
  createNewText() {
    const text = createDefaultText();
    text.zIndex = this.state.texts.length; // 新文字在最上层
    this.state.texts.push(text);
    this.state.selectedTextId = text.id;
    this.state.textJustCreated = true;
    this.refreshDisplay();
    this.renderTextPanel(this.els.toolContentInner);
    // 打开输入弹窗
    this.openTextInput(text);
  }

  openTextInput(text) {
    if (this.state.isTextInputOpen) return;
    this.state.isTextInputOpen = true;
    this.state.editingTextId = text.id;

    // 保存原始内容用于取消恢复
    this._textInputOriginal = text.content;

    const overlay = this.els.textInputOverlay;
    const preview = overlay.querySelector('#textInputPreview');
    const field = overlay.querySelector('#textInputField');
    const cancelBtn = overlay.querySelector('#textInputCancel');
    const confirmBtn = overlay.querySelector('#textInputConfirm');
    const colorsContainer = overlay.querySelector('#textInputColors');

    // 更新预览
    preview.textContent = text.content || ' ';
    field.value = text.content === '点击输入文字' ? '' : text.content;

    // 渲染颜色按钮
    colorsContainer.innerHTML = `
      ${['#FFFFFF','#FF0000','#FFEB3B','#EC4899'].map(c =>
        `<button class="input-color-btn color-btn${text.color===c?' active':''}" data-tc="${c}" style="background:${c}"></button>`
      ).join('')}
      <button class="input-color-btn color-btn custom" id="inputCustomColor">+</button>
    `;

    // 颜色点击
    colorsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('.color-btn'); if (!btn) return;
      if (btn.id === 'inputCustomColor') {
        new ColorPicker({ initialColor: text.color, onConfirm: (c) => {
          text.color = c;
          this.syncInputColors(c);
          preview.style.color = c;
          this.refreshDisplay();
        }});
        return;
      }
      const c = btn.dataset.tc;
      text.color = c;
      this.syncInputColors(c);
      preview.style.color = c;
      this.refreshDisplay();
    });

    // 输入同步
    const onInput = () => {
      text.content = field.value || ' ';
      preview.textContent = text.content;
      this.refreshDisplay();
    };
    field.addEventListener('input', onInput);

    // × 取消
    cancelBtn.onclick = () => this.closeTextInput(false);
    // ✓ 确认
    confirmBtn.onclick = () => this.closeTextInput(true);

    // 关闭图层菜单
    this.closeLayerMenu();

    // 显示弹窗
    overlay.style.display = 'flex';
    this.els.editorArea.classList.add('blurred');

    // 自动聚焦输入框
    setTimeout(() => field.focus(), 100);
  }

  closeTextInput(save) {
    if (!this.state.isTextInputOpen) return;
    this.state.isTextInputOpen = false;
    const overlay = this.els.textInputOverlay;
    overlay.style.display = 'none';
    this.els.editorArea.classList.remove('blurred');

    const text = this.state.texts.find(t => t.id === this.state.editingTextId);
    if (!text) {
      this.state.editingTextId = null;
      this.state.isTextInputOpen = false;
      this.state.textJustCreated = false;
      this._textInputOriginal = null;
      return;
    }

    if (save) {
      // 确认：保持文字
      text.content = text.content.trim() || '文字';
      this.state.editingTextId = null;
      this.state.textJustCreated = false;
      this.refreshDisplay();
      this.renderTextPanel(this.els.toolContentInner);
    } else {
      // 取消：如果是新建的文字则删除，否则恢复原内容
      if (this.state.textJustCreated) {
        this.state.texts = this.state.texts.filter(t => t.id !== text.id);
        this.state.selectedTextId = this.state.texts.length > 0 ? this.state.texts[this.state.texts.length - 1].id : null;
      } else {
        text.content = this._textInputOriginal;
      }
      this.state.editingTextId = null;
      this.state.textJustCreated = false;
      this._textInputOriginal = null;
      this.refreshDisplay();
      this.renderTextPanel(this.els.toolContentInner);
    }
  }

  // ===================== 图层管理 =====================
  moveLayer(textId, direction) {
    const idx = this.state.texts.findIndex(t => t.id === textId);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= this.state.texts.length) return;
    // 交换zIndex
    const tmp = this.state.texts[idx].zIndex;
    this.state.texts[idx].zIndex = this.state.texts[target].zIndex;
    this.state.texts[target].zIndex = tmp;
    // 交换数组位置
    [this.state.texts[idx], this.state.texts[target]] = [this.state.texts[target], this.state.texts[idx]];
    this.renderTextPanel(this.els.toolContentInner);
    this.refreshDisplay();
  }

  // ===================== 图层菜单 =====================
  showLayerMenu(textId, screenX, screenY) {
    this.closeLayerMenu();
    this.state.layerMenuTarget = textId;
    const menu = this.els.layerMenu;
    menu.style.display = 'block';
    // 定位在点击位置
    menu.style.left = Math.min(screenX, window.innerWidth - 160) + 'px';
    menu.style.top = Math.min(screenY, window.innerHeight - 100) + 'px';
    // 延迟关闭
    setTimeout(() => {
      document.addEventListener('click', this._closeLayerHandler = () => this.closeLayerMenu());
    }, 10);
  }

  closeLayerMenu() {
    this.state.layerMenuTarget = null;
    if (this.els.layerMenu) this.els.layerMenu.style.display = 'none';
    if (this._closeLayerHandler) {
      document.removeEventListener('click', this._closeLayerHandler);
      this._closeLayerHandler = null;
    }
  }

  // ===================== 文字事件处理（角控件 + 正文） =====================
  handleTextCornerHit(hit, pt, canvas) {
    const t = hit.text;
    const canvasRect = this.els.canvasWrapper.getBoundingClientRect();
    const canvasW = canvas.width;
    const canvasH = canvas.height;

    switch (hit.area) {
      case 'tr': // ✕ 删除
        this.state.texts = this.state.texts.filter(tx => tx.id !== t.id);
        this.state.selectedTextId = this.state.texts.length > 0 ? this.state.texts[this.state.texts.length - 1].id : null;
        this.refreshDisplay();
        this.renderTextPanel(this.els.toolContentInner);
        return true;

      case 'bl': // +1 复制
        const copy = JSON.parse(JSON.stringify(t));
        copy.id = genTextId();
        copy.x = Math.min(t.x + 0.04, 0.9);
        copy.y = Math.min(t.y + 0.04, 0.9);
        copy.zIndex = this.state.texts.length;
        this.state.texts.push(copy);
        this.state.selectedTextId = copy.id;
        this.refreshDisplay();
        this.renderTextPanel(this.els.toolContentInner);
        this.showToast('已复制');
        return true;

      case 'tl': // ⋮ 图层菜单
        // 计算菜单的屏幕坐标
        const cs = getCornerScreenPos(t, canvasW, canvasH);
        const sx = canvasRect.left + (cs.tl.x / canvasW) * canvasRect.width;
        const sy = canvasRect.top + (cs.tl.y / canvasH) * canvasRect.height;
        this.showLayerMenu(t.id, sx, sy + 20);
        return true;

      case 'br': // ↻ 旋转缩放
        // 开始旋转拖动
        const local = this.toTextLocal(pt.clientX, pt.clientY, t, canvas);
        const startAngle = Math.atan2(local.y, local.x);
        const startDist = Math.sqrt(local.x * local.x + local.y * local.y);
        this.state.cornerDrag = {
          textId: t.id,
          startAngle: startAngle,
          startRotation: t.rotation || 0,
          startDist: startDist,
          startFontSize: t.fontSize,
        };
        this.state.draggingText = null;
        this.state.isDragging = false;
        return true;

      case 'body': // 文字主体 → 打开输入弹窗
        if (!this.state.isTextInputOpen) {
          this.state.selectedTextId = t.id;
          this.state.textJustCreated = false;
          this.refreshDisplay();
          // 切到文字工具
          if (this.activeTool !== 'text') this.switchTool('text');
          else this.renderTextPanel(this.els.toolContentInner);
          this.openTextInput(t);
        }
        return true;
    }
    return false;
  }

  /** 将屏幕坐标转到文字局部坐标（用于旋转手柄） */
  toTextLocal(clientX, clientY, t, canvas) {
    const r = this.els.canvasWrapper.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * canvas.width;
    const py = ((clientY - r.top) / r.height) * canvas.height;
    const cx = t.x * canvas.width;
    const cy = t.y * canvas.height;
    let dx = px - cx;
    let dy = py - cy;
    if (t.rotation) {
      const rad = -(t.rotation * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
    }
    return { x: dx, y: dy };
  }

  // ===================== 触摸/拖拽 =====================
  startDrag(e) {
    if (!this.state.image) return;
    if (this.state.isTextInputOpen) return;

    const pt = e.touches ? e.touches[0] : e;
    const r = this.els.canvasWrapper.getBoundingClientRect();
    const px = ((pt.clientX - r.left) / r.width) * this.els.previewCanvas.width;
    const py = ((pt.clientY - r.top) / r.height) * this.els.previewCanvas.height;
    const canvas = this.els.previewCanvas;
    const ctx = canvas.getContext('2d');

    // ★ 缓存wrapper尺寸（拖动过程中不再重新计算，避免强制重排）
    this.state.dragCachedRect = { w: r.width, h: r.height, left: r.left, top: r.top };

    // 检测文字命中（含角控件）
    const hit = hitTestText(ctx, this.state.texts, canvas.width, canvas.height, px, py, this.state.selectedTextId);
    if (hit) {
      // 尝试处理角控件事件
      if (hit.area !== 'body') {
        const handled = this.handleTextCornerHit(hit, pt, canvas);
        if (handled) return;
      }
      // 文字主体：记录拖动候选
      if (hit.area === 'body') {
        this.state.clickCandidateTextId = hit.text.id;
        this.state.dragStartX = pt.clientX;
        this.state.dragStartY = pt.clientY;
        this.state.touchMoved = false;
        return;
      }
    }

    // 点击空白区域：取消文字选中
    if (this.state.selectedTextId) {
      this.state.selectedTextId = null;
      this.state.editText = null;
      this.refreshDisplay();
      if (this.activeTool === 'text') this.renderTextPanel(this.els.toolContentInner);
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
    const dx = Math.abs(pos.x - this.state.dragStartX);
    const dy = Math.abs(pos.y - this.state.dragStartY);

    // 角控件旋转拖动
    if (this.state.cornerDrag) {
      const cd = this.state.cornerDrag;
      const text = this.state.texts.find(t => t.id === cd.textId);
      if (text) {
        const r = this.els.canvasWrapper.getBoundingClientRect();
        const canvas = this.els.previewCanvas;
        const px = ((pos.x - r.left) / r.width) * canvas.width;
        const py = ((pos.y - r.top) / r.height) * canvas.height;
        const cx = text.x * canvas.width;
        const cy = text.y * canvas.height;
        const currentAngle = Math.atan2(py - cy, px - cx);
        const currentDist = Math.sqrt((px - cx) ** 2 + (py - cy) ** 2);

        // 旋转
        text.rotation = cd.startRotation + ((currentAngle - cd.startAngle) * 180 / Math.PI);
        // 缩放
        if (currentDist > 5 && cd.startDist > 5) {
          const scale = currentDist / cd.startDist;
          text.fontSize = Math.max(12, Math.min(200, Math.round(cd.startFontSize * scale)));
        }
        this.refreshDisplay();
      }
      return;
    }

    // 文字点击候选 → 超过阈值转为拖动
    if (this.state.clickCandidateTextId && (dx > 5 || dy > 5)) {
      const text = this.state.texts.find(t => t.id === this.state.clickCandidateTextId);
      if (text) {
        this.state.selectedTextId = text.id;
        this.state.draggingText = text;
        this.state.dragTextStartPos = { x: text.x, y: text.y };
        this.state.clickCandidateTextId = null;
        this.state.touchMoved = true;
        // 拖动开始时缓存一次wrapper尺寸
        if (!this.state.dragCachedRect) {
          const r = this.els.canvasWrapper.getBoundingClientRect();
          this.state.dragCachedRect = { w: r.width, h: r.height, left: r.left, top: r.top };
        }
      }
    }

    if (this.state.draggingText) {
      // 增量式拖动：使用缓存的wrapper尺寸，避免反复强制重排
      const rect = this.state.dragCachedRect;
      if (rect) {
        const deltaX = (pos.x - this.state.dragStartX) / rect.w;
        const deltaY = (pos.y - this.state.dragStartY) / rect.h;
        const orig = this.state.dragTextStartPos;
        if (orig) {
          this.state.draggingText.x = orig.x + deltaX;
          this.state.draggingText.y = orig.y + deltaY;
        }
      }
      // 钳位边界
      this.state.draggingText.x = Math.max(0.02, Math.min(0.98, this.state.draggingText.x));
      this.state.draggingText.y = Math.max(0.02, Math.min(0.98, this.state.draggingText.y));
      this.refreshDisplay();
      return;
    }

    if (dx > 5 || dy > 5) this.state.touchMoved = true;
  }

  endDrag() {
    // 角控件拖动结束
    if (this.state.cornerDrag) {
      this.state.cornerDrag = null;
      return;
    }

    // 点击文字候选（未拖动）：选中 + 打开输入弹窗
    if (this.state.clickCandidateTextId && !this.state.touchMoved) {
      const text = this.state.texts.find(t => t.id === this.state.clickCandidateTextId);
      if (text) {
        this.state.selectedTextId = text.id;
        this.state.editText = { ...text };
        this.state.clickCandidateTextId = null;
        this.state.draggingText = null;
        this.state.textJustCreated = false;
        if (this.activeTool !== 'text') this.switchTool('text');
        else this.renderTextPanel(this.els.toolContentInner);
        this.refreshDisplay();
        // 打开输入弹窗
        this.openTextInput(text);
      }
    }

    this.state.clickCandidateTextId = null;
    this.state.draggingText = null;
    this.state.dragTextStartPos = null;
    this.state.dragCachedRect = null;
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

  findTextUnderFinger(pt) {
    const r = this.els.canvasWrapper.getBoundingClientRect();
    const cw = this.els.previewCanvas.width;
    const ch = this.els.previewCanvas.height;
    const px = ((pt.clientX - r.left) / r.width) * cw;
    const py = ((pt.clientY - r.top) / r.height) * ch;
    const ctx = this.els.previewCanvas.getContext('2d');
    const hit = hitTestText(ctx, this.state.texts, cw, ch, px, py, this.state.selectedTextId);
    return hit ? { text: hit.text, area: hit.area } : null;
  }

  handleTouchStart(e) {
    if (e.touches.length >= 2) {
      e.preventDefault();
      if (this.state.isTextInputOpen) return;
      this.state.clickCandidateTextId = null;
      const hit = this.findTextUnderFinger(e.touches[0]);
      if (hit && hit.area === 'body') {
        this.state.pinchTextId = hit.text.id;
        this.state.pinchTextStartSize = hit.text.fontSize;
        this.state.selectedTextId = hit.text.id;
      } else {
        this.state.pinchTextId = null;
      }
      this.state.isPinching = true;
      this.state.touchMoved = false;
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
          const ratio = dist / this.state.pinchStartDist;
          let newSize = Math.round(this.state.pinchTextStartSize * (1 + (ratio - 1) * 1.5));
          newSize = Math.max(12, Math.min(200, newSize));
          text.fontSize = newSize;
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
      // ★ 正在拖动/候选拖动时阻止浏览器拦截（滚动/长按菜单）
      if (this.state.draggingText || this.state.clickCandidateTextId || this.state.isDragging) {
        e.preventDefault();
      }
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

      // 上传后保持默认缩放（白边填充模式），不自动执行智能适配
      this.state.zoom = DEFAULTS.zoom;

      // 上传后显示安全区域提示，隐藏相框声明
      if (this.els.safeAreaHint) this.els.safeAreaHint.classList.add('visible');
      if (this.els.frameDisclaimer) this.els.frameDisclaimer.classList.remove('visible');

      this.hideLoading();
      this.scheduleRender();
      this.preloadAllFrames();
    } catch (err) {
      this.hideLoading();
      this.showToast('图片加载失败，请重试');
    }
  }

  resetToUpload() {
    // 先关闭文字输入弹窗（必须在清空texts之前）
    if (this.state.isTextInputOpen) this.closeTextInput(false);
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

  // ===================== 智能适配 =====================
  smartAdapt() {
    if (!this.state.image || !this._baseDim) return;
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

    const result = calculateCoverZoom(
      this.state.image.naturalWidth,
      this.state.image.naturalHeight,
      pvw, pvh,
      this.state.rotation
    );
    this.state.zoom = result.zoom;
    this.state.puzzleCanvas = null;
    this.updateInfoBar();
    this.scheduleRender();

    // 同步adjust面板的滑块
    if (this.activeTool === 'adjust') {
      const sZoom = this.els.toolContentInner.querySelector('#sZoomSlider');
      const vZoom = this.els.toolContentInner.querySelector('#sZoomVal');
      if (sZoom) { sZoom.value = result.zoom; vZoom.textContent = result.zoom + '%'; }
    }
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

    // ★ 第一步：渲染完整的编辑区画面（Editor Canvas）
    //    包含：PuzzleCanvas + 文字层
    //    这是一个 pvw×pvh 的完整画面
    const editorCanvas = document.createElement('canvas');
    editorCanvas.width = pvw;
    editorCanvas.height = pvh;
    const ectx = editorCanvas.getContext('2d');
    ectx.drawImage(pc, 0, 0);
    // 文字层
    if (this.state.texts.length > 0) {
      renderTexts(ectx, this.state.texts, pvw, pvh, this.state.selectedTextId, {
        hideControls: this.state.isTextInputOpen,
      });
    }

    // 获取物理尺寸（用于安全区域计算）
    const s = this.state.selectedSize;
    const isRotated = this.state.rotation % 180 !== 0;
    const safePhysW = isRotated ? s.heightCm : s.widthCm;
    const safePhysH = isRotated ? s.widthCm : s.heightCm;

    if (this.state.frameEnabled) {
      const frameKey = this.state.currentFrameKey;
      const frameImg = this.state.frameImages[frameKey];

      if (!frameImg || !frameKey) {
        // 相框未加载：显示编辑区画面 + 安全区域辅助线
        canvas.width = pvw;
        canvas.height = pvh;
        canvas.style.width = '';
        canvas.style.height = '';
        canvas.classList.remove('frame-active');
        ctx.drawImage(editorCanvas, 0, 0);
        renderSafeArea(ctx, canvas.width, canvas.height, safePhysW, safePhysH);
        return;
      }
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

      // ★ 第二步：从 Editor Canvas 中截取安全区域（蓝色虚线内）
      //    这就是用户在编辑区看到的最终画面的一部分
      const si = calcSafeAreaInset(pvw, pvh, safePhysW, safePhysH);
      const safeX = si.insetX;
      const safeY = si.insetY;
      const safeW = pvw - 2 * si.insetX;
      const safeH = pvh - 2 * si.insetY;

      const snapshot = document.createElement('canvas');
      snapshot.width = safeW;
      snapshot.height = safeH;
      snapshot.getContext('2d').drawImage(editorCanvas, safeX, safeY, safeW, safeH, 0, 0, safeW, safeH);

      // ★ 第三步：将安全区域截图绘制到相框内框并覆盖相框PNG
      //    renderFrame 只负责：①放截图到内框 ②叠加相框
      renderFrame(ctx, snapshot, frameKey, frameImg, dsW, dsH);
    } else {
      // ★ 无相框模式：显示编辑区画面 + 安全区域辅助线
      canvas.classList.remove('frame-active');
      canvas.style.width = '';
      canvas.style.height = '';
      canvas.width = pvw;
      canvas.height = pvh;
      ctx.drawImage(editorCanvas, 0, 0);
      renderSafeArea(ctx, canvas.width, canvas.height, safePhysW, safePhysH);
    }
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
    // 不再使用，文字通过独立覆盖层渲染
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

      // === 渲染完整拼图 + 文字（使用与编辑器相同的 ImageState） ===
      const puzzle = document.createElement('canvas');
      puzzle.width = pxW;
      puzzle.height = pxH;
      renderImage(puzzle.getContext('2d'), this.state.image, pxW, pxH, {
        zoom: this.state.zoom, offsetX: 0, offsetY: 0,
        rotation: this.state.rotation, fillColor: this.state.fillColor,
      });
      if (this.state.texts.length > 0) {
        renderTexts(puzzle.getContext('2d'), this.state.texts, pxW, pxH, null, { hideControls: true });
      }

      // === 相框模式：裁剪至安全区域 + 叠加相框 ===
      if (this.state.frameEnabled && this.state.currentFrameKey && this.state.frameImages[this.state.currentFrameKey]) {
        const frameKey = this.state.currentFrameKey;
        const frameImg = this.state.frameImages[frameKey];
        const cfg = FRAME_CONFIG[frameKey];
        const isRotated = this.state.rotation % 180 !== 0;
        const physW = isRotated ? size.heightCm : size.widthCm;
        const physH = isRotated ? size.widthCm : size.heightCm;

        // 安全区域裁剪（与编辑器完全一致的算法）
        const si = calcSafeAreaInset(pxW, pxH, physW, physH);
        const cropX = si.insetX;
        const cropY = si.insetY;
        const cropW = pxW - 2 * cropX;
        const cropH = pxH - 2 * cropY;

        // 将裁剪后的拼图匹配到相框比例
        const frameAspect = cfg.frameWidth / cfg.frameHeight;
        let dsW, dsH;
        if (pxW / pxH > frameAspect) {
          dsH = pxH; dsW = Math.round(dsH * frameAspect);
        } else {
          dsW = pxW; dsH = Math.round(dsW / frameAspect);
        }

        const out = document.createElement('canvas');
        out.width = dsW;
        out.height = dsH;
        const octx = out.getContext('2d');

        // 裁剪后的拼图
        const cropped = document.createElement('canvas');
        cropped.width = cropW;
        cropped.height = cropH;
        cropped.getContext('2d').drawImage(puzzle, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

        // 用 frameProcessor 渲染：只显示安全区域内内容 + 相框
        renderFrame(octx, cropped, frameKey, frameImg, dsW, dsH);

        const filename = getOutputFilename(size.name, mode);
        await new Promise(r => setTimeout(r, 50));
        downloadImage(out, filename.replace('.png', '_framed.png'));
        this.showToast('带相框效果图已生成，开始下载');
      } else {
        // === 无相框模式：直接输出拼图 + 文字 ===
        const filename = getOutputFilename(size.name, mode);
        await new Promise(r => setTimeout(r, 50));
        downloadImage(puzzle, filename);
        this.showToast('图片已生成，开始下载');
      }
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
