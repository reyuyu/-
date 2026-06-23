const _ = require('lodash');
const moment = require('moment');
const qs = require('querystring');
const percentile = require('percentile');

const {httpRequest} = require('../util/httpUtil');

let headers = {
    "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
    "accept-language": "zh-CN,zh-TW;q=0.9,zh;q=0.8",
    "cache-control": "max-age=0",
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "none",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1"
};

async function getCategories(group, cookie) {
    let category = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/categories?&filter=keypoint&app=web&kav=12&version=3.0.0.0`,
        method: "GET",
        json: true,
        headers: {
            ...headers,
            cookie
        }
    });
    let rels = [];
    buildCat(category, rels, group);

    rels.push({type: '试卷', items: (group['others'] || []).filter(i => i.answerCount > 30), childTypes: []});

    calcCount(rels);
    return rels;
}

async function getRawCategories(cookie) {
    return await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/categories?&filter=keypoint&app=web&kav=12&version=3.0.0.0`,
        method: "GET",
        json: true,
        headers: {
            ...headers,
            cookie
        }
    });
}

function categoryIdFrom(cat) {
    return cat && (cat.keypointId || cat.id || cat.categoryId || cat.tagId);
}

function flattenPracticeCategories(cats, pathArr = [], out = []) {
    if (!Array.isArray(cats)) return out;
    cats.forEach(cat => {
        if (!cat) return;
        let name = cat.name || cat.title || '';
        let nextPath = name ? pathArr.concat(name.split('-')[0]) : pathArr;
        let id = categoryIdFrom(cat);
        if (id) {
            out.push({
                id,
                name: name.split('-')[0] || String(id),
                path: nextPath.join(' / '),
                hasChildren: Array.isArray(cat.children) && cat.children.length > 0
            });
        }
        flattenPracticeCategories(cat.children, nextPath, out);
    });
    return out;
}

function buildCat(cats, roots, group) {
    if (!cats || cats.length === 0) return;
    for (let cat of cats) {
        let name = cat.name.split('-')[0];
        let obj = {
            type: name,
            childTypes: [],
            items: [],
        };
        buildCat(cat.children, obj.childTypes, group);
        if (!roots.map(i => i.type).includes(name)) {
            obj.items = group[name] || []
            roots.push(obj);
        }
    }
}

function sum (arr) {
    return arr.reduce((a, b) => a + b, 0)
}

function _buildCount(root) {
    if (!root) return 0;
    let count = sum(root.items.map(i => i.answerCount)) + sum(root.childTypes.map(t => _buildCount(t)));
    root.count = count;
    return count;
}

function calcCount(roots) {
    if (!roots || roots.length === 0) return;
    for (let root of roots) {
        _buildCount(root);
    }
}

function namesFrom(list) {
    return Array.isArray(list) ? list.map(i => i.name).filter(a => a) : [];
}

function optionsFrom(accessories) {
    return Array.isArray(accessories) && accessories[0] && Array.isArray(accessories[0].options)
        ? accessories[0].options
        : [];
}

function questionMetaFrom(solutionObj) {
    return (solutionObj && solutionObj.questionMeta) || {};
}

