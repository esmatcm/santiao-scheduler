const { execFile, execSync } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const os = require('os');
const deviceConfig = require('./device-config');
const { getAdbPath } = require('./adb-path');

const execFileAsync = promisify(execFile);

const APP_COMPONENT = 'com.santiaotalk.im/com.vvchat.vcapp.activity.MainActivity';
const APP_PACKAGE = 'com.santiaotalk.im';

// Dynamic accessors — resolved from deviceConfig at call time
function DEVICE() { return deviceConfig.config.serial || deviceConfig.REF.serial; }
function HOME_PACKAGE() { return deviceConfig.config.homePackage; }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function log(tag, msg) {
  const ts = new Date().toISOString().slice(11, 23);
  const line = `[${ts}][ADB:${tag}] ${msg}`;
  console.log(line);
}

async function sh(shellCmd, { retries = 1, timeout = 15000 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const { stdout } = await execFileAsync(getAdbPath(), ['-s', DEVICE(), 'shell', shellCmd], { timeout });
      return stdout;
    } catch (e) {
      if (attempt < retries) { await sleep(1000); continue; }
      throw e;
    }
  }
}

async function tap(x, y) { await sh(`input tap ${Math.round(x)} ${Math.round(y)}`, { retries: 2 }); }

async function ensureAdbIME() {
  try { await sh('ime set youhu.laixijs/.KeyboardServices.AdbIME'); } catch {}
}

async function inputText(text) {
  const b64 = Buffer.from(text, 'utf8').toString('base64');
  await sh(`am broadcast -a ADB_INPUT_B64 --es msg '${b64}'`);
}

async function getDeviceStatus(taskQueueRef, currentTaskRef) {
  try {
    const { stdout } = await execFileAsync(getAdbPath(), ['devices'], { timeout: 5000 });
    const serial = DEVICE();
    const online = stdout.includes(serial) && stdout.includes('device');
    let ime = '';
    if (online) {
      try { ime = (await sh('settings get secure default_input_method', { timeout: 5000 })).trim(); } catch {}
    }
    return {
      online, device: serial, ime,
      adbIME: ime.includes('AdbIME'),
      queueLength: taskQueueRef.length,
      running: !!currentTaskRef,
    };
  } catch {
    return { online: false, device: DEVICE(), ime: '', adbIME: false, queueLength: 0, running: false };
  }
}

