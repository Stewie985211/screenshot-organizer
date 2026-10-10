# 文件安全与验证

## 本地验证范围

在 Windows x64、D 盘 NTFS 上验证核心与保存位置的 32 项文件检查，以及保存位置的 7 项打包版桌面检查。覆盖正常移动、哈希一致、真实撤销冲突、阶段中断恢复、人工结果持久化、旧预览拦截和输出目录排除。

历史完整桌面链路还检查了百张截图、最小窗口、真实进程退出后的恢复、停止与自有模型进程树退出。合成模型样本用于接入、格式和内容建议检查，不能推断真实个人截图准确率。

## 如何复现

- `pnpm test`：32 项核心及输出目录检查，自动创建合成图，不需要模型。
- `pnpm typecheck && pnpm build`：类型与 renderer 构建。
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
