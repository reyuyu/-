const fs = require('fs');
const path = require('path');
const {spawnSync} = require('child_process');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const releaseDir = path.join(distDir, 'mac-release');

function run(command, args) {
    const result = spawnSync(command, args, {
        cwd: root,
        stdio: 'inherit',
        shell: process.platform === 'win32'
    });
    if (result.status !== 0) {
        process.exit(result.status || 1);
    }
}

function copyFile(from, to) {
    fs.mkdirSync(path.dirname(to), {recursive: true});
    fs.copyFileSync(from, to);
    try {
        fs.chmodSync(to, 0o755);
    } catch (error) {
        // Windows may ignore chmod. The Mac guide below includes a chmod fallback.
    }
}

fs.rmSync(releaseDir, {recursive: true, force: true});
fs.mkdirSync(releaseDir, {recursive: true});

run('npm', ['run', 'build:mac']);

copyFile(
    path.join(distDir, 'fenbi-helper-macos-arm64'),
    path.join(releaseDir, 'Apple-Silicon-M1-M4', 'fenbi-helper')
);
copyFile(
    path.join(distDir, 'fenbi-helper-macos-x64'),
    path.join(releaseDir, 'Intel-Mac', 'fenbi-helper')
);

const guide = `# Mac 使用说明

## 选择哪个版本

- Apple 芯片 Mac：进入 \`Apple-Silicon-M1-M4\` 文件夹。
- Intel 芯片 Mac：进入 \`Intel-Mac\` 文件夹。

不知道芯片类型时，点左上角苹果图标，选择“关于本机”查看。

## 怎么启动

1. 双击 \`fenbi-helper\`。
2. 如果 macOS 提示无法打开，右键点 \`fenbi-helper\`，选择“打开”，再确认一次。
3. 程序会自动打开浏览器，进入做题台。
4. 第一次使用请先扫码登录粉笔账号。

如果双击没有反应，打开“终端”，进入对应文件夹后执行：

\`\`\`bash
chmod +x ./fenbi-helper
./fenbi-helper
\`\`\`

## 数据保存在哪里

DeepSeek 配置会保存在同目录的 \`config.json\`。

言语理解笔记本会保存在同目录的：

\`\`\`text
data/verbal-notebook.json
\`\`\`

所以不要只移动 \`fenbi-helper\` 一个文件，最好保留整个文件夹。

## 退出

关闭启动后的终端窗口，或者在终端里按 \`Ctrl+C\`。
`;

fs.writeFileSync(path.join(releaseDir, 'Mac-README.md'), guide, 'utf8');

console.log('');
console.log(`Mac release is ready: ${releaseDir}`);
console.log('Send the whole mac-release folder to Mac users.');