function normalizeHtml(html) {
    if (!html) return '';
    return String(html)
        .replace(/data-src=/g, 'src=')
        .replace(/src=(["'])\/\//g, 'src=$1https://')
        .replace(/src=(["'])\/(?!\/)/g, 'src=$1https://tiku.fenbi.com/');
}

function normalizeOption(option) {
    if (option == null) return '';
    if (typeof option === 'string') return normalizeHtml(option);
    return normalizeHtml(option.content || option.text || option.value || option.name || '');
}

function questionRefFrom(item, index, allowId) {
    if (item == null) return null;
    if (typeof item === 'number' || typeof item === 'string') {
        let questionId = Number.parseInt(item, 10);
        return Number.isInteger(questionId) ? {questionId, idx: index + 1} : null;
    }
    if (typeof item !== 'object') return null;
    let questionId = Number.parseInt(item.questionId || item.qid || item.question_id || (allowId ? item.id : ''), 10);
    if (!Number.isInteger(questionId)) return null;
    let questionIndex = Number.parseInt(item.questionIndex, 10);
    return {
        questionId,
        idx: Number.isInteger(questionIndex) ? questionIndex + 1 : index + 1,
        reportCorrect: item.correct,
        savedTime: item.time || 0,
        savedChoice: item.answer && Number.isInteger(item.answer.choice) ? item.answer.choice : null
    };
}

function appendQuestionRefs(refs, items, allowId) {
    if (!Array.isArray(items)) return;
    items.forEach((item, index) => {
        let ref = questionRefFrom(item, index, allowId);
        if (ref) refs.push(ref);
    });
}

function collectQuestionRefsFromTree(node, refs, key = '', depth = 0) {
    if (!node || depth > 6) return;
    if (Array.isArray(node)) {
        let isQuestionArray = /question|problem|item/i.test(key);
        if (isQuestionArray) {
            appendQuestionRefs(refs, node, /question|problem|item/i.test(key));
        }
        node.forEach(child => collectQuestionRefsFromTree(child, refs, key, depth + 1));
        return;
    }
    if (typeof node !== 'object') return;
    Object.keys(node).forEach(childKey => {
        if (/question|problem|item|section|sheet/i.test(childKey)) {
            collectQuestionRefsFromTree(node[childKey], refs, childKey, depth + 1);
        }
    });
}

function getPracticeQuestionRefs(exercise, report) {
    let refs = [];
    appendQuestionRefs(refs, report && report.answers, false);
    appendQuestionRefs(refs, exercise && exercise.questions, true);
    appendQuestionRefs(refs, exercise && exercise.questionIds, false);
    appendQuestionRefs(refs, exercise && exercise.questionList, true);
    appendQuestionRefs(refs, exercise && exercise.sheet && exercise.sheet.questions, true);
    appendQuestionRefs(refs, exercise && exercise.sheet && exercise.sheet.questionIds, false);
    appendQuestionRefs(refs, exercise && exercise.sheet && exercise.sheet.questionList, true);
    appendQuestionRefs(refs, exercise && exercise.sheet && exercise.sheet.items, true);
    appendQuestionRefs(refs, Object.values(exercise && exercise.userAnswers || {}), false);
    if (refs.length === 0) {
        collectQuestionRefsFromTree(exercise, refs);
    }

    let seen = {};
    return refs
        .filter(ref => ref && ref.questionId)
        .filter(ref => {
            if (seen[ref.questionId]) return false;
            seen[ref.questionId] = true;
            return true;
        })
        .map((ref, index) => ({
            ...ref,
            idx: ref.idx || index + 1
        }))
        .sort((a, b) => a.idx - b.idx);
}

let cleanTitle = function (title) {
    if (!title) return "无来源";
    return title.replace(/辽宁\/湖南\/湖北\/安徽\/四川\/福建\/云南\/黑龙江\/江西\/广西\/贵州\/海南\/内蒙古\/山西\/重庆\/宁夏\/西藏/g, '湖北')
        .replace(/山西\/辽宁\/黑龙江\/福建\/湖北\/ 湖南\/广西\/海南\/四川\/重庆\/ 云南\/ 西藏\/陕西\/青海\/宁夏\/ 新疆兵团/g, '湖北')
        .replace(/贵州\/四川\/福建\/黑龙江\/湖北\/山西\/重庆\/辽宁\/海南\/江西\/天津\/陕西\/云南\/广西\/山东\/湖南/g, '湖北')
        .replace(/（网友回忆版）/g, '')
        .replace(/网友回忆版/g, '')
        .replace(/第\d+题/g, '')
        .replace(/县级\+乡镇/g, '县级');
}

async function getQuestionByIds(questionIds) {
    if (!questionIds || questionIds.length === 0) return {};
    let questions = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/questions?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers
    });
    return _.zipObject(questions.map(q => q.id), questions)
}

async function getQuestionMetaByIds(questionIds) {
    let questions = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/question/meta?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers
    });
    return _.zipObject(questions.map(q => q.id), questions)
}

async function getQuestionKeyPointsByIds(questionIds) {
    let questions = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/solution/keypoints?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers
    });
    return _.zipObject(questionIds, questions);
}

// 返回收藏了的题目的id数组
async function getCollectsByIds(questionIds, cookie) {
    if (!questionIds || questionIds.length === 0) return [];
    return await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/collects?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers: {
            ...headers,
            cookie
        }
    });
}

