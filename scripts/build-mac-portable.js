const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const distDir = path.join(root, 'dist');
const releaseDir = path.join(distDir, 'mac-release');

const arch = process.arch === 'arm64' ? 'arm64' : 'x64';
const folderName = arch === 'arm64' ? 'Apple-Silicon-M1-M4' : 'Intel-Mac';
const appDir = path.join(releaseDir, folderName);

function copyDir(from, to) {
    fs.rmSync(to, {recursive: true, force: true});
    fs.cpSync(from, to, {
        recursive: true,
        filter(source) {
            const name = path.basename(source);
            return !['.git', 'dist', 'data'].includes(name);
        }
    });
}

function copyFile(from, to, mode) {
    fs.mkdirSync(path.dirname(to), {recursive: true});
    fs.copyFileSync(from, to);
    if (mode) {
        fs.chmodSync(to, mode);
    }
}

fs.rmSync(releaseDir, {recursive: true, force: true});
fs.mkdirSync(appDir, {recursive: true});

copyDir(path.join(root, 'src'), path.join(appDir, 'src'));
copyDir(path.join(root, 'node_modules'), path.join(appDir, 'node_modules'));
copyFile(path.join(root, 'package.json'), path.join(appDir, 'package.json'));
copyFile(path.join(root, 'Mac-README.md'), path.join(releaseDir, 'Mac-README.md'));
copyFile(process.execPath, path.join(appDir, 'node', 'bin', 'node'), 0o755);

const launcher = `#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"
"$DIR/node/bin/node" "$DIR/src/launcher.js"
STATUS=$?
if [ $STATUS -ne 0 ]; then
  echo
  echo "启动失败，按任意键关闭..."
  read -n 1 -s
fi
exit $STATUS
`;

fs.writeFileSync(path.join(appDir, 'fenbi-helper.command'), launcher, 'utf8');
fs.chmodSync(path.join(appDir, 'fenbi-helper.command'), 0o755);

console.log(`Portable Mac release is ready: ${appDir}`);
