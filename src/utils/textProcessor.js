/**
 * 文字叠加模块 — Meitu 风格文字框渲染
 *
 * 职责：渲染带控制框的文字叠加层
 * - 选中文字显示：虚线内框 + 实线外框 + 4个角控制圆
 * - 角控制：⋮ 图层菜单 / ✕ 删除 / +1 复制 / ↻ 旋转缩放
 * - 文本命中检测（含旋转坐标变换）
 * - 下载时文字一并导出
 */

let _id = 0;
export function genTextId() { return 'txt_' + (++_id) + '_' + Date.now(); }

const FONT_FAMILY = '"PingFang SC","Microsoft YaHei",sans-serif';
const CORNER_RADIUS = 14;       // 角控件圆半径（canvas像素）
const CORNER_HIT_RADIUS = 20;   // 角控件点击检测半径
const INNER_PAD = 10;           // 文字到虚线框内边距
const OUTER_PAD = 18;           // 虚线框到实线框外边距

/** 创建默认文字对象 */
export function createDefaultText() {
  return {
    id: genTextId(),
    content: '点击输入文字',
    fontSize: 36,
    color: '#FFFFFF',
    x: 0.5,
    y: 0.5,
    rotation: 0,
    zIndex: 0,
  };
}

/** 计算文字在当前画布尺寸下的渲染大小 */
export function measureText(ctx, text, fontSize, canvasW) {
  if (!ctx || !text) return { width: 0, height: 0 };
  const fs = fontSize * (canvasW / 400);
  ctx.font = `${Math.round(fs)}px ${FONT_FAMILY}`;
  const m = ctx.measureText(text);
  return { width: m.width, height: fs };
}

/**
 * 获取文字在画布上的完整边界信息（含角控件位置）
 * 返回坐标均为 canvas 像素坐标（未旋转的局部坐标系）
 */
function getTextBounds(ctx, t, canvasW, canvasH) {
  const cx = t.x * canvasW;
  const cy = t.y * canvasH;
  const fs = t.fontSize * (canvasW / 400);
  ctx.font = `${Math.round(fs)}px ${FONT_FAMILY}`;
  const tw = ctx.measureText(t.content || '').width;
  const th = fs;

  const iw = tw + INNER_PAD * 2;
  const ih = th + INNER_PAD * 2;
  const ow = tw + (INNER_PAD + OUTER_PAD) * 2;
  const oh = th + (INNER_PAD + OUTER_PAD) * 2;

  return {
    cx, cy, tw, th,
    iw, ih, ow, oh,
    // 角控件位置（相对于文字中心的偏移，未旋转）
    corners: {
      tl: { x: cx - ow / 2, y: cy - oh / 2 },
      tr: { x: cx + ow / 2, y: cy - oh / 2 },
      bl: { x: cx - ow / 2, y: cy + oh / 2 },
      br: { x: cx + ow / 2, y: cy + oh / 2 },
    },
  };
}

/**
 * 将画布坐标转换到文字局部坐标（逆旋转）
 */
function toLocalPos(gx, gy, t, canvasW, canvasH) {
  const cx = t.x * canvasW;
  const cy = t.y * canvasH;
  let dx = gx - cx;
  let dy = gy - cy;
  if (t.rotation) {
    const rad = -(t.rotation * Math.PI) / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return { x: dx * cos - dy * sin, y: dx * sin + dy * cos };
  }
  return { x: dx, y: dy };
}

/**
 * 命中检测：检测点击位置是否命中文字区域
 * @returns {{ text, area: 'body'|'tl'|'tr'|'bl'|'br' } | null}
 */
export function hitTestText(ctx, texts, canvasW, canvasH, px, py, selectedId) {
  if (!texts || !texts.length) return null;
  // 从顶层到底层检测
  const sorted = [...texts].sort((a, b) => b.zIndex - a.zIndex);

  for (const t of sorted) {
    const local = toLocalPos(px, py, t, canvasW, canvasH);
    const bs = getTextBounds(ctx, t, canvasW, canvasH);
    const { ow, oh, tw, th, corners } = bs;

    // 如果是当前选中文字，优先检测角控件
    if (selectedId && t.id === selectedId) {
      for (const [key, pos] of Object.entries(corners)) {
        // 角控件位置也需要转换到局部坐标
        const lcx = pos.x - bs.cx;
        const lcy = pos.y - bs.cy;
        const d = Math.sqrt((local.x - lcx) ** 2 + (local.y - lcy) ** 2);
        if (d < CORNER_HIT_RADIUS) {
          return { text: t, area: key };
        }
      }
    }

    // 检测文字主体（内框区域）
    const ih = th + INNER_PAD * 2;
    const iw = tw + INNER_PAD * 2;
    if (Math.abs(local.x) < iw / 2 && Math.abs(local.y) < ih / 2) {
      return { text: t, area: 'body' };
    }
  }
  return null;
}

/**
 * 获取角控件中心在画布上的绝对坐标（含旋转）
 */
