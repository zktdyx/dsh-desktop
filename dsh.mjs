#!/usr/bin/env node
/**
 * DeepSeek Harness 桌面启动器（dsh-desktop）
 * ---------------------------------------------------------------
 * 让「npx @deepseek-ai/dsh web」变成一键双击：
 *
 *   node dsh.mjs start     后台隐藏启动 + 自动打开浏览器
 *   node dsh.mjs stop      停止后台服务
 *   node dsh.mjs open      只打开浏览器（服务已在跑时）
 *   node dsh.mjs status    查看运行状态
 *   node dsh.mjs patch     应用「回车换行 / Ctrl+回车发送」补丁
 *   node dsh.mjs unpatch   撤销该补丁
 *   node dsh.mjs install   创建桌面快捷方式
 *
 * 平时请直接双击同目录下的「启动DSH.vbs / 停止DSH.vbs / 打开DSH.vbs」，
 * 它们会以完全无命令行窗口的方式调用本脚本。
 */
import { spawn, spawnSync } from "node:child_process";
import {
  existsSync, readFileSync, writeFileSync, mkdirSync,
  readdirSync, openSync, appendFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

// ── 常量 ────────────────────────────────────────────────────────────
const APP_NAME = "DeepSeekHarnessDesktop";
const DEFAULT_PORT = 3080;
const DEFAULT_HOST = "127.0.0.1";
const __dirname = dirname(fileURLToPath(import.meta.url));

const STATE_DIR = (() => {
  const la = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  return join(la, APP_NAME);
})();
const STATE_FILE = join(STATE_DIR, "state.json");
const CONFIG_FILE = join(STATE_DIR, "config.json");
const LOG_FILE = join(STATE_DIR, "dsh.log");
const ERROR_FILE = join(STATE_DIR, "last-error.txt");

// ── 小工具 ──────────────────────────────────────────────────────────
function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}
function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJson(file, data) {
  ensureDir(dirname(file));
  writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}
function logLine(msg) {
  try {
    ensureDir(STATE_DIR);
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`, "utf8");
  } catch { /* 日志失败不影响主流程 */ }
}
function fail(msg) {
  const text = String(msg);
  try {
    ensureDir(STATE_DIR);
    // 用 UTF-16LE（带 BOM）写入，VBS 的 OpenTextFile(…, -1) 可直接读取中文
    writeFileSync(ERROR_FILE, "\ufeff" + text, "utf16le");
    appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ERROR ${text}\n`, "utf8");
  } catch { /* 忽略 */ }
  process.stderr.write(`[dsh-desktop] ${text}\n`);
  process.exitCode = 1;
}

// ── 配置 ────────────────────────────────────────────────────────────
const DEFAULT_CONFIG = {
  port: DEFAULT_PORT,
  host: DEFAULT_HOST,
  workdir: homedir(),
  browser: "",          // 空 = 系统默认浏览器；可填浏览器可执行文件路径
  extraArgs: [],        // 额外传给 `dsh web` 的参数，例如 ["--trusted-host", "myhost"]
};

function loadConfig() {
  return { ...DEFAULT_CONFIG, ...readJson(CONFIG_FILE, {}) };
}
function saveConfig(cfg) {
  writeJson(CONFIG_FILE, cfg);
  return cfg;
}

// ── 定位 dsh 安装 ───────────────────────────────────────────────────
function candidateNodeModulesRoots() {
  const roots = [];
  const la = process.env.LOCALAPPDATA || join(homedir(), "AppData", "Local");
  const ap = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
  // npx 缓存：%LOCALAPPDATA%\npm-cache\_npx\<hash>\node_modules
  const npxCache = join(la, "npm-cache", "_npx");
  if (existsSync(npxCache)) {
    try {
      for (const sub of readdirSync(npxCache)) {
        roots.push(join(npxCache, sub, "node_modules"));
      }
    } catch { /* 忽略 */ }
  }
  // 全局 npm 常见位置
  roots.push(join(ap, "npm", "node_modules"));
  roots.push(join(la, "npm", "node_modules"));
  // npm root -g 兜底
  try {
    const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["root", "-g"], {
      encoding: "utf8", windowsHide: true, timeout: 8000,
    });
    const p = (r.stdout || "").trim();
    if (p) roots.push(p);
  } catch { /* 忽略 */ }
  return [...new Set(roots)].filter(existsSync);
}

