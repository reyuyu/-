const {exec} = require('child_process');
const net = require('net');

const {startServer} = require('./app');

const DEFAULT_PORT = Number.parseInt(process.env.PORT || 3000, 10);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_PORT_TRIES = 10;

function isPortAvailable(port, host) {
    return new Promise(resolve => {
        const tester = net.createServer()
            .once('error', () => resolve(false))
            .once('listening', () => {
                tester.close(() => resolve(true));
            });

        tester.listen(port, host);
    });
}

async function findPort(startPort) {
    for (let i = 0; i < MAX_PORT_TRIES; i++) {
        const port = startPort + i;
        if (await isPortAvailable(port, HOST)) {
            return port;
        }
    }

    throw new Error(`端口 ${startPort}-${startPort + MAX_PORT_TRIES - 1} 都被占用了`);
}

function openBrowser(url) {
    const command = process.platform === 'win32'
        ? `start "" "${url}"`
        : process.platform === 'darwin'
            ? `open "${url}"`
            : `xdg-open "${url}"`;

    exec(command, error => {
        if (error) {
            console.log(`浏览器没有自动打开，请手动访问: ${url}`);
        }
    });
}

async function main() {
    const port = await findPort(DEFAULT_PORT);
    const {url} = await startServer({host: HOST, port});

    console.log('粉笔刷题辅助工具已启动');
    console.log(`访问地址: ${url}`);
    console.log('关闭这个窗口即可退出程序。');

    if (!process.env.NO_BROWSER) {
        openBrowser(url);
    }
}

main().catch(error => {
    console.error('启动失败:', error.message);
    console.error('按 Ctrl+C 或直接关闭窗口退出。');
    process.exitCode = 1;
});
