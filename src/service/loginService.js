const request = require('request');
const setCookie = require('set-cookie-parser');
const QRCode = require('qrcode');


function queryString(n) {
    var t = "";
    for (let e in n)
        t += e + "=" + encodeURIComponent(n[e]) + "&";
    return t.slice(0, -1)
}

/**
 * 返回粉笔登录响应和 Cookie
 */
exports.login = async function (phone, password, captcha) {
    let loginBody = {
        phone,
        password
    };
    if (captcha != null && captcha !== '') {
        loginBody.captcha = captcha;
    }

    return await new Promise(function (resolve, reject) {
        request({
            url: 'https://tiku.fenbi.com/api/users/loginV2',
            method: 'POST',
            json: true,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
                'Referer': 'https://www.fenbi.com/spa/tiku'
            },
            body: queryString(loginBody),
        }, function (err, httpResponse, body) {
            if (err) reject(err);
            resolve({
                statusCode: httpResponse && httpResponse.statusCode,
                body,
                cookies: setCookie.parse((httpResponse && httpResponse.headers['set-cookie']) || [])
            });
        });
    });
}

exports.createQrCodeLogin = async function () {
    return await new Promise(function (resolve, reject) {
        request({
            url: 'https://ke.fenbi.com/qrcode-login/api/gen_code?random=' + Math.random(),
            method: 'GET',
            json: true,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
                'Referer': 'https://www.fenbi.com/'
            }
        }, async function (err, httpResponse, body) {
            if (err) reject(err);
            try {
                if (!body || body.code !== 1 || !body.data || !body.data.codeContent) {
                    resolve({
                        code: 500,
                        message: (body && body.msg) || '二维码生成失败'
                    });
                    return;
                }

                resolve({
                    code: 200,
                    lgtoken: body.data.lgtoken,
                    qrDataUrl: await QRCode.toDataURL(body.data.codeContent, {
                        margin: 1,
                        width: 220
                    })
                });
            } catch (error) {
                reject(error);
            }
        });
    });
}

exports.queryQrCodeLogin = async function (lgtoken) {
    return await new Promise(function (resolve, reject) {
        request({
            url: 'https://ke.fenbi.com/qrcode-login/api/query_code_status',
            method: 'POST',
            json: true,
            headers: {
                'Content-Type': 'application/json;charset=UTF-8',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
                'Referer': 'https://www.fenbi.com/'
            },
            body: {
                lgtoken
            }
        }, function (err, httpResponse, body) {
            if (err) reject(err);
            resolve({
                statusCode: httpResponse && httpResponse.statusCode,
                body,
                cookies: setCookie.parse((httpResponse && httpResponse.headers['set-cookie']) || [])
            });
        });
    });
}