function findDshInstallations() {
  const found = [];
  for (const root of candidateNodeModulesRoots()) {
    const bin = join(root, "@deepseek-ai", "dsh", "lib", "bin.js");
    const clientJs = join(root, "@deepseek-ai", "dsh-client-ui-conversation", "lib", "client.js");
    if (existsSync(bin)) {
      found.push({ root, bin, clientJs: existsSync(clientJs) ? clientJs : null });
    }
  }
  return found;
}

function locateDshBin() {
  return findDshInstallations().map((i) => i.bin);
}

function locateClientJsFiles() {
  return findDshInstallations().map((i) => i.clientJs).filter(Boolean);
}

/** 确保 dsh 已安装（首次运行触发 npx 拉取），返回 bin.js 路径。 */
function ensureDshInstalled() {
  const bins = locateDshBin();
  if (bins.length > 0) return bins[0];
  logLine("未找到 dsh 安装，正在通过 npx 拉取 @deepseek-ai/dsh ...");
  const r = spawnSync("npx", ["--yes", "@deepseek-ai/dsh", "--version"], {
    encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "pipe"], timeout: 180000,
  });
  if (r.error) {
    fail(`无法运行 npx（${r.error.message}）。请确认已安装 Node.js 并加入 PATH。`);
    process.exit(1);
  }
  const again = locateDshBin();
  if (again.length > 0) return again[0];
  fail("npx 已运行但仍未找到 dsh 安装路径。请手动执行一次 `npx @deepseek-ai/dsh web` 后再试。");
  process.exit(1);
}

// ── 补丁：回车换行 / Ctrl+回车发送 ──────────────────────────────────
const PATCH_MARKER = "/* dsh-desktop: enter=newline, ctrl+enter=send */";
const BACKUP_SUFFIX = ".dsh-backup";

function patchClientJsText(source) {
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const trim = (l) => (l || "").trim();

  const enterIdx = lines.findIndex((l) => trim(l) === 'if (e.key !== "Enter") return;');
  if (enterIdx < 0) throw new Error("未找到 Enter 处理锚点（可能 dsh 版本已变化）");
  // 已是补丁后形态：enterIdx+2 处应是 accelerated 声明
  if (trim(lines[enterIdx + 2]) === "const accelerated = e.ctrlKey || e.metaKey;") {
    return { changed: false, source };
  }
  const accelIdx = lines.findIndex((l, i) => i > enterIdx && trim(l) === "const accelerated = e.ctrlKey || e.metaKey;");
  const submitIdx = lines.findIndex((l, i) => i > (accelIdx >= 0 ? accelIdx : enterIdx) && l.includes("keyboard.submit(resolveSubmitMode(running, accelerated"));
  if (accelIdx < 0 || submitIdx < 0) throw new Error("补丁锚点不完整（可能 dsh 版本已变化）");

  const t0 = (lines[enterIdx].match(/^\s*/) || [""])[0];
  const t1 = t0 + "\t";
  const t2 = t0 + "\t\t";
  const replacement = [
    `${t0}if (e.key !== "Enter") return;`,
    `${t0}if (composing) return;`,
    `${t0}const accelerated = e.ctrlKey || e.metaKey;`,
    `${t0}if (!accelerated) {`,
    `${t1}if (keyboard.arbitrate("enter", composing) !== "pass") {`,
    `${t2}e.preventDefault();`,
    `${t1}}`,
    `${t1}return;`,
    `${t0}}`,
    `${t0}if (keyboard.arbitrate("enter", composing) !== "pass") {`,
    `${t1}e.preventDefault();`,
    `${t1}return;`,
    `${t0}}`,
    `${t0}e.preventDefault();`,
    `${t0}if (e.repeat) return;`,
    `${t0}if (locked || machineBusy) return;`,
    `${t0}if (canSteerQueue) {`,
    `${t1}keyboard.steerQueue();`,
    `${t1}return;`,
    `${t0}}`,
    `${t0}keyboard.submit(resolveSubmitMode(running, "accelerated", subagent === null));`,
    `${t0}${PATCH_MARKER}`,
  ];
  const newLines = [...lines.slice(0, enterIdx), ...replacement, ...lines.slice(submitIdx + 1)];
  return { changed: true, source: newLines.join(eol) };
}

