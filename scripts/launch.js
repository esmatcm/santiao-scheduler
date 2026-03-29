/**
 * Cross-platform launcher: starts the server, waits for it to be ready,
 * then opens the browser. Used by 启动.bat / 启动.command.
 */
const { spawn, exec } = require('child_process');
const http = require('http');
const path = require('path');
const os = require('os');

const PORT = 3456;
const URL = `http://localhost:${PORT}`;
const SERVER_SCRIPT = path.join(__dirname, '..', 'server.js');

function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}

// --- Check if port is already in use ---
function checkPort() {
  return new Promise((resolve) => {
    const req = http.get(`${URL}/api/health`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(true));
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

// --- Wait for server to respond ---
function waitForServer(maxSeconds = 30) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      const req = http.get(`${URL}/api/health`, (res) => {
        clearInterval(interval);
        resolve(true);
      });
      req.on('error', () => {});
      req.setTimeout(2000, () => req.destroy());

      if (attempts >= maxSeconds) {
        clearInterval(interval);
        resolve(false);
      }
    }, 1000);
  });
}

// --- Open URL in default browser ---
function openBrowser(url) {
  const platform = os.platform();
  let cmd;
  if (platform === 'darwin') cmd = `open "${url}"`;
  else if (platform === 'win32') cmd = `start "" "${url}"`;
  else cmd = `xdg-open "${url}"`;
  exec(cmd, (err) => {
    if (err) log(`Could not open browser: ${err.message}`);
  });
}

// --- Main ---
async function main() {
  console.log('');
  console.log('  ==========================================');
  console.log('    三条定时发送工具');
  console.log('  ==========================================');
  console.log('');

  // Check if already running
  const alreadyRunning = await checkPort();
  if (alreadyRunning) {
    log(`Server already running at ${URL}`);
    log('Opening browser...');
    openBrowser(URL);
    console.log('');
    console.log(`  ➜  ${URL}`);
    console.log('');
    return;
  }

  // Start server as child process, pipe output to this console
  log('Starting server...');
  const child = spawn(process.execPath, [SERVER_SCRIPT], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env },
  });

  child.on('error', (err) => {
    log(`Server failed to start: ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code) => {
    log(`Server exited with code ${code}`);
    process.exit(code || 0);
  });

  // Wait for server to be ready
  log('Waiting for server to be ready...');
  const ready = await waitForServer(30);

  if (ready) {
    log('Server is ready!');
    openBrowser(URL);
    console.log('');
    console.log('  ==========================================');
    console.log(`    ➜  ${URL}`);
    console.log('');
    console.log('    Browser should open automatically.');
    console.log('    Close this window to stop the server.');
    console.log('  ==========================================');
    console.log('');
  } else {
    log('Server did not respond in 30s — opening browser anyway...');
    openBrowser(URL);
    console.log('');
    console.log(`  ➜  ${URL}`);
    console.log('  (Server may still be starting...)');
    console.log('');
  }

  // Keep process alive (child process keeps running)
  // On Windows, closing this window kills the child too
  process.on('SIGINT', () => {
    log('Shutting down...');
    child.kill();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    child.kill();
    process.exit(0);
  });
}

main().catch(err => {
  log(`Error: ${err.message}`);
  process.exit(1);
});
