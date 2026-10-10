# 贡献指南

欢迎提交问题和 Pull Request。请在 Windows x64、D 盘项目目录中工作，使用 Node.js 24 和 package.json 指定的 pnpm 版本。

提交前运行 `pnpm typecheck`、`pnpm test` 和 `pnpm build`。改变文件操作、恢复或撤销行为时，增加能够验证失败和恢复的检查；不要以真实个人截图做自动移动实验。

界面通过 `window.screenshots` 使用 IPC，合同在 `src/shared/types.ts`。保留 contextIsolation、sandbox 和原生文件操作校验，不给 renderer 增加文件系统权限。

请勿提交个人截图、数据库、模型权重、运行日志、密钥、`.env`、node_modules 或构建输出。复现问题时优先提交合成样本和去除个人路径的简要错误信息。

独立设计原型在 ui-design，正式程序在 src/renderer。业务变化须同步正式界面与使用说明，原型可以保持演示数据。
