// dsh-skin-night-watch (潮汐值班) — browser half.
// CSS-only skin: overrides the DSH `--dsw-*` token system and installs an
// ambient deep-sea background. No React tree is mounted, so it cannot disturb
// existing layout; uninstalling restores stock tokens on next load.
window.__ModuleLoader__.load({
  id: 'dsh-skin-night-watch',
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    var CSS = "/* dsh-skin-night-watch · 潮汐值班 — 低照度深海 / 平静叙事 / 徽章式仪表 */\n:root,\n:root[data-dsw-theme=\"dark\"],\n[data-dsw-theme=\"dark\"] {\n  --dsw-alias-bg-base: #050a11;\n  --dsw-alias-bg-layer-1: #08111b;\n  --dsw-alias-bg-layer-2: #0a1420;\n  --dsw-alias-bg-layer-3: #0d1a28;\n  --dsw-alias-bg-overlay: rgba(6, 13, 21, 0.92);\n  --dsw-alias-bg-module-platform: #071019;\n  --dsw-alias-bg-multi-select: #12293d;\n  --dsw-alias-border-l1: #152b40;\n  --dsw-alias-border-l2: #1e3f5c;\n  --dsw-alias-border-l3: #27536f;\n  --dsw-alias-border-l4: #35688a;\n  --dsw-alias-label-primary: #cfe3f2;\n  --dsw-alias-label-primary-foreground: #e8f4ff;\n  --dsw-alias-label-secondary: #9db4c8;\n  --dsw-alias-label-tertiary: #6b8299;\n  --dsw-alias-label-caption: #587089;\n  --dsw-alias-brand-primary: #6ee7e0;\n  --dsw-alias-link: #7fd9ff;\n  --dsw-alias-button-primary-fill: #1d5f6b;\n  --dsw-alias-button-primary-hover: #26727f;\n  --dsw-alias-interactive-bg-hover: #10222f;\n  --dsw-alias-interactive-bg-hover-accent: #14313f;\n  --dsw-alias-interactive-bg-active: #16394a;\n  --dsw-alias-markdown-code-block: #07131d;\n  --dsw-alias-markdown-code-block-banner: #0b1c28;\n  --dsw-alias-markdown-inline-code: #123244;\n  --dsw-alias-markdown-citation: #17465a;\n  --dsw-alias-markdown-tag: #123244;\n  --dsw-alias-scrollbar-bg-l2: #12293d;\n  --dsw-alias-scrollbar-hover-l2: #1d4358;\n  --dsw-alias-settings-card-fill: #08131d;\n  --dsw-alias-settings-card-stroke: #16344a;\n  --dsw-alias-state-business-primary: #6ee7e0;\n  --dsw-alias-state-business-tertiary: #2f6f7a;\n  --dsw-alias-state-warn-primary: #ffb37a;\n  --dsw-alias-turn-trigger-bg: #0a1a26;\n  --dsw-alias-turn-trigger-bg-hover: #0e2634;\n  --dsw-alias-menu-group-header-fill: #0a1a26;\n  --dsw-alias-bg-document-preview: #071019;\n  --dsw-elevation-panel: 0 18px 40px rgba(2, 8, 14, 0.55);\n  --dsw-elevation-prominent: 0 24px 60px rgba(2, 8, 14, 0.62);\n  --dsw-elevation-soft: 0 8px 22px rgba(2, 8, 14, 0.42);\n  --dsw-elevation-stroke: 1px solid #16344a;\n  --dsw-elevation-stroke-color: #16344a;\n  --dsw-hovercard-bg: #0a1622;\n  --dsw-menu-surface-fill: #08131d;\n  --dsw-menu-backdrop-filter: blur(14px) saturate(115%);\n  --dsw-specific-bubble: #0c1f2c;\n  --dsw-specific-input-major: #081521;\n  --dsw-specific-menu: #08131d;\n  --dsw-specific-selector: #0a1a26;\n  --dsw-specific-sidebar-fill: #060f18;\n  --dsw-specific-sidebar-nav-item-active: #0f2a38;\n  --dsw-shadow-lv1: 0 2px 8px rgba(2, 8, 14, 0.45);\n  --dsw-shadow-lv2: 0 8px 20px rgba(2, 8, 14, 0.5);\n  --dsw-shadow-lv3: 0 16px 38px rgba(2, 8, 14, 0.55);\n  --dsw-mask-blur: blur(6px);\n}\n\nhtml[data-dsh-skin=\"night-watch\"] body,\nhtml[data-dsh-skin=\"night-watch\"] #root {\n  background-color: #050a11;\n  background-image:\n    radial-gradient(1200px 620px at 18% -10%, rgba(110, 231, 224, 0.06), transparent 62%),\n    radial-gradient(900px 520px at 88% 8%, rgba(127, 182, 255, 0.05), transparent 58%),\n    linear-gradient(180deg, #050a11 0%, #04080e 100%);\n  background-attachment: fixed;\n}\n\nhtml[data-dsh-skin=\"night-watch\"] ::selection {\n  background: rgba(110, 231, 224, 0.24);\n  color: #e8f4ff;\n}\n\nhtml[data-dsh-skin=\"night-watch\"] * {\n  scrollbar-color: #1d4358 #091520;\n}";
    var STYLE_ID = 'dsh-skin-night-watch-style';
    function apply() {
      if (typeof document === 'undefined') return false;
      var old = document.getElementById(STYLE_ID);
      if (old && old.parentNode) old.parentNode.removeChild(old);
      var el = document.createElement('style');
      el.id = STYLE_ID;
      el.setAttribute('data-dsh-skin', 'night-watch');
      el.textContent = CSS;
      document.head.appendChild(el);
      document.documentElement.setAttribute('data-dsh-skin', 'night-watch');
      return true;
    }
    function uninstall() {
      if (typeof document === 'undefined') return;
      var el = document.getElementById(STYLE_ID);
      if (el && el.parentNode) el.parentNode.removeChild(el);
      document.documentElement.removeAttribute('data-dsh-skin');
    }
    apply();
    exports.apply = apply;
    exports.uninstall = uninstall;
    exports.default = { apply: apply, uninstall: uninstall };
    return module.exports;
  }
});
