const express = require('express');
const router = express.Router();
const { store } = require('../lib/storage');

// GET /api/logs?taskId=&page=1&limit=50
router.get('/', (req, res) => {
  const { taskId } = req.query;
  const page  = Math.max(1, parseInt(req.query.page  || '1'));
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit || '50')));

  const all   = taskId ? store.logs.filter(l => l.taskId === taskId) : store.logs;
  const total = all.length;
  const start = (page - 1) * limit;

  res.json({
    logs:  all.slice(start, start + limit),
    total,
    page,
    limit,
    pages: Math.ceil(total / limit) || 1,
  });
});

module.exports = router;
