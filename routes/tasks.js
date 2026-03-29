const express = require('express');
const multer  = require('multer');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();

const { store, saveTasks }              = require('../lib/storage');
const { scheduleTask, enqueueTask, cronJobs } = require('../lib/scheduler');

const ALLOWED_IMAGE_TYPES = /^image\/(jpeg|png|gif|webp)$/;
const upload = multer({
  dest: path.join(__dirname, '../uploads'),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (ALLOWED_IMAGE_TYPES.test(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpg, jpeg, png, gif, webp)'));
    }
  },
});

router.get('/', (req, res) => res.json(store.tasks));

router.post('/', upload.single('image'), (req, res) => {
  const { message, schedules, enabled } = req.body;

  let groupNames = [];
  try { groupNames = JSON.parse(req.body.groupNames || '[]'); } catch {}
  if (!Array.isArray(groupNames)) groupNames = groupNames ? [groupNames] : [];
  // fallback to legacy single field
  if (groupNames.length === 0 && req.body.groupName) groupNames = [req.body.groupName];

  // Validate groupNames: must be non-empty strings
  groupNames = groupNames.filter(n => typeof n === 'string' && n.trim().length > 0);

  // Parse and validate schedules
  let parsedSchedules = [];
  try { parsedSchedules = JSON.parse(schedules || '[]'); } catch {}
  if (!Array.isArray(parsedSchedules)) parsedSchedules = [];
  const cron = require('node-cron');
  parsedSchedules = parsedSchedules.filter(s => s.cronExpression && cron.validate(s.cronExpression));

  const task = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    groupNames,
    groupName: groupNames[0] || '',       // keep for backward compat
    message: message || '',
    imagePath:         req.file ? req.file.path         : null,
    imageOriginalName: req.file ? req.file.originalname : null,
    schedules:  parsedSchedules,
    enabled:    enabled !== 'false',
    status:     'active',
    createdAt:  new Date().toISOString(),
    lastRun: null, lastError: null, runCount: 0, lastRunFinished: null,
  };
  store.tasks.push(task);
  saveTasks();
  if (task.enabled) scheduleTask(task);
  res.json(task);
});

router.put('/:id', upload.single('image'), (req, res) => {
  const task = store.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });

  const { message, schedules, enabled } = req.body;
  if (req.body.groupNames !== undefined) {
    try { task.groupNames = JSON.parse(req.body.groupNames); } catch { task.groupNames = []; }
    task.groupName = task.groupNames[0] || '';
  } else if (req.body.groupName !== undefined) {
    task.groupName  = req.body.groupName;
    task.groupNames = [req.body.groupName];
  }
  if (message  !== undefined) task.message   = message;
  if (schedules !== undefined) task.schedules = JSON.parse(schedules);
  if (enabled  !== undefined) task.enabled   = (enabled === 'true' || enabled === true);
  if (req.file) { task.imagePath = req.file.path; task.imageOriginalName = req.file.originalname; }

  saveTasks();
  scheduleTask(task);
  res.json(task);
});

router.delete('/:id', (req, res) => {
  const idx = store.tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const t = store.tasks[idx];
  if (cronJobs[t.id]) { cronJobs[t.id].forEach(j => j.stop()); delete cronJobs[t.id]; }
  if (t.imagePath) { try { fs.unlinkSync(t.imagePath); } catch {} }
  store.tasks.splice(idx, 1);
  saveTasks();
  res.json({ ok: true });
});

router.post('/:id/run', (req, res) => {
  const task = store.tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  const queued = enqueueTask(task);
  if (!queued) return res.status(429).json({ error: '任务正在队列中或刚刚执行过，请稍后再试' });
  res.json({ ok: true });
});

module.exports = router;
