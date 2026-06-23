# Mac 使用说明

## 选择哪个版本

- Apple 芯片 Mac：使用 `fenbi-helper-macos-arm64.tar.gz`。
- Intel 芯片 Mac：使用 `fenbi-helper-macos-x64.tar.gz`。

不知道芯片类型时，点左上角苹果图标，选择“关于本机”查看。

## 怎么启动

1. 解压下载的 `.tar.gz` 文件。
2. 进入解压后的文件夹。
3. 双击 `fenbi-helper`。
4. 如果 macOS 提示无法打开，右键点 `fenbi-helper`，选择“打开”，再确认一次。
5. 程序会自动打开浏览器，进入做题台。
6. 第一次使用请先扫码登录粉笔账号。

如果双击没有反应，打开“终端”，进入对应文件夹后执行：

```bash
chmod +x ./fenbi-helper
./fenbi-helper
```

## 数据保存在哪里

DeepSeek 配置会保存在同目录的：

```text
config.json
```

言语理解笔记本会保存在同目录的：

```text
data/verbal-notebook.json
```

所以不要只移动 `fenbi-helper` 一个文件，最好保留整个文件夹。

## 退出

关闭启动后的终端窗口，或者在终端里按 `Ctrl+C`。
