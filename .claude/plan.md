# 文字功能重构计划

## 当前问题分析

### 1. 手势冲突问题
- 双指缩放文字需要两个手指分别在文字的右上方和左下方，这个操作对用户来说太复杂
- 图片和文字的手势没有完全分离
- `isInTextResizeArea` 方法逻辑有问题

### 2. 功能缺失
- 没有删除文字功能
- 没有简单的点击选中编辑
- 缩放体验不好

### 3. 布局和坐标问题
- 文字 x,y 是相对坐标，需要考虑不同画布尺寸的缩放

## 解决方案设计

### 核心原则
1. **手势完全分离**：通过 Hit Test 准确识别点击对象
2. **独立对象管理**：每个文字作为独立对象，包含 id、text、color、x、y、scale、selected
3. **保持其他功能不变**：图片上传、移动、缩放、旋转、裁剪、相框等功能不受影响

### 手势处理策略

#### Hit Test 命中检测
- 从顶层到底层遍历文字对象
- 检查触摸点是否在文字边界框内
- 返回命中的文字对象或 null

#### 情况一：点击图片区域（非文字）
- 所有拖动、缩放操作仅作用于图片
- 文字保持不动

#### 情况二：点击文字区域
- 单指：拖动文字
- 双指：缩放文字
- 图片保持完全静止

#### 情况三：多个文字
- 只有当前点击选中的文字响应手势
- 其他文字保持不动

### 实现方案

#### 1. Hit Test 函数
```javascript
// 精确的文字边界框计算
function getTextBounds(text, canvasW, canvasH) {
  const fontSize = text.fontSize * (canvasW / 400);
  const x = text.x * canvasW;
  const y = text.y * canvasH;

  // 测量文字实际宽度
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.font = `${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text.content);

  return {
    left: x - metrics.width / 2,
    right: x + metrics.width / 2,
    top: y - fontSize / 2,
    bottom: y + fontSize / 2,
    centerX: x,
    centerY: y
  };
}

// 检查点是否在文字边界框内
function isPointInText(x, y, bounds, padding = 10) {
  return x >= bounds.left - padding &&
         x <= bounds.right + padding &&
         y >= bounds.top - padding &&
         y <= bounds.bottom + padding;
}
```

#### 2. 手势处理逻辑
```javascript
// 触摸开始
handleTouchStart(e) {
  if (e.touches.length === 1) {
    // 单指：检查是否点击文字
    const hit = this.hitTestText(e.touches[0]);
    if (hit) {
      this.state.selectedTextId = hit.text.id;
      this.state.textDragMode = true;
      this.state.textDragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      this.state.textOriginalPos = { x: hit.text.x, y: hit.text.y };
    } else {
      // 点击图片，处理图片拖动
      this.state.selectedTextId = null;
      this.state.textDragMode = false;
      this.handleImageDragStart(e);
    }
  } else if (e.touches.length === 2) {
    // 双指：检查是否在文字上
    const hit1 = this.hitTestText(e.touches[0]);
    const hit2 = this.hitTestText(e.touches[1]);

    if (hit1 && hit1.text.id === hit2?.text?.id) {
      // 双指都在同一个文字上，进入文字缩放模式
      this.state.textPinchMode = true;
      this.state.selectedTextId = hit1.text.id;
      this.state.pinchStartDist = this.getTouchDistance(e);
      this.state.pinchStartScale = hit1.text.scale || 1;
    } else {
      // 双指在图片上，进入图片缩放模式
      this.state.textPinchMode = false;
      this.state.selectedTextId = null;
      this.handleImagePinchStart(e);
    }
  }
}

// 触摸移动
handleTouchMove(e) {
  if (e.touches.length === 1) {
    if (this.state.textDragMode && this.state.selectedTextId) {
      // 拖动文字
      const text = this.state.texts.find(t => t.id === this.state.selectedTextId);
      if (text) {
        const r = this.els.canvasWrapper.getBoundingClientRect();
        const dx = (e.touches[0].clientX - this.state.textDragStart.x) / r.width;
        const dy = (e.touches[0].clientY - this.state.textDragStart.y) / r.height;
        text.x = Math.max(0.05, Math.min(0.95, this.state.textOriginalPos.x + dx));
        text.y = Math.max(0.05, Math.min(0.95, this.state.textOriginalPos.y + dy));
        this.refreshDisplay();
      }
    } else {
      // 拖动图片
      this.handleImageDragMove(e);
    }
  } else if (e.touches.length === 2) {
    if (this.state.textPinchMode && this.state.selectedTextId) {
      // 缩放文字
      const dist = this.getTouchDistance(e);
      const ratio = dist / this.state.pinchStartDist;
      const text = this.state.texts.find(t => t.id === this.state.selectedTextId);
      if (text) {
        text.scale = Math.max(0.5, Math.min(3.0, this.state.pinchStartScale * ratio));
        this.refreshDisplay();
      }
    } else {
      // 缩放图片
      this.handleImagePinchMove(e);
    }
  }
}

// 触摸结束
handleTouchEnd(e) {
  this.state.textDragMode = false;
  this.state.textPinchMode = false;
}
```

#### 3. UI 改进
- 添加删除按钮
- 简化颜色选择
- 显示当前选中文字
- 点击文字列表项直接编辑

## 实现步骤

1. 重写 `textProcessor.js` - 更新文字渲染和边界框计算
2. 重写 `app.js` 中的手势处理逻辑 - 实现手势分离
3. 更新 UI - 添加删除功能，优化编辑体验
4. 测试 - 确保所有功能正常，手势无冲突