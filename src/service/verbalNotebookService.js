const fs = require('fs');
const path = require('path');

const {resolveStoragePath} = require('./storagePath');

const dataDir = resolveStoragePath('data');
const notebookPath = path.join(dataDir, 'verbal-notebook.json');

function ensureStore() {
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, {recursive: true});
    }
    if (!fs.existsSync(notebookPath)) {
        fs.writeFileSync(notebookPath, JSON.stringify({entries: []}, null, 2), 'utf8');
    }
}

function readStore() {
    ensureStore();
    try {
        const store = JSON.parse(fs.readFileSync(notebookPath, 'utf8'));
        return {
            entries: Array.isArray(store.entries) ? store.entries : []
        };
    } catch (error) {
        return {entries: []};
    }
}

function writeStore(store) {
    ensureStore();
    fs.writeFileSync(notebookPath, JSON.stringify(store, null, 2), 'utf8');
    return store;
}

function normalizeEntry(entry = {}, sourceQuestion = {}) {
    const now = new Date().toISOString();
    const word = String(entry.word || '').trim();
    if (!word) return null;
    return {
        id: entry.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        word,
        meaning: String(entry.meaning || '').trim(),
        distinction: String(entry.distinction || '').trim(),
        tips: String(entry.tips || '').trim(),
        confusables: Array.isArray(entry.confusables)
            ? entry.confusables.map(item => String(item || '').trim()).filter(Boolean)
            : String(entry.confusables || '').split(/[、,，;\s]+/).map(item => item.trim()).filter(Boolean),
        exampleQuestion: {
            exerciseId: sourceQuestion.exerciseId || entry.exampleQuestion && entry.exampleQuestion.exerciseId || '',
            exerciseName: sourceQuestion.exerciseName || entry.exampleQuestion && entry.exampleQuestion.exerciseName || '',
            questionId: sourceQuestion.questionId || entry.exampleQuestion && entry.exampleQuestion.questionId || '',
            title: sourceQuestion.title || entry.exampleQuestion && entry.exampleQuestion.title || '',
            stem: sourceQuestion.stem || entry.exampleQuestion && entry.exampleQuestion.stem || '',
            material: sourceQuestion.material || entry.exampleQuestion && entry.exampleQuestion.material || '',
            options: sourceQuestion.options || entry.exampleQuestion && entry.exampleQuestion.options || [],
            correctAnswer: sourceQuestion.correctAnswer || entry.exampleQuestion && entry.exampleQuestion.correctAnswer || '',
            solution: sourceQuestion.solution || entry.exampleQuestion && entry.exampleQuestion.solution || ''
        },
        createdAt: entry.createdAt || now,
        updatedAt: now
    };
}

exports.list = function () {
    const store = readStore();
    return store.entries.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
};

exports.addMany = function (entries = [], sourceQuestion = {}) {
    const store = readStore();
    const normalized = entries
        .map(entry => normalizeEntry(entry, sourceQuestion))
        .filter(Boolean);
    store.entries = normalized.concat(store.entries);
    writeStore(store);
    return normalized;
};

exports.update = function (id, patch = {}) {
    const store = readStore();
    const index = store.entries.findIndex(entry => entry.id === id);
    if (index === -1) {
        const error = new Error('笔记不存在');
        error.status = 404;
        throw error;
    }
    const next = normalizeEntry({
        ...store.entries[index],
        ...patch,
        id,
        createdAt: store.entries[index].createdAt
    }, patch.exampleQuestion || store.entries[index].exampleQuestion || {});
    store.entries[index] = next;
    writeStore(store);
    return next;
};

exports.remove = function (id) {
    const store = readStore();
    const before = store.entries.length;
    store.entries = store.entries.filter(entry => entry.id !== id);
    writeStore(store);
    return {removed: before !== store.entries.length};
};
