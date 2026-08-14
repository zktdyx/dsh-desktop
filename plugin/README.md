# @dsh-desktop/enter-behavior

DeepSeek Harness 输入框体验增强插件：**回车 = 换行，Ctrl+回车 / Cmd+回车 = 发送**。

## 原理

- 这是一个 **dual-face**（双面）DSH 插件：
  - 宿主半 `lib/index.js`：仅声明一个空的 Cordis 插件，让加载器为其建立 fiber。
  - 客户端半 `lib/client.js`：在浏览器端以「捕获阶段键盘拦截」实现新的按键语义。
- `dsh.client.platform = "web"` + `immediately: true` 让它在页面启动时立即加载。
- 不修改任何 DeepSeek Harness 既有代码，升级 dsh 后依然有效。

## 安装

### 方式一：本地安装（无需发布）

```sh
dsh plugin --profile web add file:<本仓库>/plugin
```

### 方式二：发布到 npm 后安装

```sh
cd plugin
npm publish
dsh plugin --profile web add @dsh-desktop/enter-behavior
```

安装后**重启** `dsh web` 即可生效。

## 卸载

```sh
dsh plugin --profile web remove @dsh-desktop/enter-behavior
```

## 注意

- 本插件与 dsh-desktop 启动器内置的「补丁」方案二选一即可（效果相同）。
- 若两个方案同时启用，不会冲突：插件拦截纯回车，补丁修改的是 composer 自身逻辑，
  最终行为一致（回车换行、Ctrl+回车发送）。
