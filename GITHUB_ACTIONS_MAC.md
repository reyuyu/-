# 用 GitHub 自动打包 Mac 版本

`runs-on: macos-latest` 不是 PowerShell 命令，它应该写在 GitHub Actions 配置文件里。

本项目已经加好了配置文件：

```text
.github/workflows/build-mac.yml
```

## 第一次怎么用

1. 在 GitHub 创建一个新仓库。
2. 把当前项目上传到这个仓库，注意要包含这些文件：

```text
package.json
package-lock.json
src/
scripts/
.github/workflows/build-mac.yml
```

3. 打开 GitHub 仓库页面。
4. 点击顶部 `Actions`。
5. 左侧选择 `Build Mac Release`。
6. 点击 `Run workflow`。
7. 等它跑完，进入这次运行记录。
8. 在页面底部 `Artifacts` 下载对应架构的压缩包。

下载后里面会有：

```text
fenbi-helper-macos-arm64.tar.gz
fenbi-helper-macos-x64.tar.gz
```

## 给 Mac 用户发哪个

- Apple 芯片 Mac：发 `fenbi-helper-macos-arm64.tar.gz`
- Intel 芯片 Mac：发 `fenbi-helper-macos-x64.tar.gz`

让用户解压后按 `Mac-README.md` 操作。

## 为什么这样能解决

你本地 Windows 报错的原因是：

```text
Not able to build for 'macos' here, only for 'win'
```

GitHub Actions 会真的开一台 macOS 云端机器来打包，所以不再需要 Windows 交叉构建 macOS 版本。

## 常见问题

如果 Actions 里 `npm ci` 失败，通常是没有上传 `package-lock.json`。

如果 Actions 里下载依赖失败，重新点一次 `Re-run jobs` 通常就可以。

如果日志停在 `Compiling Node.js from sources...`，不一定是失败。`pkg` 没找到预编译运行时的时候会在 macOS runner 上现场编译 Node，第一次可能比较久。工作流已经缓存了 `~/.pkg-cache`，第一次成功后，后续同架构构建会快很多。

如果 Mac 用户打开时提示不受信任，让用户右键 `fenbi-helper`，选择“打开”，再确认一次。
