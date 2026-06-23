const fs = require('fs');
const path = require('path');
const request = require('request');

const {resolveStoragePath} = require('./storagePath');

const configPath = resolveStoragePath('config.json');

function readLocalConfig() {
    if (!fs.existsSync(configPath)) return {};
    try {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } catch (error) {
        return {};
    }
}

function writeLocalConfig(nextConfig) {
    const config = {
        ...readLocalConfig(),
        ...nextConfig
    };
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return config;
}

function getDeepSeekConfig() {
    const config = readLocalConfig();
    return {
        apiKey: process.env.DEEPSEEK_API_KEY || config.deepseekApiKey,
        model: process.env.DEEPSEEK_MODEL || config.deepseekModel || 'deepseek-chat',
        baseUrl: process.env.DEEPSEEK_BASE_URL || config.deepseekBaseUrl || 'https://api.deepseek.com'
    };
}

function maskKey(apiKey) {
    if (!apiKey) return '';
    if (apiKey.length <= 10) return apiKey.slice(0, 2) + '***';
    return apiKey.slice(0, 6) + '...' + apiKey.slice(-4);
}

function stripHtml(value) {
    return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseJsonFromText(text) {
    const raw = String(text || '').trim();
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const content = fenced ? fenced[1].trim() : raw;
    try {
        return JSON.parse(content);
    } catch (error) {
        const start = content.indexOf('[');
        const end = content.lastIndexOf(']');
        if (start >= 0 && end > start) {
            return JSON.parse(content.slice(start, end + 1));
        }
        throw error;
    }
}

function askDeepSeek(config, messages) {
    return new Promise((resolve, reject) => {
        request({
            url: `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`,
            method: 'POST',
            json: true,
            timeout: 60000,
            headers: {
                Authorization: `Bearer ${config.apiKey}`,
                'Content-Type': 'application/json'
            },
            body: {
                model: config.model,
                messages,
                temperature: 0.2
            }
        }, (error, response, body) => {
            if (error) return reject(error);
            if (response && response.statusCode >= 400) {
                const message = body && (body.message || (body.error && body.error.message));
                return reject(new Error(message || `DeepSeek returned ${response.statusCode}`));
            }
            const content = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
            if (!content) return reject(new Error('DeepSeek did not return content'));
            resolve(content);
        });
    });
}

function buildQuestionPrompt(question = {}) {
    const options = (question.options || []).map((option, index) => {
        return `${String.fromCharCode(65 + index)}. ${stripHtml(option)}`;
    }).join('\n');
    const labels = []
        .concat(question.keypoints || [])
        .concat(question.tags || [])
        .concat(question.source || [])
        .concat(question.exerciseName || [])
        .filter(Boolean)
        .join(' / ');
    return [
        `题目标签：${labels || '未知'}`,
        `材料：${stripHtml(question.material) || '无'}`,
        `题干：${stripHtml(question.stem)}`,
        `选项：\n${options || '无'}`,
        `标准答案：${question.correctAnswer || '未知'}`,
        `粉笔解析：${stripHtml(question.solution) || '暂无'}`,
        question.hasImage || question.imageNotice
            ? `图片限制说明：${question.imageNotice || '本题含图片，但当前接口没有接收图片内容。请不要声称你看到了图片，只能基于文字部分和解析作答。'}`
            : ''
    ].join('\n');
}

function detectSection(question = {}) {
    const text = [
        question.exerciseName,
        question.source,
        ...(question.keypoints || []),
        ...(question.tags || []),
        question.stem,
        question.material
    ].map(stripHtml).join(' ');
    const rules = [
        ['verbal', /言语|逻辑填空|实词填空|虚词填空|词的辨析|词义|词义侧重|词语辨析|近义词|关联词|片段阅读|语句表达|中心理解|主旨|意图|标题|排序|接语|词语|成语|病句|歧义|篇章阅读|填入画横线|依次填入|最恰当/],
        ['quantity', /数量|数学|资料计算|方程|工程|行程|利润|容斥|排列|组合|概率|几何|数列|最值|年龄|浓度|牛吃草|钟表/],
        ['judgement', /判断|图形|定义判断|类比|逻辑判断|加强|削弱|前提|结论|真假|翻译推理|分析推理|归纳|论证/],
        ['data', /资料分析|资料|增长率|增长量|比重|平均数|倍数|基期|现期|同比|环比|百分点|拉动|贡献率/],
        ['common', /常识|政治|经济|法律|科技|历史|人文|地理|公文|时政|管理|生活常识/]
    ];
    const hit = rules.find(([, pattern]) => pattern.test(text));
    return hit ? hit[0] : 'general';
}

function sectionProfile(section) {
    const profiles = {
        verbal: {
            name: '言语理解与表达',
            strategy: [
                '先判断题型：逻辑填空、片段阅读、语句排序、下文推断、标题/主旨/意图题。',
                '逻辑填空要解释关键词、成语和近义词的权威含义，比较语义轻重、搭配对象、感情色彩、语体色彩和语境照应。',
                '片段阅读要抓主题词、转折词、因果词、对策词，区分主旨、意图、细节和无中生有。',
                '排序题优先找首句、代词指代、关联词、时间/逻辑顺序。',
                '回答时给出快速排除路径，不要只翻译文段。'
            ]
        },
        quantity: {
            name: '数量关系',
            strategy: [
                '先识别模型：工程、行程、利润、排列组合、概率、容斥、几何、最值、数列等。',
                '优先给考场快法：设特值、比例法、方程、代入排除、尾数/奇偶、倍数约束、极端值。',
                '计算过程要短，能用选项反推就不要展开复杂代数。',
                '指出题眼、单位、比例基准和容易设错的量。'
            ]
        },
        judgement: {
            name: '判断推理',
            strategy: [
                '先判断小题型：图形推理、定义判断、类比推理、逻辑判断。',
                '定义判断要拆条件，逐项核对必要条件，提醒不要代入生活常识。',
                '类比要先造句找关系，再辨析语义、功能、组成、因果、职业场景等二级关系。',
                '逻辑判断要明确论点、论据、论证方式；加强削弱题按力度排序，必要时指出无关项。',
                '分析推理要给表格、排除或确定信息链。'
            ]
        },
        data: {
            name: '资料分析',
            strategy: [
                '先定位材料、指标、时间和单位，再判断考点：增长率、增长量、比重、平均数、倍数、基期/现期。',
                '优先使用速算：截位直除、估算、差分、百化分、有效数字、选项间距判断。',
                '说明公式来源，但不要冗长推导。',
                '重点提醒单位、百分点与百分数、同比/环比、基期/现期不要混。'
            ]
        },
        common: {
            name: '常识判断',
            strategy: [
                '先判断知识领域：政治、法律、经济、科技、人文、历史、地理、时政。',
                '解释关键概念的规范含义，必要时指出常见误解。',
                '用排除法优先处理绝对化、张冠李戴、时间错误、主体错误、范围错误。',
                '如果知识点不确定，要明确说不确定，并基于题干和选项给稳妥判断。'
            ]
        },
        general: {
            name: '行测综合题',
            strategy: [
                '先识别题型和题眼，再选择最快方法。',
                '优先给考场可执行的排除、估算、代入或定位策略。',
                '结尾给同类题复盘提醒。'
            ]
        }
    };
    return profiles[section] || profiles.general;
}

function baseMessages(question) {
    const section = detectSection(question);
    const profile = sectionProfile(section);
    return [
        {
            role: 'system',
            content: [
                '你是公务员考试行测刷题教练，熟悉国考、省考、事业单位常见题型。',
                '你的目标不是写长篇学术解析，而是训练用户形成考场上的快速做题思路。',
                `当前判断板块：${profile.name}。`,
                '请严格采用该板块的答题策略：',
                ...profile.strategy,
                '请优先使用考公题常用技巧：题型识别、关键词抓取、选项代入、排除法、估算、特值法、比例法、尾数法、定位材料、先易后难、避免陷阱。',
                '回答结构要先给“最快切入点”，再给必要推理，最后给复盘提醒。',
                '可使用 Markdown 和 LaTeX 公式。',
                '不要编造题目没有给出的条件。'
            ].join('\n')
        },
        {
            role: 'user',
            content: [
                buildQuestionPrompt(question),
                '',
                '请给出：',
                `1. 题型判断与最快切入点（按${profile.name}处理）`,
                '2. 考场快速做法/排除路径',
                '3. 为什么标准答案成立',
                '4. 易错陷阱与下次遇到同类题怎么做',
                section === 'verbal' ? '5. 若涉及词语/成语，请解释其规范含义、搭配和语境差异' : ''
            ].join('\n')
        }
    ];
}

exports.getConfigStatus = function () {
    const config = getDeepSeekConfig();
    return {
        configured: Boolean(config.apiKey),
        model: config.model,
        baseUrl: config.baseUrl,
        maskedApiKey: maskKey(config.apiKey || '')
    };
};

exports.saveConfig = function (payload = {}) {
    const nextConfig = {};
    if (payload.deepseekApiKey && String(payload.deepseekApiKey).trim()) {
        nextConfig.deepseekApiKey = String(payload.deepseekApiKey).trim();
    }
    if (payload.deepseekModel && String(payload.deepseekModel).trim()) {
        nextConfig.deepseekModel = String(payload.deepseekModel).trim();
    }
    if (payload.deepseekBaseUrl && String(payload.deepseekBaseUrl).trim()) {
        nextConfig.deepseekBaseUrl = String(payload.deepseekBaseUrl).trim().replace(/\/+$/, '');
    }
    writeLocalConfig(nextConfig);
    return exports.getConfigStatus();
};

exports.explainQuestion = async function (question) {
    const config = getDeepSeekConfig();
    if (!config.apiKey) {
        return {
            configured: false,
            content: '还没有配置 DeepSeek API Key。请回到主页填写后再生成 AI 解答。'
        };
    }
    return {
        configured: true,
        content: await askDeepSeek(config, baseMessages(question))
    };
};

exports.chatQuestion = async function (payload = {}) {
    const config = getDeepSeekConfig();
    if (!config.apiKey) {
        return {
            configured: false,
            content: '还没有配置 DeepSeek API Key。'
        };
    }
    const history = Array.isArray(payload.history) ? payload.history.slice(-8) : [];
    const messages = baseMessages(payload.question || {});
    history.forEach(item => {
        if (!item || !item.role || !item.content) return;
        messages.push({
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: String(item.content).slice(0, 3000)
        });
    });
    messages.push({
        role: 'user',
        content: String(payload.message || '').slice(0, 3000)
    });
    return {
        configured: true,
        content: await askDeepSeek(config, messages)
    };
};

exports.extractVerbalNotes = async function (question = {}) {
    const config = getDeepSeekConfig();
    if (!config.apiKey) {
        return {
            configured: false,
            entries: [],
            message: '还没有配置 DeepSeek API Key。'
        };
    }
    const content = await askDeepSeek(config, [
        {
            role: 'system',
            content: [
                '你是公务员考试行测「言语理解与表达」词语辨析笔记助手。',
                '请只提取题目中值得积累的实词、虚词、成语、固定搭配或近义词组。',
                '每个条目要服务于考公做题：解释规范含义、语境搭配、感情色彩、适用对象、容易混淆点和排除技巧。',
                '只返回 JSON 数组，不要返回 Markdown，不要写额外说明。',
                '数组元素格式：{"word":"词语","meaning":"规范含义","confusables":["易混词1","易混词2"],"distinction":"辨析技巧","tips":"考场使用提醒"}。',
                '如果题目中没有值得积累的词语，返回 []。'
            ].join('\n')
        },
        {
            role: 'user',
            content: buildQuestionPrompt(question)
        }
    ]);
    const entries = parseJsonFromText(content);
    return {
        configured: true,
        entries: Array.isArray(entries) ? entries : []
    };
};
