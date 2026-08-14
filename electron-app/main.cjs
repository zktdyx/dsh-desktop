// DeepSeek Harness 桌面应用 —— Electron 主进程
// 作用：确保本地 DSH 服务器在跑，然后用原生窗口加载 Web UI。
const { app, BrowserWindow, Tray, Menu, shell, dialog, nativeImage } = require("electron");
const { spawn, spawnSync } = require("child_process");
const { existsSync, readdirSync } = require("fs");
const { join } = require("path");
const os = require("os");
const http = require("http");

const PORT = parseInt(process.env.DSH_PORT, 10) || 3080;
const HOST = "127.0.0.1";
const URL = `http://${HOST}:${PORT}/`;

let mainWindow = null;
let tray = null;
let serverPid = null;

// ── 定位 dsh 安装（与 dsh.mjs 一致的查找顺序） ──────────────────────
function candidateRoots() {
  const roots = [];
  const la = process.env.LOCALAPPDATA || join(os.homedir(), "AppData", "Local");
  const ap = process.env.APPDATA || join(os.homedir(), "AppData", "Roaming");
  roots.push(join(la, "DeepSeekHarnessDesktop", "dsh", "node_modules"));
  const npxCache = join(la, "npm-cache", "_npx");
  if (existsSync(npxCache)) {
    try {
      for (const sub of readdirSync(npxCache)) roots.push(join(npxCache, sub, "node_modules"));
    } catch { /* 忽略 */ }
  }
  roots.push(join(ap, "npm", "node_modules"));
  roots.push(join(la, "npm", "node_modules"));
  try {
    const r = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["root", "-g"], {
      encoding: "utf8", windowsHide: true, timeout: 8000,
    });
    const p = (r.stdout || "").trim();
    if (p) roots.push(p);
  } catch { /* 忽略 */ }
  return [...new Set(roots)].filter(existsSync);
}

function locateDshBin() {
  for (const root of candidateRoots()) {
    const bin = join(root, "@deepseek-ai", "dsh", "lib", "bin.js");
    if (existsSync(bin)) return bin;
  }
  return null;
}

// ── 服务器状态检测 ─────────────────────────────────────────────────
function probeServer() {
  return new Promise((resolve) => {
    const req = http.get({ host: HOST, port: PORT, path: "/", timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode >= 200 && res.statusCode < 400);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

function waitUntilUp(timeoutMs = 90000) {
  return new Promise((resolve) => {
    const start = Date.now();
    (async function poll() {
      if (await probeServer()) return resolve(true);
      if (Date.now() - start > timeoutMs) return resolve(false);
      setTimeout(poll, 400);
    })();
  });
}

// ── 定位系统 Node.js ──────────────────────────────────────────────
// Electron 的 process.execPath 是 Electron 自身，不是 node；dsh 必须用真正的 Node 运行
function locateNodeExe() {
  const candidates = [];
  if (process.platform === "win32") {
    try {
      const r = spawnSync("where", ["node"], { encoding: "utf8", windowsHide: true, timeout: 8000 });
      for (const line of (r.stdout || "").split(/\r?\n/)) {
        const p = line.trim();
        if (p && existsSync(p)) candidates.push(p);
      }
    } catch { /* 忽略 */ }
  }
  candidates.push(
    join(process.env.ProgramFiles || "C:\\Program Files", "nodejs", "node.exe"),
    join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "nodejs", "node.exe"),
    join(process.env.LOCALAPPDATA || "", "Programs", "nodejs", "node.exe")
  );
  for (const p of candidates) {
    if (p && existsSync(p)) return p;
  }
  return "node"; // 兜底：依赖 PATH
}

// ── 启动 / 停止服务器 ─────────────────────────────────────────────
function startServer() {
  const bin = locateDshBin();
  if (!bin) return false;
  const child = spawn(locateNodeExe(), [bin, "web", "--port", String(PORT)], {
    detached: true,
    windowsHide: true,
    stdio: "ignore",
    env: { ...process.env },
  });
  child.once("error", (err) => {
    console.error("启动 dsh 服务失败:", err && err.message ? err.message : err);
  });
  serverPid = child.pid;
  child.unref();
  return true;
}

function stopServer() {
  if (serverPid) {
    try { spawnSync("taskkill", ["/F", "/T", "/PID", String(serverPid)], { windowsHide: true, timeout: 15000 }); } catch { /* 忽略 */ }
    serverPid = null;
  }
}

// ── 窗口 ───────────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    title: "DeepSeek Harness",
    icon: join(__dirname, "build", "icon.ico"),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mainWindow.loadURL(URL);
  // 外链交给系统浏览器，避免在应用内打开新窗口
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => { mainWindow = null; });
}

function showWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

// ── 托盘 ───────────────────────────────────────────────────────────
function createTray() {
  const iconPath = join(__dirname, "build", "icon.ico");
  let image;
  try { image = nativeImage.createFromPath(iconPath); } catch { /* 忽略 */ }
  tray = new Tray(image && !image.isEmpty() ? image : nativeImage.createEmpty());
  tray.setToolTip("DeepSeek Harness");
  const menu = Menu.buildFromTemplate([
    { label: "打开 DeepSeek Harness", click: () => showWindow() },
    { label: "停止服务", click: () => stopServer() },
    { type: "separator" },
    { label: "退出", click: () => { stopServer(); app.quit(); } },
  ]);
  tray.setContextMenu(menu);
  tray.on("double-click", () => showWindow());
}

// ── 主流程 ─────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  if (!(await probeServer())) {
    if (!startServer()) {
      dialog.showErrorBox(
        "DeepSeek Harness",
        "未找到 @deepseek-ai/dsh 安装。\n请先运行 dsh-desktop 启动器（node dsh.mjs start）完成安装。"
      );
      app.quit();
      return;
    }
    const ok = await waitUntilUp();
    if (!ok) {
      dialog.showErrorBox("DeepSeek Harness", "服务启动超时，请检查 dsh 是否可正常运行。");
    }
  }
  createWindow();
  createTray();
});

// 关闭窗口不退出，保留托盘（用托盘「退出」真正退出）
app.on("window-all-closed", () => {
  /* 保持运行，驻留托盘 */
});

app.on("before-quit", () => {
  /* 退出时不停服务器（服务器 detached，独立于本应用） */
});
