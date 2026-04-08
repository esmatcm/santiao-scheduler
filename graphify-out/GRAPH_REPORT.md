# Graph Report - santiao-scheduler  (2026-04-08)

## Corpus Check
- Large corpus: 2393 files · ~4,471,822 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 745 nodes · 1597 edges · 42 communities detected
- Extraction: 84% EXTRACTED · 16% INFERRED · 0% AMBIGUOUS · INFERRED: 255 edges (avg confidence: 0.52)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `Santiao Scheduler` - 25 edges
2. `assert()` - 20 edges
3. `sh()` - 20 edges
4. `log()` - 14 edges
5. `POST()` - 13 edges
6. `ensureOnMainScreen()` - 12 edges
7. `openGroup()` - 12 edges
8. `scanGroups()` - 12 edges
9. `GET()` - 11 edges
10. `sleep()` - 10 edges

## Surprising Connections (you probably didn't know these)
- `AdbIME (ADB Input Method)` --conceptually_related_to--> `Android SDK Platform Tools (ADB)`  [INFERRED]
  santiao-scheduler/README.md → santiao-scheduler/resources/README.txt
- `lib/adb-path.js (ADB Path Resolver)` --references--> `Android SDK Platform Tools (ADB)`  [INFERRED]
  santiao-scheduler/README.md → santiao-scheduler/resources/README.txt

## Communities

### Community 0 - "Empty"
Cohesion: 0.03
Nodes (0): 

### Community 1 - "V8 Quick Checks"
Cohesion: 0.03
Nodes (7): base(), v8(), QuickIsFalse(), QuickIsNull(), QuickIsString(), QuickIsTrue(), QuickIsUndefined()

### Community 2 - "V8 C++ Bindings"
Cohesion: 0.03
Nodes (7): Clear(), Get(), Release(), FromCString(), GetTypename(), cppgc(), VisitWeakContainer()

### Community 3 - "Empty"
Cohesion: 0.06
Nodes (0): 

### Community 4 - "Santiao Project Structure"
Cohesion: 0.09
Nodes (35): ADB-based Android Automation, AdbIME (ADB Input Method), Atomic Write Storage Strategy, groups.json (Group Chat List), lib/adb.js (ADB Core Operations), lib/adb-path.js (ADB Path Resolver), lib/device-config.js (Device Config & Screen Adaptation), lib/scheduler.js (Cron Task Scheduler) (+27 more)

### Community 5 - "API Test Suite"
Cohesion: 0.16
Nodes (27): assert(), DELETE(), GET(), main(), POST(), request(), runOneRound(), runTest() (+19 more)

### Community 6 - "ADB Device Automation"
Cohesion: 0.26
Nodes (27): captureScreen(), DEVICE(), dumpActivityTopXml(), dumpAndFind(), dumpXml(), ensureAdbIME(), ensureOnMainScreen(), findInXml() (+19 more)

### Community 7 - "V8 Debugger Internals"
Cohesion: 0.11
Nodes (27): bta(), current_frame(), current_thread(), jco(), jh(), jl(), jlh(), job() (+19 more)

### Community 8 - "V8 Memory Management"
Cohesion: 0.08
Nodes (2): Copy(), Persistent()

### Community 9 - "V8 Error Handling"
Cohesion: 0.1
Nodes (3): ERR_COMMON_ERROR(), ERR_FATAL_ERROR(), ERR_GET_RFLAGS()

### Community 10 - "Device Setup & Install"
Cohesion: 0.42
Nodes (15): adbCmd(), adbShell(), checkAdb(), checkDevice(), forceComplete(), getState(), installIme(), installSantiao() (+7 more)

### Community 11 - "Device Detection & Init"
Cohesion: 0.33
Nodes (9): adb(), adbShell(), detectHomePackage(), detectScreenSize(), detectSerial(), detectStatusBar(), init(), log() (+1 more)

### Community 12 - "Task Queue & Execution"
Cohesion: 0.36
Nodes (6): broadcast(), enqueueTask(), executeTask(), executeTaskOnce(), processQueue(), stepUpdate()

