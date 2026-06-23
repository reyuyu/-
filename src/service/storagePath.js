const path = require('path');

function projectRoot() {
    if (process.pkg) {
        return path.dirname(process.execPath);
    }
    return path.join(__dirname, '..', '..');
}

exports.projectRoot = projectRoot;

exports.resolveStoragePath = function (...parts) {
    return path.join(projectRoot(), ...parts);
};