async function getCurrentAppPackage() {
  const probes = [
    'dumpsys activity activities | grep mResumedActivity | head -n 1',
    'dumpsys window windows | grep -E "mCurrentFocus|mFocusedApp" | head -n 5',
  ];

  for (const probe of probes) {
    try {
      const out = await sh(probe, { timeout: 8000, retries: 0 });
      const match = out.match(/\s([A-Za-z0-9._]+)\//);
      if (match) return match[1];
    } catch {}
  }
  return '';
}

async function launchSantiao(reason = '') {
  log('nav', `Launching 三条${reason ? ` (${reason})` : ''}`);
  await sh(`am force-stop ${APP_PACKAGE}`, { timeout: 15000, retries: 0 }).catch(() => {});
  await sleep(1200);
  await sh(`am start -W -S -n ${APP_COMPONENT} --activity-clear-task`, { timeout: 25000, retries: 1 });
  await sleep(5500);
}

async function captureScreen(prefix = 'santiao') {
  const remote = `/sdcard/${prefix}_${Date.now()}.png`;
  const local = `${os.tmpdir()}/${prefix}_${Date.now()}.png`;
  await execFileAsync(getAdbPath(), ['-s', DEVICE(), 'shell', 'screencap', '-p', remote], { timeout: 20000 });
  await execFileAsync(getAdbPath(), ['-s', DEVICE(), 'pull', remote, local], { timeout: 30000 });
  await sh(`rm -f ${remote}`, { timeout: 10000, retries: 0 }).catch(() => {});
  return local;
}

// ---------------------------------------------------------------------------
// Fallback: parse `dumpsys activity top` view hierarchy into synthetic XML
// so existing regex-based patterns (resource-id + bounds) still work.
// ---------------------------------------------------------------------------
async function dumpActivityTopXml(label = '') {
  try {
    const raw = await sh(
      'dumpsys activity top',
      { timeout: 15000, retries: 0 }
    );
    // Find the santiaotalk TASK section.
    // There may be multiple sections containing the package name (e.g. finished activities).
    // Use the LAST one found (most recent/top) as it's the currently active one.
    const sections = raw.split(/^TASK /m);
    const matchingSections = sections.filter(s => s.includes(APP_PACKAGE));
    if (matchingSections.length === 0) {
      log('dump', `[fallback] 三条 not found in dumpsys activity top${label ? ' [' + label + ']' : ''}`);
      return null;
    }
    // Prefer section with mResumed=true, otherwise use the last match
    const section = matchingSections.find(s => s.includes('mResumed=true')) || matchingSections[matchingSections.length - 1];

    // Parse view lines with indentation tracking to compute absolute screen bounds.
    // Format: <spaces>ClassName{hash flags bounds #hexId app:id/name}
    // All bounds in dumpsys are relative to parent view. We accumulate parent offsets
    // and add the app window's y-offset to convert to screen coordinates.
    // Determine screen offset: if action_bar_root covers full screen (edge-to-edge),
    // offset=0; otherwise the app window starts below the status bar (offset=104px).
    let statusBarOffset = 0;
    const rootMatch = section.match(/\s(\d+),(\d+)-(\d+),(\d+)\s+#[\da-fA-F]+\s+app:id\/action_bar_root/);
    if (rootMatch) {
      const rootBottom = parseInt(rootMatch[4]);
      // Determine if app draws under the status bar:
      // - rootBottom ~2466: normal content area (status bar not included) → offset=statusBar
      // - rootBottom ~2570: content extends under status bar → offset=0
      // - rootBottom ~2712: full screen including nav bar → offset=0
      // Threshold scales with screen height (ref: 2500 on 2712 screen)
      if (rootBottom <= deviceConfig.statusBarThreshold()) {
        statusBarOffset = deviceConfig.config.statusBar;
        log('dump', `[fallback] Applying statusBarOffset=${statusBarOffset} (rootBottom=${rootBottom})${label ? ' [' + label + ']' : ''}`);
      } else {
        log('dump', `[fallback] No statusBarOffset needed (rootBottom=${rootBottom}, app draws under status bar)${label ? ' [' + label + ']' : ''}`);
      }
    }
    const lines = section.split('\n');
    // Match ANY view with bounds (with or without app:id) for parent tracking
    // Note: views without app:id end with bounds} (no trailing space), so allow \s or }
    const anyViewRegex = /^(\s+)\S+\{[^}]*\s(-?\d+),(-?\d+)-(-?\d+),(-?\d+)[\s}]/;
    // Match views that have app:id for XML output
    const idRegex = /app:id\/(\w+)/;
    const nodes = [];
    // Stack of { indent, absLeft, absTop } for accumulating parent offsets
    const parentStack = [];

    for (const line of lines) {
      const m = line.match(anyViewRegex);
      if (!m) continue;
      const indent = m[1].length;
      let l = parseInt(m[2]), t = parseInt(m[3]), r = parseInt(m[4]), b = parseInt(m[5]);

      // Skip invisible/gone views (0,0-0,0 bounds)
      if (l === 0 && t === 0 && r === 0 && b === 0) continue;

      // Pop parents that are at same or deeper indent level
      while (parentStack.length > 0 && parentStack[parentStack.length - 1].indent >= indent) {
        parentStack.pop();
      }

      // Compute absolute coords by accumulating parent offsets
      let absLeft = l, absTop = t, absRight = r, absBottom = b;
      if (parentStack.length > 0) {
        const parent = parentStack[parentStack.length - 1];
        // Only add parent offset if this view's bounds look like relative coords
        // (i.e. much smaller than parent's absolute position)
        if (t < parent.absTop && parent.absTop > 200) {
          absLeft = parent.absLeft + l;
          absTop = parent.absTop + t;
          absRight = parent.absLeft + r;
          absBottom = parent.absTop + b;
        }
      }

      // Push as potential parent (using window coords, not screen coords)
      parentStack.push({ indent, absLeft, absTop });

      // Only emit XML node for views with app:id
      const idMatch = line.match(idRegex);
      if (!idMatch) continue;
      const id = idMatch[1];

      // Add window offset for screen-absolute coordinates
      const screenTop = absTop + statusBarOffset;
      const screenBottom = absBottom + statusBarOffset;
      const screenLeft = absLeft;
      const screenRight = absRight;

      nodes.push(`<node resource-id="${APP_PACKAGE}:id/${id}" bounds="[${screenLeft},${screenTop}][${screenRight},${screenBottom}]" package="${APP_PACKAGE}" />`);
    }

    if (nodes.length === 0) {
      log('dump', `[fallback] No visible views parsed${label ? ' [' + label + ']' : ''}`);
      return null;
    }

    const xml = `<?xml version='1.0' encoding='UTF-8' ?><hierarchy rotation="0">${nodes.join('')}</hierarchy>`;
    log('dump', `[fallback] Generated synthetic XML with ${nodes.length} nodes${label ? ' [' + label + ']' : ''}`);
    return xml;
  } catch (e) {
    log('dump', `[fallback] dumpActivityTopXml error: ${e.message}`);
    return null;
  }
}

// Dump UI XML; returns xml string or null
// Tries uiautomator first, falls back to dumpsys activity top parsing.
async function dumpXml(label = '') {
  try {
    // uiautomator dump is unreliable on MIUI (returns stale/wrong window data),
    // so we always use dumpsys activity top as the primary source.
    let xml = await dumpActivityTopXml(label);
    if (!xml) {
      log('dump', `UI dump failed (dumpsys returned null)${label ? ' [' + label + ']' : ''}`);
      return null;
    }

    if (label) {
      const indicators = [
        ['search-bar', /resource-id="com\.santiaotalk\.im:id\/search/],
        ['chat-input', /resource-id="com\.santiaotalk\.im:id\/(chat_input|text_input|input_box)/],
        ['send-btn',   /resource-id="com\.santiaotalk\.im:id\/(send_btn|input_send_bnt)/],
        ['result-item', /resource-id="com\.santiaotalk\.im:id\/(item_chat_name|rv_search_results)/],
      ];
      const found = indicators.filter(([, r]) => r.test(xml)).map(([n]) => n);
      const miss  = indicators.filter(([, r]) => !r.test(xml)).map(([n]) => n);
      log('dump', `[${label}] found:[${found.join(',')}] missing:[${miss.join(',')}]`);
    }
    return xml;
  } catch (e) {
    log('dump', `dumpXml error: ${e.message}`);
    return null;
  }
}

// Find element coords in xml by regex patterns; returns { x, y } or null
function findInXml(xml, patterns) {
  for (const p of patterns) {
    const m = p.exec(xml);
    if (m) return { x: (+m[1] + +m[3]) / 2, y: (+m[2] + +m[4]) / 2 };
  }
  return null;
}

// @deprecated - Sync version using execSync. Use dumpXml() + dumpActivityTopXml() instead.
// Kept as utility but no longer exported. May be removed in a future version.
function dumpAndFind(keywords, label = '') {
  const tag = label ? `[${label}]` : '';
  try {
    const adbBin = JSON.stringify(getAdbPath());
    const xml = require('child_process').execSync(
      `${adbBin} -s ${DEVICE()} shell "uiautomator dump /sdcard/window_dump.xml && cat /sdcard/window_dump.xml"`,
      { timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
    ).toString();

    if (!keywords || keywords.length === 0) return { found: false, xml };

    const kws = Array.isArray(keywords) ? keywords : [keywords];
    for (const kw of kws) {
      const regex = new RegExp(`<node[^>]*text="[^"]*${kw}[^"]*"[^>]*bounds="\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]"`, 'i');
      const match = xml.match(regex);
      if (match) {
        const cx = Math.round((parseInt(match[1]) + parseInt(match[3])) / 2);
        const cy = Math.round((parseInt(match[2]) + parseInt(match[4])) / 2);
        console.log(`[ADB:dump]${tag} Found "${kw}" at (${cx}, ${cy})`);
        return { found: true, x: cx, y: cy, keyword: kw, xml };
      }
    }
    console.log(`[ADB:dump]${tag} Keywords not found: ${kws.join(', ')}`);
    return { found: false, xml };
  } catch (e) {
    console.error(`[ADB:dump]${tag} UI dump failed:`, e.message?.substring(0, 100));
    return { found: false, xml: '' };
  }
}

// Wait for element to appear in UI with retries; returns { x, y, xml } or null
async function waitForElement(patterns, label, maxAttempts = 5, intervalMs = 1500) {
  for (let i = 0; i < maxAttempts; i++) {
    const xml = await dumpXml(`${label} ${i + 1}/${maxAttempts}`);
    if (xml) {
      const coords = findInXml(xml, patterns);
      if (coords) {
        log('wait', `Found [${label}] on attempt ${i + 1}`);
        return { ...coords, xml };
      }
    }
    if (i < maxAttempts - 1) await sleep(intervalMs);
  }
  log('wait', `NOT found [${label}] after ${maxAttempts} attempts`);
  return null;
}

// ===================================================================
// Fallback: check if we're on the main chat list using dumpsys activity
// Returns true if MessageFragment is the active (RESUMED, state=7) fragment
// ===================================================================
async function isOnMainScreenFallback() {
  try {
    const currentPackage = await getCurrentAppPackage();
    if (currentPackage !== APP_PACKAGE) return false;

    const raw = await sh(
      'dumpsys activity top',
      { timeout: 10000, retries: 0 }
    );
    // Check for MessageFragment in state=7 (RESUMED) and rv_conversation visible
    const hasMessageFragment = /MessageFragment\{[^}]*\}/.test(raw);
    const hasConversationList = raw.includes('app:id/rv_conversation');
    const hasBottomBar = raw.includes('app:id/compose_bottom_bar');

    // Also check we're NOT in ChatRoomActivity or PictureSelector
    const inChatRoom = raw.includes('ChatRoomActivity') && /app:id\/(text_input|input_send_bnt|rv_messages)/.test(raw);
    const inPicker = raw.includes('PictureSelectorSupporter') || raw.includes('app:id/ivPicture');
    if (inChatRoom || inPicker) {
      log('nav', `[fallback] Detected ${inChatRoom ? 'ChatRoomActivity' : 'PictureSelector'} — NOT on main screen`);
      return false;
    }
    if (hasMessageFragment && (hasConversationList || hasBottomBar)) {
      log('nav', '[fallback] Detected main chat list via dumpsys (MessageFragment + rv_conversation)');
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// Fallback search bar coordinates for the 三条 app.
// The search bar is inside compose_bottom_bar (Jetpack Compose),
// which uiautomator / dumpsys can't resolve to individual elements.
// Derived from screenshot analysis: "Q 搜索" is at the bottom of the screen.
// Now computed as ratio of screen size so it adapts to any device.
function FALLBACK_SEARCH_COORDS() { return deviceConfig.coords('searchBar'); }

// ===================================================================
// ENSURE we are on the main chat list (search bar visible)
// Presses BACK up to maxBacks times if needed, then relaunches app once
// ===================================================================
async function ensureOnMainScreen(maxBacks = 5) {
  const SEARCH_PATTERNS = [
    /resource-id="com\.santiaotalk\.im:id\/search[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/fb_search[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /content-desc="搜索"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /text="搜索"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ];

  // Broader indicators that we're on the main list (bottom tabs) but search bar may be scrolled off
  const MAIN_LIST_TAB_PATTERNS = [
    /text="消息"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /text="通讯录"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /content-desc="消息"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /content-desc="通讯录"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ];

  // Try to find search bar coords from xml; if on main list but bar scrolled off, scroll to top first
  async function tryFindSearchBar(xml) {
    if (!xml) return null;
    const coords = findInXml(xml, SEARCH_PATTERNS);
    if (coords) return coords;
    // If we see main list tab indicators, search bar might be scrolled off — scroll to top
    const onMainList = MAIN_LIST_TAB_PATTERNS.some(p => p.test(xml)) && xml.includes(`package="${APP_PACKAGE}"`);
    if (onMainList) {
      log('nav', 'Main list tabs visible but search bar not found — scrolling to top');
      const sw = deviceConfig.coords('swipeScrollTop');
      await sh(`input swipe ${sw.x} ${sw.yFrom} ${sw.x} ${sw.yTo}`, { retries: 0 }).catch(() => {}); // swipe down to reveal top
      await sleep(800);
      const xml2 = await dumpXml('after-scroll-top');
      if (xml2) return findInXml(xml2, SEARCH_PATTERNS);
    }
    // Fallback: if xml has the app package but search bar element isn't found
    // (e.g. search bar is in Compose and not enumerable), use fixed coords.
    // BUT: skip if we detect chat-room-specific elements — that means we're in a chat, not main screen.
    if (xml && xml.includes(`package="${APP_PACKAGE}"`)) {
      const chatIndicators = /resource-id="com\.santiaotalk\.im:id\/(text_input|input_send_bnt|input_box|rv_messages|input_more_bnt|back_bnt|to_user_name)"/;
      if (chatIndicators.test(xml)) {
        log('nav', 'App package detected in XML but chat-room indicators found — NOT on main screen');
        return null;
      }
      // Also detect image picker (PictureSelector library)
      const pickerIndicators = /resource-id="com\.santiaotalk\.im:id\/(ivPicture|ps_complete_select|ps_tv_preview|fragment_container|recycler)"/;
      if (pickerIndicators.test(xml)) {
        log('nav', 'App package detected in XML but image picker indicators found — NOT on main screen');
        return null;
      }
      log('nav', 'App package detected in XML but search bar not found — using fallback coords');
      return FALLBACK_SEARCH_COORDS();
    }
    return null;
  }

  // Fallback check using dumpsys when all XML-based detection fails
  async function tryFallbackDetection() {
    if (await isOnMainScreenFallback()) {
      log('nav', 'Using fallback search bar coords (dumpsys verified main screen)');
      return FALLBACK_SEARCH_COORDS();
    }
    return null;
  }

  // First check: are we already on the main screen?
  let xml = await dumpXml('main-screen-check');
  let coords = await tryFindSearchBar(xml);
  if (coords) {
    log('nav', 'Already on main chat list');
    return coords;
  }
  // Fallback: dumpsys-based detection
  coords = await tryFallbackDetection();
  if (coords) return coords;

  let currentPackage = await getCurrentAppPackage();
  if (currentPackage && currentPackage !== APP_PACKAGE) {
    log('nav', `Foreground app is ${currentPackage || 'unknown'}; relaunching 三条 before BACK navigation`);
    await launchSantiao(`foreground=${currentPackage}`);
    xml = await dumpXml('after-foreground-relaunch');
    coords = await tryFindSearchBar(xml);
    if (coords) {
      log('nav', 'Reached main chat list after relaunch from foreign app');
      return coords;
    }
    coords = await tryFallbackDetection();
    if (coords) return coords;
  }

  // Press BACK up to maxBacks times, checking after each
  for (let i = 0; i < maxBacks; i++) {
    log('nav', `Pressing BACK (attempt ${i + 1}/${maxBacks}) to reach main screen`);
    await sh('input keyevent KEYCODE_BACK');
    await sleep(1500);
    xml = await dumpXml(`after-back-${i + 1}`);
    coords = await tryFindSearchBar(xml);
    if (coords) {
      log('nav', `Reached main chat list after ${i + 1} BACK press(es)`);
      return coords;
    }
    coords = await tryFallbackDetection();
    if (coords) return coords;

    currentPackage = await getCurrentAppPackage();
    if (currentPackage && currentPackage !== APP_PACKAGE) {
      log('nav', `BACK moved app to ${currentPackage}; stopping BACK loop and relaunching 三条`);
      break;
    }
  }

  // Last resort: restart the app
  log('nav', 'Could not find main screen with BACK, relaunching app');
  await launchSantiao('main-screen-fallback');

  const result = await waitForElement(SEARCH_PATTERNS, 'main-screen-after-relaunch', 6, 1500);
  if (result) return result;

  // Final fallback after relaunch
  coords = await tryFallbackDetection();
  if (coords) return coords;

  const screenshotPath = await captureScreen('ensure-main-failed').catch(() => '');
  throw new Error(`无法返回主聊天列表，请检查手机状态${screenshotPath ? `（截图: ${screenshotPath}）` : ''}`);
}

// Check if we're in a chat screen using dumpsys activity top (fallback)
async function isInChatScreenFallback() {
  try {
    const raw = await sh('dumpsys activity top', { timeout: 10000, retries: 0 });
    const sections = raw.split(/^TASK /m);
    const section = sections.find(s => s.includes(APP_PACKAGE));
    if (!section) return false;
    // Chat screen indicators: ChatRoomActivity or chat input/send views
    return /ChatRoomActivity|app:id\/text_input|app:id\/input_send_bnt|app:id\/input_box|app:id\/rv_messages/.test(section);
  } catch {
    return false;
  }
}

async function returnToMainScreen(stepUpdate = () => {}) {
  stepUpdate('正在返回主聊天列表...');
  // Press BACK first to leave chat room (if we're in one)
  await sh('input keyevent KEYCODE_BACK').catch(() => {});
  await sleep(2000);
  const coords = await ensureOnMainScreen(5);
  await sleep(1000);
  return coords;
}

// ===================================================================
// NAVIGATION
// ===================================================================
async function openGroup(groupName, stepUpdate, isFirst = true) {
  stepUpdate(`正在打开三条...`);
  await ensureAdbIME();

  if (isFirst) {
    log('nav', 'isFirst=true: launching app');
    await launchSantiao('first-group');
  }

  // Ensure we're on the main chat list (has search bar).
  // For non-first groups, returnToMainScreen was already called but the screen may
  // still need a couple more BACKs to fully settle — allow 3 safety BACKs.
  const searchCoords = await ensureOnMainScreen(isFirst ? 2 : 3);

  stepUpdate(`正在搜索「${groupName}」...`);
  log('nav', `Tapping search bar at (${searchCoords.x}, ${searchCoords.y})`);
  await tap(searchCoords.x, searchCoords.y);
  await sleep(1500);

  // Verify search input is active (basic check — non-fatal if dump fails)
  const afterTapXml = await dumpXml('after-tap-search');
  if (!afterTapXml) {
    log('nav', 'Could not verify search input via UI dump — proceeding anyway');
  }

  // Clear and type group name
  await sh('am broadcast -a ADB_CLEAR_TEXT');
  await sleep(500);
  log('nav', `Typing group name: "${groupName}"`);
  await inputText(groupName);
  await sleep(2500);

  // Wait for search results
  const RESULT_PATTERNS = [
    /resource-id="com\.santiaotalk\.im:id\/item_chat_name"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/search_result_item"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/item_search_group[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ];
  const resultItem = await waitForElement(RESULT_PATTERNS, `search-result:${groupName}`, 5, 1500);

  if (!resultItem) {
    // Fallback: check if SearchFragment is active with rv_search_results visible
    log('nav', `Search result not found via patterns — trying fallback for "${groupName}"`);
    let usedFallback = false;
    try {
      const raw = await sh('dumpsys activity top', { timeout: 10000, retries: 0 });
      const hasSearchResults = raw.includes('app:id/rv_search_results') && raw.includes('SearchFragment');
      if (hasSearchResults) {
        // Search results are visible — tap the first result at a known position
        // First result is below the "群聊" section header (ends ~y=254), first item ~y=260-380
        const fallbackCoords = deviceConfig.coords('searchResult');
        log('nav', `[fallback] SearchFragment active — tapping first result at (${fallbackCoords.x}, ${fallbackCoords.y})`);
        await tap(fallbackCoords.x, fallbackCoords.y);
        usedFallback = true;
      }
    } catch {}
    if (!usedFallback) {
      const dbgXml = await dumpXml('search-result-debug');
      if (dbgXml) log('nav', `Debug XML (first 800): ${dbgXml.slice(0, 800)}`);
      throw new Error(`搜索「${groupName}」后未找到任何结果，请确认群名正确`);
    }
  } else {
    log('nav', `Tapping search result at (${resultItem.x}, ${resultItem.y})`);
    await tap(resultItem.x, resultItem.y);
  }
  await sleep(3000);

  // Verify we entered a chat screen with chat input
  const CHAT_INPUT_PATTERNS = [
    /resource-id="com\.santiaotalk\.im:id\/chat_input[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/text_input[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ];
  const chatScreen = await waitForElement(CHAT_INPUT_PATTERNS, `chat-screen:${groupName}`, 4, 1000);

  if (!chatScreen) {
    // Fallback: verify via dumpsys that we're in a chat activity
    const chatFallback = await isInChatScreenFallback();
    if (!chatFallback) {
      const dbgXml = await dumpXml('chat-screen-debug');
      if (dbgXml) log('nav', `Chat screen debug XML (first 800): ${dbgXml.slice(0, 800)}`);
      throw new Error(`点击搜索结果后未进入聊天界面，请检查手机状态`);
    }
    log('nav', `[fallback] Verified chat screen via dumpsys`);
  } else {
    // Log whether group name appears in title (non-fatal if absent — names may be truncated)
    if (chatScreen.xml && chatScreen.xml.includes(groupName)) {
      log('nav', `Confirmed in group chat: "${groupName}"`);
    } else {
      log('nav', `WARNING: group name "${groupName}" not found in screen XML — may be truncated/encoded`);
      stepUpdate(`注意：界面未显示群名「${groupName}」，请核实`);
    }
  }

  return true;
}

// ===================================================================
// SEND TEXT
// ===================================================================
async function sendText(text, taskId, stepUpdate) {
  stepUpdate('正在输入文字...');
  await ensureAdbIME();

  const CHAT_INPUT_PATTERNS = [
    /resource-id="com\.santiaotalk\.im:id\/chat_input[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/text_input[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ];

  let inputEl = await waitForElement(CHAT_INPUT_PATTERNS, 'chat-input-box', 3, 800);
  if (!inputEl) {
    // Fallback: try to find chat input via dumpsys
    const fallbackXml = await dumpActivityTopXml('sendText-input-fallback');
    if (fallbackXml) inputEl = findInXml(fallbackXml, CHAT_INPUT_PATTERNS);
    if (!inputEl) {
      // Verify we're at least on a chat screen
      if (await isInChatScreenFallback()) {
        log('sendText', '[fallback] On chat screen but input not found in XML — using fallback coords');
        // Chat input is typically near the bottom of the chat screen, above the nav bar
        inputEl = deviceConfig.coords('chatInput');
      } else {
        throw new Error('找不到聊天输入框，当前界面不是聊天界面');
      }
    }
  }

  await tap(inputEl.x, inputEl.y);
  await sleep(800);

  const now = new Date();
  const processed = text
    .replace(/\{date\}/g, now.toLocaleDateString('zh'))
    .replace(/\{time\}/g, now.toLocaleTimeString('zh'))
    .replace(/\{datetime\}/g, now.toLocaleString('zh'));

  log('sendText', `Inputting text (${processed.length} chars)`);
  await inputText(processed);
  await sleep(1000);

  stepUpdate('正在发送文字...');
  const SEND_PATTERNS = [
    /resource-id="com\.santiaotalk\.im:id\/send_btn"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/input_send_bnt"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /text="发送"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"[^>]*resource-id="com\.santiaotalk\.im:id\/send_btn"/,
  ];
  let sendEl = await waitForElement(SEND_PATTERNS, 'send-text-btn', 3, 800);
  if (!sendEl) {
    // Fallback: try dumpsys
    const fallbackXml = await dumpActivityTopXml('sendText-send-fallback');
    if (fallbackXml) sendEl = findInXml(fallbackXml, SEND_PATTERNS);
    if (!sendEl) throw new Error('找不到发送按钮，无法发送文字');
  }

  log('sendText', `Tapping send at (${sendEl.x}, ${sendEl.y})`);
  await tap(sendEl.x, sendEl.y);
  await sleep(1200);
}

// ===================================================================
// SEND IMAGE
// ===================================================================
async function sendImage(localImagePath, taskId, stepUpdate) {
  stepUpdate('正在推送图片到手机...');
  const ts = Date.now();
  const camPath  = `/sdcard/DCIM/Camera/IMG_${ts}.jpg`;
  const dcimPath = `/sdcard/DCIM/santiao_${ts}.jpg`;

  await execFileAsync(getAdbPath(), ['-s', DEVICE(), 'push', localImagePath, camPath], { timeout: 30000 });
  await sh(`cp "${camPath}" "${dcimPath}"`);
  await sh(`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${camPath}"`);
  await sh(`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${dcimPath}"`);
  await sleep(2000);

  stepUpdate('正在选择图片...');

  // Verify we're in a chat screen first
  const CHAT_INPUT_PATTERNS = [
    /resource-id="com\.santiaotalk\.im:id\/chat_input[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/text_input[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ];
  let chatCheck = await waitForElement(CHAT_INPUT_PATTERNS, 'sendImage-chat-check', 3, 800);
  if (!chatCheck) {
    // Fallback: try dumpsys
    const fallbackXml = await dumpActivityTopXml('sendImage-chat-fallback');
    if (fallbackXml) chatCheck = findInXml(fallbackXml, CHAT_INPUT_PATTERNS);
    if (!chatCheck && !(await isInChatScreenFallback())) {
      throw new Error('发送图片前：当前界面不是聊天界面');
    }
  }

  // + / attachment button
  const ATTACH_PATTERNS = [
    /resource-id="com\.santiaotalk\.im:id\/chat_attach_btn[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/add_btn[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/input_more_bnt[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /content-desc="添加"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /content-desc="更多"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ];
  let plusEl = await waitForElement(ATTACH_PATTERNS, 'attach-btn', 3, 800);
  if (!plusEl) {
    const fallbackXml = await dumpActivityTopXml('sendImage-attach-fallback');
    if (fallbackXml) plusEl = findInXml(fallbackXml, ATTACH_PATTERNS);
    if (!plusEl) throw new Error('找不到附件/添加按钮，无法发送图片');
  }

  log('sendImage', `Tapping attach at (${plusEl.x}, ${plusEl.y})`);
  await tap(plusEl.x, plusEl.y);
  await sleep(1500);

  // 图片 button
  const IMG_BTN_PATTERNS = [
    /resource-id="com\.santiaotalk\.im:id\/image_bnt[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /text="图片"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /content-desc="图片"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/chat_image[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ];
  let imgBtn = await waitForElement(IMG_BTN_PATTERNS, 'image-menu-btn', 3, 1000);
  if (!imgBtn) {
    const fallbackXml = await dumpActivityTopXml('sendImage-imgbtn-fallback');
    if (fallbackXml) imgBtn = findInXml(fallbackXml, IMG_BTN_PATTERNS);
    if (!imgBtn) {
      // Fallback: the 图片 button is the 2nd item in the attach menu grid.
      // Position: chat_input(1634) + llInputMore(162) + grid(60) + image_bnt(0..245) + statusBar(104)
      // Center: x=(305+610)/2=457, y=1634+162+60+122+104=2082
      log('sendImage', '[fallback] Using fixed coords for 图片 button');
      imgBtn = deviceConfig.coords('imageButton');
    }
  }

  log('sendImage', `Tapping image btn at (${imgBtn.x}, ${imgBtn.y})`);
  await tap(imgBtn.x, imgBtn.y);
  await sleep(3000);

  // Verify PictureSelector actually opened
  const rawAfterImgBtn = await sh('dumpsys activity top', { timeout: 10000, retries: 0 }).catch(() => '');
  if (!rawAfterImgBtn.includes('PictureSelectorSupporter')) {
    log('sendImage', 'PictureSelector did NOT open after tapping image button — retrying');
    // Maybe the + menu closed, try reopening
    await tap(plusEl.x, plusEl.y);
    await sleep(1500);
    await tap(imgBtn.x, imgBtn.y);
    await sleep(3000);
    const raw2 = await sh('dumpsys activity top', { timeout: 10000, retries: 0 }).catch(() => '');
    if (!raw2.includes('PictureSelectorSupporter')) {
      throw new Error('找不到图片选项，无法发送图片');
    }
  }

  // Tap the checkbox (tvCheck/btnCheck) on the first photo to SELECT it.
  // Do NOT tap ivPicture — that opens a full-screen preview instead of selecting.
  const CHECK_PATTERNS = [
    /resource-id="com\.santiaotalk\.im:id\/tvCheck[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/btnCheck[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ];
  let checkEl = await waitForElement(CHECK_PATTERNS, 'first-photo-check', 5, 1500);
  if (!checkEl) {
    const fallbackXml = await dumpActivityTopXml('sendImage-photo-fallback');
    if (fallbackXml) checkEl = findInXml(fallbackXml, CHECK_PATTERNS);
    if (!checkEl) throw new Error('找不到图片选择框，无法选择图片');
  }

  log('sendImage', `Tapping photo checkbox at (${checkEl.x}, ${checkEl.y})`);
  await tap(checkEl.x, checkEl.y);
  await sleep(1500);

  // Verify photo was selected: check if we're still in the picker grid
  // (if tap opened preview instead, go back and retry)
  const rawAfterCheck = await sh('dumpsys activity top', { timeout: 10000, retries: 0 }).catch(() => '');
  if (rawAfterCheck.includes('PictureSelectorSupporter')) {
    // Still in picker — check if ps_tv_select_num is visible (means selection worked)
    const checkXml = await dumpActivityTopXml('sendImage-verify-selection');
    const hasSelection = checkXml && /ps_tv_select_num/.test(checkXml) &&
      /ps_tv_select_num[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.test(checkXml);
    if (!hasSelection) {
      log('sendImage', 'Selection may not have worked — checking if in preview mode');
      // If in preview mode (full screen image), press back and retry with adjusted coords
      await sh('input keyevent KEYCODE_BACK').catch(() => {});
      await sleep(1000);
    }
  }

  stepUpdate('正在发送图片...');
  const SEND_PATTERNS = [
    /resource-id="com\.santiaotalk\.im:id\/ps_complete_select[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/ps_tv_complete[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/send_btn[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /resource-id="com\.santiaotalk\.im:id\/input_send_bnt[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
    /text="发送[^"]*"[^>]*bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/,
  ];
  let sendEl = await waitForElement(SEND_PATTERNS, 'send-image-btn', 3, 1000);
  if (!sendEl) {
    const fallbackXml = await dumpActivityTopXml('sendImage-send-fallback');
    if (fallbackXml) sendEl = findInXml(fallbackXml, SEND_PATTERNS);
    if (!sendEl) throw new Error('找不到发送按钮，无法发送图片');
  }

  log('sendImage', `Tapping send at (${sendEl.x}, ${sendEl.y})`);
  await tap(sendEl.x, sendEl.y);
  await sleep(3000);

  // Wait for image picker to close and return to chat room
  // Press BACK if still in PictureSelector
  try {
    const raw = await sh('dumpsys activity top', { timeout: 10000, retries: 0 });
    if (raw.includes('PictureSelectorSupporter')) {
      log('sendImage', 'Image picker still visible after send — pressing BACK');
      await sh('input keyevent KEYCODE_BACK');
      await sleep(2000);
    }
  } catch {}

  // Cleanup
  try {
    await sh(`rm -f "${camPath}" "${dcimPath}"`);
    await sh(`am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d "file://${camPath}"`);
  } catch {}
}

// ===================================================================
// SCAN GROUP CHATS from conversation list
// Strategy: tap each conversation item → read chat room title → BACK
// uiautomator can read the title bar (to_user_name) inside chat rooms
// even though it can't read the conversation list text.
// ===================================================================

/**
 * Read chat room title from the currently open chat room via dumpsys.
 * Looks for to_user_name or navView title text in the raw dumpsys output.
 * Returns the group name string or null.
 */
async function readChatRoomTitle() {
  // Try uiautomator first — it can read text attributes in chat rooms
  try {
    const raw = execSync(
      `${JSON.stringify(getAdbPath())} -s ${DEVICE()} shell "uiautomator dump /sdcard/window_dump.xml && cat /sdcard/window_dump.xml"`,
      { timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
    ).toString();

    // Look for to_user_name text (group name in chat room title)
    const titleMatch = raw.match(/resource-id="com\.santiaotalk\.im:id\/to_user_name"[^>]*text="([^"]+)"/);
    if (titleMatch) {
      let name = titleMatch[1].trim();
      // Strip member count suffix like " (98)" or "(98)"
      name = name.replace(/\s*\(\d+\)\s*$/, '').trim();
      return name;
    }

    // Alternative: try reversed attribute order
    const titleMatch2 = raw.match(/text="([^"]+)"[^>]*resource-id="com\.santiaotalk\.im:id\/to_user_name"/);
    if (titleMatch2) {
      let name = titleMatch2[1].trim();
      name = name.replace(/\s*\(\d+\)\s*$/, '').trim();
      return name;
    }
  } catch (e) {
    log('scan', `uiautomator title read failed: ${e.message?.substring(0, 80)}`);
  }

  // Fallback: try dumpsys activity top — look for mText in to_user_name view
  try {
    const raw = await sh('dumpsys activity top', { timeout: 10000, retries: 0 });
    // Find the to_user_name view and its mText
    const lines = raw.split('\n');
    let foundToUserName = false;
    for (const line of lines) {
      if (line.includes('app:id/to_user_name')) {
        foundToUserName = true;
        continue;
      }
      if (foundToUserName) {
        const textMatch = line.match(/mText=([^\s}]+)/);
        if (textMatch) {
          let name = textMatch[1].trim();
          name = name.replace(/\s*\(\d+\)\s*$/, '').trim();
          return name;
        }
        // Only look at the next few lines after to_user_name
        if (line.match(/^\s+\S+\{/)) break; // next view started
      }
    }
  } catch (e) {
    log('scan', `dumpsys title read failed: ${e.message?.substring(0, 80)}`);
  }

  return null;
}

/**
 * Get conversation item bounds from the main screen via dumpsys.
 * The hierarchy is: rv_conversation > SwipeLayout (has real bounds) > cl_item (relative 0,0).
 * We use the SwipeLayout bounds (relative to RecyclerView) + rv's offset + statusBar.
 * Returns array of { top, bottom, centerX, centerY } for each item.
 */
async function getConversationItemBounds() {
  const raw = await sh('dumpsys activity top', { timeout: 15000, retries: 0 });
  const sections = raw.split(/^TASK /m);
  const section = sections.filter(s => s.includes(APP_PACKAGE)).find(s => s.includes('mResumed=true'))
    || sections.filter(s => s.includes(APP_PACKAGE)).pop();
  if (!section) return [];

  const screenH = deviceConfig.config.height;

  // Find statusBarOffset
  let statusBarOffset = 0;
  const rootMatch = section.match(/\s(\d+),(\d+)-(\d+),(\d+)\s+#[\da-fA-F]+\s+app:id\/action_bar_root/);
  if (rootMatch) {
    const rootBottom = parseInt(rootMatch[4]);
    if (rootBottom <= deviceConfig.statusBarThreshold()) {
      statusBarOffset = deviceConfig.config.statusBar;
    }
  }

  // Find rv_conversation bounds (parent container)
  const rvMatch = section.match(/(\d+),(\d+)-(\d+),(\d+)\s+#[\da-fA-F]+\s+app:id\/rv_conversation/);
  if (!rvMatch) {
    log('scan', 'rv_conversation not found in dumpsys');
    return [];
  }
  const rvTop = parseInt(rvMatch[2]);  // e.g. 134
  const rvBottom = parseInt(rvMatch[4]); // e.g. 2608

  // Find SwipeLayout children of rv_conversation — these have the real item positions
  // Pattern: SwipeLayout{hash flags bounds} directly under rv_conversation
  const lines = section.split('\n');
  const items = [];
  let rvIndent = -1;
  let inRv = false;

  for (const line of lines) {
    if (line.includes('app:id/rv_conversation')) {
      const m = line.match(/^(\s+)/);
      if (m) { rvIndent = m[1].length; inRv = true; }
      continue;
    }
    if (!inRv) continue;

    // Check indent — if same or less than rv, we've left
    const indentMatch = line.match(/^(\s+)/);
    if (!indentMatch) continue;
    const indent = indentMatch[1].length;
    if (indent <= rvIndent && line.match(/\S+\{/)) {
      inRv = false;
      continue;
    }

    // Look for SwipeLayout (direct children of rv with actual position bounds)
    if (line.includes('SwipeLayout') || line.includes('SwipeMenu')) {
      const boundsMatch = line.match(/(\d+),(\d+)-(\d+),(\d+)/);
      if (boundsMatch) {
        // These bounds are relative to rv_conversation
        const l = parseInt(boundsMatch[1]);
        const t = parseInt(boundsMatch[2]);
        const r = parseInt(boundsMatch[3]);
        const b = parseInt(boundsMatch[4]);

        // Absolute screen position = rv offset + item relative + statusBar
        const absTop = rvTop + t + statusBarOffset;
        const absBottom = rvTop + b + statusBarOffset;
        const absLeft = l;
        const absRight = r;

        // Skip items that are off-screen
        if (absBottom < statusBarOffset || absTop > screenH) continue;
        // Skip tiny items
        if ((absBottom - absTop) < 50) continue;

        items.push({
          top: absTop,
          bottom: absBottom,
          centerX: Math.round((absLeft + absRight) / 2),
          centerY: Math.round((absTop + absBottom) / 2),
        });
      }
    }
  }

  log('scan', `Found ${items.length} items, rv=[${rvTop},${rvBottom}], offset=${statusBarOffset}, positions: ${items.map(i => i.centerY).join(',')}`);
  return items;
}

/**
 * Check if a conversation item is a group chat (has group icon indicator).
 * In Santiao, group chats show iv_group icon overlay on avatar.
 * Returns true if we're in a group chat room (title contains member count).
 */
async function isGroupChat() {
  try {
    const raw = execSync(
      `${JSON.stringify(getAdbPath())} -s ${DEVICE()} shell "uiautomator dump /sdcard/window_dump.xml && cat /sdcard/window_dump.xml"`,
      { timeout: 10000, maxBuffer: 10 * 1024 * 1024 }
    ).toString();

    // Group chats typically show member count in title: "群名 (98)"
    const titleMatch = raw.match(/resource-id="com\.santiaotalk\.im:id\/to_user_name"[^>]*text="([^"]+)"/);
    if (titleMatch) {
      return /\(\d+\)/.test(titleMatch[1]);
    }
    const titleMatch2 = raw.match(/text="([^"]+)"[^>]*resource-id="com\.santiaotalk\.im:id\/to_user_name"/);
    if (titleMatch2) {
      return /\(\d+\)/.test(titleMatch2[1]);
    }
  } catch {}
  return false; // Can't determine — treat as non-group
}

/**
 * Scan the conversation list for group chats.
 * Taps each conversation item, reads the title, determines if it's a group,
 * then goes back. Scrolls down for more items.
 *
 * @param {function} progressCb - callback(msg) for progress updates
 * @param {number} maxScrolls - max scroll iterations (default 3)
 * @returns {string[]} - array of unique group chat names
 */
async function scanGroups(progressCb = () => {}, maxScrolls = 3) {
  const foundGroups = new Set();
  const scannedNames = new Set(); // all names we've already opened (group or not)
  let totalScanned = 0;

  progressCb('正在启动三条...');
  log('scan', 'Starting group scan');

  // Ensure on main screen
  await launchSantiao('group-scan');
  await ensureOnMainScreen(3);
  await sleep(1000);

  let prevItemCount = -1; // track if scroll revealed new items

  for (let scroll = 0; scroll <= maxScrolls; scroll++) {
    progressCb(`正在扫描会话列表... (第 ${scroll + 1} 轮)`);
    log('scan', `Scan round ${scroll + 1}/${maxScrolls + 1}`);

    const items = await getConversationItemBounds();
    log('scan', `Found ${items.length} conversation items on screen`);

    if (items.length === 0) {
      log('scan', 'No conversation items found — stopping scan');
      break;
    }

    let newNamesThisRound = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];

      progressCb(`正在扫描第 ${totalScanned + 1} 个会话...`);
      log('scan', `Tapping item ${i + 1} at (${item.centerX}, ${item.centerY})`);

      // Tap the conversation item
      await tap(item.centerX, item.centerY);
      await sleep(2000);

      // Check if we entered a chat room
      const inChat = await isInChatScreenFallback();
      if (!inChat) {
        log('scan', `Item ${i + 1}: not a chat room — skipping`);
        await sh('input keyevent KEYCODE_BACK').catch(() => {});
        await sleep(1000);
        totalScanned++;
        continue;
      }

      // Read the title
      const title = await readChatRoomTitle();
      totalScanned++;

      if (title) {
        if (scannedNames.has(title)) {
          // Already scanned this name — means we've scrolled back to seen items
          log('scan', `Item ${i + 1}: "${title}" already scanned — duplicate`);
          await sh('input keyevent KEYCODE_BACK').catch(() => {});
          await sleep(1500);
          const backOnMain = await isOnMainScreenFallback();
          if (!backOnMain) { await ensureOnMainScreen(3); await sleep(1000); }
          continue;
        }
        scannedNames.add(title);
        newNamesThisRound++;

        // Check if it's a group chat (has member count)
        const isGroup = await isGroupChat();
        if (isGroup) {
          foundGroups.add(title);
          log('scan', `Found group: "${title}" (total: ${foundGroups.size})`);
          progressCb(`发现群聊: ${title} (共 ${foundGroups.size} 个)`);
        } else {
          log('scan', `Item ${i + 1}: "${title}" — not a group chat, skipping`);
        }
      } else {
        log('scan', `Item ${i + 1}: could not read title`);
      }

      // Go back to main screen
      await sh('input keyevent KEYCODE_BACK').catch(() => {});
      await sleep(1500);

      // Verify we're back on main screen
      const backOnMain = await isOnMainScreenFallback();
      if (!backOnMain) {
        log('scan', 'Not on main screen after BACK — re-navigating');
        await ensureOnMainScreen(3);
        await sleep(1000);
      }
    }

    // If no new unique names were found, stop scrolling
    if (newNamesThisRound === 0) {
      log('scan', 'No new names found in this round — stopping');
      break;
    }

    // Scroll down for more items (if not the last round)
    if (scroll < maxScrolls) {
      log('scan', 'Scrolling down for more items');
      const sw = deviceConfig.coords('swipeScrollTop');
      // Swipe UP to scroll down (reverse of scroll-to-top)
      await sh(`input swipe ${sw.x} ${sw.yTo} ${sw.x} ${sw.yFrom} 500`);
      await sleep(1500);
    }
  }

  const result = Array.from(foundGroups);
  log('scan', `Scan complete. Found ${result.length} groups: [${result.join(', ')}]`);
  progressCb(`扫描完成，共发现 ${result.length} 个群聊`);

  return result;
}

module.exports = {
  DEVICE, APP_COMPONENT, APP_PACKAGE, HOME_PACKAGE, deviceConfig,
  sleep, sh, tap, ensureAdbIME, inputText,
  getDeviceStatus, getCurrentAppPackage, launchSantiao, captureScreen,
  openGroup, sendText, sendImage,
  ensureOnMainScreen, returnToMainScreen, scanGroups,
};
