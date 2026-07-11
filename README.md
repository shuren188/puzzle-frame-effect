<div align="center">

# 🧩 拼图裁剪相框效果图

> **一款轻量级在线拼图DIY编辑工具** — 上传照片，自由拼图裁剪、叠加透明相框、添加艺术文字，一键下载高清效果图

[![在线体验](https://img.shields.io/badge/🌐_在线体验-点击前往-5ce5e5?style=for-the-badge)](https://shuren188.github.io/puzzle-frame-effect/)
[![版本](https://img.shields.io/badge/版本-v4.8.0-5ce5e5)](https://github.com/shuren188/puzzle-frame-effect/releases)
[![许可](https://img.shields.io/badge/许可-MIT-b794f4)](LICENSE)
![构建](https://img.shields.io/badge/构建-通过-5ce5e5)
![依赖](https://img.shields.io/badge/依赖-零生产依赖-5ce5e5)

---

![应用预览](ScreenShot_2026-07-11_135819_627.png)

</div>

---

## ✨ 项目亮点

- **📸 上传即用** — 浏览器打开即可编辑，无需安装任何软件
- **🎨 拼图DIY** — 5种尺寸（35片~300片），自由裁剪
- **🖼️ 透明相框** — 10组精美相框，一键开关预览
- **✏️ 文字编辑** — 美图秀秀风格文字系统，图层/旋转/缩放/复制
- **📥 高清导出** — 支持原图和2倍分辨率，PC直接下载/手机长按保存
- **🔒 隐私安全** — 所有图片仅在本地处理，不上传服务器
- **⚡ 极致轻量** — 纯前端 Canvas 渲染，零生产依赖，首屏 < 2s

---

## 🎯 功能总览

<table>
<tr>
  <td align="center" width="25%"><b>🖼️ 图片处理</b></td>
  <td align="center" width="25%"><b>📐 拼图裁剪</b></td>
  <td align="center" width="25%"><b>🖼️ 相框效果</b></td>
  <td align="center" width="25%"><b>✏️ 文字编辑</b></td>
</tr>
<tr>
  <td>上传/拖拽图片<br/>拖动位置<br/>双指缩放 50%~300%<br/>左转/右转 90°</td>
  <td>35片·70片·120片<br/>200片·300/520片<br/>原图/2倍高清输出<br/>HSV自定义填充色</td>
  <td>5尺寸×横竖版=10组<br/>一键开关预览<br/>后台预加载<br/>文字同步适配内框</td>
  <td>Meitu风格文字框<br/>点击编辑·颜色切换<br/>拖动·双指缩放·旋转<br/>复制·删除·图层管理</td>
</tr>
</table>

---

## 📖 快速上手

### 1️⃣ 上传图片
点击上传区域或直接拖拽图片到页面。支持 JPEG / PNG / WebP / TIFF / BMP / GIF / SVG / AVIF。

### 2️⃣ 选择拼图尺寸 & 调整图片
底部工具栏选择尺寸（35片~300片），用「旋转角度」面板缩放/旋转，或直接在画布上双指操作。

### 3️⃣ 添加相框（可选）
点击右上角「添加相框」开关，自动匹配当前尺寸的横版/竖版相框。

### 4️⃣ 添加文字
点击底部「添加文字」→ 输入内容 ✓ 确认 → 拖动/缩放/旋转/改色。

### 5️⃣ 下载
点击顶栏「下载图片」按钮。PC端直接下载PNG，手机端长按保存。

> 📌 **详细使用指南** 请参见下方的「[📖 使用指南](#-使用指南详细)」章节

---

## 🏗️ 系统架构

项目采用严格的**分层模块架构**，核心原则是**图片处理与视图显示完全分离**：

```
用户操作 (鼠标/触摸事件)
       │
       ▼
  App (app.js) ── 状态管理 + 事件调度
       │
       ├── imageProcessor.js  ── 图片处理核心
       ├── frameProcessor.js  ── 相框显示（纯显示，不参与图片处理）
       ├── textProcessor.js   ── 文字渲染（Meitu风格框体+角控件+命中检测）
       ├── download.js        ── 下载导出（PC下载 / 移动端长按保存）
       └── ColorPicker.js     ── HSV颜色选择器组件
```

### 渲染流程

```
scheduleRender()
  → requestAnimationFrame()
    → rebuildPuzzle()        // 生成 PuzzleCanvas（拼图）
    → refreshDisplay()       // 叠加相框 + 叠加文字
      → renderFrame()        // 相框渲染（如有）
      → renderTexts()        // 文字渲染（基于拼图尺寸覆盖层）
```

---

## 🚀 开发指南

```bash
# 克隆
git clone https://github.com/shuren188/puzzle-frame-effect.git
cd puzzle-frame-effect

# 安装依赖
npm install

# 启动开发（端口 3000）
npm run dev

# 构建
npm run build

# 部署到 GitHub Pages
npm run deploy
```

### 技术栈

| 类别 | 技术 |
|------|------|
| **框架** | 原生 JavaScript (ES Module) |
| **构建** | Vite 6 |
| **图形** | Canvas 2D API |
| **样式** | 原生 CSS（液态玻璃设计系统） |
| **字体** | 系统默认字体（PingFang SC / Microsoft YaHei） |
| **部署** | GitHub Pages (gh-pages) |
| **生产依赖** | **零依赖** |

---

## 📦 项目结构

```
puzzle-frame-effect/
├── index.html              # 单页HTML入口
├── vite.config.js          # Vite构建配置
├── package.json            # 项目配置
├── deploy-versioned.js     # 版本化部署脚本
│
├── public/frames/          # 相框资源 (WebP)
│   ├── h/                  # 横版 (35/70/120/200/300)
│   └── v/                  # 竖版 (35/70/120/200/300)
│
├── src/
│   ├── main.js             # 应用入口
│   ├── constants.js        # 全局常量
│   ├── components/
│   │   ├── app.js          # 主应用（状态/事件/渲染/手势）
│   │   └── ColorPicker.js  # HSV颜色选择器
│   ├── utils/
│   │   ├── imageProcessor.js  # 图片处理核心
│   │   ├── frameProcessor.js  # 相框显示
│   │   ├── textProcessor.js   # 文字渲染
│   │   └── download.js        # 下载导出
│   └── styles/
│       └── main.css        # 全局样式
│
├── README.md               # 项目说明
└── 添加文字功能优化.txt      # 设计规范
```

---

## 📖 使用指南（详细）

<details>
<summary><b>🖼️ 图片上传与编辑</b></summary>

| 操作 | 方式 |
|------|------|
| 上传 | 点击上传区域 或 拖拽图片到页面 |
| 拖动 | 单指/鼠标在画布上拖拽调整位置 |
| 缩放 | 双指捏合（50%~300%）或「旋转角度」面板的滑块 |
| 旋转 | 点击左转90° / 右转90° 按钮 |
| 重置 | 顶栏「重置」按钮恢复默认 |

</details>

<details>
<summary><b>✏️ 文字编辑操作</b></summary>

| 操作 | 说明 |
|------|------|
| **添加文字** | 点击底部「添加文字」→ 自动弹出输入弹窗 → 输入 → ✓ 确认 |
| **编辑内容** | 点击画布上文字主体 → 弹出弹窗修改 |
| **改颜色** | 点击颜色按钮即时切换（白/红/黄/粉），`+` 打开HSV拾色器 |
| **拖动** | 单指/鼠标拖拽文字框 |
| **双指缩放** | 双指捏合缩放文字大小 |
| **旋转** | 拖拽右下角 `↻` 角控件 |
| **复制** | 点击左下角 `+1` 角控件 |
| **删除** | 点击右上角 `✕` 角控件 |
| **图层** | 点击左上角 `⋯` 角控件 → 上移/下移 |

</details>

<details>
<summary><b>🖼️ 相框与下载</b></summary>

| 操作 | 说明 |
|------|------|
| 开启相框 | 预览区右上角开关，自动匹配尺寸和方向 |
| 相框+文字 | 文字自动跟随拼图缩放至相框内框 |
| 下载图片 | 顶栏「下载图片」→ PC直接下载，手机长按保存 |
| 下载内容 | 拼图+文字（不含相框） |

</details>

---

## 📋 版本发布记录

> 每次版本更新都会在此记录。版本号格式：`v主版本.次版本.修订号`

### v4.8.0 — 全面重写README + 版本化部署
> 2026-07-11

- **新增** `deploy-versioned.js` — 部署时自动读取最新Git标签和提交信息，gh-pages commit 消息格式：`vX.Y.Z: 提交描述`
- **重写** README — 完整的GitHub首页项目说明，含架构图、功能总览表、折叠式使用指南
- **优化** 仓库设置 — 已设置项目描述和主页链接

### v4.7.0 — 手机端下载修复
> 2026-07-11

- **修复** 手机端（iOS Safari / Android Chrome）点击下载无反应
- **改进** 所有移动端统一使用「展示图片 → 长按保存到相册」流程

### v4.6.0 — 文字坐标系重构 + 拖动流畅性
> 2026-07-11

- **核心修复** 文字始终基于拼图尺寸独立渲染，相框/预览/下载三模式位置完全一致
- **修复** ColorPicker HEX输入框过长把确定按钮挤出弹窗
- **修复** 拖动中途卡顿：缓存wrapper尺寸、移动端preventDefault、冗余钳位清理

### v4.5.0 — 面板布局优化 + 增量式拖动
> 2026-07-11

- 角控件三点改为横向 `⋯`；颜色按钮和操作合并为一行居中
- 预设颜色精简为白/红/黄/粉四色
- 拖动改为增量式(delta)跟踪，手指离开画布边界不影响

### v4.4.0 — 美图秀秀风格文字系统（重大重构）
> 2026-07-11

- **Meitu文字框**：虚线内框 + 实线外框 + 4个角控制圆点
- **角控件交互**：`⋯`图层 / `✕`删除 / `+1`复制 / `↻`旋转缩放
- **文字输入弹窗**：背景虚化 + 预览 + 输入框 + ✕/✓ + 颜色按钮
- **图层管理**：上移/下移一层，支持N个文字

### v4.3.0 — ColorPicker修复
> 2026-07-11

- 修复自定义颜色拾取器「+」按钮无法弹出（缺失CSS样式）
- 面板信息行改为输入框聚焦时显示半透明提示

### v4.2.0 — 手势隔离加强
> 2026-07-11

- Canvas `measureText()` 精确命中检测
- 双指缩放文字同步选中状态

### v4.1.0 — 点击选中 + 编辑
> 2026-07-11

- 点击画布文字自动选中并切换到编辑面板
- 青色虚线选中边框
- 点击/拖动精确分离

### v4.0.0 — 文字精简重构
> 2026-07-11

- **移除** 思源黑体(~3MB) + 旋转滑块 + 字体选择
- **改用** 系统默认字体
- 颜色即时更新

### v3.x — 初期文字功能迭代
> 2026-07-11 之前

| 版本 | 内容 |
|------|------|
| v3.4 | 手势分离 + 独立对象管理 |
| v3.3 | 极简重构 |
| v3.2 | 颜色选择 + 精确缩放 |
| v3.1 | 文字功能修复 |
| v3.0 | 添加文字功能 + 三款自定义字体 |

### v2.x — UI/UX 迭代

| 版本 | 内容 |
|------|------|
| v2.6 | WebP相框压缩97% + 分层渲染 <500ms |
| v2.5 | 字体调整 + 相框开关优化 |
| v2.4 | 上传页重设计 |
| v2.3 | 赛博朋克→液态玻璃 |
| v2.2 | 液态玻璃风格 |
| v2.1 | 赛博朋克风格 |
| v2.0 | 全屏沉浸式布局 |

### v1.0 — 相框预览功能
> 初始版本

- 基础拼图裁剪 + 透明PNG相框叠加

---

## 🤝 参与贡献

1. Fork 本仓库
2. `git checkout -b feature/my-feature`
3. `git commit -m 'feat: 添加新功能'`
4. `git push origin feature/my-feature`
5. 创建 Pull Request

### 版本更新流程

```bash
# 修改代码 → 提交
git add -A && git commit -m "@ feat: vX.Y.Z - 描述"

# 打标签
git tag vX.Y.Z

# 推送代码和标签
git push origin v4.0 && git push origin vX.Y.Z

# 构建并部署（自动生成版本号commit）
npm run build && npm run deploy

# ★ 记得同步更新 README.md 的版本历史
```

---

<div align="center">

**📄 许可：** [MIT](LICENSE) © shuren188

*🧩 用 ❤ 制作的拼图DIY工具 — 自由拼图、自由编辑、高清放大*

[![在线体验](https://img.shields.io/badge/🌐_在线体验-点击前往-5ce5e5?style=for-the-badge)](https://shuren188.github.io/puzzle-frame-effect/)

</div>