function isPatched(file) {
  try {
    return readFileSync(file, "utf8").includes(PATCH_MARKER);
  } catch {
    return false;
  }
}

function applyPatchFile(file) {
  const source = readFileSync(file, "utf8");
  const { changed, source: next } = patchClientJsText(source);
  if (!changed) return { file, changed: false };
  const backup = file + BACKUP_SUFFIX;
  if (!existsSync(backup)) writeFileSync(backup, source, "utf8");
  writeFileSync(file, next, "utf8");
  return { file, changed: true };
}

function unpatchFile(file) {
  const backup = file + BACKUP_SUFFIX;
  if (existsSync(backup)) {
    writeFileSync(file, readFileSync(backup, "utf8"), "utf8");
    return { file, changed: true };
  }
  const source = readFileSync(file, "utf8");
  if (!source.includes(PATCH_MARKER)) return { file, changed: false };
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const lines = source.split(/\r?\n/);
  const trim = (l) => (l || "").trim();
  const enterIdx = lines.findIndex((l) => trim(l) === 'if (e.key !== "Enter") return;');
  if (enterIdx < 0) throw new Error("未找到 Enter 锚点，无法撤销");
  const submitIdx = lines.findIndex((l, i) => i > enterIdx && l.includes('resolveSubmitMode(running, "accelerated"'));
  if (submitIdx < 0) throw new Error("未找到补丁的 submit 锚点，无法撤销");
  const t0 = (lines[enterIdx].match(/^\s*/) || [""])[0];
  const t1 = t0 + "\t";
  const original = [
    `${t0}if (e.key !== "Enter") return;`,
    `${t0}if (composing) return;`,
    `${t0}if (keyboard.arbitrate("enter", composing) !== "pass") {`,
    `${t1}e.preventDefault();`,
    `${t1}return;`,
    `${t0}}`,
    `${t0}e.preventDefault();`,
    `${t0}if (e.repeat) return;`,
    `${t0}if (locked || machineBusy) return;`,
    `${t0}const accelerated = e.ctrlKey || e.metaKey;`,
    `${t0}if (accelerated && canSteerQueue) {`,
    `${t1}keyboard.steerQueue();`,
    `${t1}return;`,
    `${t0}}`,
    `${t0}keyboard.submit(resolveSubmitMode(running, accelerated ? "accelerated" : "enter", subagent === null));`,
  ];
  const newLines = [...lines.slice(0, enterIdx), ...original, ...lines.slice(submitIdx + 1)];
  writeFileSync(file, newLines.join(eol), "utf8");
  return { file, changed: true };
}

function cmdPatch() {
  ensureDshInstalled();
  const files = locateClientJsFiles();
  if (files.length === 0) {
    fail("未找到 dsh-client-ui-conversation 的 client.js，请先运行一次 `npx @deepseek-ai/dsh web`。");
    return;
  }
  let anyChanged = false;
  for (const file of files) {
    const r = applyPatchFile(file);
    console.log(`${r.changed ? "已补丁" : "已是最新"}：${file}`);
    if (r.changed) anyChanged = true;
  }
  console.log(anyChanged
    ? "✅ 补丁完成。重启 dsh 后生效：输入框回车=换行，Ctrl+回车=发送。"
    : "✅ 所有副本都已经是补丁后的状态（无需改动）。");
}

function cmdUnpatch() {
  const files = locateClientJsFiles();
  if (files.length === 0) {
    console.log("未找到可撤销的 dsh 安装。");
    return;
  }
  for (const file of files) {
    if (isPatched(file) || existsSync(file + BACKUP_SUFFIX)) {
      console.log(`${unpatchFile(file).changed ? "已撤销" : "无需撤销"}：${file}`);
    } else {
      console.log(`未打补丁：${file}`);
    }
  }
  console.log("✅ 已还原为官方默认：回车=发送，Shift+回车=换行。");
}

// ── 服务器状态检测 ──────────────────────────────────────────────────
async function httpProbe(url, timeoutMs = 1500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, redirect: "manual" });
    // 2xx/3xx 才算真正就绪（DSH 启动中途会短暂返回 404）
    const ready = res.status >= 200 && res.status < 400;
    return { up: true, ready, status: res.status };
  } catch {
    return { up: false, ready: false };
  } finally {
    clearTimeout(timer);
  }
}

