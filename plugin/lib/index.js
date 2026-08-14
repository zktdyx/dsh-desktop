// 本插件仅作为「bundle patch 层」使用：声明一个宿主插件行，
// 让 DSH 加载器为本包建立 fiber，从而 client-modules 能扫描到
// dsh.client 并服务 /plugins/@dsh-desktop/enter-behavior/client.js。
// 宿主侧不需要做任何事（真正的逻辑在浏览器端 client.js）。

export default {
  name: "enter-behavior",
  apply() {}
};
