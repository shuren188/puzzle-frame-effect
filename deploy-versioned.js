/**
 * 版本化部署脚本 — 自动读取最新Git标签和提交信息作为gh-pages commit消息
 *
 * 用法：node deploy-versioned.js
 * 效果：gh-pages commit 消息为 "v4.7.0: 修复手机端下载长按保存无响应"
 */
import { execSync } from 'child_process';
import { publish } from 'gh-pages';

function getLatestTag() {
  try {
    return execSync('git describe --tags --abbrev=0', { encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown-version';
  }
}

function getLatestCommitMsg() {
  try {
    const msg = execSync('git log -1 --pretty=%s', { encoding: 'utf-8' }).trim();
    // 去除 @ 前缀
    return msg.replace(/^@\s*/, '');
  } catch {
    return '';
  }
}

const tag = getLatestTag();
const commitMsg = getLatestCommitMsg();
const message = `${tag}: ${commitMsg}`;

console.log(`📦 部署版本: ${tag}`);
console.log(`📝 gh-pages commit: ${message}`);
console.log('🚀 正在发布到 GitHub Pages...');

publish('dist', {
  message,
  dotfiles: true,
  history: false,
}, (err) => {
  if (err) {
    console.error('❌ 部署失败:', err);
    process.exit(1);
  }
  console.log('✅ 部署成功！');
});
