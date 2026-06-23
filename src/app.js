const Koa = require('koa');
const KoaRouter = require('koa-router');
const koaBody = require('koa-body');

const render = require('koa-ejs');
const serve = require('koa-static');


const path = require('path');
const qs = require('qs');
const url = require('url');

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app = new Koa();
const router = new KoaRouter();

const exerciseResult = require('./service/exercisesResult');
const loginService = require('./service/loginService');
const aiService = require('./service/aiService');
const verbalNotebookService = require('./service/verbalNotebookService');

function setLocalCookie(ctx, name, value) {
    ctx.cookies.set(name, value, {
        path: '/',
        maxAge: 0,
        expires: new Date('2099-07-06'),
        httpOnly: false
    });
}

function parseCookieText(cookieText) {
    return (cookieText || '')
        .split(';')
        .map(item => item.trim())
        .filter(item => item.includes('='))
        .map(item => {
            const eqIndex = item.indexOf('=');
            return {
                name: item.slice(0, eqIndex).trim(),
                value: item.slice(eqIndex + 1).trim()
            };
        })
        .filter(item => item.name && item.value);
}

render(app, {
    root: path.join(__dirname, 'views'),
    layout: false,
    viewExt: 'ejs',
    cache: false,
    debug: false,
});

app.use(async(ctx, next) => {
    try {
        await next();
    } catch (error) {
        console.error(error);
        if (ctx.path.startsWith('/api/')) {
            ctx.status = 500;
            ctx.type = 'application/json';
            ctx.body = {
                code: 500,
                message: error.message || '服务内部错误'
            };
            return;
        }
        ctx.status = 500;
        ctx.type = 'html';
        ctx.body = `
            <html lang="zh">
            <body style="background:#f5f7fa;font-family:Arial,'Microsoft YaHei',sans-serif;">
                <div style="width:520px;margin:120px auto;padding:24px;background:#fff;border:1px solid #ddd;">
                    <h2 style="margin-top:0;">读取失败</h2>
                    <p>${error.message || '服务内部错误'}</p>
                    <p style="color:#666;">可以返回登录页重新扫码。如果反复出现，通常是扫码登录没有拿到粉笔题库 Cookie。</p>
                    <a href="/setup">返回登录页</a>
                </div>
            </body>
            </html>
        `;
    }
});

app.use(serve(__dirname + '/views/js'))

app.use(router.routes()).use(router.allowedMethods())

app.use(koaBody())

app.use(async(ctx, next) => {
    if (ctx.status === 404) {
        ctx.redirect('/dashboard');
    } else {
        next();
    }
});

router.get('/exercise/:exerciseId', async ctx => {
    let exerciseId = ctx.params.exerciseId;
    let costThreshold = Number.parseInt(ctx.query.cost || 70);
    let cookie = ctx.request.headers['cookie']
    let renderObj = await exerciseResult.getResultObj(exerciseId, costThreshold, cookie);
    if (renderObj) {
        await ctx.render('exerciseResult', renderObj);
    } else {
        ctx.redirect('/setup?redirectPath=' + ctx.originalUrl);
    }
});

router.get('/question/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie']
    let renderObj = await exerciseResult.getQuestion(questionId, cookie);
    if (renderObj) {
        await ctx.render('question', renderObj);
    } else {
        ctx.redirect('/setup?redirectPath=' + ctx.originalUrl);
    }
});

router.get('/search', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        await ctx.render('search');
    }
});

router.post('/api/search', koaBody(), async ctx => {
    let cookie = ctx.request.headers['cookie']
    let {text} = ctx.request.body;
    ctx.body = await exerciseResult.search(text, cookie);
});

router.post('/api/saveNote/:questionId', koaBody(), async ctx => {
    let cookie = ctx.request.headers['cookie']
    let questionId = ctx.params.questionId;
    let {noteContent} = ctx.request.body;
    ctx.body = await exerciseResult.saveNote(questionId, noteContent, cookie);
});

