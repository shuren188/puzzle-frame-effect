/** 拼图尺寸配置 (名称 → 像素宽高) */
export const SIZES = [
  { name: '35片', width: 1181, height: 1772, label: '10×15cm' },
  { name: '70片', width: 1772, height: 2362, label: '15×20cm' },
  { name: '120片', width: 2362, height: 2953, label: '20×25cm' },
  { name: '200片', width: 2480, height: 3543, label: '21×30cm' },
  { name: '300/520片', width: 3071, height: 4488, label: '26×38cm' },
];

/** 输出质量倍率 */
export const QUALITIES = [
  { name: '原图', value: 1 },
  { name: '高清', value: 2 },
];

/** 预设填充颜色 */
export const PRESET_COLORS = [
  { name: '纯白', hex: '#FFFFFF' },
  { name: '黑色', hex: '#000000' },
  { name: '科技蓝', hex: '#06B6D4' },
  { name: '霓虹紫', hex: '#A855F7' },
  { name: '樱花粉', hex: '#EC4899' },
];

/** 默认设置 */
export const DEFAULTS = {
  sizeIndex: 0,            // 默认 35片
  quality: 1,              // 默认 1x
  fillColor: '#FFFFFF',    // 默认纯白
  zoom: 100,               // 默认 100%
  offsetX: 0,              // 默认水平居中
  offsetY: 0,              // 默认垂直居中
  rotation: 0,             // 默认不旋转
};

/** 缩放范围 */
export const ZOOM_RANGE = { min: 50, max: 150, step: 1 };

/** 偏移范围 (%) */
export const OFFSET_RANGE = { min: -100, max: 100, step: 1 };

/** 拖拽灵敏度 */
export const DRAG_SENSITIVITY = 2.5;

/** 文案 */
export const TEXT = {
  title: '上传即拼图',
  subtitle: '完整保留画面 · 智能白边适配 · 35至520片',
  previewTitle: '拼图预览',
  reUpload: '重新上传',
  sizeLabel: '选择尺寸',
  qualityLabel: '输出质量',
  adjustLabel: '调整',
  colorLabel: '颜色',
  rotateLeft: '↺ 左转90°',
  rotateRight: '↻ 右转90°',
  download: '下载高清图片',
};
