# Mac 用户使用方案

## 推荐方式

当前最简单的交付方式是打包成两个免安装文件：

- Apple 芯片：M1、M2、M3、M4 等
- Intel 芯片：老款 Intel Mac

Mac 用户不需要安装 Node.js。运行后程序会启动本地服务，并自动打开浏览器进入做题台。

## 本地构建命令

如果在 Mac 或网络可以访问 GitHub 的电脑上构建，执行：

```bash
npm run build:mac:release
```

生成目录：

```text
dist/mac-release
```

把整个 `dist/mac-release` 文件夹发给 Mac 用户即可。

## Windows 上构建失败怎么办

如果你在 Windows 上看到类似：

```text
Not able to build for 'macos' here, only for 'win'
```

这是因为 Windows 不能在本机从源码构建 macOS 运行时。推荐改用 GitHub Actions 自动打包，见 `GITHUB_ACTIONS_MAC.md`。

## 用户怎么用

1. 根据 Mac 芯片选择对应文件夹。
2. 双击 `fenbi-helper`。
3. 如果 macOS 提示无法打开，右键选择“打开”。
4. 浏览器自动打开后扫码登录粉笔。

如果双击没反应，让用户打开终端，在对应文件夹里执行：

```bash
chmod +x ./fenbi-helper
./fenbi-helper
```

## 数据位置

打包后，数据会保存在可执行文件同目录：

```text
config.json
data/verbal-notebook.json
```

所以不要只移动单个 `fenbi-helper` 文件，建议保留整个文件夹。

## 后续更像 App 的方案

如果要给大量非技术用户使用，下一步可以做 Electron `.app`：

- 优点：像普通 Mac App 一样双击图标打开，有独立窗口。
- 缺点：包更大，公开分发最好做开发者签名和 notarization。

现在这个项目已经是网页 UI + 本地 Node 服务，所以先用 `pkg` 二进制发布最快；等功能稳定后，再做 Electron 壳更划算。
