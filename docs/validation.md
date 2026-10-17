# 文件安全与验证

## v0.4.0 验证

本地核心 **86/86** 通过，包含图片预览文件锁、真实 FFmpeg 视频解码/容器/旋转/抽样/取消、识别缓存与恢复，以及一键整理的范围、草稿、跳过、启动失败和停止边界。

正式 Electron 新流程与原手动流程各 **7/7 组**通过，实际执行解码、抽帧、分类计划、移动和撤销，覆盖 1440×960 与 1024×700。桌面回归模拟模型响应，不作为模型准确率证据。原有真实模型测试的范围和边界继续保留。

复现：安装 FFmpeg/ffprobe 后运行 `pnpm test`；构建打包后运行 `pnpm test:quick` 和 `pnpm test:selection`。后两项无需下载模型，自动生成隔离视频及素材副本。详见 [新功能说明](video-and-quick-organize.md)。

## 历史 v0.2.2 本地验证范围

在 Windows x64、D 盘 NTFS 上验证核心与持久化的 63 项文件检查、24 项完整打包版整合回归及 4 项专项桌面回归。覆盖正常移动、哈希一致、真实撤销冲突、阶段中断恢复、人工结果持久化、旧预览拦截和输出目录排除。

历史完整桌面链路还检查了百张截图、最小窗口、真实进程退出后的恢复、停止与自有模型进程树退出。合成模型样本用于接入、格式和内容建议检查，不能推断真实个人截图准确率。

历史 0.2.2 的问题清单和历史兼容边界见 [审查与修复记录](audit-2026-10-14.md)。

## 历史检查与实验

- `pnpm test`：63 项核心及输出目录检查，自动创建合成图，不需要模型。
- `pnpm typecheck && pnpm build`：类型与 renderer 构建。
- `pnpm test:audit`：先准备本地模型并打包，检查缩略图更新、失败重试与部分整理记录。
- `pnpm test:output`：先打包，检查真实桌面的设置、预览、移动和撤销。
- `node node_modules/tsx/dist/cli.mjs scripts/integration-smoke.ts --packaged`：需本地模型，覆盖完整实际桌面链路。
- `node node_modules/tsx/dist/cli.mjs scripts/layout-smoke.ts`：百张图片与正常/最小窗口。

提供 scripts/监督-* 独立实验脚本，使用项目内样本副本。识别实验应串行运行，避免多个进程同时占用模型资源。运行记录存于 output 或 data，默认不提交。

## 再生成合成样本

仓库包含合成样本与其 manifest。需要再生成时，在项目根目录执行：

```powershell
py -3.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install Pillow --cache-dir .cache/pip
.\.venv\Scripts\python.exe scripts/监督-生成测试样本.py
```

脚本使用 Windows 系统字体。测试图片里的聊天、订单、代码和课件是人为构造，文件路径相对项目保存。

## 已知边界

常见非压缩/位掩码 BMP 可读，RLE BMP 暂不支持。文件发布和撤销需要支持硬链接的目的地。原位置被占用或文件被外部修改时会保留文件并显示冲突；跨盘、不同文件系统和真实图片内容应单独实测。当前不是全文 OCR 系统，也不会自动监听截图目录。
