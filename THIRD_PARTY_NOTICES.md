# 第三方组件说明

本仓库包含项目原创源码、界面和由脚本生成的合成样本。依赖版本由 pnpm-lock.yaml 固定；依赖不作为源码副本提交，其许可证以安装包内文件为准。

- Electron: https://github.com/electron/electron/blob/main/LICENSE
- React: https://github.com/facebook/react/blob/main/LICENSE
- Vite: https://github.com/vitejs/vite/blob/main/LICENSE
- TypeScript: https://github.com/microsoft/TypeScript/blob/main/LICENSE.txt
- Sharp 与其图像库: https://github.com/lovell/sharp/blob/main/LICENSE
- Zod: https://github.com/colinhacks/zod/blob/main/LICENSE
- Playwright: https://github.com/microsoft/playwright/blob/main/LICENSE
- Ollama: https://github.com/ollama/ollama/blob/main/LICENSE
- Qwen3-VL 模型: https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct

Ollama 运行环境通过准备脚本从官方发行页下载并校验发行包 SHA256；模型由 Ollama 按指定标签下载。仓库的 MIT 许可证不替代第三方组件或模型的许可证。分发二进制时保留 Electron、图像库等组件的许可证文件。