function getExerciseReport(exerciseId, cookie) {
    return httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/exercises/${exerciseId}/report/v2`,
        method: "GET",
        json: true,
        headers: {
            ...headers,
            cookie
        }
    });
}

function getExercise(exerciseId, cookie) {
    return httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/exercises/${exerciseId}`,
        method: "GET",
        json: true,
        headers: {
            ...headers,
            cookie
        }
    });
}

function syncExerciseAnswer(exerciseId, answers, cookie) {
    return httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/async/exercises/${exerciseId}/incr`,
        method: "POST",
        json: true,
        headers: {
            ...headers,
            cookie
        },
        body: answers
    });
}

function submitExercise(exerciseId, cookie) {
    return httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/async/exercises/${exerciseId}/submit`,
        method: "POST",
        headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            cookie
        },
        body: 'status=1'
    });
}

async function submitExerciseWithFallback(exerciseId, cookie) {
    const attempts = [
        () => submitExercise(exerciseId, cookie),
        () => httpRequest({
            url: `https://tiku.fenbi.com/api/xingce/async/exercises/${exerciseId}/submit`,
            method: "POST",
            json: true,
            headers: {
                ...headers,
                cookie
            },
            body: {
                status: 1
            }
        }),
        () => httpRequest({
            url: `https://tiku.fenbi.com/api/xingce/exercises/${exerciseId}/submit`,
            method: "POST",
            json: true,
            headers: {
                ...headers,
                cookie
            },
            body: {
                status: 1
            }
        })
    ];
    let lastError;
    for (let attempt of attempts) {
        try {
            return await attempt();
        } catch (error) {
            lastError = error;
        }
    }
    throw lastError || new Error('交卷同步失败');
}

function createExercise(params, cookie) {
    return httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/exercises`,
        method: "POST",
        json: true,
        headers: {
            ...headers,
            cookie
        },
        form: params
    });
}

async function getExerciseHistory(categoryId, cookie) {
    let cursorArr = [0, 30];
    let hisArr = await Promise.all(cursorArr.map(cursor => {
        return httpRequest({
            url: `https://tiku.fenbi.com/api/xingce/category-exercises?categoryId=${categoryId}&cursor=${cursor}&count=30`,
            method: "GET",
            json: true,
            headers: {
                ...headers,
                cookie
            }
        });
    }));
    return _.flatMap(hisArr.filter(a => a && Array.isArray(a.datas)), his => his.datas);
}

async function getSolutionsByIds(questionIds, cookie) {
    if (!questionIds || questionIds.length === 0) return {};
    let questions = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/solutions?ids=${questionIds.join(',')}`,
        method: "GET",
        json: true,
        headers: {
            ...headers,
            cookie
        }
    });
    return _.zipObject(questionIds, questions);
}

async function getEpisodesByIds(questionIds, cookie) {
    let result = await httpRequest({
        url: `https://ke.fenbi.com/api/gwy/v3/episodes/tiku_episodes_with_multi_type?tiku_ids=${questionIds.join(',')}&tiku_prefix=xingce&tiku_type=5`,
        method: "GET",
        json: true,
        headers: {
            ...headers,
            cookie
        }
    });
    return result.data;
}

function parseWordListFromNote2(content) {
    let lines = content.split('\n');
    let wdList = lines.map(wl => {
        let reg = /.*\[!([^\]]*)\].*/g;
        if (wl.match(reg)) {
            return wl.replace(reg, '$1');
        }
    }).filter(a=>a);
    return wdList.filter(a => a.length <= 5);
}

function parseWordListFromNote1(content) {
    let lines = content.split('\n');
    let s = lines.indexOf('[start积累]');
    let e = lines.indexOf('[end积累]');
    if (s !== -1 && e !== -1) {
        lines = lines.slice(s+1, e).filter(a => a);
        let wdList = lines.map(wl => {
            let w = wl.replace(/.*\* \[?([^\]]*)\]?\[?[^\[\]]*\]?[：|:].*/g, '$1')
            return w;
        });
        return wdList.filter(a => a.length <= 5);
    } else {
        return [];
    }
}

function parseWordListFromNote(content) {
    return parseWordListFromNote1(content).concat(parseWordListFromNote2(content));
}


function parseTagListFromNote(content) {
    let lines = content.split('\n').filter(a => a);
    let wdList = lines.map(wl => {
        if (wl.match(/^\{(.*)\}$/g)) {
            let w = wl.replace(/^\{(.*)\}$/g, '$1')
            return w;
        }
    }).filter(a => a);
    return wdList;
}

