const cron = require('node-cron');
const fs = require('fs');
const { store, saveTasks, addLog } = require('./storage');
const { sh, sleep, openGroup, sendText, sendImage, returnToMainScreen } = require('./adb');

// --- SSE ---
const sseClients = new Set();

// Heartbeat: every 30s send a comment to detect dead connections
setInterval(() => {
  for (const res of sseClients) {
    try { res.write(': heartbeat\n\n'); } catch { sseClients.delete(res); }
  }
}, 30000);

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) { try { res.write(msg); } catch { sseClients.delete(res); } }
}
function stepUpdate(taskId, step) {
  broadcast('step', { taskId, step, ts: Date.now() });
}

// --- Queue ---
const taskQueue = [];
let currentTask = null;
const cronJobs = {};

function getCurrentTask() { return currentTask; }

function enqueueTask(task) {
  if (taskQueue.some(t => t.id === task.id)) return false;
  if (task.lastRunFinished) {
    const elapsed = Date.now() - new Date(task.lastRunFinished).getTime();
    if (elapsed < 30000) return false;
  }
  taskQueue.push(task);
  processQueue();
  return true;
}

async function processQueue() {
  if (currentTask || taskQueue.length === 0) return;
  const task = taskQueue.shift();
  currentTask = task;
  try {
    await executeTask(task);
  } catch (err) {
    console.error(`[processQueue] Unexpected error for task ${task.id}:`, err.message);
  } finally {
    currentTask = null;
    if (taskQueue.length > 0) processQueue();
  }
}

const MAX_RETRIES = 2;

async function executeTaskOnce(task) {
  stepUpdate(task.id, '正在唤醒手机...');
  await sh('input keyevent KEYCODE_WAKEUP');
  await sleep(500);

  const groupNames = task.groupNames && task.groupNames.length > 0
    ? task.groupNames
    : (task.groupName ? [task.groupName] : []);

  for (let i = 0; i < groupNames.length; i++) {
    const groupName = groupNames[i];
    await openGroup(groupName, (step) => stepUpdate(task.id, step), i === 0);

    if (task.message && task.message.trim()) {
      await sendText(task.message, task.id, (step) => stepUpdate(task.id, step));
      await sleep(1000);
    }
    if (task.imagePath && fs.existsSync(task.imagePath)) {
      await sendImage(task.imagePath, task.id, (step) => stepUpdate(task.id, step));
      await sleep(500);
    }

    stepUpdate(task.id, groupNames.length > 1 ? `已发: ${groupName}` : '发送完成，正在回到主聊天列表...');
    await returnToMainScreen((step) => stepUpdate(task.id, step));
    if (i < groupNames.length - 1) await sleep(1500);
  }
}

async function executeTask(task) {
  const start = Date.now();
  const ts = new Date().toISOString();
  const groupNames = task.groupNames && task.groupNames.length > 0
    ? task.groupNames : (task.groupName ? [task.groupName] : []);
  const label = groupNames.join(', ');

  console.log(`\n[${ts}] Task: ${task.id} -> ${label}`);
  task.lastRun = ts;
  task.status = 'running';
  saveTasks();
  broadcast('taskUpdate', { id: task.id, status: 'running' });

  let lastErr = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      stepUpdate(task.id, `第 ${attempt} 次重试...`);
      console.log(`[Retry ${attempt}/${MAX_RETRIES}] task ${task.id}`);
      await sleep(3000);
      try {
        await returnToMainScreen((step) => stepUpdate(task.id, step));
      } catch {
        try {
          await sh('input keyevent KEYCODE_BACK');
          await sh('input keyevent KEYCODE_BACK');
          await sh('input keyevent KEYCODE_BACK');
        } catch {}
      }
      await sleep(1000);
    }
    try {
      await executeTaskOnce(task);
      lastErr = null;
      break;
    } catch (err) {
      lastErr = err;
      console.error(`[Attempt ${attempt + 1}/${MAX_RETRIES + 1}] ${err.message}`);
      try {
        await returnToMainScreen((step) => stepUpdate(task.id, step));
      } catch {
        try {
          await sh('input keyevent KEYCODE_BACK');
          await sh('input keyevent KEYCODE_BACK');
          await sh('input keyevent KEYCODE_BACK');
        } catch {}
      }
    }
  }

  if (lastErr) {
    task.status = 'error';
    task.lastError = lastErr.message;
    task.lastRunFinished = new Date().toISOString();
    saveTasks();
    addLog(task.id, label, 'error', Date.now() - start, lastErr.message);
    broadcast('taskUpdate', { id: task.id, status: 'error', error: lastErr.message });
    stepUpdate(task.id, '');
    console.error(`[FAIL] ${lastErr.message}`);
  } else {
    task.status = 'active';
    task.lastError = null;
    task.runCount = (task.runCount || 0) + 1;
    task.lastRunFinished = new Date().toISOString();
    saveTasks();
    addLog(task.id, label, 'success', Date.now() - start, null);
    broadcast('taskUpdate', { id: task.id, status: 'active' });
    stepUpdate(task.id, '');
    console.log(`[OK] #${task.runCount} (${Date.now() - start}ms)`);
  }
}

function scheduleTask(task) {
  if (cronJobs[task.id]) { cronJobs[task.id].forEach(j => j.stop()); delete cronJobs[task.id]; }
  if (!task.enabled || !task.schedules || task.schedules.length === 0) return;
  const taskId = task.id;
  cronJobs[taskId] = [];
  task.schedules.forEach(sched => {
    if (sched.cronExpression && cron.validate(sched.cronExpression)) {
      cronJobs[taskId].push(cron.schedule(sched.cronExpression, () => {
        // Look up fresh task reference to avoid stale closure
        const freshTask = store.tasks.find(t => t.id === taskId);
        if (freshTask && freshTask.enabled) enqueueTask(freshTask);
      }));
    }
  });
}

function initScheduler() {
  store.tasks.forEach(t => { if (t.enabled) scheduleTask(t); });
}

module.exports = {
  sseClients, broadcast, stepUpdate,
  taskQueue, cronJobs,
  getCurrentTask, enqueueTask, scheduleTask, initScheduler,
};
