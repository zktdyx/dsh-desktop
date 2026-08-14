# DSH Desktop（DeepSeek Harness 桌面启动器）

把 DeepSeek Harness 从「命令行伺候」变成**一个桌面图标 / 一个托盘图标**，并顺带解决输入框的按键习惯。

## 解决什么问题

| 痛点 | 本项目的做法 |
|---|---|
| 每次都要开 PowerShell/CMD 敲 `npx @deepseek-ai/dsh web` | 桌面图标**双击即用** |
| 后台得一直挂着命令行窗口，还怕误关 | 服务在后台**完全无窗口**隐藏运行，关浏览器/关终端都不影响 |
| 三个图标记不住该点哪个 | 合并成**一个托盘图标**，右键菜单：打开 / 停止 / 退出 |
| 输入框回车会直接发送，想换行还得 Shift+回车 | 改为**回车=换行，Ctrl+回车=发送** |

## 目录结构

```
dsh-desktop/
├── dsh.mjs              核心启动器（start/stop/open/status/patch/unpatch/install）
├── tray.ps1             系统托盘图标（一个图标：打开 / 停止 / 退出）
├── DeepSeekHarness.vbs  双击入口（无命令行窗口，拉起托盘图标）
├── dsh.ico              黑鲸图标（托盘 + 桌面快捷方式）
├── make-icon.mjs        从 favicon.svg 重新生成 dsh.ico 的脚本
├── plugin/              独立的 DSH 客户端插件（可选，用于 GitHub/npm 发布）
├── LICENSE
└── README.md
```

## 快速开始

1. 确认已安装 **Node.js**（18+，含 `node` 与 `npx`，并已加入 PATH）。
2. 双击运行一次下面的命令完成初始化（首次会拉取 `@deepseek-ai/dsh`）：

   ```powershell
   node dsh.mjs install
   ```

   它会在**桌面**创建**一个**快捷方式：`DeepSeek Harness`。

3. 以后**双击桌面「DeepSeek Harness」图标**，系统托盘会出现 DeepSeek Harness 图标：
   - **左键双击** = 打开（未启动则先启动再打开）
   - **右键** = 菜单：`打开 DeepSeek Harness` / `停止服务` / `退出`

> 也可以直接双击 `DeepSeekHarness.vbs`，效果相同。

## 命令行用法

```powershell
node dsh.mjs start      后台隐藏启动 + 自动打开浏览器
node dsh.mjs stop       停止后台服务
node dsh.mjs open       只打开浏览器
node dsh.mjs status     查看运行状态（地址 / PID / 补丁情况）
node dsh.mjs patch      应用「回车换行 / Ctrl+回车发送」补丁
node dsh.mjs unpatch    撤销补丁，恢复官方默认
node dsh.mjs install    创建桌面快捷方式
```

## 配置

首次运行会自动在 `%LOCALAPPDATA%\DeepSeekHarnessDesktop\config.json` 生成配置，可按需修改：

```json
{
  "port": 3080,                 // 端口，默认 3080
  "host": "127.0.0.1",          // 监听地址
  "workdir": "C:\\Users\\你",    // 模型的默认工作目录（workspace 根）
  "browser": "",                // 留空 = 系统默认浏览器；否则填浏览器可执行文件路径
  "extraArgs": []               // 额外传给 `dsh web` 的参数
}
```

修改 `workdir` 可让模型默认在指定文件夹里工作。

## 关于「回车换行 / Ctrl+回车发送」

本项目提供**两种等价方案**，任选其一：

### 方案 A：启动器内置补丁（默认，推荐）

`dsh.mjs start` / `install` 会自动对已安装的 `dsh-client-ui-conversation/lib/client.js` 打补丁（幂等、自动备份为 `.dsh-backup`）。升级 dsh 后重新运行一次 `start` 即可自动重新打补丁。

### 方案 B：DSH 插件（适合想发布/复用的用户）

把 `plugin/` 目录发布为 npm 包或本地安装：

```powershell
dsh plugin --profile web add file:<本仓库>/plugin
```

详见 [`plugin/README.md`](plugin/README.md)。

## 常见问题

- **双击后没有任何反应？** 请确认 Node.js 已安装且 `node -v` 可用；首次启动需要联网拉取 dsh，稍等片刻。
- **启动失败怎么看原因？** 看 `%LOCALAPPDATA%\DeepSeekHarnessDesktop\dsh.log`。
- **怎么彻底关掉服务？** 托盘右键 → `停止服务`，或 `node dsh.mjs stop`。
- **端口被占用？** 修改 `config.json` 里的 `port`，再重新启动。
- **升级 dsh 后补丁失效？** 重新运行一次 `node dsh.mjs start`（会自动重新打补丁）。

## 发布到 GitHub

1. 在 GitHub 新建仓库，把本目录（`dsh-desktop/`）推上去。
2. 手动打包并发布：

   ```powershell
   git tag v1.0.0; git push origin v1.0.0
   # 打包：把 dsh.mjs / tray.ps1 / DeepSeekHarness.vbs / README.md / LICENSE 压成 zip
   gh release create v1.0.0 dsh-desktop.zip --generate-notes
   ```

3. 如需发布插件，进入 `plugin/` 执行 `npm publish`，然后用户可 `dsh plugin --profile web add @dsh-desktop/enter-behavior` 安装。

> 想恢复「打 tag 自动发布」？把 `release.yml` 放回 `.github/workflows/` 即可；
> 但推送工作流文件需要 gh 令牌含 `workflow` scope（`gh auth refresh -s workflow`）。

## 许可证

MIT