exports.zjWord = async function (word) {
    let result = await httpRequest({
        url: `https://zaojv.com/wordQueryDo.php`,
        method: "POST",
        headers: {
            ...headers,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: qs.stringify({
            nsid: 0,
            s: 45957424262910633321,
            wo: word,
            directGo: 1
        })
    });
    return "https://zaojv.com/" + result.replace(/\n/g, "").replace(/(.*)HREF="(.*)".*/g, '$2')
}

exports.saveNote = async function (questionId, content, cookie) {
    let result = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/notes`,
        method: "POST",
        headers: {
            ...headers,
            'Content-Type': 'application/json;charset=UTF-8',
            cookie
        },
        body: JSON.stringify({
            content,
            questionId: Number.parseInt(questionId)
        })
    });
    if (!result) {
        throw new Error('save note error!')
    }
    return result;
}

let getNotesMapByIds = async function (questionIds, cookie) {
    if (!questionIds || questionIds.length === 0) {
        return {};
    }
    let params = qs.stringify({
        questionIds: questionIds.join(',')
    })
    let result = await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/notes?` + params,
        method: "GET",
        headers: {
            ...headers,
            'Content-Type': 'application/json;charset=UTF-8',
            cookie
        },
        json: true,
    });
    result = Array.isArray(result) ? result.filter(a => a) : [];

    return _.zipObject(result.map(r => r.questionId), result.map(r => r.content));
}

exports.getExerciseHistory = async function (cookie) {
    let result = await Promise.all([
        getExerciseHistory(1, cookie),
        getExerciseHistory(3, cookie)
    ]);
    let exerciseHistory = _.orderBy(_.flatMap(result, _.identity), ['updatedTime'], ['desc']);
    if (exerciseHistory.length === 0) {
        throw new Error('没有读取到粉笔练习历史。可能是扫码登录没有拿到题库 Cookie，或这个账号暂无行测练习记录。');
    }
    let exerciseReportMap = _.zipObject(exerciseHistory.map(item => item.id), await Promise.all(exerciseHistory.map(item => getExerciseReport(item.id, cookie))));
    exerciseHistory.forEach(history => {
        history.finishedTime = moment(history.updatedTime).format('YYYY-MM-DD HH:mm:ss')
        history.finishedDate = moment(history.updatedTime).format('YYYY-MM-DD')
        let report = exerciseReportMap[history.id];
        if (report) {
            history.elapsedTime = report.elapsedTime;
            history.answerCount = report.answerCount;
            history.correctRate = (report.correctCount / report.answerCount * 100).toFixed(1);
        }
    });
    exerciseHistory = exerciseHistory.filter(h => h.status === 1 && h.answerCount > 0);
    let exerciseHistoryGroup = _.groupBy(exerciseHistory, h => {
        let name = h.sheet.name || '';
        if (name.startsWith('专项智能练习')) {
            h.cleanName = name.replace(/(专项智能练习)（(.*)）/, '$1');
            return name.replace(/专项智能练习（(.*)）/, '$1');
        } else {
            h.cleanName = cleanTitle(name);
            return 'others';
        }
    });

    let groupItems = await getCategories(exerciseHistoryGroup, cookie);

    let exerciseHeatMapData = {};

    // let dayTime = 3600 * 24 * 1000;
    // let start = +moment().startOf('day').subtract(1, 'year').toDate();
    // let end = +moment().startOf('day').toDate();
    // for (let time = start; time < end; time += dayTime) {
    //     exerciseHeatMapData[time / 1000] = 0;
    // }
    exerciseHistory.forEach(h => {
        let v = moment(h.finishedDate).toDate().getTime() / 1000;
        exerciseHeatMapData[v] = (exerciseHeatMapData[v] || 0) + h.answerCount;
    });

    return {
        groupItems,
        exerciseHeatMapData,
        exerciseHistoryGroup,
        exerciseHistory,
        cleanTitle,
        moment
    }
}