async function waitUntilUp(url, timeoutMs = 120000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const r = await httpProbe(url, 1500);
    if (r.ready) return true;
    await new Promise((res) => setTimeout(res, 300));
  }
  return false;
}

function openBrowser(url, browser) {
  if (browser) {
    const child = spawn(browser, [url], { detached: true, windowsHide: true, stdio: "ignore" });
    child.unref();
    return;
  }
  const child = spawn("cmd", ["/c", "start", "", url], { detached: true, windowsHide: true, stdio: "ignore" });
  child.unref();
}

// ── 启动 / 停止 ─────────────────────────────────────────────────────
async function cmdStart() {
  const cfg = loadConfig();
  const url = `http://${cfg.host}:${cfg.port}/`;

  // 1) 已有人在跑？直接打开浏览器
  const probe = await httpProbe(url, 1500);
  if (probe.ready) {
    logLine(`服务已在 ${url} 运行，直接打开浏览器。`);
    openBrowser(url, cfg.browser);
    console.log(`✅ DeepSeek Harness 已在运行：${url}（已打开浏览器）`);
    return;
  }

  // 2) 确保 dsh 安装 + 打补丁
  const bin = ensureDshInstalled();
  for (const f of locateClientJsFiles()) {
    if (!isPatched(f)) {
      try { applyPatchFile(f); logLine(`已应用输入框补丁：${f}`); }
      catch (e) { logLine(`补丁失败（忽略）：${e.message}`); }
    }
  }

  // 3) 后台隐藏启动
  ensureDir(STATE_DIR);
  const args = [bin, "web", "--port", String(cfg.port), ...(cfg.extraArgs || [])];
  let outFd, errFd;
  try {
    outFd = openSync(LOG_FILE, "a");
    errFd = openSync(LOG_FILE, "a");
  } catch {
    outFd = errFd = "ignore";
  }
  const child = spawn(process.execPath, args, {
    cwd: cfg.workdir || homedir(),
    detached: true,
    windowsHide: true,
    stdio: ["ignore", outFd, errFd],
    env: { ...process.env },
  });
  child.unref();
  const pid = child.pid;
  writeJson(STATE_FILE, {
    pid,
    port: cfg.port,
    host: cfg.host,
    url,
    workdir: cfg.workdir || homedir(),
    startedAt: new Date().toISOString(),
  });
  logLine(`已启动 dsh（PID ${pid}）：${args.join(" ")}`);

  // 4) 等待就绪
  process.stdout.write(`⏳ 正在启动 DeepSeek Harness（PID ${pid}，端口 ${cfg.port}）...\n`);
  const ready = await waitUntilUp(url);
  if (ready) {
    openBrowser(url, cfg.browser);
    console.log(`✅ 已启动：${url}（已在后台隐藏运行，关闭浏览器不影响服务）`);
    logLine(`服务就绪：${url}`);
  } else {
    fail(`服务启动超时。请查看日志：${LOG_FILE}`);
    console.log(`   停止服务可运行：node "${join(__dirname, "dsh.mjs")}" stop`);
  }
}

function findPidOnPort(port) {
  try {
    const r = spawnSync("netstat", ["-ano", "-p", "tcp"], { encoding: "utf8", windowsHide: true, timeout: 8000 });
    for (const line of (r.stdout || "").split(/\r?\n/)) {
      if (!/LISTENING/i.test(line)) continue;
      if (line.includes(`:${port}`)) {
        const m = line.trim().split(/\s+/).pop();
        if (m && /^\d+$/.test(m)) return Number(m);
      }
    }
  } catch { /* 忽略 */ }
  return null;
}

function killPid(pid) {
  try {
    const r = spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], {
      encoding: "utf8", windowsHide: true, timeout: 15000,
    });
    return ((r.stdout || "") + (r.stderr || "")).trim();
  } catch (e) {
    return String(e);
  }
}

