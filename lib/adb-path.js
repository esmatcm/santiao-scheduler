/**
 * Resolve the ADB binary path.
 * Priority: system PATH > bundled platform-tools/ in project root.
 */

const { execFileSync, execSync } = require('child_process');
const path = require('path');
const fs   = require('fs');

const IS_WIN = process.platform === 'win32';
let cachedPath = undefined; // undefined = not yet resolved, null = not found

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}][AdbPath] ${msg}`);
}

/** Find ADB in system PATH */
function findSystemAdb() {
  try {
    const cmd = IS_WIN ? 'where adb' : 'which adb';
    const result = execSync(cmd, { timeout: 5000, encoding: 'utf8' }).trim();
    // `which` may return multiple lines; take the first
    return result.split('\n')[0].trim();
  } catch {
    return null;
  }
}

/** Find bundled ADB in project's platform-tools/ */
function findBundledAdb() {
  const binary = IS_WIN ? 'adb.exe' : 'adb';
  const candidate = path.join(__dirname, '..', 'platform-tools', binary);
  if (fs.existsSync(candidate)) return candidate;
  return null;
}

/** Verify an ADB path actually works */
function verifyAdb(adbPath) {
  try {
    execFileSync(adbPath, ['version'], { timeout: 5000, encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

/** Resolve ADB path (force re-resolve, updates cache) */
function resolveAdb() {
  // 1. System PATH
  const sys = findSystemAdb();
  if (sys && verifyAdb(sys)) {
    log(`System ADB: ${sys}`);
    cachedPath = sys;
    return sys;
  }

  // 2. Bundled
  const bundled = findBundledAdb();
  if (bundled && verifyAdb(bundled)) {
    log(`Bundled ADB: ${bundled}`);
    cachedPath = bundled;
    return bundled;
  }

  log('ADB not found (not in PATH and no bundled platform-tools)');
  cachedPath = null;
  return null;
}

/** Get cached ADB path (resolves on first call) */
function getAdbPath() {
  if (cachedPath === undefined) resolveAdb();
  return cachedPath;
}

module.exports = { getAdbPath, resolveAdb };
