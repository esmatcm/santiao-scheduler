const fs = require('fs');
const path = require('path');

function loadJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}

function atomicWrite(file, data) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

const FILES = {
  tasks:     path.join(__dirname, '../tasks.json'),
  groups:    path.join(__dirname, '../groups.json'),
  logs:      path.join(__dirname, '../logs.json'),
  templates: path.join(__dirname, '../templates.json'),
};

const MAX_LOGS = 10000;

// Load raw data
const rawTasks = loadJSON(FILES.tasks, []);
const needsMigration = rawTasks.some(t => !t.groupNames);

const store = {
  tasks:     rawTasks.map(t => {
    if (!t.groupNames) t.groupNames = t.groupName ? [t.groupName] : [];
    return t;
  }),
  groups:    loadJSON(FILES.groups, []),
  logs:      loadJSON(FILES.logs, []),
  templates: loadJSON(FILES.templates, []),
};

function saveTasks()     { atomicWrite(FILES.tasks,     store.tasks); }
function saveGroups()    { atomicWrite(FILES.groups,    store.groups); }
function saveLogs()      { atomicWrite(FILES.logs,      store.logs); }
function saveTemplates() { atomicWrite(FILES.templates, store.templates); }

// Persist migration immediately
if (needsMigration) saveTasks();

function addLog(taskId, groupLabel, status, duration, error) {
  store.logs.unshift({
    taskId, groupLabel, status, duration,
    error: error || null,
    ts: new Date().toISOString(),
  });
  if (store.logs.length > MAX_LOGS) store.logs.length = MAX_LOGS;
  saveLogs();
}

module.exports = { store, FILES, saveTasks, saveGroups, saveLogs, saveTemplates, addLog };