router.get('/calc', async ctx => {
    await ctx.render('calc', {});
});

router.get('/dashboard', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        await ctx.render('dashboard');
    }
});

router.get('/practice', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        await ctx.render('practice', {
            exerciseId: ''
        });
    }
});

router.get('/practice/:exerciseId', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        await ctx.render('practice', {
            exerciseId: ctx.params.exerciseId
        });
    }
});

router.get('/verbal-notebook', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        await ctx.render('verbal-notebook');
    }
});

router.get('/setup', async ctx => {
    await ctx.render('setup', {});
});

router.post('/api/login', koaBody(), async ctx => {
    let {phone, password, captcha} = ctx.request.body;
    let loginResult = await loginService.login(phone, password, captcha);
    let cookies = loginResult.cookies || [];
    if (cookies.length > 1) {
        cookies.forEach(cookie => {
            let {name, value} = cookie;
            setLocalCookie(ctx, name, value);
            let referer = ctx.request.headers.referer;
            let redirectPath = qs.parse(url.parse(referer).query)['redirectPath'] || '/dashboard';
            ctx.body = {
                code: 200,
                redirectPath
            };
        });
    } else {
        ctx.body = {
            code: 500,
            message: (loginResult.body && loginResult.body.msg) || '粉笔账号密码登录失败。当前粉笔网页登录已改用新版验证，建议使用 Cookie 登录。'
        };
    }
});

router.post('/api/useCookie', koaBody(), async ctx => {
    let {cookieText} = ctx.request.body;
    let cookies = parseCookieText(cookieText);
    cookies.forEach(cookie => {
        setLocalCookie(ctx, cookie.name, cookie.value);
    });
    let hasUserId = cookies.some(cookie => cookie.name === 'userid');
    ctx.body = {
        code: hasUserId ? 200 : 400,
        message: hasUserId ? '' : 'Cookie 中没有找到 userid，请确认复制的是已登录粉笔网页的请求 Cookie。',
        redirectPath: '/dashboard'
    };
});

router.post('/api/qrcode/start', async ctx => {
    ctx.body = await loginService.createQrCodeLogin();
});

router.post('/api/qrcode/status', koaBody(), async ctx => {
    let {lgtoken} = ctx.request.body;
    if (!lgtoken) {
        ctx.body = {
            code: 400,
            message: '缺少二维码登录 token'
        };
        return;
    }

    let result = await loginService.queryQrCodeLogin(lgtoken);
    let cookies = result.cookies || [];
    cookies.forEach(cookie => {
        setLocalCookie(ctx, cookie.name, cookie.value);
    });
    let cookieNames = cookies.map(cookie => cookie.name);
    let hasUserId = cookieNames.includes('userid');

    ctx.body = {
        code: 200,
        data: result.body && result.body.data,
        message: (result.body && result.body.msg) || '',
        hasCookie: cookies.length > 0,
        hasUserId,
        cookieNames,
        redirectPath: '/dashboard'
    };
});

router.post('/api/collect/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie']
    await exerciseResult.addCollect(questionId, cookie);
    ctx.body = '';
});

router.del('/api/collect/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie']
    await exerciseResult.delCollect(questionId, cookie);
    ctx.body = '';
});

router.get('/api/video/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie'];
    ctx.body = await exerciseResult.getVideoUrl(questionId, cookie);
});

router.get('/api/comment/:questionId', async ctx => {
    let questionId = ctx.params.questionId;
    let cookie = ctx.request.headers['cookie'];
    ctx.body = await exerciseResult.getComments(questionId, cookie);
});

router.post('/api/zj', koaBody(), async ctx => {
    let {word} = ctx.request.body;
    ctx.body = await exerciseResult.zjWord(word);
});

router.get('/api/practice/history', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    ctx.body = await exerciseResult.getPracticeHistory(cookie);
});

router.get('/api/practice/categories', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    ctx.body = await exerciseResult.getPracticeCategories(cookie);
});

