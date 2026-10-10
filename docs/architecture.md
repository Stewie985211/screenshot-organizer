# 架构与接口

## 桌面入口

Electron 主进程从 `.screenshot-organizer-root` 定位项目，或使用用于实验隔离的 SCREENSHOT_PROJECT_ROOT。浏览器数据、SQLite、模型和临时文件均在项目内。正式 renderer 加载本地文件，通过 preload 暴露的 window.screenshots 访问主进程。

窗口启用 contextIsolation 与 sandbox，renderer 不具备 Node 文件系统权限。图片按 shot://image/{id} 协议读取，主进程核对图片 ID 并提供预览，常见 BMP 在本地解码。

## 业务链路

1. Store 保存设置、图片、识别缓存、冻结计划、批次与逐项移动记录。
2. scanImages 扫描来源，排除输出、运行数据和目录链接，计算内容哈希和尺寸。
3. LocalRuntime 管理项目内 Ollama，默认地址为 127.0.0.1:21434；只停止自行启动的进程树。
4. analyzeImage 使用 qwen3-vl:4b-instruct，为可见内容生成标题、摘要和分类；不确定项交给人工确认。
5. buildPlan 校验选择并计算分类目录与最终名称，预览阶段不移动图片。
6. MoveEngine 根据冻结计划完成复制、校验、发布、删除源文件和日志提交。撤销与恢复使用同一文件完整性原则。

## IPC 方法

getState / onProgress 提供真实状态和进度；chooseFolders / saveSettings 管理来源和设置；scan / analyze 读取和识别；buildPlan / applyPlan 完成预览和移动；undoBatch / recover 处理撤销与恢复；prepareModel / runtimeStatus 管理模型；reveal 在资源管理器中显示图片。

修改标题、分类、选择或设置后，旧的前端预览失效。主进程也会检查来源、输出和分类变化。人工最终结果在成功整理时持久化，普通识别保留；显式重新识别或原图内容变化后失效。

## 存储

- data/app/organizer.sqlite：业务数据与持久化操作记录，使用 WAL 和 FULL 同步。
- data/models：模型权重和 manifest。
- data/browser：Electron 本地浏览器数据。
- data/temp、data/logs：临时文件和诊断日志。
- tools/ollama：下载的本地运行环境。
- output：默认整理目录和实验报告；用户可单独选择 D 盘其他输出目录。

运行数据默认被 Git 忽略。唯一提交的 data 内容是合成样本 manifest。