exports.getPracticeHistory = async function (cookie) {
    let result = await Promise.all([
        getExerciseHistory(1, cookie),
        getExerciseHistory(3, cookie)
    ]);
    let exerciseHistory = _.orderBy(_.flatMap(result, _.identity), ['updatedTime'], ['desc']);
    let reports = await Promise.all(exerciseHistory.slice(0, 60).map(item => getExerciseReport(item.id, cookie)));
    let reportMap = _.zipObject(exerciseHistory.slice(0, 60).map(item => item.id), reports);
    return exerciseHistory.slice(0, 60).map(item => {
        let report = reportMap[item.id] || {};
        return {
            id: item.id,
            name: cleanTitle(item.sheet && item.sheet.name),
            rawName: item.sheet && item.sheet.name,
            updatedTime: item.updatedTime,
            finishedTime: moment(item.updatedTime).format('YYYY-MM-DD HH:mm'),
            answerCount: report.answerCount || item.answerCount || 0,
            correctRate: report.answerCount ? (report.correctCount / report.answerCount * 100).toFixed(1) : '',
            elapsedMinutes: report.elapsedTime ? Math.round(moment.duration(report.elapsedTime, 'seconds').asMinutes()) : 0,
            status: item.status
        };
    }).filter(item => item.answerCount > 0);
}

exports.getPracticeCategories = async function (cookie) {
    let category = await getRawCategories(cookie);
    let list = flattenPracticeCategories(category)
        .filter(item => item.id && item.name)
        .slice(0, 500);
    if (list.length === 0) {
        throw new Error('没有读取到粉笔题库分类，请重新扫码登录后再试。');
    }
    return list;
}

exports.createPracticeExercise = async function (options, cookie) {
    let mode = options.mode || 'quick';
    let params = {
        prefix: 'xingce',
        categories: 'xingce'
    };

    if (mode === 'random') {
        params.type = 2;
        params.fontExerId = 2;
    } else {
        params.type = 3;
        params.fontExerId = 3;
        if (mode === 'keypoint') {
            let keypointId = Number.parseInt(options.keypointId, 10);
            if (!Number.isInteger(keypointId)) {
                throw new Error('请选择一个专项分类。');
            }
            params.keypointId = keypointId;
        }
    }

    let result = await createExercise(params, cookie);
    let data = result && (result.data || result);
    let exerciseId = data && (data.id || data.exerciseId || data.eid);
    if (!exerciseId) {
        throw new Error('粉笔创建练习失败，请重新扫码登录后再试。');
    }
    return {
        code: 200,
        exerciseId,
        raw: data
    };
}

exports.getQuestion = async function (questionId, cookie) {
    let solutionMap = await getSolutionsByIds([questionId], cookie);
    let notesMap = await getNotesMapByIds([questionId], cookie);
    let collectionIds = await getCollectsByIds([questionId], cookie);
    collectionIds = Array.isArray(collectionIds) ? collectionIds : [];
    let q = solutionMap[questionId];
    if (!q) {
        throw new Error('没有读取到题目详情，可能是粉笔题目接口返回为空。');
    }
    if (notesMap[questionId]) {
        q.note = notesMap[questionId];
        q.wordList = parseWordListFromNote(q.note);
    }

    q.hasCollect = collectionIds.some(qid => qid === q.id);

    q.keypoints = namesFrom(q.keypoints);

    let qMeta = questionMetaFrom(q);
    q.mostWrongAnswer = qMeta.mostWrongAnswer;

    q.correctRatio = qMeta.correctRatio || 0;

    q.totalCount = qMeta.totalCount || 0;

    q.options = optionsFrom(q.accessories);

    if (q.material) {
        q.material = q.material.content;
    }
    return {
        q,
    }
};

