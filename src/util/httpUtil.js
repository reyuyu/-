const request = require('request')

const ERR_CODE = 666;

exports.httpRequest = async function (params) {
    try {
        return await new Promise(function (resolve, reject) {
            request(params, function (err, httpResponse, body) {
                if (err) return reject(err);
                if (httpResponse && httpResponse.statusCode >= 400) {
                    let error = new Error(`请求${params.url}返回 ${httpResponse.statusCode}`);
                    error.statusCode = httpResponse.statusCode;
                    error.body = body;
                    return reject(error);
                }
                resolve(body);
            });
        });
    } catch (error) {
        if (error.code === 'ETIMEDOUT') {
            throw {
                code: 'ERR_CODE',
                message: `请求${params.url}服务超时`,
                value: JSON.stringify(error),
            };
        }
        if (error.connect === true) {
            throw {
                code: ERR_CODE,
                message: `无法连接${params.url}服务`,
                value: JSON.stringify(error),
            };
        }
        throw {
            code: ERR_CODE,
            message: `请求${params.url}服务出错`,
            value: error.message,
        };
    }
};