function cmdStop() {
  const state = readJson(STATE_FILE, null);
  const cfg = loadConfig();
  let killed = false;

  if (state && state.pid) {
    const out = killPid(state.pid);
    logLine(`停止 PID ${state.pid}：${out}`);
    killed = true;
  }
  const byPort = findPidOnPort(cfg.port);
  if (byPort) {
    const out = killPid(byPort);
    logLine(`按端口 ${cfg.port} 停止 PID ${byPort}：${out}`);
    killed = true;
  }
  try { writeFileSync(STATE_FILE, "{}", "utf8"); } catch { /* 忽略 */ }

  if (killed) console.log(`✅ 已停止 DeepSeek Harness（端口 ${cfg.port}）。`);
  else console.log(`ℹ️ 未发现运行中的 DeepSeek Harness（端口 ${cfg.port}）。`);
}

async function cmdStatus() {
  const cfg = loadConfig();
  const url = `http://${cfg.host}:${cfg.port}/`;
  const state = readJson(STATE_FILE, null);
  const probe = await httpProbe(url, 1500);
  console.log(`服务地址：${url}`);
  console.log(`运行状态：${probe.ready ? "运行中 ✅" : "未运行 ⏹"}`);
  if (state && state.pid) console.log(`记录 PID：${state.pid}（启动于 ${state.startedAt}）`);
  const bins = locateDshBin();
  console.log(`dsh 安装：${bins.length > 0 ? bins[0] : "未找到（首次 start 会自动拉取）"}`);
  const files = locateClientJsFiles();
  const patched = files.filter(isPatched).length;
  console.log(`输入框补丁：${files.length > 0 ? `${patched}/${files.length} 已打补丁` : "未定位到（首次 start 会自动补丁）"}`);
}

function cmdOpen() {
  const cfg = loadConfig();
  const url = `http://${cfg.host}:${cfg.port}/`;
  openBrowser(url, cfg.browser);
  console.log(`✅ 已打开：${url}`);
}

// ── 安装：创建桌面快捷方式 ─────────────────────────────────────────
function psQuote(s) {
  return "'" + String(s).replace(/'/g, "''") + "'";
}

function cmdInstall() {
  ensureDshInstalled();
  for (const f of locateClientJsFiles()) {
    if (!isPatched(f)) { try { applyPatchFile(f); } catch { /* 忽略 */ } }
  }
  const shortcuts = [
    { name: "DeepSeek Harness", vbs: join(__dirname, "DeepSeekHarness.vbs") },
  ];
  const items = shortcuts.map((s) =>
    `@{ name = ${psQuote(s.name)}; vbs = ${psQuote(s.vbs)} }`
  ).join(",\n  ");
  const script = `
$ErrorActionPreference = 'Stop'
$ws = New-Object -ComObject WScript.Shell
$desktop = [Environment]::GetFolderPath('Desktop')
$items = @(
  ${items}
)
foreach ($it in $items) {
  $lnk = Join-Path $desktop ($it.name + '.lnk')
  $sc = $ws.CreateShortcut($lnk)
  $sc.TargetPath = 'wscript.exe'
  $sc.Arguments = '"' + $it.vbs + '"'
  $sc.WorkingDirectory = Split-Path $it.vbs
  $sc.WindowStyle = 7
  $sc.Description = 'DeepSeek Harness'
  $sc.Save()
  Write-Output ('created: ' + $lnk)
}
`;
  const r = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], {
    encoding: "utf8", windowsHide: true, timeout: 30000,
  });
  if (r.status === 0) {
    console.log("✅ 已在桌面创建快捷方式（一个图标）：");
    for (const s of shortcuts) console.log(`   - ${s.name}`);
    console.log("   双击该图标会在系统托盘显示 DeepSeek Harness 图标：");
    console.log("   左键双击 = 打开；右键菜单 = 打开 / 停止服务 / 退出。");
  } else {
    fail(`创建快捷方式失败：${(r.stderr || r.stdout || `exit ${r.status}`).trim()}`);
  }
}

// ── 入口 ────────────────────────────────────────────────────────────
const command = process.argv[2] || "start";
const cmdMap = {
  start: cmdStart,
  stop: cmdStop,
  open: cmdOpen,
  status: cmdStatus,
  patch: cmdPatch,
  unpatch: cmdUnpatch,
  install: cmdInstall,
};

(async () => {
  try {
    const fn = cmdMap[command];
    if (!fn) {
      console.log(`用法：node dsh.mjs <start|stop|open|status|patch|unpatch|install>`);
      process.exit(2);
    }
    await fn();
  } catch (e) {
    fail(e && e.message ? e.message : String(e));
  }
})();
