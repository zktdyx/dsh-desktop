# DeepSeek Harness 桌面应用（Electron 包装）

用**独立原生窗口**访问 DeepSeek Harness 的 Web UI，功能与浏览器版完全一致（因为就是同一个本地服务）。

## 结构

- `main.cjs`：Electron 主进程——定位/启动后台 DSH 服务、创建窗口、系统托盘
- `build/icon.ico`：黑鲸图标（窗口 + 托盘 + 安装包）
- `package.json`：electron-builder 打包配置（NSIS 安装包）

## 本地运行

```powershell
npm install
npm start
```

## 打包成安装包

```powershell
npm run dist
```

产物在 `release/DeepSeek Harness Setup <版本>.exe`。

## 国内网络注意事项

1. 安装依赖/下载 Electron 二进制建议走镜像（`.npmrc` 已配置 npmmirror）：
   - `electron_mirror` → Electron 二进制
   - `electron_builder_binaries_mirror` → NSIS/winCodeSign 工具
2. npm 11 默认拦截 `electron` 的 postinstall（下载二进制那步），若 `node_modules/electron/dist/electron.exe` 不存在，手动补跑：
   ```powershell
   $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
   node node_modules/electron/install.js
   ```
3. 构建时若报 `Cannot create symbolic link`（winCodeSign 解压失败，因缺少符号链接特权），手动跳过符号链接预解压即可：
   ```powershell
   $7za="node_modules\7zip-bin\win\x64\7za.exe"
   $base="$env:LOCALAPPDATA\electron-builder\Cache\winCodeSign"
   & $7za x -snl- -bd -y (Get-ChildItem "$base\*.7z" | Select-Object -First 1).FullName "-o$base\2.6.0"
   ```

## 说明

- 安装包**未签名**（无代码签名证书），运行时 Windows 会提示 SmartScreen，点「仍要运行」即可。
- 应用本身只是一个窗口外壳；DSH 服务与 Node 环境需已安装（由 dsh-desktop 启动器负责）。
