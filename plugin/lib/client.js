// 客户端插件：把 DeepSeek Harness 输入框的按键语义改成
//   回车 = 换行；Ctrl+回车 / Cmd+回车 = 发送
// 通过在 document 捕获阶段拦截键盘事件实现，不修改任何既有代码。
window.__ModuleLoader__.load({
  id: "@dsh-desktop/enter-behavior",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    /** 目标是否为 DeepSeek Harness 输入框（composer card 内的 textarea）。 */
    function isComposerInput(target) {
      return (
        !!target &&
        target.tagName === "TEXTAREA" &&
        typeof target.closest === "function" &&
        target.closest("[data-composer-card]") !== null
      );
    }

    /** 在受控 textarea 光标处插入换行，并触发 React onChange。 */
    function insertNewline(el) {
      const start = el.selectionStart ?? el.value.length;
      const end = el.selectionEnd ?? start;
      const next = el.value.slice(0, start) + "\n" + el.value.slice(end);
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value"
      ).set;
      setter.call(el, next);
      const caret = start + 1;
      el.setSelectionRange(caret, caret);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function onKeyDown(e) {
      if (!isComposerInput(e.target)) return;
      if (e.key !== "Enter") return;
      // IME 组合中不拦截
      if (e.isComposing || e.keyCode === 229) return;
      // Shift/Alt+回车 保持默认（换行）
      if (e.shiftKey || e.altKey) return;
      // Ctrl/Cmd+回车 → 交给 composer 的原有逻辑（发送）
      if (e.ctrlKey || e.metaKey) return;
      // 纯回车 → 换行（阻止 composer 把回车当发送）
      e.preventDefault();
      e.stopPropagation();
      insertNewline(e.target);
    }

    function apply(ctx) {
      ctx.effect(() => {
        document.addEventListener("keydown", onKeyDown, true);
        return () => document.removeEventListener("keydown", onKeyDown, true);
      }, "enter-behavior: keydown interceptor");
    }

    exports.apply = apply;
    return module.exports;
  }
});