exports.getResultObj = async function (exerciseId, costThreshold, cookie) {
    let [exercise, report] = await Promise.all([getExercise(exerciseId, cookie), getExerciseReport(exerciseId, cookie)]);
    if (!report || !report.answers || !exercise) return;
    let collectionIds = await getCollectsByIds(report.answers.map(answer => answer.questionId), cookie);
    collectionIds = Array.isArray(collectionIds) ? collectionIds : [];

    let answerResultMap = {};

    report.answers.forEach(answer => {
        // 只筛选出你做了的
        // todo: 这里判断下，收藏的题的idx是否在你做了的题的idx的range里
        if (answer.status !== 10 || collectionIds.includes(answer.questionId)) {
            answerResultMap[answer.questionId] = answer.correct;
        }
    });

    let concernQuestions = Object.keys(answerResultMap).map(questionId => {
        let ua = Object.values(exercise.userAnswers).find(item => item.questionId == questionId);
        let correct = answerResultMap[questionId];
        return {
            idx: (ua && (ua.questionIndex + 1))  || report.answers.findIndex(item => item.questionId == questionId) + 1,
            questionId,
            correct,
            cost: ua && ua.time,
            myAnswer: (ua && ua.answer && ['A', 'B', 'C', 'D'][ua.answer.choice]) || '未选择'
        }
    }).filter(a => a);

    // let questionContentMap = await getQuestionByIds(concernQuestions.map(q => q.questionId));
    // let questionMetaMap = await getQuestionMetaByIds(concernQuestions.map(q => q.questionId));
    // let questionKeyPointsMap = await getQuestionKeyPointsByIds(concernQuestions.map(q => q.questionId));
    let solutionMap = await getSolutionsByIds(concernQuestions.map(q => q.questionId), cookie);
    let notesMap = await getNotesMapByIds(concernQuestions.map(q => q.questionId), cookie);

    concernQuestions = _.orderBy(concernQuestions, ['correct', 'cost', 'idx'], ['asc', 'desc', 'asc']);

    let concernSource = ['国家', '联考', '省', '市'];
    let concernSourceCountMap = {};
    concernQuestions.forEach(q => {
        let solutionObj = solutionMap[q.questionId];
        if (!solutionObj) {
            q.content = '题目详情读取失败';
            q.options = [];
            q.difficulty = 0;
            q.correctAnswer = '';
            q.source = '';
            q.keypoints = [];
            q.tags = [];
            q.solution = '';
            q.mostWrongAnswer = '';
            q.correctRatio = 0;
            q.totalCount = 0;
            return;
        }
        // 题干
        q.content = solutionObj.content; // html
        // 选项
        q.options = optionsFrom(solutionObj.accessories);
        // 难度
        q.difficulty = solutionObj.difficulty;
        // 正确答案
        q.correctAnswer = solutionObj.correctAnswer;
        // 题目来源
        q.source = solutionObj.source;

        concernSource.some(item => {
            if (q.source && q.source.includes(item)) {
                concernSourceCountMap[item] = (concernSourceCountMap[item] || 0) + 1;
                return true;
            }
            return false;
        });

        q.hasCollect = collectionIds.some(qid => qid == q.questionId);

        q.keypoints = namesFrom(solutionObj.keypoints);
        q.tags = namesFrom(solutionObj.tags);

        // 答案解析
        q.solution = solutionObj.solution; // html

        let qMeta = questionMetaFrom(solutionObj);
        q.mostWrongAnswer = qMeta.mostWrongAnswer;

        q.correctRatio = qMeta.correctRatio || 0;

        q.totalCount = qMeta.totalCount || 0;

        if (notesMap[q.questionId]) {
            q.note = notesMap[q.questionId];
            q.wordList = parseWordListFromNote(q.note);
            q.tagList = parseTagListFromNote(q.note);
        }

        if (solutionObj.material) {
            q.material = solutionObj.material.content;
        }
    });

    let costArr = concernQuestions.map(a => ({idx: a.idx, cost: a.cost, correctRatio: a.correctRatio, correct: a.correct})).filter(a => a.cost);
    // let mean = _.sum(costArr) / costArr.length;
    // let var1 = Math.sqrt(_.sum(costArr.map(i => (i - mean) * (i - mean))) / costArr.length);
    // let var2 = Math.sqrt(_.sum(costArr.map(i => (i - mean) * (i - mean))) / (costArr.length - 1));

    return {
        moment,
        exercise,
        cleanTitle,
        costThreshold,
        concernSourceCount: Object.keys(concernSourceCountMap).map(key => ({key, count: concernSourceCountMap[key]})),
        concernQuestions,
        costArr: _.orderBy(costArr, ['idx'], ['asc']),
        percentile,
        avg: arr => arr.reduce( ( p, c ) => p + c, 0 ) / arr.length,
    }
}