router.post('/api/practice/create', koaBody(), async ctx => {
    let cookie = ctx.request.headers['cookie'];
    ctx.body = await exerciseResult.createPracticeExercise(ctx.request.body || {}, cookie);
});

router.get('/api/practice/:exerciseId', async ctx => {
    let cookie = ctx.request.headers['cookie'];
    ctx.body = await exerciseResult.getPracticeExercise(ctx.params.exerciseId, cookie);
});

router.post('/api/practice/:exerciseId/answer', koaBody(), async ctx => {
    let cookie = ctx.request.headers['cookie'];
    try {
        await exerciseResult.syncPracticeAnswer(ctx.params.exerciseId, ctx.request.body, cookie);
        ctx.body = {
            code: 200,
            synced: true
        };
    } catch (error) {
        ctx.body = {
            code: 200,
            synced: false,
            message: error.message || '粉笔同步失败，已保存在本地。'
        };
    }
});

router.post('/api/practice/:exerciseId/submit', koaBody(), async ctx => {
    let cookie = ctx.request.headers['cookie'];
    try {
        await exerciseResult.submitPracticeExercise(ctx.params.exerciseId, cookie, ctx.request.body && ctx.request.body.answers);
        ctx.body = {
            code: 200,
            synced: true
        };
    } catch (error) {
        ctx.body = {
            code: 200,
            synced: false,
            message: error.message || '交卷同步失败。'
        };
    }
});

router.post('/api/ai/explain', koaBody(), async ctx => {
    ctx.body = await aiService.explainQuestion(ctx.request.body);
});

router.post('/api/ai/chat', koaBody(), async ctx => {
    ctx.body = await aiService.chatQuestion(ctx.request.body);
});

router.post('/api/ai/verbal-notes', koaBody(), async ctx => {
    ctx.body = await aiService.extractVerbalNotes(ctx.request.body);
});

router.get('/api/verbal-notebook', async ctx => {
    ctx.body = {
        code: 200,
        entries: verbalNotebookService.list()
    };
});

router.post('/api/verbal-notebook/entries', koaBody(), async ctx => {
    const body = ctx.request.body || {};
    ctx.body = {
        code: 200,
        entries: verbalNotebookService.addMany(body.entries || [], body.sourceQuestion || {})
    };
});

router.patch('/api/verbal-notebook/:id', koaBody(), async ctx => {
    ctx.body = {
        code: 200,
        entry: verbalNotebookService.update(ctx.params.id, ctx.request.body || {})
    };
});

router.del('/api/verbal-notebook/:id', async ctx => {
    ctx.body = {
        code: 200,
        ...verbalNotebookService.remove(ctx.params.id)
    };
});

router.get('/api/ai/config', async ctx => {
    ctx.body = {
        code: 200,
        ...aiService.getConfigStatus()
    };
});

router.post('/api/ai/config', koaBody(), async ctx => {
    ctx.body = {
        code: 200,
        ...aiService.saveConfig(ctx.request.body || {})
    };
});

router.get('/favicon.ico', async ctx => {
    ctx.body = ''
});

router.all('/', async ctx => {
    let cookie = ctx.request.headers['cookie']
    if (!cookie || !cookie.includes('userid')) {
        ctx.redirect('/setup');
    } else {
        ctx.redirect('/dashboard');
    }
});

function startServer(options = {}) {
    const port = Number.parseInt(options.port || process.env.PORT || 3000, 10);
    const host = options.host || process.env.HOST || '127.0.0.1';

    return new Promise((resolve, reject) => {
        const server = app.listen(port, host, () => {
            resolve({
                server,
                host,
                port,
                url: `http://${host}:${port}`
            });
        });
        server.on('error', reject);
    });
}

if (require.main === module) {
    startServer().then(({url}) => {
        console.log(`粉笔刷题辅助工具已启动: ${url}`);
    }).catch(error => {
        console.error('服务启动失败:', error.message);
        process.exitCode = 1;
    });
}

module.exports = {
    app,
    startServer
};
