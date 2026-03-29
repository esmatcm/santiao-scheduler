/**
 * First-time setup state manager.
 * Checks ADB, device, IME installation, and persists state to setup.json.
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const path = require('path');
const fs   = require('fs');

const { getAdbPath, resolveAdb } = require('./adb-path');

const execFileAsync = promisify(execFile);

const SETUP_FILE   = path.join(__dirname, '..', 'setup.json');
const IME_APK      = path.join(__dirname, '..', 'resources', 'AdbIME.apk');
const SANTIAO_APK  = path.join(__dirname, '..', 'resources', 'SantiaoTalk.apk');
const IME_ID       = 'youhu.laixijs/.KeyboardServices.AdbIME';
const SANTIAO_PKG  = 'com.santiaotalk.im';

// In-memory cache
let stateCache = null;

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][Setup] ${msg}`);
}

// ---------------------------------------------------------------------------
// State persistence (same atomic pattern as storage.js)
// ---------------------------------------------------------------------------

function loadState() {
  try {
    if (fs.existsSync(SETUP_FILE)) {
      stateCache = JSON.parse(fs.readFileSync(SETUP_FILE, 'utf8'));
    }
  } catch {}
  if (!stateCache) {
    stateCache = {
      completed: false,
      adbAvailable: false,
      adbPath: '',
      deviceSerial: '',
      deviceModel: '',
      santiaoInstalled: false,
      imeInstalled: false,
      completedAt: null,
    };
  }
  return stateCache;
}

function saveState(partial) {
  if (!stateCache) loadState();
  Object.assign(stateCache, partial);
  const tmp = SETUP_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(stateCache, null, 2));
  fs.renameSync(tmp, SETUP_FILE);
}

function getState() {
  if (!stateCache) loadState();
  return { ...stateCache };
}

function isComplete() {
  if (!stateCache) loadState();
  return stateCache.completed === true;
}

// ---------------------------------------------------------------------------
// ADB helper
// ---------------------------------------------------------------------------

async function adbCmd(args, timeout = 15000) {
  const adb = getAdbPath();
  if (!adb) throw new Error('ADB not found');
  const { stdout } = await execFileAsync(adb, args, { timeout });
  return stdout.trim();
}

async function adbShell(serial, cmd, timeout = 15000) {
  return adbCmd(['-s', serial, 'shell', cmd], timeout);
}

// ---------------------------------------------------------------------------
// Setup steps
// ---------------------------------------------------------------------------

async function checkAdb() {
  const adbPath = resolveAdb();
  if (!adbPath) {
    saveState({ adbAvailable: false, adbPath: '' });
    return { ok: false, error: 'ADB not found. Install Android SDK Platform Tools or place platform-tools/ in the app directory.' };
  }
  let version = '';
  try {
    version = await adbCmd(['version'], 5000);
    version = version.split('\n')[0]; // first line only
  } catch {}
  saveState({ adbAvailable: true, adbPath: adbPath });
  log(`ADB OK: ${adbPath}`);
  return { ok: true, path: adbPath, version };
}

async function checkDevice() {
  const adb = getAdbPath();
  if (!adb) return { ok: false, error: 'ADB not available' };

  const raw = await adbCmd(['devices']);
  const lines = raw.split('\n').slice(1);
  const devices = [];
  for (const line of lines) {
    const m = line.match(/^(\S+)\s+device$/);
    if (m) devices.push(m[1]);
  }

  if (devices.length === 0) {
    saveState({ deviceSerial: '', deviceModel: '' });
    return { ok: false, error: 'No device connected. Enable USB debugging and connect your phone.' };
  }

  const serial = devices[0];
  let model = '';
  try {
    model = await adbShell(serial, 'getprop ro.product.model', 5000);
  } catch {}

  saveState({ deviceSerial: serial, deviceModel: model });
  log(`Device: ${serial} (${model})`);
  return { ok: true, serial, model, count: devices.length };
}

async function installSantiao() {
  const adb = getAdbPath();
  if (!adb) return { ok: false, error: 'ADB not available' };

  const state = getState();
  const serial = state.deviceSerial;
  if (!serial) return { ok: false, error: 'No device detected. Run device check first.' };

  // Check if already installed
  try {
    const packages = await adbShell(serial, `pm list packages ${SANTIAO_PKG}`, 10000);
    if (packages.includes(SANTIAO_PKG)) {
      saveState({ santiaoInstalled: true });
      log('Santiao app already installed');
      return { ok: true, alreadyInstalled: true };
    }
  } catch {}

  // Install APK
  if (!fs.existsSync(SANTIAO_APK)) {
    return {
      ok: false,
      error: `SantiaoTalk.apk not found at ${SANTIAO_APK}. Place the APK file in the resources/ directory.`,
    };
  }

  try {
    log(`Installing Santiao app from ${SANTIAO_APK}...`);
    const result = await adbCmd(['-s', serial, 'install', '-r', SANTIAO_APK], 120000);
    if (!result.includes('Success')) {
      return { ok: false, error: `Install failed: ${result}` };
    }
  } catch (e) {
    return { ok: false, error: `Install error: ${e.message}` };
  }

  // Verify
  try {
    const packages = await adbShell(serial, `pm list packages ${SANTIAO_PKG}`, 10000);
    if (!packages.includes(SANTIAO_PKG)) {
      return { ok: false, error: 'Install command succeeded but app not found. Check phone screen for prompts.' };
    }
  } catch {}

  saveState({ santiaoInstalled: true });
  log('Santiao app installed successfully');
  return { ok: true };
}

async function launchAndVerify() {
  const adb = getAdbPath();
  if (!adb) return { ok: false, error: 'ADB not available' };

  const state = getState();
  const serial = state.deviceSerial;
  if (!serial) return { ok: false, error: 'No device detected.' };

  const APP_PKG = 'com.santiaotalk.im';
  const APP_CMP = 'com.santiaotalk.im/com.vvchat.vcapp.activity.MainActivity';

  // Check if app is installed first
  try {
    const packages = await adbShell(serial, `pm list packages ${APP_PKG}`, 10000);
    if (!packages.includes(APP_PKG)) {
      return { ok: false, error: 'Santiao app is not installed. Install it first.' };
    }
  } catch {}

  // Force stop then launch
  log('Launching Santiao app...');
  try {
    await adbShell(serial, `am force-stop ${APP_PKG}`, 10000);
  } catch {}
  await new Promise(r => setTimeout(r, 1500));

  try {
    await adbShell(serial, `am start -W -S -n ${APP_CMP} --activity-clear-task`, 25000);
  } catch (e) {
    return { ok: false, error: `Launch failed: ${e.message}` };
  }

  // Wait for the main chat list to appear
  log('Waiting for chat interface...');
  await new Promise(r => setTimeout(r, 6000));

  // Check up to 10 times (30 seconds total) — cold start can be slow
  for (let i = 0; i < 10; i++) {
    try {
      const raw = await adbShell(serial, 'dumpsys activity top', 15000);

      // Check the app is in foreground
      if (!raw.includes(APP_PKG)) {
        log(`Attempt ${i + 1}: App not in foreground yet`);
        await new Promise(r => setTimeout(r, 2000));
        continue;
      }

      // Look for main chat list indicators
      const hasMessageFragment = /MessageFragment\{/.test(raw);
      const hasConversationList = raw.includes('app:id/rv_conversation');
      const hasBottomBar = raw.includes('app:id/compose_bottom_bar');
      const hasSearchBar = raw.includes('app:id/search');

      const indicators = [];
      if (hasMessageFragment) indicators.push('MessageFragment');
      if (hasConversationList) indicators.push('rv_conversation');
      if (hasBottomBar) indicators.push('compose_bottom_bar');
      if (hasSearchBar) indicators.push('search');

      log(`Attempt ${i + 1}: indicators=[${indicators.join(',')}]`);

      if (hasMessageFragment || hasConversationList || hasBottomBar) {
        saveState({ santiaoVerified: true });
        log('Santiao chat interface verified');
        return {
          ok: true,
          indicators,
          message: `Chat interface detected (${indicators.join(', ')})`,
        };
      }

      // App is open but not on main screen yet — might still be loading
      await new Promise(r => setTimeout(r, 2000));
    } catch (e) {
      log(`Attempt ${i + 1} error: ${e.message}`);
      await new Promise(r => setTimeout(r, 2000));
    }
  }

  return {
    ok: false,
    error: '三条已启动但未检测到聊天界面。可能原因：1) 需要在手机上登录 2) App 仍在加载 3) 手机屏幕被锁定。请检查手机后重试。',
  };
}

async function installIme() {
  const adb = getAdbPath();
  if (!adb) return { ok: false, error: 'ADB not available' };

  const state = getState();
  const serial = state.deviceSerial;
  if (!serial) return { ok: false, error: 'No device detected. Run device check first.' };

  // Check if already installed
  try {
    const ime = await adbShell(serial, 'ime list -s', 10000);
    if (ime.includes('youhu.laixijs')) {
      // Already installed — just enable and set
      await adbShell(serial, `ime enable ${IME_ID}`);
      await adbShell(serial, `ime set ${IME_ID}`);
      saveState({ imeInstalled: true });
      log('ADB IME already installed, enabled and set');
      return { ok: true, alreadyInstalled: true };
    }
  } catch {}

  // Install APK
  if (!fs.existsSync(IME_APK)) {
    return {
      ok: false,
      error: `AdbIME.apk not found at ${IME_APK}. Place the APK file in the resources/ directory.`,
    };
  }

  try {
    log(`Installing ADB IME from ${IME_APK}...`);
    const result = await adbCmd(['-s', serial, 'install', '-r', IME_APK], 60000);
    if (!result.includes('Success')) {
      return { ok: false, error: `Install failed: ${result}` };
    }
  } catch (e) {
    return { ok: false, error: `Install error: ${e.message}` };
  }

  // Enable and set as default
  try {
    await adbShell(serial, `ime enable ${IME_ID}`);
    await adbShell(serial, `ime set ${IME_ID}`);
  } catch (e) {
    return { ok: false, error: `IME enable failed: ${e.message}` };
  }

  // Verify
  try {
    const current = await adbShell(serial, 'settings get secure default_input_method', 5000);
    if (!current.includes('AdbIME')) {
      return { ok: false, error: `IME set but not active. Current: ${current.trim()}` };
    }
  } catch {}

  saveState({ imeInstalled: true });
  log('ADB IME installed and set successfully');
  return { ok: true };
}

async function verify() {
  const errors = [];

  const adbResult = await checkAdb();
  if (!adbResult.ok) errors.push(adbResult.error);

  const deviceResult = await checkDevice().catch(e => ({ ok: false, error: e.message }));
  if (!deviceResult.ok) errors.push(deviceResult.error);

  let santiaoResult = { ok: false };
  let imeResult = { ok: false };
  if (deviceResult.ok) {
    const serial = deviceResult.serial;
    // Check Santiao app
    try {
      const packages = await adbShell(serial, `pm list packages ${SANTIAO_PKG}`, 10000);
      santiaoResult.ok = packages.includes(SANTIAO_PKG);
      if (!santiaoResult.ok) errors.push('Santiao app is not installed on the device.');
    } catch (e) {
      errors.push(`Santiao check failed: ${e.message}`);
    }
    // Check IME
    try {
      const current = await adbShell(serial, 'settings get secure default_input_method', 5000);
      imeResult.ok = current.includes('AdbIME');
      if (!imeResult.ok) errors.push('ADB IME is not the active input method.');
    } catch (e) {
      errors.push(`IME check failed: ${e.message}`);
    }
  }

  const ok = errors.length === 0;
  if (ok) {
    saveState({ completed: true, completedAt: new Date().toISOString() });
    log('Setup verification passed');
  }

  return {
    ok,
    adb: adbResult,
    device: deviceResult,
    santiao: santiaoResult,
    ime: imeResult,
    errors,
  };
}

/** Reset setup state (for re-running setup) */
function reset() {
  stateCache = null;
  try { fs.unlinkSync(SETUP_FILE); } catch {}
  loadState();
  log('Setup state reset');
  return getState();
}

/** Force-complete setup (allow user to enter dashboard even if verify didn't fully pass) */
function forceComplete() {
  saveState({ completed: true, completedAt: new Date().toISOString() });
  log('Setup force-completed by user');
}

module.exports = { getState, isComplete, checkAdb, checkDevice, installSantiao, launchAndVerify, installIme, verify, reset, forceComplete };