exports.getPracticeExercise = async function (exerciseId, cookie) {
    let exercise = await getExercise(exerciseId, cookie);
    if (!exercise) {
        throw new Error('没有读取到练习信息，请重新扫码登录后再试。');
    }

    let report = {};
    try {
        report = await getExerciseReport(exerciseId, cookie);
    } catch (error) {
        report = {};
    }

    let refs = getPracticeQuestionRefs(exercise, report);
    if (refs.length === 0) {
        throw new Error('没有读取到练习题目。可能是粉笔还没有生成完成，请稍后刷新；如果反复出现，请重新扫码登录。');
    }

    let questionIds = refs.map(ref => ref.questionId);
    let solutionMap = await getSolutionsByIds(questionIds, cookie);
    let [questionMap, notesMap, collectionIds] = await Promise.all([
        getQuestionByIds(questionIds).catch(() => ({})),
        getNotesMapByIds(questionIds, cookie).catch(() => ({})),
        getCollectsByIds(questionIds, cookie).catch(() => [])
    ]);
    collectionIds = Array.isArray(collectionIds) ? collectionIds : [];

    let userAnswers = Object.values(exercise.userAnswers || {});
    let questions = refs.map((ref, index) => {
        let solutionObj = solutionMap[ref.questionId] || {};
        let questionObj = questionMap[ref.questionId] || {};
        let qMeta = questionMetaFrom(solutionObj);
        let ua = userAnswers.find(item => item.questionId == ref.questionId);
        let options = optionsFrom(solutionObj.accessories).length
            ? optionsFrom(solutionObj.accessories)
            : optionsFrom(questionObj.accessories);
        let note = notesMap[ref.questionId] || '';
        let savedChoice = ua && ua.answer && Number.isInteger(ua.answer.choice)
            ? ua.answer.choice
            : ref.savedChoice;
        return {
            idx: (ua && (ua.questionIndex + 1)) || ref.idx || index + 1,
            questionId: ref.questionId,
            content: normalizeHtml(solutionObj.content || questionObj.content || '题目详情读取失败'),
            material: normalizeHtml(
                (solutionObj.material && solutionObj.material.content) ||
                (questionObj.material && questionObj.material.content) ||
                ''
            ),
            options: options.map(normalizeOption),
            answerType: solutionObj.accessories && solutionObj.accessories[0] && solutionObj.accessories[0].type,
            correctAnswer: solutionObj.correctAnswer,
            solution: normalizeHtml(solutionObj.solution || ''),
            source: cleanTitle(solutionObj.source),
            difficulty: solutionObj.difficulty || 0,
            keypoints: namesFrom(solutionObj.keypoints),
            tags: namesFrom(solutionObj.tags),
            correctRatio: qMeta.correctRatio || 0,
            totalCount: qMeta.totalCount || 0,
            mostWrongAnswer: qMeta.mostWrongAnswer,
            hasCollect: collectionIds.some(qid => qid == ref.questionId),
            note,
            savedChoice: Number.isInteger(savedChoice) ? savedChoice : null,
            savedTime: (ua && ua.time) || ref.savedTime || 0,
            reportCorrect: ref.reportCorrect
        };
    }).sort((a, b) => a.idx - b.idx);

    return {
        exercise: {
            id: exercise.id,
            name: cleanTitle(exercise.sheet && exercise.sheet.name),
            rawName: exercise.sheet && exercise.sheet.name,
            updatedTime: exercise.updatedTime,
            elapsedTime: exercise.elapsedTime
        },
        questions
    };
}

exports.syncPracticeAnswer = async function (exerciseId, payload, cookie) {
    let choice = Number.parseInt(payload.choice, 10);
    let questionIndex = Number.parseInt(payload.questionIndex, 10);
    let questionId = Number.parseInt(payload.questionId, 10);
    let time = Number.parseInt(payload.time || 0, 10);
    if (!Number.isInteger(choice) || !Number.isInteger(questionIndex) || !Number.isInteger(questionId)) {
        throw new Error('答题同步参数不完整。');
    }
    let answerPayload = [{
        questionIndex,
        questionId,
        time,
        flag: 0,
        answer: {
            type: 1,
            choice
        }
    }];
    return await syncExerciseAnswer(exerciseId, answerPayload, cookie);
}

exports.syncPracticeAnswers = async function (exerciseId, answers, cookie) {
    if (!Array.isArray(answers) || answers.length === 0) {
        return null;
    }
    let answerPayload = answers.map(item => {
        let choice = Number.parseInt(item.choice, 10);
        let questionIndex = Number.parseInt(item.questionIndex, 10);
        let questionId = Number.parseInt(item.questionId, 10);
        let time = Number.parseInt(item.time || 0, 10);
        if (!Number.isInteger(choice) || !Number.isInteger(questionIndex) || !Number.isInteger(questionId)) {
            return null;
        }
        return {
            questionIndex,
            questionId,
            time,
            flag: 0,
            answer: {
                type: 1,
                choice
            }
        };
    }).filter(Boolean);
    if (answerPayload.length === 0) {
        return null;
    }
    return await syncExerciseAnswer(exerciseId, answerPayload, cookie);
}