export function getCornerScreenPos(t, canvasW, canvasH) {
  const cx = t.x * canvasW;
  const cy = t.y * canvasH;
  const ctx = document.createElement('canvas').getContext('2d');
  const fs = t.fontSize * (canvasW / 400);
  ctx.font = `${Math.round(fs)}px ${FONT_FAMILY}`;
  const tw = ctx.measureText(t.content || '').width;
  const ow = tw + (INNER_PAD + OUTER_PAD) * 2;
  const oh = fs + (INNER_PAD + OUTER_PAD) * 2;

  const corners = {
    tl: { x: -ow / 2, y: -oh / 2 },
    tr: { x: ow / 2, y: -oh / 2 },
    bl: { x: -ow / 2, y: oh / 2 },
    br: { x: ow / 2, y: oh / 2 },
  };

  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad), sin = Math.sin(rad);
  const result = {};
  for (const [key, p] of Object.entries(corners)) {
    result[key] = {
      x: cx + p.x * cos - p.y * sin,
      y: cy + p.x * sin + p.y * cos,
    };
  }
  return result;
}

/**
 * 在Canvas上绘制所有文字
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array} texts - 文字对象数组
 * @param {number} canvasW
 * @param {number} canvasH
 * @param {string|null} selectedId - 选中文字ID（显示控制框）
 * @param {object} [opts] - { hideControls: boolean } 隐藏角控件（输入模式时）
 */
export function renderTexts(ctx, texts, canvasW, canvasH, selectedId, opts) {
  if (!texts || !texts.length) return;
  const hideControls = opts && opts.hideControls;
  const sorted = [...texts].sort((a, b) => a.zIndex - b.zIndex);

  sorted.forEach(t => {
    if (!t.content || !t.content.trim()) return;
    const isSelected = selectedId && t.id === selectedId;
    const cx = t.x * canvasW;
    const cy = t.y * canvasH;
    const fs = t.fontSize * (canvasW / 400);
    ctx.font = `${Math.round(fs)}px ${FONT_FAMILY}`;
    const tw = ctx.measureText(t.content).width;

    ctx.save();
    ctx.translate(cx, cy);
    if (t.rotation) ctx.rotate((t.rotation * Math.PI) / 180);

    // === 选中状态：绘制控制框 ===
    if (isSelected && !hideControls) {
      const ow = tw + (INNER_PAD + OUTER_PAD) * 2;
      const oh = fs + (INNER_PAD + OUTER_PAD) * 2;
      const iw = tw + INNER_PAD * 2;
      const ih = fs + INNER_PAD * 2;

      // 外层实线框
      ctx.save();
      ctx.shadowColor = 'transparent';
      ctx.strokeStyle = 'rgba(92,229,229,0.7)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(-ow / 2, -oh / 2, ow, oh);

      // 内层虚线框
      ctx.setLineDash([4, 5]);
      ctx.strokeStyle = 'rgba(92,229,229,0.35)';
      ctx.lineWidth = 1;
      ctx.strokeRect(-iw / 2, -ih / 2, iw, ih);
      ctx.setLineDash([]);
      ctx.restore();

      // 四个角控件圆
      const corners = {
        tl: { x: -ow / 2, y: -oh / 2 },
        tr: { x: ow / 2, y: -oh / 2 },
        bl: { x: -ow / 2, y: oh / 2 },
        br: { x: ow / 2, y: oh / 2 },
      };
      for (const [key, p] of Object.entries(corners)) {
        drawCorner(ctx, p.x, p.y, key, tw, fs);
      }
    }

    // === 文字阴影 & 文字本身 ===
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    ctx.font = `${Math.round(fs)}px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = t.color || '#FFFFFF';
    ctx.fillText(t.content, 0, 0);
    ctx.restore();

    ctx.restore();
  });
}

/** 绘制单个角控件圆 + 图标 */
function drawCorner(ctx, x, y, key, tw, fs) {
  const r = CORNER_RADIUS;
  ctx.save();
  ctx.shadowColor = 'transparent';

  // 圆背景
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = '#1a1e2e';
  ctx.fill();
  ctx.strokeStyle = 'rgba(92,229,229,0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 图标
  ctx.fillStyle = '#5ce5e5';
  ctx.font = `bold ${r}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const s = r * 0.85;

  switch (key) {
    case 'tl': // ⋮ 三个点
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(x, y + i * 3.5, 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'tr': // ✕
      ctx.strokeStyle = '#5ce5e5';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const o = s * 0.45;
      ctx.beginPath(); ctx.moveTo(x - o, y - o); ctx.lineTo(x + o, y + o);
      ctx.moveTo(x + o, y - o); ctx.lineTo(x - o, y + o);
      ctx.stroke();
      break;
    case 'bl': // +1
      ctx.font = `bold ${r * 0.75}px sans-serif`;
      ctx.fillText('+1', x, y + 0.5);
      break;
    case 'br': // ↻ 旋转箭头
      ctx.strokeStyle = '#5ce5e5';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      const a = s * 0.5;
      ctx.beginPath();
      ctx.arc(x, y, a, Math.PI * 0.15, Math.PI * 1.5);
      ctx.stroke();
      // 箭头尖
      const tip = Math.PI * 1.5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(tip) * a, y + Math.sin(tip) * a);
      ctx.lineTo(x + Math.cos(tip + 0.5) * (a + 5), y + Math.sin(tip + 0.5) * (a + 5));
      ctx.lineTo(x + Math.cos(tip - 0.5) * (a + 5), y + Math.sin(tip - 0.5) * (a + 5));
      ctx.closePath();
      ctx.fillStyle = '#5ce5e5';
      ctx.fill();
      break;
  }
  ctx.restore();
}
