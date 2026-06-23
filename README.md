# Fenbi Helper

一个面向行测刷题的本地辅助工具。它会在本机启动一个网页做题台，通过扫码登录读取粉笔题库数据，支持在线刷题、提交同步、DeepSeek AI 解题思路、言语理解词语笔记本。

> 本项目仅用于个人学习辅助。粉笔账号、Cookie、DeepSeek API Key 都应只保存在使用者自己的电脑上，不要上传到公开仓库。

## 主要功能

- 粉笔扫码登录
- 选择快速、随机、专项练习
- 在线做题并尝试同步到粉笔
- 交卷后显示标准答案和解析
- 每道题生成 AI 参考思路
- 每道题支持轻量追问线程，切换题目后自动重置
- 针对行测不同板块使用不同 AI 提示词
- 言语理解题支持生成词语、成语、近义辨析笔记
- 笔记本支持搜索、排序、编辑和查看来源例题
- 支持 Windows 本地启动和 Mac 自动打包

## 环境要求

开发或源码运行需要：

- Node.js 18 或更高版本
- npm
- 一个可扫码登录的粉笔账号
- 可选：DeepSeek API Key

Mac 普通用户如果使用打包版本，不需要安装 Node.js。

## 本地快速启动

安装依赖：

```bash
npm install
```

启动本地服务：

```bash
npm run start:desktop
```

程序会自动打开浏览器。如果没有自动打开，可以手动访问终端里显示的本地地址，通常类似：

```text
http://127.0.0.1:3000
```

第一次进入后，按页面提示使用粉笔 App 扫码登录。

## DeepSeek AI 配置

进入主页后，在 `DeepSeek AI` 配置区填写：

- API Key
- 模型名，默认 `deepseek-chat`
- Base URL，默认 `https://api.deepseek.com`

配置会保存在本机的 `config.json`，该文件已被 `.gitignore` 忽略，不会上传到仓库。

也可以手动创建：

```json
{
  "deepseekApiKey": "你的 DeepSeek API Key",
  "deepseekModel": "deepseek-chat",
  "deepseekBaseUrl": "https://api.deepseek.com"
}
```

## 怎么刷题

1. 打开首页。
2. 选择 `快速`、`随机` 或 `专项`。
3. 点击创建并开始。
4. 完成题目后交卷。
5. 交卷后查看标准答案、粉笔解析和 AI 思路。
6. 言语理解题可在 AI 区生成词语笔记。

## 言语理解笔记本

主页有明显的 `言语笔记本` 入口。

做言语理解题时，交卷后可以点击 `记笔记`，让 AI 从题目中提取词语、成语、近义辨析信息。用户可以勾选需要积累的词条，并保存到本地笔记本。

笔记数据保存在：

```text
data/verbal-notebook.json
```

该目录已被 `.gitignore` 忽略。

## Windows 使用

源码方式：

```powershell
npm.cmd install
npm.cmd run start:desktop
```

如果 PowerShell 提示不能运行 `npm.ps1`，请使用 `npm.cmd`，例如：

```powershell
npm.cmd run start:desktop
```

构建 Windows 单文件：

```powershell
npm.cmd run build:win
```

生成文件：

```text
dist/fenbi-helper.exe
```

## Mac 使用

推荐使用 GitHub Actions 自动打包 Mac 版本，避免在 Windows 本地交叉构建失败。

工作流文件已经内置：

```text
.github/workflows/build-mac.yml
```

上传到 GitHub 后：

1. 打开仓库页面。
2. 点击 `Actions`。
3. 选择 `Build Mac Release`。
4. 点击 `Run workflow`。
5. 等待完成后，在 `Artifacts` 下载 `fenbi-helper-mac-release`。

下载包里会包含：

```text
fenbi-helper-macos-arm64.tar.gz
fenbi-helper-macos-x64.tar.gz
fenbi-helper-mac-release.tar.gz
Mac使用说明.md
```

选择方式：

- Apple 芯片 Mac：使用 `fenbi-helper-macos-arm64.tar.gz`
- Intel 芯片 Mac：使用 `fenbi-helper-macos-x64.tar.gz`
- 不确定芯片：使用 `fenbi-helper-mac-release.tar.gz`

更详细说明见：

- [GITHUB_ACTIONS_MAC.md](./GITHUB_ACTIONS_MAC.md)
- [MAC使用说明.md](./MAC使用说明.md)

## 常见问题

### 为什么不能直接用 GitHub Pages 做在线网站？

GitHub Pages 只能托管静态网页，而本项目需要后端服务来保存登录态、请求粉笔接口、调用 DeepSeek、保存笔记。更适合先做成本地工具或桌面应用。

### 为什么 Windows 上打 Mac 包失败？

如果看到：

```text
Not able to build for 'macos' here, only for 'win'
```

说明 Windows 本机不能构建 macOS 目标。请使用 GitHub Actions 或直接在 Mac 上打包。

### DeepSeek 能读题目图片吗？

当前默认模型 `deepseek-chat` 主要基于文本回答，不能直接读取题图。如果题目依赖图片，AI 解答只能基于题干文本和选项。后续如果接入多模态模型，可以再补图片理解能力。

### 做题同步失败怎么办？

工具会尽量调用粉笔接口同步答案。如果粉笔接口变化、登录态失效或风控拦截，可能出现同步失败。此时可以重新扫码登录，或先把它作为本地刷题工具使用。

## 项目结构

```text
src/
  app.js                         Koa 服务入口
  launcher.js                    本地桌面启动器
  service/
    aiService.js                 DeepSeek AI 调用和提示词
    exercisesResult.js           粉笔练习、题目、提交相关逻辑
    loginService.js              扫码登录逻辑
    storagePath.js               打包后的本地存储路径
    verbalNotebookService.js     言语笔记本本地存储
  views/
    dashboard.ejs                首页做题台
    practice.ejs                 刷题页面
    setup.ejs                    登录页
    verbal-notebook.ejs          言语笔记本
scripts/
  build-mac-release.js           Mac 发布包构建脚本
.github/workflows/
  build-mac.yml                  GitHub Actions Mac 自动打包
```

## 安全提醒

不要提交这些文件：

```text
config.json
data/
dist/
node_modules/
*.exe
```

其中 `config.json` 可能包含 DeepSeek API Key，`data/` 可能包含个人笔记和来源题目。