### Community 13 - "Storage & Persistence"
Cohesion: 0.43
Nodes (6): addLog(), atomicWrite(), saveGroups(), saveLogs(), saveTasks(), saveTemplates()

### Community 14 - "Chat Room Test Helpers"
Cohesion: 0.62
Nodes (6): isInChatRoom(), log(), logResult(), runTest(), ts(), verifySendSuccess()

### Community 15 - "ADB Path Resolution"
Cohesion: 0.52
Nodes (6): findBundledAdb(), findSystemAdb(), getAdbPath(), log(), resolveAdb(), verifyAdb()

### Community 16 - "Build & Packaging"
Cohesion: 0.6
Nodes (5): buildPlatform(), copyDir(), copyRecursive(), rmrf(), sizeMB()

### Community 17 - "Server Startup"
Cohesion: 0.6
Nodes (5): checkPort(), log(), main(), openBrowser(), waitForServer()

### Community 18 - "V8 Slot/Value"
Cohesion: 0.4
Nodes (2): slot(), value()

### Community 19 - "Empty"
Cohesion: 0.67
Nodes (0): 

### Community 20 - "Empty"
Cohesion: 0.67
Nodes (0): 

### Community 21 - "Empty"
Cohesion: 0.67
Nodes (0): 

### Community 22 - "Empty"
Cohesion: 0.67
Nodes (0): 

### Community 23 - "Group Scan SSE"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Zlib Headers"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Server Entry"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Misc Routes"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Task Routes"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Log Routes"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Template Routes"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "NPM PowerShell"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "NPX PowerShell"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Empty"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Empty"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Empty"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Empty"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Empty"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Empty"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Empty"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Empty"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Empty"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Empty"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **20 isolated node(s):** `Print a v8 heap object`, `Print v8::internal::(Maybe)?(Direct|Indirect)?Handle value`, `Print v8::(Maybe)?Local value`, `Print v8::Local handle value`, `Print the code object at the given pc (default: current pc)` (+15 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `Group Scan SSE`** (2 nodes): `groups.js`, `sendScanProgress()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Zlib Headers`** (2 nodes): `zconf.h`, `zlib.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Server Entry`** (1 nodes): `server.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Misc Routes`** (1 nodes): `misc.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Task Routes`** (1 nodes): `tasks.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Log Routes`** (1 nodes): `logs.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Template Routes`** (1 nodes): `templates.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `NPM PowerShell`** (1 nodes): `npm.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `NPX PowerShell`** (1 nodes): `npx.ps1`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Empty`** (1 nodes): `asn1_mac.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Empty`** (1 nodes): `core_object.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Empty`** (1 nodes): `fips_names.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Empty`** (1 nodes): `core_names.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Empty`** (1 nodes): `buildinf.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Empty`** (1 nodes): `progs.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Empty`** (1 nodes): `der_ecx.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Empty`** (1 nodes): `der_wrap.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Empty`** (1 nodes): `der_dsa.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Empty`** (1 nodes): `der_digests.h`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Are the 19 inferred relationships involving `assert()` (e.g. with `testHealth()` and `testDeviceStatus()`) actually correct?**
  _`assert()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 19 inferred relationships involving `sh()` (e.g. with `DEVICE()` and `sleep()`) actually correct?**
  _`sh()` has 19 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `log()` (e.g. with `launchSantiao()` and `dumpActivityTopXml()`) actually correct?**
  _`log()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Are the 12 inferred relationships involving `POST()` (e.g. with `request()` and `testSetupCheckAdb()`) actually correct?**
  _`POST()` has 12 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Print a v8 heap object`, `Print v8::internal::(Maybe)?(Direct|Indirect)?Handle value`, `Print v8::(Maybe)?Local value` to the rest of the system?**
  _20 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Empty` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._
- **Should `V8 Quick Checks` be split into smaller, more focused modules?**
  _Cohesion score 0.03 - nodes in this community are weakly interconnected._