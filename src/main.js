import './styles/main.css';
import { App } from './components/app.js';

// DOM 就绪后启动应用
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => new App());
} else {
  new App();
}