exports.submitPracticeExercise = async function (exerciseId, cookie, answers) {
    if (Array.isArray(answers) && answers.length > 0) {
        try {
            await exports.syncPracticeAnswers(exerciseId, answers, cookie);
        } catch (error) {
            // Continue to submit; Fenbi may have accepted prior incremental syncs.
        }
    }
    return await submitExerciseWithFallback(exerciseId, cookie);
}

exports.addCollect = async function (questionId, cookie) {
    return await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/collects/${questionId}`,
        method: "POST",
        headers: {
            ...headers,
            cookie
        },
        body: null
    });
}

exports.delCollect = async function (questionId, cookie) {
    await httpRequest({
        url: `https://tiku.fenbi.com/api/xingce/collects/${questionId}`,
        method: "DELETE",
        headers: {
            ...headers,
            cookie
        }
    });
}

exports.getVideoUrl = async function (questionId, cookie) {
    let episodeMap = await getEpisodesByIds([questionId]);
    if (episodeMap[questionId]) {
        let videoResult = await httpRequest({
            url: `https://ke.fenbi.com/api/gwy/v3/episodes/${episodeMap[questionId][0].id}/mediafile/meta`,
            method: "GET",
            headers: {
                ...headers,
                cookie
            },
            json: true
        });
        if (videoResult && videoResult.datas && videoResult.datas.length > 0) {
            return _.orderBy(videoResult.datas, ['realSize'], ['desc'])[0].url;
        } else {
            return null;
        }
    } else {
        return null;
    }
}

exports.getComments = async function (questionId, cookie) {
    try {
        let episodeMap = await getEpisodesByIds([questionId]);
        let cursorArr = [0, 30];
        let commentResultArr = await Promise.all(cursorArr.map(cursor => {
            return httpRequest({
                url: `https://ke.fenbi.com/ipad/gwy/v3/comments/episodes/${episodeMap[questionId][0].id}?system=12.4.7&inhouse=0&app=gwy&ua=iPad&av=44&version=6.11.3&kav=22&kav=1&len=30&start=${cursor}`,
                method: "GET",
                json: true,
                headers: {
                    ...headers,
                    cookie
                }
            });
        }));
        let datas = _.flatMap(commentResultArr.filter(a => a), r => r.datas);
        return _.orderBy(datas.filter(i => {
            return i.likeCount > 1 && !['?', '？'].some(t => i.comment.includes(t)) && i.comment.length > 8
        }), ['likeCount'], ['desc']).slice(0, 10);
    } catch (e) {
        return [];
    }
}

function convertTree(root) {
    let str = '';
    for (let child of root.children) {
        if (child.name === 'em') {
            str += '<span class="searchKeyword">' + convertTree(child) + '</span>';
        } else if (child.name === 'txt') {
            str += child.value;
        } else if (child.name === 'p') {
            str += convertTree(child);
        } else {
        }
    }
    return str;
}

exports.search = async function (text, cookie) {
    let cursorArr = [0, 15];
    let commentResultArr = await Promise.all(cursorArr.map(cursor => {
        return httpRequest({
            url: `https://60.205.108.139/ipad/search/v2?system=12.4.7&inhouse=0&app=gwy&ua=iPad&av=44&version=6.11.3&kav=22&coursePrefix=xingce&format=json&len=15&q=${encodeURIComponent(text)}&start=${cursor}`,
            method: "GET",
            json: true,
            headers: {
                ...headers,
                'User-Agent': 'XC/6.11.3 (iPad; iOS 12.4.7; Scale/2.00)',
                'Accept': '*/*',
                'Host': 'tiku.fenbi.com',
                cookie
            }
        });
    }));
    let datas = _.flatMap(commentResultArr.filter(a => a), r => _.get(r, 'data.items', []));

    datas.forEach(item => {
        let sourceList = item.source.split(',');
        item.sourceList = sourceList.filter(s => {
            let blockSourceList = ['礼包', '模考'];
            return !blockSourceList.some(b => s.includes(b));
        })
    });
    datas = datas.filter(item => item.sourceList.length !== 0);
    datas.forEach(item => {
        item.stemSnippet_ = convertTree(JSON.parse(item.stemSnippet));
    });
    return datas;
}
