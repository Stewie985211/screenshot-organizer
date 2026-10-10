# 独立 UI 设计原型

本目录保留三栏界面设计源、通用图标、样式变量和交互原型。原型使用合成 SVG 截图和演示数据；正式桌面界面位于 ../src/renderer，调用真实 IPC。

在仓库根目录安装依赖后执行 `node ui-design/scripts/build.mjs`，生成 `ui-design/output/拾图-交互原型.html`，可直接在浏览器打开。

浏览器检查需要 Playwright Chromium：

```powershell
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $PWD '.cache/playwright'
pnpm exec playwright install chromium
node ui-design/scripts/verify.mjs
```

也可通过 BROWSER_PATH 指定已安装的 Chrome 可执行文件。图标使用项目内 SVG；应用界面不加载远程字体或 CDN。
