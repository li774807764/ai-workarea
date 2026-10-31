/* js/uml/uml.js —— UML 渲染器（契约 docs/CONTRACT.md §4）
 * 零依赖 / 零构建 / 无网络 / 不抛异常 / 颜色全部走 CSS 变量 + fallback。
 * 对外只挂一个全局：window.PLM_UML
 */
(function (root) {
  'use strict';

  if (!root) { return; }

  var VERSION = '1.0.0';
  var TYPES = ['usecase', 'class', 'state', 'sequence'];

  /* ---------------- 主题色（契约 §5，一律 var(--x, fallback)） ---------------- */
  var C = {
    line: 'var(--uml-line,#64748b)',
    fill: 'var(--uml-fill,#1e293b)',
    text: 'var(--uml-text,#e2e8f0)',
    dim: 'var(--text-dim,#94a3b8)',
    mute: 'var(--text-mute,#64748b)',
    accent: 'var(--accent,#38bdf8)',
    accent2: 'var(--accent-2,#818cf8)',
    border: 'var(--border,#334155)',
    panel: 'var(--panel,#0f172a)',
    warn: 'var(--warn,#f59e0b)'
  };

  var FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI','PingFang SC','Microsoft YaHei',sans-serif";
  var FS = 13;        /* 正文字号 */
  var FS_S = 11;      /* 小字（标签 / 多重度） */
  var LH = 17;        /* 正文行高 */
  var PAD = 18;       /* 画布内边距 */
  var MAXNODE = 60;   /* 大图保护阈值 */

  /* 布局宽度预算：opts.width 减去两侧内边距后的可用像素。
   * 返回 Infinity 表示调用方没给宽度（无限画布，按内容自然铺开）。
   * 各 builder 用它来折行 / 分带，避免「先铺开再整体缩小」把字压成渣。 */
  function budgetOf(o) {
    if (!o || typeof o !== 'object') { return Infinity; }
    var w = Number(o.width);
    if (!isFinite(w) || w <= 0) { return Infinity; }
    return Math.max(200, w - PAD * 2 - 2);
  }

  /* ---------------- 基础工具 ---------------- */

  function isArr(v) { return Object.prototype.toString.call(v) === '[object Array]'; }
  function arr(v) { return isArr(v) ? v : []; }
  function str(v) { return (v === null || v === undefined) ? '' : String(v); }

  function num(v, d) {
    var x = Number(v);
    return isFinite(x) ? x : (d === undefined ? 0 : d);
  }

  /* 所有对外输出的坐标都过一遍 n()：保证不出现 NaN / Infinity / undefined */
  function n(v) {
    var x = Number(v);
    if (!isFinite(x)) { x = 0; }
    return Math.round(x * 10) / 10;
  }

  function maxOf(list) {
    var m = 0;
    for (var i = 0; i < list.length; i++) { if (list[i] > m) { m = list[i]; } }
    return m;
  }
  function minOf(list) {
    if (!list.length) { return 0; }
    var m = list[0];
    for (var i = 1; i < list.length; i++) { if (list[i] < m) { m = list[i]; } }
    return m;
  }

  function esc(s) {
    s = str(s);
    return s.replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* ---------------- 文本度量（中文 1em、英文/数字 0.55em） ---------------- */

  function isWideCp(cp) {
    if (cp < 0x1100) { return false; }
    return (cp <= 0x115f) ||
      (cp >= 0x2e80 && cp <= 0xa4cf) ||
      (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe6f) ||
      (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6);
  }

  function charW(ch, size) {
    var cp = ch.charCodeAt(0);
    if (isWideCp(cp)) { return size; }
    if (ch === ' ') { return size * 0.32; }
    return size * 0.55;
  }

  function textW(s, size) {
    s = str(s);
    size = num(size, FS);
    var w = 0;
    for (var i = 0; i < s.length; i++) { w += charW(s.charAt(i), size); }
    return w;
  }

  function maxLineW(lines, size) {
    var m = 0;
    for (var i = 0; i < lines.length; i++) {
      var w = textW(lines[i], size);
      if (w > m) { m = w; }
    }
    return m;
  }

  /* 按字符宽度硬折行（同时尊重 \n） */
  function wrapText(text, maxW, size) {
    text = str(text);
    size = num(size, FS);
    var paras = text.split('\n');
    var lines = [];
    for (var p = 0; p < paras.length; p++) {
      var s = paras[p];
      if (s === '') { lines.push(''); continue; }
      if (!(maxW > 0)) { lines.push(s); continue; }
      var cur = '';
      var curW = 0;
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        var w = charW(ch, size);
        if (curW + w > maxW && cur !== '') {
          lines.push(cur);
          cur = '';
          curW = 0;
        }
        cur += ch;
        curW += w;
      }
      if (cur !== '') { lines.push(cur); }
    }
    if (!lines.length) { lines.push(''); }
    return lines;
  }

  /* ---------------- Scene：收集图元 + 包围盒 ---------------- */

  function Scene() {
    this.parts = [];
    this.minX = 0;
    this.minY = 0;
    this.maxX = 0;
    this.maxY = 0;
    this.ok = false;
  }

  Scene.prototype.mark = function (x0, y0, x1, y1) {
    x0 = num(x0); y0 = num(y0); x1 = num(x1); y1 = num(y1);
    if (x1 < x0) { var t = x0; x0 = x1; x1 = t; }
    if (y1 < y0) { var u = y0; y0 = y1; y1 = u; }
    if (!this.ok) {
      this.minX = x0; this.minY = y0; this.maxX = x1; this.maxY = y1; this.ok = true;
      return this;
    }
    if (x0 < this.minX) { this.minX = x0; }
    if (y0 < this.minY) { this.minY = y0; }
    if (x1 > this.maxX) { this.maxX = x1; }
    if (y1 > this.maxY) { this.maxY = y1; }
    return this;
  };

  Scene.prototype.put = function (svg) {
    if (svg) { this.parts.push(svg); }
    return this;
  };

  /* 放图元并登记包围盒 */
  Scene.prototype.add = function (svg, x0, y0, x1, y1) {
    this.put(svg);
    this.mark(x0, y0, x1, y1);
    return this;
  };

  /* ---------------- 图元发射器 ---------------- */

  function opt(o) { return (o && typeof o === 'object') ? o : {}; }

  function paint(o, key) {
    var v = o[key];
    if (v === undefined || v === null || v === '') { return 'none'; }
    return str(v);
  }

  function rect(x, y, w, h, o) {
    o = opt(o);
    w = Math.max(0, num(w));
    h = Math.max(0, num(h));
    var s = '<rect x="' + n(x) + '" y="' + n(y) + '" width="' + n(w) + '" height="' + n(h) + '"';
    if (num(o.rx) > 0) { s += ' rx="' + n(o.rx) + '"'; }
    s += ' fill="' + paint(o, 'fill') + '" stroke="' + paint(o, 'stroke') + '"';
    if (o.sw !== 0) { s += ' stroke-width="' + n(num(o.sw, 1.2)) + '"'; }
    if (o.dash) { s += ' stroke-dasharray="' + esc(o.dash) + '"'; }
    if (o.role) { s += ' data-role="' + esc(o.role) + '"'; }
    if (o.id) { s += ' data-id="' + esc(o.id) + '"'; }
    return s + '/>';
  }

  function circle(cx, cy, r, o) {
    o = opt(o);
    var s = '<circle cx="' + n(cx) + '" cy="' + n(cy) + '" r="' + n(Math.max(0, num(r))) + '" fill="' +
      paint(o, 'fill') + '" stroke="' + paint(o, 'stroke') + '"';
    if (o.sw !== 0) { s += ' stroke-width="' + n(num(o.sw, 1.2)) + '"'; }
    if (o.dash) { s += ' stroke-dasharray="' + esc(o.dash) + '"'; }
    if (o.role) { s += ' data-role="' + esc(o.role) + '"'; }
    if (o.id) { s += ' data-id="' + esc(o.id) + '"'; }
    return s + '/>';
  }

  function ellipse(cx, cy, rx, ry, o) {
    o = opt(o);
    var s = '<ellipse cx="' + n(cx) + '" cy="' + n(cy) + '" rx="' + n(Math.max(0, num(rx))) + '" ry="' +
      n(Math.max(0, num(ry))) + '" fill="' + paint(o, 'fill') + '" stroke="' + paint(o, 'stroke') + '"';
    if (o.sw !== 0) { s += ' stroke-width="' + n(num(o.sw, 1.2)) + '"'; }
    if (o.dash) { s += ' stroke-dasharray="' + esc(o.dash) + '"'; }
    if (o.role) { s += ' data-role="' + esc(o.role) + '"'; }
    if (o.id) { s += ' data-id="' + esc(o.id) + '"'; }
    return s + '/>';
  }

  function seg(x1, y1, x2, y2, o) {
    o = opt(o);
    var s = '<line x1="' + n(x1) + '" y1="' + n(y1) + '" x2="' + n(x2) + '" y2="' + n(y2) + '" stroke="' +
      paint(o, 'stroke') + '"';
    if (o.sw !== 0) { s += ' stroke-width="' + n(num(o.sw, 1.2)) + '"'; }
    if (o.dash) { s += ' stroke-dasharray="' + esc(o.dash) + '"'; }
    if (o.role) { s += ' data-role="' + esc(o.role) + '"'; }
    return s + '/>';
  }

  function polyPath(pts, o) {
    o = opt(o);
    if (!pts || !pts.length) { return ''; }
    var d = 'M' + n(pts[0].x) + ',' + n(pts[0].y);
    for (var i = 1; i < pts.length; i++) { d += ' L' + n(pts[i].x) + ',' + n(pts[i].y); }
    var s = '<path d="' + d + '" fill="none" stroke="' + paint(o, 'stroke') + '"';
    if (o.sw !== 0) { s += ' stroke-width="' + n(num(o.sw, 1.2)) + '"'; }
    if (o.dash) { s += ' stroke-dasharray="' + esc(o.dash) + '"'; }
    s += ' stroke-linejoin="round" stroke-linecap="butt"';
    if (o.mEnd) { s += ' marker-end="url(#' + esc(o.mEnd) + ')"'; }
    if (o.mStart) { s += ' marker-start="url(#' + esc(o.mStart) + ')"'; }
    if (o.role) { s += ' data-role="' + esc(o.role) + '"'; }
    if (o.id) { s += ' data-id="' + esc(o.id) + '"'; }
    return s + '/>';
  }

  function txt(x, y, s, o) {
    o = opt(o);
    var size = num(o.size, FS);
    var a = ' x="' + n(x) + '" y="' + n(y) + '" font-size="' + n(size) + '" fill="' + paint(o, 'fill') + '"' +
      ' text-anchor="' + str(o.anchor || 'middle') + '"';
    if (o.weight) { a += ' font-weight="' + esc(o.weight) + '"'; }
    if (o.style) { a += ' font-style="' + esc(o.style) + '"'; }
    if (o.opacity !== undefined) { a += ' opacity="' + n(num(o.opacity, 1)) + '"'; }
    if (o.role) { a += ' data-role="' + esc(o.role) + '"'; }
    if (o.rotate !== undefined) {
      a += ' transform="rotate(' + n(o.rotate) + ' ' + n(x) + ' ' + n(y) + ')"';
    }
    return '<text' + a + '>' + esc(s) + '</text>';
  }

  /* 多行文本块：top 为首行顶部 */
  function txtBlock(x, top, lines, o) {
    o = opt(o);
    var size = num(o.size, FS);
    var lh = num(o.lh, size * 1.32);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      out.push(txt(x, num(top) + size * 0.8 + i * lh, lines[i], o));
    }
    return out;
  }

  function blockH(linesCount, size, lh) {
    size = num(size, FS);
    lh = num(lh, size * 1.32);
    return Math.max(0, (linesCount - 1)) * lh + size;
  }

  /* 把多行文本的包围盒登记进场景（anchor: middle 或 start） */
  function markText(sc, x, top, lines, size, lh, anchor) {
    size = num(size, FS);
    lh = num(lh, size * 1.32);
    var w = maxLineW(lines, size);
    var h = blockH(lines.length, size, lh);
    var x0 = (anchor === 'start') ? num(x) : num(x) - w / 2;
    sc.mark(x0, num(top), x0 + w, num(top) + h);
  }

  function emptyHint(sc, label) {
    var lines = [str(label || '暂无内容')];
    sc.add(txt(0, 14, lines[0], { anchor: 'start', size: 12, fill: C.dim, role: 'empty' }),
      0, 0, textW(lines[0], 12) + 10, 18);
  }

  /* ---------------- 箭头标记 ---------------- */

  var uidSeq = 0;

  function markers() {
    uidSeq += 1;
    var p = 'plmu' + uidSeq + '_';
    var ids = {
      open: p + 'open',
      filled: p + 'filled',
      tri: p + 'tri',
      dia: p + 'dia',
      diaF: p + 'diaF'
    };
    var d = '<defs>';
    /* 开放箭头（依赖 / 异步消息） */
    d += '<marker id="' + ids.open + '" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12"' +
      ' markerUnits="userSpaceOnUse" orient="auto">' +
      '<path d="M1.4,1.4 L11,6 L1.4,10.6" fill="none" stroke="' + C.line +
      '" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></marker>';
    /* 实心箭头（同步消息） */
    d += '<marker id="' + ids.filled + '" viewBox="0 0 12 12" refX="11" refY="6" markerWidth="12" markerHeight="12"' +
      ' markerUnits="userSpaceOnUse" orient="auto">' +
      '<path d="M1,1 L11,6 L1,11 Z" fill="' + C.accent + '" stroke="' + C.accent +
      '" stroke-width="1" stroke-linejoin="round"/></marker>';
    /* 空心三角（继承 / 实现） */
    d += '<marker id="' + ids.tri + '" viewBox="0 0 14 12" refX="13" refY="6" markerWidth="14" markerHeight="12"' +
      ' markerUnits="userSpaceOnUse" orient="auto">' +
      '<path d="M1,1 L13,6 L1,11 Z" fill="' + C.panel + '" stroke="' + C.line +
      '" stroke-width="1.3" stroke-linejoin="round"/></marker>';
    /* 空心菱形（聚合） */
    d += '<marker id="' + ids.dia + '" viewBox="0 0 14 12" refX="1" refY="6" markerWidth="14" markerHeight="12"' +
      ' markerUnits="userSpaceOnUse" orient="auto">' +
      '<path d="M1,6 L7,1.6 L13,6 L7,10.4 Z" fill="' + C.panel + '" stroke="' + C.line +
      '" stroke-width="1.3" stroke-linejoin="round"/></marker>';
    /* 实心菱形（组合） */
    d += '<marker id="' + ids.diaF + '" viewBox="0 0 14 12" refX="1" refY="6" markerWidth="14" markerHeight="12"' +
      ' markerUnits="userSpaceOnUse" orient="auto">' +
      '<path d="M1,6 L7,1.6 L13,6 L7,10.4 Z" fill="' + C.line + '" stroke="' + C.line +
      '" stroke-width="1" stroke-linejoin="round"/></marker>';
    d += '</defs>';
    return { defs: d, ids: ids };
  }

  /* ---------------- 几何辅助 ---------------- */

  function box(cx, cy, w, h) {
    return { x0: num(cx) - num(w) / 2, y0: num(cy) - num(h) / 2, x1: num(cx) + num(w) / 2, y1: num(cy) + num(h) / 2 };
  }
  function bcx(b) { return (b.x0 + b.x1) / 2; }
  function bcy(b) { return (b.y0 + b.y1) / 2; }

  /* 端口坐标夹进框内（留 inset 余量），避免箭头扎到中心或被挤到框外 */
  function clampAxis(lo, hi, v, inset) {
    var a = lo + inset;
    var z = hi - inset;
    if (z <= a) { return (lo + hi) / 2; }
    return Math.max(a, Math.min(z, v));
  }

  /* 文本包围盒（用于碰撞检测，不必和 SVG 完全一致，略保守） */
  function labelBox(x, baselineY, wText, size, anchor) {
    var left = x;
    if (anchor === 'middle') { left -= wText / 2; } else if (anchor === 'end') { left -= wText; }
    return { x0: left, x1: left + wText, y0: baselineY - size * 0.86, y1: baselineY + size * 0.3 };
  }

  function boxesHit(a, b) {
    if (!a || !b) { return false; }
    return !(a.x1 <= b.x0 + 0.5 || b.x1 <= a.x0 + 0.5 || a.y1 <= b.y0 + 0.5 || b.y1 <= a.y0 + 0.5);
  }

  /* 线段（水平或垂直）是否穿过某框内部（端点贴边不算） */
  function segHitsBox(x0, y0, x1, y1, b) {
    var lox = Math.min(x0, x1);
    var hix = Math.max(x0, x1);
    var loy = Math.min(y0, y1);
    var hiy = Math.max(y0, y1);
    return !(hix <= b.x0 + 1 || lox >= b.x1 - 1 || hiy <= b.y0 + 1 || loy >= b.y1 - 1);
  }

  /* 从椭圆中心指向 (tx,ty) 的边界点 */
  function ellipseEdge(cx, cy, rx, ry, tx, ty) {
    var dx = num(tx) - cx;
    var dy = num(ty) - cy;
    if (!dx && !dy) { return { x: cx + rx, y: cy }; }
    var k = Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    if (!isFinite(k) || k === 0) { return { x: cx + rx, y: cy }; }
    return { x: cx + dx / k, y: cy + dy / k };
  }

  /* 从矩形中心指向 (tx,ty) 的边界点 */
  function rectEdge(b, tx, ty) {
    var cx = bcx(b);
    var cy = bcy(b);
    var dx = num(tx) - cx;
    var dy = num(ty) - cy;
    if (!dx && !dy) { return { x: cx, y: b.y1 }; }
    var ax = dx ? (b.x1 - b.x0) / 2 / Math.abs(dx) : Infinity;
    var ay = dy ? (b.y1 - b.y0) / 2 / Math.abs(dy) : Infinity;
    var t = Math.min(ax, ay);
    return { x: cx + dx * t, y: cy + dy * t };
  }

  function dedupe(pts) {
    var out = [];
    for (var i = 0; i < pts.length; i++) {
      var p = pts[i];
      if (!out.length) { out.push(p); continue; }
      var q = out[out.length - 1];
      if (Math.abs(p.x - q.x) > 0.4 || Math.abs(p.y - q.y) > 0.4) { out.push(p); }
    }
    if (out.length === 1) { out.push({ x: out[0].x, y: out[0].y }); }
    return out;
  }

  /* 折线按弧长取点（用于标签定位） */
  function pointAt(pts, t) {
    if (!pts || !pts.length) { return { x: 0, y: 0, nx: 0, ny: -1 }; }
    if (pts.length === 1) { return { x: pts[0].x, y: pts[0].y, nx: 0, ny: -1 }; }
    var total = 0;
    var lens = [];
    for (var i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i - 1].x;
      var dy = pts[i].y - pts[i - 1].y;
      var l = Math.sqrt(dx * dx + dy * dy);
      lens.push(l);
      total += l;
    }
    if (total <= 0.001) { return { x: pts[0].x, y: pts[0].y, nx: 0, ny: -1 }; }
    var goal = total * Math.max(0, Math.min(1, num(t, 0.5)));
    var acc = 0;
    for (var j = 0; j < lens.length; j++) {
      if (acc + lens[j] >= goal) {
        var k = lens[j] > 0 ? (goal - acc) / lens[j] : 0;
        var x = pts[j].x + (pts[j + 1].x - pts[j].x) * k;
        var y = pts[j].y + (pts[j + 1].y - pts[j].y) * k;
        var ex = lens[j] > 0 ? (pts[j + 1].x - pts[j].x) / lens[j] : 0;
        var ey = lens[j] > 0 ? (pts[j + 1].y - pts[j].y) / lens[j] : 0;
        return { x: x, y: y, nx: -ey, ny: ex };
      }
      acc += lens[j];
    }
    var last = pts[pts.length - 1];
    return { x: last.x, y: last.y, nx: 0, ny: -1 };
  }

  /* =========================================================================
   * 用例图
   * ========================================================================= */

  /* 椭圆尺寸由文字反解：让文字矩形内切于椭圆（再留 6% 余量，中文实测宽度有误差） */
  function ucEllipse(name) {
    var lines = wrapText(name, 152, FS);
    var tw = maxLineW(lines, FS);
    var th = blockH(lines.length, FS, LH);
    var ry = Math.max(26, (th / 2) * 1.7 + 6);
    var ratio = (th / 2) / ry;
    var denom = Math.sqrt(Math.max(0.12, 1 - ratio * ratio));
    var rx = Math.max(72, (tw / 2) / denom * 1.06 + 6);
    return { lines: lines, rx: rx, ry: ry };
  }

  function buildUsecase(spec, o) {
    var sc = new Scene();
    var actors = arr(spec.actors);
    var ucs = arr(spec.usecases);
    var links = arr(spec.links);
    var bTitle = str(spec.boundary);
    var budget = budgetOf(o);
    var i, k, q;

    /* ---- 用例测量：椭圆尺寸由文字反解，保证文字内切不溢出 ---- */
    var list = [];
    for (i = 0; i < ucs.length; i++) {
      var u = ucs[i] || {};
      var uid = str(u.id || ('uc' + i));
      var uname = str(u.name || uid);
      var m = ucEllipse(uname);
      list.push({
        id: uid, name: uname, group: str(u.group), idx: i,
        lines: m.lines, rx: m.rx, ry: m.ry, w: m.rx * 2, h: m.ry * 2
      });
    }

    /* ---- 分组：同组用例连续成「带」，组与组纵向分开，互不重叠 ---- */
    var buckets = [];
    var bucketIdx = {};
    for (i = 0; i < list.length; i++) {
      var g = list[i].group;
      if (g === '') { buckets.push({ g: '', items: [list[i]] }); continue; }
      if (bucketIdx[g] === undefined) {
        bucketIdx[g] = buckets.length;
        buckets.push({ g: g, items: [list[i]] });
      } else {
        buckets[bucketIdx[g]].items.push(list[i]);
      }
    }

    /* ---- 分带排布：组内超宽就折行，组间留带距 ---- */
    var itemGapX = 30;
    var itemGapY = 26;
    var grpPad = 14;
    var bandGap = 22;
    var bandTop = 0;
    var gridW = 0;
    for (i = 0; i < buckets.length; i++) {
      var bk = buckets[i];
      var hasCap = bk.g !== '';
      var bpad = hasCap ? grpPad : 4;
      var capLines = hasCap
        ? wrapText(bk.g, isFinite(budget) ? Math.max(90, budget - bpad * 2 - 8) : 220, FS_S)
        : [];
      var capH = capLines.length ? capLines.length * 14 + 6 : 0;
      var limitW = isFinite(budget) ? Math.max(150, budget - bpad * 2 - 2) : Infinity;
      var rows = [];
      var curRow = [];
      var curW = 0;
      for (k = 0; k < bk.items.length; k++) {
        var it2 = bk.items[k];
        var addW = (curRow.length ? itemGapX : 0) + it2.w;
        if (curRow.length && curW + addW > limitW) {
          rows.push({ items: curRow, w: curW });
          curRow = [];
          curW = 0;
          addW = it2.w;
        }
        curRow.push(it2);
        curW += addW;
      }
      if (curRow.length) { rows.push({ items: curRow, w: curW }); }
      if (!rows.length) { continue; }
      var rowHs = [];
      var bandW = 0;
      for (k = 0; k < rows.length; k++) {
        var rh = 0;
        for (q = 0; q < rows[k].items.length; q++) {
          if (rows[k].items[q].h > rh) { rh = rows[k].items[q].h; }
        }
        rowHs.push(rh);
        if (rows[k].w > bandW) { bandW = rows[k].w; }
      }
      var bodyH = capH;
      for (k = 0; k < rowHs.length; k++) { bodyH += rowHs[k] + (k ? itemGapY : 0); }
      var rectW = bandW + bpad * 2;
      var rectH = bodyH + bpad * 2;
      bk.rect = hasCap ? { x0: 0, y0: bandTop, x1: rectW, y1: bandTop + rectH } : null;
      bk.capLines = capLines;
      var yCur = bandTop + bpad + capH;
      for (k = 0; k < rows.length; k++) {
        var xCur = bpad + (bandW - rows[k].w) / 2;
        for (q = 0; q < rows[k].items.length; q++) {
          var nd = rows[k].items[q];
          nd.cx = xCur + nd.w / 2;
          nd.cy = yCur + rowHs[k] / 2;
          xCur += nd.w + itemGapX;
        }
        yCur += rowHs[k] + itemGapY;
      }
      if (rectW > gridW) { gridW = rectW; }
      bandTop += rectH + bandGap;
    }
    var gridH = Math.max(0, bandTop - bandGap);

    /* ---- 内容包围盒 ---- */
    var contentMinX = 0;
    var contentMinY = 0;
    var contentMaxX = gridW;
    var contentMaxY = gridH;
    for (i = 0; i < list.length; i++) {
      var e0 = list[i];
      if (e0.cx - e0.rx < contentMinX) { contentMinX = e0.cx - e0.rx; }
      if (e0.cy - e0.ry < contentMinY) { contentMinY = e0.cy - e0.ry; }
      if (e0.cx + e0.rx > contentMaxX) { contentMaxX = e0.cx + e0.rx; }
      if (e0.cy + e0.ry > contentMaxY) { contentMaxY = e0.cy + e0.ry; }
    }

    /* ---- Actor 测量 ---- */
    var actorsN = [];
    for (i = 0; i < actors.length; i++) {
      var a = actors[i] || {};
      var aid = str(a.id || ('a' + i));
      var aname = str(a.name || aid);
      var alines = wrapText(aname, 116, FS);
      var aw = Math.max(42, maxLineW(alines, FS) + 12);
      var ah = 46 + blockH(alines.length, FS, LH);
      actorsN.push({ id: aid, name: aname, lines: alines, w: aw, h: ah, idx: i });
    }
    var actorColW = 0;
    for (i = 0; i < actorsN.length; i++) { if (actorsN[i].w > actorColW) { actorColW = actorsN[i].w; } }

    var leftCount = actorsN.length > 1 ? Math.ceil(actorsN.length / 2) : actorsN.length;
    var leftA = actorsN.slice(0, leftCount);
    var rightA = actorsN.slice(leftCount);
    var gutter = 62;                       /* actor 列与系统边界之间的连线走廊 */
    var leftW = leftA.length ? actorColW : 0;
    var gridOx = leftW + (leftW ? gutter : 0);   /* 系统边界整体右移，给 actor 让位 */

    var bp = 20;                           /* 系统边界内边距 */
    var bX0 = contentMinX - bp + gridOx;
    var bX1 = contentMaxX + bp + gridOx;
    var minBW = bTitle ? Math.min(380, textW(bTitle, FS) + 28) : 0;
    if (minBW > bX1 - bX0) {
      var grow = (minBW - (bX1 - bX0)) / 2;
      bX0 -= grow;
      bX1 += grow;
    }
    var bTitleLines = bTitle ? wrapText(bTitle, Math.max(120, (bX1 - bX0) - 24), FS) : [];
    var bTitleH = bTitleLines.length ? blockH(bTitleLines.length, FS, LH) + 12 : 0;
    var bY0 = contentMinY - bp - bTitleH;
    var bY1 = contentMaxY + bp;
    var bw = bX1 - bX0;
    var bh = bY1 - bY0;

    /* ---- actor 竖直分布：对齐系统边界的高度区间，连线走水平 ---- */
    var spreadList = function (list2, xCenter) {
      var cnt = list2.length;
      if (!cnt) { return; }
      var top = bY0 + 12;
      var bot = bY1 - 12;
      var span = Math.max(0, bot - top);
      for (var z = 0; z < cnt; z++) {
        var cy2 = cnt === 1 ? (top + bot) / 2 : top + span * (z + 0.5) / cnt;
        list2[z].cx = xCenter;
        list2[z].cy = cy2;
        list2[z].b = box(xCenter, cy2, list2[z].w, list2[z].h);
      }
    };
    spreadList(leftA, leftW / 2);
    spreadList(rightA, bX1 + gutter + actorColW / 2);

    /* ---- 系统边界 ---- */
    sc.add(rect(bX0, bY0, bw, bh, { rx: 8, fill: 'none', stroke: C.border, dash: '6 4', role: 'boundary' }),
      bX0, bY0, bX1, bY1);
    if (bTitle) {
      var tbW = maxLineW(bTitleLines, FS);
      var tbTop = bY0 + 8;
      var tbSv = txtBlock(bX0 + bw / 2, tbTop, bTitleLines, { size: FS, fill: C.dim, anchor: 'middle', weight: '600' });
      for (k = 0; k < tbSv.length; k++) { sc.put(tbSv[k]); }
      sc.mark(bX0 + bw / 2 - tbW / 2, tbTop, bX0 + bw / 2 + tbW / 2, tbTop + blockH(bTitleLines.length, FS, LH));
    }

    /* ---- 分组装饰：横向小标题 + 虚线框（不旋转、不压 actor） ---- */
    for (i = 0; i < buckets.length; i++) {
      var gr = buckets[i];
      if (!gr.rect) { continue; }
      var gx0 = gridOx + gr.rect.x0;
      var gy0 = gr.rect.y0;
      var gw = gr.rect.x1 - gr.rect.x0;
      var gh = gr.rect.y1 - gr.rect.y0;
      sc.add(rect(gx0, gy0, gw, gh, { rx: 10, fill: 'none', stroke: C.border, dash: '3 4', role: 'group' }),
        gx0, gy0, gx0 + gw, gy0 + gh);
      var capTop = gy0 + 4;
      var cw = maxLineW(gr.capLines, FS_S);
      var csv = txtBlock(gx0 + grpPad - 2, capTop, gr.capLines,
        { size: FS_S, fill: C.mute, anchor: 'start', weight: '600', lh: 14, role: 'group-label' });
      for (k = 0; k < csv.length; k++) { sc.put(csv[k]); }
      sc.mark(gx0 + grpPad - 2, capTop, gx0 + grpPad - 2 + cw, capTop + blockH(gr.capLines.length, FS_S, 14));
    }

    /* ---- 用例椭圆 ---- */
    var byUcId = {};
    for (i = 0; i < list.length; i++) {
      var nd2 = list[i];
      var ecx = gridOx + nd2.cx;
      var ecy = nd2.cy;
      sc.add(ellipse(ecx, ecy, nd2.rx, nd2.ry, { fill: C.fill, stroke: C.line, role: 'usecase', id: nd2.id }),
        ecx - nd2.rx, ecy - nd2.ry, ecx + nd2.rx, ecy + nd2.ry);
      var tTop = ecy - blockH(nd2.lines.length, FS, LH) / 2;
      var sv = txtBlock(ecx, tTop, nd2.lines, { size: FS, fill: C.text, anchor: 'middle' });
      for (k = 0; k < sv.length; k++) { sc.put(sv[k]); }
      markText(sc, ecx, tTop, nd2.lines, FS, LH, 'middle');
      byUcId[nd2.id] = { kind: 'uc', cx: ecx, cy: ecy, rx: nd2.rx, ry: nd2.ry, b: box(ecx, ecy, nd2.rx * 2, nd2.ry * 2) };
    }

    /* ---- Actor 火柴人 ---- */
    var byActorId = {};
    var allActors = leftA.concat(rightA);
    for (i = 0; i < allActors.length; i++) {
      var an = allActors[i];
      var acx = an.cx;
      var acy = an.cy;
      var top2 = acy - an.h / 2;
      var headR = 8;
      var headCy = top2 + headR;
      sc.add(circle(acx, headCy, headR, { fill: 'none', stroke: C.line, role: 'actor-head' }),
        acx - headR, headCy - headR, acx + headR, headCy + headR);
      var bodyTop = headCy + headR;
      var bodyBot = bodyTop + 16;
      sc.put(seg(acx, bodyTop, acx, bodyBot, { stroke: C.line, role: 'actor-body' }));
      sc.put(seg(acx - 11, bodyTop + 6, acx + 11, bodyTop + 6, { stroke: C.line, role: 'actor-arm' }));
      sc.put(seg(acx, bodyBot, acx - 9, bodyBot + 12, { stroke: C.line, role: 'actor-leg' }));
      sc.put(seg(acx, bodyBot, acx + 9, bodyBot + 12, { stroke: C.line, role: 'actor-leg' }));
      var nTop = bodyBot + 12 + 6;
      var nsv = txtBlock(acx, nTop, an.lines, { size: FS, fill: C.text, anchor: 'middle', role: 'actor-name' });
      for (k = 0; k < nsv.length; k++) { sc.put(nsv[k]); }
      markText(sc, acx, nTop, an.lines, FS, LH, 'middle');
      byActorId[an.id] = { kind: 'actor', cx: acx, cy: acy, b: box(acx, acy, an.w, an.h) };
    }

    /* ---- 连线 ---- */
    for (i = 0; i < links.length; i++) {
      var ln = links[i] || {};
      var fid = str(ln.from);
      var tid = str(ln.to);
      var A = byActorId[fid] || byUcId[fid];
      var B = byActorId[tid] || byUcId[tid];
      if (!A || !B || A === B) { continue; }
      var e1;
      var e2;
      if (A.kind === 'uc' && B.kind === 'uc') {
        e1 = ellipseEdge(A.cx, A.cy, A.rx, A.ry, B.cx, B.cy);
        e2 = ellipseEdge(B.cx, B.cy, B.rx, B.ry, A.cx, A.cy);
      } else if (A.kind === 'uc') {
        e1 = ellipseEdge(A.cx, A.cy, A.rx, A.ry, B.cx, B.cy);
        e2 = rectEdge(B.b, A.cx, A.cy);
      } else if (B.kind === 'uc') {
        e1 = rectEdge(A.b, B.cx, B.cy);
        e2 = ellipseEdge(B.cx, B.cy, B.rx, B.ry, A.cx, A.cy);
      } else {
        e1 = rectEdge(A.b, B.cx, B.cy);
        e2 = rectEdge(B.b, A.cx, A.cy);
      }
      var kind = str(ln.kind || 'assoc');
      var lab = '';
      var mo = { stroke: C.line, role: 'link' };
      var mid = { x: (e1.x + e2.x) / 2, y: (e1.y + e2.y) / 2 };
      if (kind === 'include' || kind === 'extend') {
        mo.dash = '6 4';
        mo.mEnd = markers_cur.ids.open;
        lab = '«' + kind + '»';
      } else if (kind === 'general') {
        mo.mEnd = markers_cur.ids.tri;
      }
      var dirx = e2.x - e1.x;
      var diry = e2.y - e1.y;
      var dl = Math.sqrt(dirx * dirx + diry * diry) || 1;
      var nx = -diry / dl;
      var ny = dirx / dl;
      if (lab) {
        var lw = textW(lab, FS_S);
        var lx2 = mid.x + nx * 14;
        var ly2 = mid.y + ny * 14;
        if (ny > 0) { ly2 += 4; }
        sc.put(txt(lx2, ly2, lab, { size: FS_S, fill: C.accent2, anchor: 'middle', role: 'rel-label' }));
        sc.mark(lx2 - lw / 2, ly2 - FS_S, lx2 + lw / 2, ly2 + 4);
      }
      sc.put(polyPath([e1, e2], mo));
      sc.mark(e1.x, e1.y, e2.x, e2.y);
    }

    if (!list.length && !actorsN.length) { emptyHint(sc, '用例图：暂无内容'); }

    return { sc: sc, simplified: false };
  }

  /* =========================================================================
   * 类图
   * ========================================================================= */

  function visOf(v) {
    var s = str(v).trim();
    if (s === '+' || s === '-' || s === '#') { return s; }
    return '';
  }

  function attrText(a) {
    if (typeof a === 'string') { return a; }
    a = a || {};
    var v = visOf(a.visibility);
    var nm = str(a.name);
    var tp = str(a.type);
    return (v ? v + ' ' : '') + nm + (tp ? ': ' + tp : '');
  }

  function methodText(m) {
    if (typeof m === 'string') { return m; }
    m = m || {};
    var v = visOf(m.visibility);
    var nm = str(m.name);
    var pr = m.params;
    var ps = isArr(pr) ? pr.map(function (x) { return str(x); }).join(', ') : str(pr);
    var ret = str(m.ret);
    return (v ? v + ' ' : '') + nm + '(' + ps + ')' + (ret ? ': ' + ret : '');
  }

  function buildClass(spec, o) {
    var sc = new Scene();
    var list = arr(spec.classes);
    var rels = arr(spec.relations);
    var i, k;

    var nodes = [];
    var byId = {};
    for (i = 0; i < list.length; i++) {
      var c = list[i] || {};
      var cid = str(c.id || ('cls' + i));
      var cname = str(c.name || cid);
      var stereo = c.stereotype ? '«' + str(c.stereotype) + '»' : '';
      var nameLines = wrapText(cname, 168, FS);
      var attrs = [];
      var aRaw = arr(c.attrs);
      for (k = 0; k < aRaw.length; k++) {
        var at = wrapText(attrText(aRaw[k]), 190, FS);
        for (var q = 0; q < at.length; q++) { attrs.push(at[q]); }
      }
      var meths = [];
      var mRaw = arr(c.methods);
      for (k = 0; k < mRaw.length; k++) {
        var mt = wrapText(methodText(mRaw[k]), 190, FS);
        for (var q2 = 0; q2 < mt.length; q2++) { meths.push(mt[q2]); }
      }
      var noteLines = c.note ? wrapText(str(c.note), 190, FS_S) : [];

      var nameW = maxLineW(nameLines, FS);
      var stereoW = stereo ? textW(stereo, FS_S) : 0;
      var attrW = maxLineW(attrs, FS);
      var methW = maxLineW(meths, FS);
      var noteW = maxLineW(noteLines, FS_S);
      var padX = 12;
      var w = Math.max(140, Math.max(Math.max(nameW, stereoW), Math.max(attrW, methW)) + padX * 2);
      /* 名称栏：上留 8、构造型一行、正文块，再留 6 给分隔线，避免基线压在分隔线上 */
      var nameH = 16 + (stereo ? 2 : 0) + blockH(nameLines.length, FS, LH) + 6;
      var attrsH = attrs.length ? attrs.length * 16 + 10 : 12;
      var methsH = meths.length ? meths.length * 16 + 10 : 12;
      var noteH = noteLines.length ? noteLines.length * 14 + 8 : 0;
      var bodyH = nameH + attrsH + methsH + 2;
      var h = bodyH + noteH;

      var nd = {
        id: cid, name: cname, stereo: stereo, nameLines: nameLines, attrs: attrs, meths: meths,
        noteLines: noteLines, nameH: nameH, attrsH: attrsH, methsH: methsH, noteH: noteH,
        bodyH: bodyH, w: w, h: h, noteW: noteW, idx: i, level: 0
      };
      nodes.push(nd);
      if (!byId[cid]) { byId[cid] = nd; }
    }

    /* ---- 连线表（先过滤非法引用） ---- */
    var edges = [];
    for (i = 0; i < rels.length; i++) {
      var r = rels[i] || {};
      var fid = str(r.from);
      var tid = str(r.to);
      if (!fid || !tid || !byId[fid] || !byId[tid]) { continue; }
      edges.push({
        from: fid, to: tid, kind: str(r.kind || 'assoc'), label: str(r.label),
        fromMult: str(r.fromMult), toMult: str(r.toMult),
        fromRole: str(r.fromRole), toRole: str(r.toRole), idx: i
      });
    }

    /* ---- 层级：继承 / 实现 决定上下关系（from 是子类，to 是父类） ---- */
    var hier = [];
    for (i = 0; i < edges.length; i++) {
      if (edges[i].kind === 'inherit' || edges[i].kind === 'realize') { hier.push(edges[i]); }
    }
    /* 去掉成环的边，避免层级无限增长 */
    var color = {};
    for (i = 0; i < nodes.length; i++) { color[nodes[i].id] = 0; }
    var childMap = {};
    for (i = 0; i < hier.length; i++) {
      if (!childMap[hier[i].to]) { childMap[hier[i].to] = []; }
      childMap[hier[i].to].push(hier[i]);
    }
    var keep = [];
    var visit = function (id, stack) {
      if (color[id] === 1) { return; }
      if (color[id] === 2) { return; }
      color[id] = 1;
      var kids = childMap[id] || [];
      for (var zi = 0; zi < kids.length; zi++) {
        var e2 = kids[zi];
        if (color[e2.from] === 1) { continue; }   /* 成环：丢弃该边 */
        keep.push(e2);
        visit(e2.from, stack);
      }
      color[id] = 2;
    };
    for (i = 0; i < nodes.length; i++) {
      if (color[nodes[i].id] === 0) { visit(nodes[i].id, null); }
    }

    var levels = {};
    for (i = 0; i < nodes.length; i++) { levels[nodes[i].id] = 0; }
    for (var it = 0; it < nodes.length + 1; it++) {
      var changed = false;
      for (i = 0; i < keep.length; i++) {
        var fromL = levels[keep[i].from] || 0;
        var toL = levels[keep[i].to] || 0;
        if (fromL < toL + 1) { levels[keep[i].from] = toL + 1; changed = true; }
      }
      if (!changed) { break; }
    }
    var maxLv = 0;
    for (i = 0; i < nodes.length; i++) {
      nodes[i].level = levels[nodes[i].id] || 0;
      if (nodes[i].level > maxLv) { maxLv = nodes[i].level; }
    }

    /* ---- 分层排布：同一层超宽就折成多行，保证内容不越出请求宽度 ---- */
    var rows2 = [];
    for (i = 0; i <= maxLv; i++) { rows2.push([]); }
    for (i = 0; i < nodes.length; i++) { rows2[nodes[i].level].push(nodes[i]); }

    var hGap = 52;
    var vGap = 74;      /* 层与层之间 */
    var rowGap = 40;    /* 同层折行之间 */
    var budget = budgetOf(o);
    var lines = [];     /* { nodes, w, h } */
    for (i = 0; i < rows2.length; i++) {
      var cur = [];
      var curW = 0;
      var curH = 0;
      for (k = 0; k < rows2[i].length; k++) {
        var nd0 = rows2[i][k];
        var addW = (cur.length ? hGap : 0) + nd0.w;
        if (cur.length && curW + addW > budget) {
          lines.push({ nodes: cur, w: curW, h: curH, level: i });
          cur = [];
          curW = 0;
          curH = 0;
          addW = nd0.w;
        }
        cur.push(nd0);
        curW += addW;
        if (nd0.h > curH) { curH = nd0.h; }
      }
      if (cur.length) { lines.push({ nodes: cur, w: curW, h: curH, level: i }); }
    }

    var totalW = 0;
    for (i = 0; i < lines.length; i++) { if (lines[i].w > totalW) { totalW = lines[i].w; } }

    /* ---- 巷道容量：统计跨行边，按行距自适应加宽 + 给每条边分配水平轨道 ---- */
    var lineOf = {};
    for (i = 0; i < lines.length; i++) {
      for (k = 0; k < lines[i].nodes.length; k++) { lineOf[lines[i].nodes[k].id] = i; }
    }
    var gapCount = [];
    for (i = 0; i < lines.length; i++) { gapCount.push(0); }
    var edgeSpan = [];
    for (i = 0; i < edges.length; i++) {
      var la0 = lineOf[edges[i].from];
      var lb0 = lineOf[edges[i].to];
      var sag = [];
      if (la0 !== undefined && lb0 !== undefined && la0 !== lb0) {
        var lo0 = Math.min(la0, lb0);
        var hi0 = Math.max(la0, lb0);
        for (k = lo0; k < hi0; k++) { gapCount[k] += 1; sag.push(k); }
      }
      edgeSpan.push(sag);
    }

    var yCur = 0;
    var prevLevel = lines.length ? lines[0].level : 0;
    for (i = 0; i < lines.length; i++) {
      if (i) {
        /* 行距 = 基础值 + 该间隙上跨行连线数 × 12（上限 40），避免标签在窄带里叠字 */
        var baseGap = (lines[i].level === prevLevel ? rowGap : vGap);
        yCur += baseGap + Math.min((gapCount[i - 1] || 0) * 12, 40);
      }
      prevLevel = lines[i].level;
      var xCur = Math.max(0, (totalW - lines[i].w) / 2);
      for (k = 0; k < lines[i].nodes.length; k++) {
        var node2 = lines[i].nodes[k];
        node2.cx = xCur + node2.w / 2;
        node2.cy = yCur + lines[i].h / 2;
        node2.b = box(node2.cx, node2.cy, node2.w, node2.h);
        node2.rowIdx = i;
        xCur += node2.w + hGap;
      }
      yCur += lines[i].h;
    }

    /* ---- 画类框 ---- */
    for (i = 0; i < nodes.length; i++) {
      var nn = nodes[i];
      var x0 = nn.b.x0;
      var y0 = nn.b.y0;
      var bodyH = nn.bodyH;
      sc.add(rect(x0, y0, nn.w, bodyH, { rx: 3, fill: C.fill, stroke: C.line, sw: 1.3, role: 'class', id: nn.id }),
        x0, y0, x0 + nn.w, y0 + bodyH);
      /* 名称栏 */
      var tv = y0 + 8;
      if (nn.stereo) {
        sc.put(txt(x0 + nn.w / 2, tv + FS_S * 0.8, nn.stereo, { size: FS_S, fill: C.dim, anchor: 'middle', style: 'italic' }));
        sc.mark(x0 + nn.w / 2 - textW(nn.stereo, FS_S) / 2, tv, x0 + nn.w / 2 + textW(nn.stereo, FS_S) / 2, tv + FS_S);
        tv += FS_S + 2;
      }
      var nsv2 = txtBlock(x0 + nn.w / 2, tv, nn.nameLines, { size: FS, fill: C.text, anchor: 'middle', weight: '600' });
      for (k = 0; k < nsv2.length; k++) { sc.put(nsv2[k]); }
      /* 分隔线 */
      var y1 = y0 + nn.nameH;
      sc.put(seg(x0, y1, x0 + nn.w, y1, { stroke: C.line, sw: 1.1 }));
      var y2 = y1 + nn.attrsH;
      sc.put(seg(x0, y2, x0 + nn.w, y2, { stroke: C.line, sw: 1.1 }));
      /* 属性 */
      var atY = y1 + 5;
      for (k = 0; k < nn.attrs.length; k++) {
        sc.put(txt(x0 + 12, atY + k * 16 + FS * 0.78, nn.attrs[k], { size: FS, fill: C.text, anchor: 'start' }));
      }
      /* 方法 */
      var mtY = y2 + 5;
      for (k = 0; k < nn.meths.length; k++) {
        sc.put(txt(x0 + 12, mtY + k * 16 + FS * 0.78, nn.meths[k], { size: FS, fill: C.text, anchor: 'start' }));
      }
      /* 备注 */
      if (nn.noteLines.length) {
        var noteTop = y0 + bodyH + 4;
        var nsv = txtBlock(x0, noteTop, nn.noteLines, { size: FS_S, fill: C.mute, anchor: 'start', style: 'italic', role: 'note' });
        for (k = 0; k < nsv.length; k++) { sc.put(nsv[k]); }
      }
    }

    /* ---- 关系线（正交折线） ---- */
    var nodeBoxes = [];
    for (i = 0; i < nodes.length; i++) { nodeBoxes.push(nodes[i].b); }

    /* 折线是否穿过「无关」节点框（端点所属的两个框豁免） */
    var pathClear = function (pts, ba, bb) {
      for (var pi = 1; pi < pts.length; pi++) {
        for (var bi = 0; bi < nodeBoxes.length; bi++) {
          var bx = nodeBoxes[bi];
          if (bx === ba || bx === bb) { continue; }
          if (segHitsBox(pts[pi - 1].x, pts[pi - 1].y, pts[pi].x, pts[pi].y, bx)) { return false; }
        }
      }
      return true;
    };

    function ortho(ba, bb, laneFrac, useLane) {
      var aY = bcy(ba);
      var bY = bcy(bb);
      var aX = bcx(ba);
      var bX = bcx(bb);
      var vOverlap = !(ba.y1 <= bb.y0 || bb.y1 <= ba.y0);
      var hOverlap = !(ba.x1 <= bb.x0 || bb.x1 <= ba.x0);
      var tries = [];
      if (!vOverlap) {
        var loY = bY > aY ? ba.y1 : bb.y1;
        var hiY = bY > aY ? bb.y0 : ba.y0;
        var midY = (loY + hiY) / 2;
        /* 在层间走廊里试几个 y，挑不穿过其它节点的 */
        var span = Math.max(0, hiY - loY);
        /* 先试「专属轨道」：跨行边按序号均分走廊，同巷道的多条线各走各的水平线 */
        if (useLane && span > 4) {
          var ly = loY + Math.max(0.12, Math.min(0.88, laneFrac)) * span;
          tries.push(dedupe([
            { x: aX, y: bY > aY ? ba.y1 : ba.y0 },
            { x: aX, y: ly },
            { x: bX, y: ly },
            { x: bX, y: bY > aY ? bb.y0 : bb.y1 }
          ]));
        }
        var offs = [0, -0.3, 0.3, -0.45, 0.45];
        for (var oi = 0; oi < offs.length; oi++) {
          var yy = midY + offs[oi] * span;
          tries.push(dedupe([
            { x: aX, y: bY > aY ? ba.y1 : ba.y0 },
            { x: aX, y: yy },
            { x: bX, y: yy },
            { x: bX, y: bY > aY ? bb.y0 : bb.y1 }
          ]));
        }
      } else if (!hOverlap) {
        var loX = bX > aX ? ba.x1 : bb.x1;
        var hiX = bX > aX ? bb.x0 : ba.x0;
        var midX = (loX + hiX) / 2;
        var spanX = Math.max(0, hiX - loX);
        if (useLane && spanX > 4) {
          var lx = loX + Math.max(0.12, Math.min(0.88, laneFrac)) * spanX;
          tries.push(dedupe([
            { x: bX > aX ? ba.x1 : ba.x0, y: aY },
            { x: lx, y: aY },
            { x: lx, y: bY },
            { x: bX > aX ? bb.x0 : bb.x1, y: bY }
          ]));
        }
        var offs2 = [0, -0.3, 0.3, -0.45, 0.45];
        for (var oi2 = 0; oi2 < offs2.length; oi2++) {
          var xx = midX + offs2[oi2] * spanX;
          tries.push(dedupe([
            { x: bX > aX ? ba.x1 : ba.x0, y: aY },
            { x: xx, y: aY },
            { x: xx, y: bY },
            { x: bX > aX ? bb.x0 : bb.x1, y: bY }
          ]));
        }
      } else {
        /* 两轴都重叠：从外侧绕，左右各试一次再上下 */
        var toRight = (ba.x0 + ba.x1) <= (bb.x0 + bb.x1);
        var outX = toRight ? Math.max(ba.x1, bb.x1) + 30 : Math.min(ba.x0, bb.x0) - 30;
        tries.push(dedupe([
          { x: toRight ? ba.x1 : ba.x0, y: aY },
          { x: outX, y: aY },
          { x: outX, y: bY },
          { x: toRight ? bb.x1 : bb.x0, y: bY }
        ]));
        var outY = Math.max(ba.y1, bb.y1) + 26;
        tries.push(dedupe([
          { x: aX, y: ba.y1 },
          { x: aX, y: outY },
          { x: bX, y: outY },
          { x: bX, y: bb.y1 }
        ]));
      }
      for (var ti = 0; ti < tries.length; ti++) {
        if (pathClear(tries[ti], ba, bb)) { return tries[ti]; }
      }
      return tries[0];
    }

    /* 标签落点：候选里挑第一个不压节点框、不压已放标签、不压在连线上的 */
    var usedLabels = [];
    var segList = [];      /* 全部关系线折线段，标签要避开（标签不能压线） */
    var spotFree = function (x, y, wText) {
      var lb = labelBox(x, y, wText, FS_S, 'middle');
      for (var bi3 = 0; bi3 < nodeBoxes.length; bi3++) {
        if (boxesHit(lb, nodeBoxes[bi3])) { return false; }
      }
      for (var li = 0; li < usedLabels.length; li++) {
        if (boxesHit(lb, usedLabels[li])) { return false; }
      }
      /* 线段用外扩 2px 的框判定，留出视觉间隙（标签不贴线） */
      var lb2 = { x0: lb.x0 - 2, x1: lb.x1 + 2, y0: lb.y0 - 2, y1: lb.y1 + 2 };
      for (var si = 0; si < segList.length; si++) {
        if (segHitsBox(segList[si].x0, segList[si].y0, segList[si].x1, segList[si].y1, lb2)) { return false; }
      }
      return true;
    };
    var labelBoxOf = function (x, y, wText) { return labelBox(x, y, wText, FS_S, 'middle'); };
    var pickLabel = function (cands, wText) {
      var ci;
      for (ci = 0; ci < cands.length; ci++) {
        if (spotFree(cands[ci].x, cands[ci].y, wText)) { return cands[ci]; }
      }
      /* 兜底：以最后一个候选为圆心，按半径递增扫描 12 个方向 */
      var cx = 0;
      var cy = 0;
      for (ci = 0; ci < cands.length; ci++) { cx += cands[ci].x; cy += cands[ci].y; }
      cx = cands.length ? cx / cands.length : 0;
      cy = cands.length ? cy / cands.length : 0;
      for (var rr = 10; rr <= 160; rr += 8) {
        for (var ai = 0; ai < 12; ai++) {
          var ang = (ai / 12) * Math.PI * 2;
          var tx = cx + Math.cos(ang) * rr;
          var ty = cy + Math.sin(ang) * rr;
          if (spotFree(tx, ty, wText)) { return { x: tx, y: ty }; }
        }
      }
      return cands.length ? cands[0] : { x: 0, y: 0 };
    };

    var lanesSeq = {};
    var lanesTot = {};
    for (i = 0; i < gapCount.length; i++) { lanesSeq[i] = 0; lanesTot[i] = gapCount[i] || 1; }

    var routed = [];       /* 第一遍只布线画线，标签留到第二遍统一落点 */
    for (i = 0; i < edges.length; i++) {
      var e = edges[i];
      var na = byId[e.from];
      var nb = byId[e.to];
      var pts;
      var mo2 = { stroke: C.line, sw: 1.2 };
      var isSelf = (na === nb);
      var sag2 = edgeSpan[i] || [];
      var laneKey = sag2.length ? sag2[0] : -1;
      var laneFrac = 0.5;
      if (laneKey >= 0) {
        /* 同一条间隙上的多条跨行边按序号均分走廊，各自走一条水平轨道 */
        var laneNo = lanesSeq[laneKey];
        lanesSeq[laneKey] = laneNo + 1;
        laneFrac = (laneNo + 1) / (lanesTot[laneKey] + 1);
      }
      if (isSelf) {
        var bxx = na.b.x1;
        var cyy = bcy(na.b);
        var lw2 = 26;
        pts = dedupe([
          { x: bxx, y: cyy - 10 },
          { x: bxx + lw2, y: cyy - 10 },
          { x: bxx + lw2, y: cyy + 10 },
          { x: bxx, y: cyy + 10 }
        ]);
      } else {
        pts = ortho(na.b, nb.b, laneFrac, laneKey >= 0);
      }

      if (e.kind === 'inherit') { mo2.mEnd = markers_cur.ids.tri; }
      else if (e.kind === 'realize') { mo2.mEnd = markers_cur.ids.tri; mo2.dash = '7 5'; }
      else if (e.kind === 'agg') { mo2.mStart = markers_cur.ids.dia; }
      else if (e.kind === 'comp') { mo2.mStart = markers_cur.ids.diaF; }
      else if (e.kind === 'depend') { mo2.mEnd = markers_cur.ids.open; mo2.dash = '6 4'; }

      sc.put(polyPath(pts, mo2));
      for (k = 0; k < pts.length; k++) {
        sc.mark(pts[k].x - 1, pts[k].y - 1, pts[k].x + 1, pts[k].y + 1);
      }
      routed.push({ e: e, pts: pts });
    }

    /* 全部折线段登记：标签要避开所有连线，不能压线 */
    for (i = 0; i < routed.length; i++) {
      for (k = 1; k < routed[i].pts.length; k++) {
        segList.push({
          x0: routed[i].pts[k - 1].x, y0: routed[i].pts[k - 1].y,
          x1: routed[i].pts[k].x, y1: routed[i].pts[k].y
        });
      }
    }

    /* ---- 第二遍：连线标签（此时已知全部线段与类框，逐条找空位） ---- */
    for (i = 0; i < routed.length; i++) {
      var er = routed[i].e;
      var pts3 = routed[i].pts;

      /* 主标签：跨行边贴自己的轨道起点（各边按出口 x 自然散开），同行边落在水平段中点上方；
         被占则沿切线交错 / 沿法向远离 */
      if (er.label) {
        var lw3 = textW(er.label, FS_S);
        var cands = [];
        var crossRow = pts3.length >= 4 && Math.abs(pts3[pts3.length - 1].y - pts3[0].y) > 60;
        if (crossRow) {
          var b1 = pts3[1];
          var dir = (pts3[2] && pts3[2].x < b1.x) ? -1 : 1;
          for (var ci = 0; ci < 10; ci++) {
            var offx = b1.x + dir * (14 + ci * 22 + lw3 / 2);
            cands.push({ x: offx, y: b1.y - 7 });
            cands.push({ x: offx, y: b1.y + 15 });
          }
        }
        var mid2 = pointAt(pts3, 0.5);
        var xShifts = [0, -30, 30, -58, 58, -86, 86];
        for (var xi3 = 0; xi3 < xShifts.length; xi3++) {
          for (var sgi = 1; sgi >= -1; sgi -= 2) {
            for (var mul = 11; mul <= 52; mul += 5) {
              cands.push({
                x: mid2.x + mid2.nx * mul * sgi + xShifts[xi3] * mid2.ny,
                y: mid2.y + mid2.ny * mul * sgi + 4 + xShifts[xi3] * mid2.nx
              });
            }
          }
        }
        var pick = pickLabel(cands, lw3);
        sc.put(txt(pick.x, pick.y, er.label, { size: FS_S, fill: C.accent2, anchor: 'middle', role: 'rel-label' }));
        var lbox = labelBoxOf(pick.x, pick.y, lw3);
        usedLabels.push(lbox);
        sc.mark(lbox.x0, lbox.y0, lbox.x1, lbox.y1);
      }
      /* 多重度 / 角色名：贴近端点；同一条线上多条时沿折线错开，避免挤成一列 */
      var spread = (i % 3) * 0.05;
      var endLabel = function (textVal, t, sign) {
        if (!textVal) { return; }
        var tt = sign > 0 ? Math.min(0.30, t + spread) : Math.max(0.70, t - spread);
        var p = pointAt(pts3, tt);
        var w2 = textW(textVal, FS_S);
        var cs = [];
        /* 沿切线错开（同一条水平轨道上多条倍度标注不会上下对齐成一列） */
        var tx = -p.ny, ty = p.nx;
        var sh0 = (i % 3) * 22 * (sign > 0 ? 1 : -1);
        for (var mu = 9; mu <= 44; mu += 4) {
          cs.push({ x: p.x + p.nx * mu * sign + tx * sh0, y: p.y + p.ny * mu * sign + ty * sh0 + 4 });
        }
        for (var mu2 = 9; mu2 <= 44; mu2 += 4) {
          cs.push({ x: p.x - p.nx * mu2 * sign + tx * sh0, y: p.y - p.ny * mu2 * sign + ty * sh0 + 4 });
        }
        var pk = pickLabel(cs, w2);
        sc.put(txt(pk.x, pk.y, textVal, { size: FS_S, fill: C.dim, anchor: 'middle', role: 'rel-mult' }));
        var mbox = labelBoxOf(pk.x, pk.y, w2);
        usedLabels.push(mbox);
        sc.mark(mbox.x0, mbox.y0, mbox.x1, mbox.y1);
      };
      endLabel(er.fromMult, 0.08, 1);
      endLabel(er.toMult, 0.92, -1);
      endLabel(er.fromRole, 0.16, 1);
      endLabel(er.toRole, 0.84, -1);
    }

    if (!nodes.length) { emptyHint(sc, '类图：暂无内容'); }

    return { sc: sc, simplified: false };
  }

  /* =========================================================================
   * 状态机
   * ========================================================================= */

  function buildState(spec, o) {
    var sc = new Scene();
    var rawStates = arr(spec.states);
    var rawTrans = arr(spec.transitions);
    var budget = budgetOf(o);
    var i, k, q;

    var items = [];
    var byId = {};
    for (i = 0; i < rawStates.length; i++) {
      var s = rawStates[i] || {};
      var sid = str(s.id || ('st' + i));
      var kind = str(s.kind || 'state');
      if (kind !== 'initial' && kind !== 'final') { kind = 'state'; }
      var name = str(s.name || sid);
      var lines = wrapText(name, 148, FS);
      var sub = [];
      if (s.entry) { sub.push(wrapText('entry / ' + str(s.entry), 148, FS_S)); }
      if (s.action) { sub.push(wrapText('action / ' + str(s.action), 148, FS_S)); }
      var subLines = [];
      for (k = 0; k < sub.length; k++) {
        for (var qi = 0; qi < sub[k].length; qi++) { subLines.push(sub[k][qi]); }
      }
      var it2 = { id: sid, kind: kind, name: name, lines: lines, sub: subLines, idx: i, level: 0 };
      if (kind === 'initial') {
        it2.w = 22; it2.h = 22;
      } else if (kind === 'final') {
        it2.w = 26; it2.h = 26;
      } else {
        var tw3 = Math.max(maxLineW(lines, FS), maxLineW(subLines, FS_S));
        it2.w = Math.max(104, tw3 + 30);
        it2.h = blockH(lines.length, FS, LH) + 16 + (subLines.length ? subLines.length * 14 + 8 : 0);
      }
      items.push(it2);
      if (!byId[sid]) { byId[sid] = it2; }
    }

    /* ---- 转移过滤 ---- */
    var trans = [];
    for (i = 0; i < rawTrans.length; i++) {
      var t = rawTrans[i] || {};
      var fid = str(t.from);
      var tid = str(t.to);
      if (!fid || !tid || !byId[fid] || !byId[tid]) { continue; }
      var lbl = str(t.event);
      if (str(t.guard)) { lbl += ' [' + str(t.guard) + ']'; }
      if (str(t.action)) { lbl += ' / ' + str(t.action); }
      trans.push({ from: fid, to: tid, label: lbl, idx: i });
    }

    /* ---- 分层：从 initial 出发 BFS，其余丢到末列 ---- */
    var reached = {};
    var queue = [];
    for (i = 0; i < items.length; i++) { reached[items[i].id] = -1; }
    for (i = 0; i < items.length; i++) {
      if (items[i].kind === 'initial') { reached[items[i].id] = 0; queue.push(items[i].id); }
    }
    if (!queue.length) {
      var indeg = {};
      for (i = 0; i < items.length; i++) { indeg[items[i].id] = 0; }
      for (i = 0; i < trans.length; i++) { indeg[trans[i].to] = (indeg[trans[i].to] || 0) + 1; }
      for (i = 0; i < items.length; i++) {
        if (indeg[items[i].id] === 0) { reached[items[i].id] = 0; queue.push(items[i].id); }
      }
    }
    if (!queue.length && items.length) { reached[items[0].id] = 0; queue.push(items[0].id); }

    var aus = {};   /* 出边索引 */
    for (i = 0; i < trans.length; i++) {
      if (!aus[trans[i].from]) { aus[trans[i].from] = []; }
      aus[trans[i].from].push(trans[i]);
    }
    var maxLv = 0;
    var head = 0;
    while (head < queue.length) {
      var cur = queue[head];
      head += 1;
      var outs = aus[cur] || [];
      for (k = 0; k < outs.length; k++) {
        var toId = outs[k].to;
        if (reached[toId] < 0) {
          reached[toId] = reached[cur] + 1;
          if (reached[toId] > maxLv) { maxLv = reached[toId]; }
          queue.push(toId);
        }
      }
    }
    var orphanLv = maxLv + (queue.length ? 1 : 0);
    var hasOrphan = false;
    for (i = 0; i < items.length; i++) {
      if (reached[items[i].id] < 0) {
        reached[items[i].id] = orphanLv;
        hasOrphan = true;
      }
    }
    if (hasOrphan) { maxLv = orphanLv; }

    var cols2 = [];
    for (i = 0; i <= maxLv; i++) { cols2.push([]); }
    for (i = 0; i < items.length; i++) {
      items[i].level = reached[items[i].id];
      cols2[items[i].level].push(items[i]);
    }

    /* ---- 列宽 / 列高 ---- */
    var colGap = 86;
    var rowGap = 46;
    var maxLabW = 0;
    for (i = 0; i < trans.length; i++) {
      var lw4 = textW(trans[i].label, FS_S);
      if (lw4 > maxLabW) { maxLabW = lw4; }
    }
    if (maxLabW > 0) { colGap = Math.max(86, Math.min(240, maxLabW + 56)); }

    var colWid = [];
    var colHgt = [];
    for (i = 0; i < cols2.length; i++) {
      var cw = 0;
      var chh = 0;
      for (k = 0; k < cols2[i].length; k++) {
        if (cols2[i][k].w > cw) { cw = cols2[i][k].w; }
        chh += cols2[i][k].h + (k ? rowGap : 0);
      }
      colWid.push(cw);
      colHgt.push(chh);
    }

    /* ---- 分带：横向累计超预算就换带，奇数带反向（蛇形），保证不出框 ---- */
    /* 预留右侧/左侧标签的横向余量，否则标签会把内容包围盒顶出请求宽度 */
    var packW = budget;
    if (isFinite(packW)) { packW = Math.max(320, packW - 112); }
    var bands = [];
    var curBand = { cols: [], w: 0 };
    for (i = 0; i < cols2.length; i++) {
      var addW2 = (curBand.cols.length ? colGap : 0) + colWid[i];
      if (curBand.cols.length && curBand.w + addW2 > packW) {
        bands.push(curBand);
        curBand = { cols: [], w: 0 };
        addW2 = colWid[i];
      }
      curBand.cols.push(i);
      curBand.w += addW2;
    }
    if (curBand.cols.length) { bands.push(curBand); }
    if (!bands.length) { bands.push({ cols: [], w: 0 }); }

    /* 带间距按跨带转移数自适应：跨带线越多，带间留白越大，标签不抢位 */
    var bandOf = {};
    for (i = 0; i < bands.length; i++) {
      for (k = 0; k < bands[i].cols.length; k++) { bandOf[bands[i].cols[k]] = i; }
    }
    var gapEdges = [];
    for (i = 0; i < bands.length; i++) { gapEdges.push(0); }
    for (i = 0; i < trans.length; i++) {
      var ba0 = bandOf[byId[trans[i].from].level];
      var bb0 = bandOf[byId[trans[i].to].level];
      if (ba0 === undefined || bb0 === undefined || ba0 === bb0) { continue; }
      var lo5 = Math.min(ba0, bb0);
      var hi5 = Math.max(ba0, bb0);
      for (k = lo5; k < hi5; k++) { gapEdges[k] += 1; }
    }
    var bandGap = 78;
    var totalW2 = 0;
    for (i = 0; i < bands.length; i++) { if (bands[i].w > totalW2) { totalW2 = bands[i].w; } }
    var yBand = 0;
    for (var bi = 0; bi < bands.length; bi++) {
      var band = bands[bi];
      var rev = (bi % 2 === 1);
      var bandH = 0;
      for (k = 0; k < band.cols.length; k++) {
        var cInd = band.cols[k];
        if (colHgt[cInd] > bandH) { bandH = colHgt[cInd]; }
      }
      var runX = 0;
      for (k = 0; k < band.cols.length; k++) {
        var ci2 = band.cols[k];
        var left2 = rev ? (band.w - runX - colWid[ci2]) : runX;
        var yy2 = yBand + (bandH - colHgt[ci2]) / 2;
        for (q = 0; q < cols2[ci2].length; q++) {
          var nd4 = cols2[ci2][q];
          nd4.cx = left2 + colWid[ci2] / 2;
          nd4.cy = yy2 + nd4.h / 2;
          nd4.b = box(nd4.cx, nd4.cy, nd4.w, nd4.h);
          yy2 += nd4.h + rowGap;
        }
        runX += colWid[ci2] + colGap;
      }
      yBand += bandH + (bi < bands.length - 1
        ? (46 + Math.min((gapEdges[bi] || 0) * 10, 34))
        : 0);
    }

    /* ---- 画状态 ---- */
    for (i = 0; i < items.length; i++) {
      var st = items[i];
      var sx0 = st.b.x0;
      var sy0 = st.b.y0;
      if (st.kind === 'initial') {
        sc.add(circle(st.cx, st.cy, st.w / 2, { fill: C.text, stroke: C.line, role: 'initial', id: st.id }),
          sx0, sy0, sx0 + st.w, sy0 + st.h);
      } else if (st.kind === 'final') {
        sc.add(circle(st.cx, st.cy, st.w / 2, { fill: 'none', stroke: C.line, sw: 1.6, role: 'final' }),
          sx0, sy0, sx0 + st.w, sy0 + st.h);
        sc.put(circle(st.cx, st.cy, st.w / 2 - 5, { fill: C.text, stroke: 'none', sw: 0, role: 'final-inner', id: st.id }));
      } else {
        sc.add(rect(sx0, sy0, st.w, st.h, { rx: 12, fill: C.fill, stroke: C.line, role: 'state', id: st.id }),
          sx0, sy0, sx0 + st.w, sy0 + st.h);
        var tTop2 = sy0 + 8;
        var sv2 = txtBlock(st.cx, tTop2, st.lines, { size: FS, fill: C.text, anchor: 'middle' });
        for (k = 0; k < sv2.length; k++) { sc.put(sv2[k]); }
        markText(sc, st.cx, tTop2, st.lines, FS, LH, 'middle');
        if (st.sub.length) {
          var subTop = tTop2 + blockH(st.lines.length, FS, LH) + 2;
          var sv3 = txtBlock(st.cx, subTop, st.sub, { size: FS_S, fill: C.dim, anchor: 'middle', lh: 14 });
          for (k = 0; k < sv3.length; k++) { sc.put(sv3[k]); }
          markText(sc, st.cx, subTop, st.sub, FS_S, 14, 'middle');
        }
      }
    }

    /* ---- 转移：正交折线（水平出 → 垂直走 → 水平入；跨带走竖直通道） ---- */
    var boxList = [];
    for (i = 0; i < items.length; i++) { boxList.push(items[i].b); }

    var labelHitsNode = function (x, y, wText, anchor) {
      var lb = labelBox(x, y, wText, FS_S, anchor);
      for (var bi2 = 0; bi2 < boxList.length; bi2++) {
        if (boxesHit(lb, boxList[bi2])) { return true; }
      }
      return false;
    };
    var pickStateLabel = function (cands, wText) {
      var ci;
      for (ci = 0; ci < cands.length; ci++) {
        if (!labelHitsNode(cands[ci].x, cands[ci].y, wText, cands[ci].anchor)) { return cands[ci]; }
      }
      /* 兜底：以首个候选为圆心扫一圈，保证标签不压在状态框上 */
      var c0 = cands[0] || { x: 0, y: 0 };
      for (var rr = 12; rr <= 200; rr += 8) {
        for (var ai = 0; ai < 12; ai++) {
          var ang = (ai / 12) * Math.PI * 2;
          var tx = c0.x + Math.cos(ang) * rr;
          var ty = c0.y + Math.sin(ang) * rr;
          if (!labelHitsNode(tx, ty, wText, 'middle')) { return { x: tx, y: ty, anchor: 'middle' }; }
        }
      }
      return cands[0];
    };

    /* 同一对状态之间的多条转移分「车道」（lane），避免线与标签叠在一起 */
    var pairCount = {};
    for (i = 0; i < trans.length; i++) {
      var uk0 = (trans[i].from <= trans[i].to)
        ? (trans[i].from + '||' + trans[i].to)
        : (trans[i].to + '||' + trans[i].from);
      pairCount[uk0] = (pairCount[uk0] || 0) + 1;
    }
    var pairSeen = {};
    var LANE = 26;
    var INSET = 9;

    for (i = 0; i < trans.length; i++) {
      var tr = trans[i];
      var A2 = byId[tr.from];
      var B2 = byId[tr.to];
      var pts2 = [];
      var mo3 = { stroke: C.line, sw: 1.2, mEnd: markers_cur.ids.filled, role: 'transition' };
      var labCands = [];

      var ukey = (tr.from <= tr.to)
        ? (tr.from + '||' + tr.to)
        : (tr.to + '||' + tr.from);
      pairSeen[ukey] = (pairSeen[ukey] || 0) + 1;
      var laneIdx = pairSeen[ukey] - 1;
      var laneN = pairCount[ukey] || 1;
      var laneOff = (laneN > 1) ? (laneIdx - (laneN - 1) / 2) * LANE : 0;

      if (A2 === B2) {
        /* 自转移：右侧小环，多次自环逐层外扩 */
        var loopW = 30 + laneIdx * 12;
        var yA0 = clampAxis(A2.b.y0, A2.b.y1, bcy(A2.b) - 10, INSET);
        var yA1 = clampAxis(A2.b.y0, A2.b.y1, bcy(A2.b) + 10, INSET);
        if (yA1 - yA0 < 6) { yA1 = yA0 + 6; }
        pts2 = dedupe([
          { x: A2.b.x1, y: yA0 },
          { x: A2.b.x1 + loopW, y: yA0 },
          { x: A2.b.x1 + loopW, y: yA1 },
          { x: A2.b.x1, y: yA1 }
        ]);
        labCands.push({ x: A2.b.x1 + loopW + 7, y: bcy(A2.b) + 4, anchor: 'start' });
        labCands.push({ x: A2.b.x1 + loopW + 7, y: yA0 - 4, anchor: 'start' });
      } else {
        var hSep = (B2.b.x0 > A2.b.x1 + 20) || (B2.b.x1 < A2.b.x0 - 20);
        if (hSep) {
          /* 左右分离：水平出 → 垂直走 → 水平入；车道让人 y 错开 */
          var toRight = B2.b.x0 > A2.b.x1;
          var yBase = (bcy(A2.b) + bcy(B2.b)) / 2 + laneOff;
          var y1p = clampAxis(A2.b.y0, A2.b.y1, yBase, INSET);
          var y2p = clampAxis(B2.b.y0, B2.b.y1, yBase, INSET);
          var edgeA = toRight ? A2.b.x1 : A2.b.x0;
          var edgeB = toRight ? B2.b.x0 : B2.b.x1;
          var cx1 = (edgeA + edgeB) / 2;
          var xLo = Math.min(edgeA, edgeB) + 8;
          var xHi = Math.max(edgeA, edgeB) - 8;
          cx1 = (xHi > xLo) ? Math.max(xLo, Math.min(xHi, cx1)) : (edgeA + edgeB) / 2;
          pts2 = dedupe([
            { x: edgeA, y: y1p },
            { x: cx1, y: y1p },
            { x: cx1, y: y2p },
            { x: edgeB, y: y2p }
          ]);
          labCands.push({ x: cx1, y: yBase - 7, anchor: 'middle' });
          labCands.push({ x: cx1, y: yBase + 14, anchor: 'middle' });
          labCands.push({ x: toRight ? cx1 + 8 : cx1 - 8, y: yBase - 7, anchor: toRight ? 'start' : 'end' });
          labCands.push({ x: toRight ? cx1 - 8 : cx1 + 8, y: yBase + 14, anchor: toRight ? 'end' : 'start' });
        } else {
          /* 上下关系（含跨带）：竖直出 → 水平走 → 竖直入；车道让 x 错开 */
          var down = (B2.b.y0 + B2.b.y1) > (A2.b.y0 + A2.b.y1);
          var xBase = (bcx(A2.b) + bcx(B2.b)) / 2 + laneOff;
          var x1p = clampAxis(A2.b.x0, A2.b.x1, xBase, INSET);
          var x2p = clampAxis(B2.b.x0, B2.b.x1, xBase, INSET);
          var gTop = down ? A2.b.y1 : A2.b.y0;
          var gBot = down ? B2.b.y0 : B2.b.y1;
          var cy1 = (gTop + gBot) / 2 + laneOff * 0.5;
          var yLo = Math.min(gTop, gBot) + 9;
          var yHi = Math.max(gTop, gBot) - 9;
          cy1 = (yHi > yLo) ? Math.max(yLo, Math.min(yHi, cy1)) : (gTop + gBot) / 2;
          pts2 = dedupe([
            { x: x1p, y: gTop },
            { x: x1p, y: cy1 },
            { x: x2p, y: cy1 },
            { x: x2p, y: gBot }
          ]);
          var midX2 = (x1p + x2p) / 2;
          /* 成对转移时把两个标签分到竖直通道的左/右两侧，避免相邻车道叠字 */
          var rCand = { x: Math.max(x1p, x2p) + 8, y: cy1 - 7, anchor: 'start' };
          var lCand = { x: Math.min(x1p, x2p) - 8, y: cy1 - 7, anchor: 'end' };
          var uCand = { x: midX2, y: cy1 - 8, anchor: 'middle' };
          var dCand = { x: midX2, y: cy1 + 14, anchor: 'middle' };
          if (laneN > 1 && laneIdx % 2 === 1) {
            labCands.push(lCand, rCand, uCand, dCand);
          } else {
            labCands.push(rCand, lCand, uCand, dCand);
          }
        }
      }

      sc.put(polyPath(pts2, mo3));
      for (k = 0; k < pts2.length; k++) {
        sc.mark(pts2[k].x - 1, pts2[k].y - 1, pts2[k].x + 1, pts2[k].y + 1);
      }

      if (tr.label) {
        var lw5 = textW(tr.label, FS_S);
        var pk2 = pickStateLabel(labCands, lw5);
        sc.put(txt(pk2.x, pk2.y, tr.label, { size: FS_S, fill: C.dim, anchor: pk2.anchor, role: 'trans-label' }));
        var lbx = labelBox(pk2.x, pk2.y, lw5, FS_S, pk2.anchor);
        sc.mark(lbx.x0, lbx.y0, lbx.x1, lbx.y1);
      }
    }
    if (!items.length) { emptyHint(sc, '状态机：暂无内容'); }

    return { sc: sc, simplified: false };
  }

  function cy0(node) { return bcy(node.b); }

  /* =========================================================================
   * 时序图
   * ========================================================================= */

  function buildSequence(spec, o) {
    var sc = new Scene();
    var parts = arr(spec.participants);
    var msgs = arr(spec.messages);
    var budget = budgetOf(o);
    var i, k;

    var ps = [];
    var byId = {};
    for (i = 0; i < parts.length; i++) {
      var p = parts[i] || {};
      var pid = str(p.id || ('pt' + i));
      var pname = str(p.name || pid);
      var lines = wrapText(pname, 150, FS);
      var w = Math.max(96, maxLineW(lines, FS) + 30);
      var boxH = Math.max(38, blockH(lines.length, FS, LH) + 18);
      ps.push({ id: pid, name: pname, lines: lines, w: w, boxH: boxH, idx: i });
      if (!byId[pid]) { byId[pid] = ps[ps.length - 1]; }
    }

    /* 横向间距：参与者太多时压缩间距，尽量把整行塞进宽度预算 */
    var gapX = 46;
    if (ps.length > 1 && isFinite(budget)) {
      var sumW = 0;
      for (i = 0; i < ps.length; i++) { sumW += ps[i].w; }
      var fitGap = (budget - sumW) / (ps.length - 1);
      gapX = Math.max(14, Math.min(46, Math.floor(fitGap)));
    }
    var xCur3 = 0;
    var topH = 0;
    for (i = 0; i < ps.length; i++) {
      if (ps[i].boxH > topH) { topH = ps[i].boxH; }
    }
    for (i = 0; i < ps.length; i++) {
      ps[i].cx = xCur3 + ps[i].w / 2;
      ps[i].top = 0;
      ps[i].bot = ps[i].boxH;
      xCur3 += ps[i].w + gapX;
    }

    var rowH = 34;
    var firstY = topH + 30;
    var msgY = [];
    for (i = 0; i < msgs.length; i++) { msgY.push(firstY + i * rowH); }
    var endY = msgs.length ? (msgY[msgs.length - 1] + 26) : (topH + 40);

    /* 参与者方框 + 生命线 */
    for (i = 0; i < ps.length; i++) {
      var pp = ps[i];
      sc.add(rect(pp.cx - pp.w / 2, 0, pp.w, pp.boxH, { rx: 4, fill: C.fill, stroke: C.line, sw: 1.3, role: 'participant', id: pp.id }),
        pp.cx - pp.w / 2, 0, pp.cx + pp.w / 2, pp.boxH);
      var tv2 = pp.boxH / 2 - blockH(pp.lines.length, FS, LH) / 2;
      var sv4 = txtBlock(pp.cx, tv2, pp.lines, { size: FS, fill: C.text, anchor: 'middle', weight: '600' });
      for (k = 0; k < sv4.length; k++) { sc.put(sv4[k]); }
      sc.put(seg(pp.cx, pp.boxH, pp.cx, endY, { stroke: C.dim, dash: '5 5', role: 'lifeline' }));
      sc.mark(pp.cx - pp.w / 2, 0, pp.cx + pp.w / 2, pp.boxH);
    }

    function arrowEnd(kind) {
      if (kind === 'return') { return markers_cur.ids.open; }
      if (kind === 'async') { return markers_cur.ids.open; }
      return markers_cur.ids.filled;
    }

    /* 消息 */
    for (i = 0; i < msgs.length; i++) {
      var m = msgs[i] || {};
      var fid = str(m.from);
      var tid = str(m.to);
      var A = byId[fid];
      var B = byId[tid];
      if (!A || !B) { continue; }
      var kind = str(m.kind || 'sync');
      if (kind !== 'async' && kind !== 'return') { kind = 'sync'; }
      var y = msgY[i];
      var text = str(m.text);
      var mo4 = { stroke: kind === 'return' ? C.dim : C.line, sw: 1.3, mEnd: arrowEnd(kind) };
      if (kind === 'return') { mo4.dash = '6 4'; }
      var labW = textW(text, FS_S);

      if (A === B) {
        /* 自消息：矩形环 */
        var lx4 = A.cx + 34;
        var p2 = dedupe([
          { x: A.cx, y: y - 4 },
          { x: lx4, y: y - 4 },
          { x: lx4, y: y + 12 },
          { x: A.cx, y: y + 12 }
        ]);
        sc.put(polyPath(p2, mo4));
        sc.mark(A.cx, y - 6, lx4 + 2, y + 14);
        if (text) {
          sc.put(txt(A.cx + 6, y - 10, text, { size: FS_S, fill: C.dim, anchor: 'start', role: 'msg-text' }));
          sc.mark(A.cx + 6, y - 10 - FS_S, A.cx + 6 + labW, y - 6);
        }
      } else {
        var x1 = A.cx;
        var x2 = B.cx;
        sc.put(polyPath([{ x: x1, y: y }, { x: x2, y: y }], mo4));
        sc.mark(Math.min(x1, x2), y - 2, Math.max(x1, x2), y + 2);
        if (text) {
          var mx2 = (x1 + x2) / 2;
          var my2 = y - 7;
          sc.put(txt(mx2, my2, text, { size: FS_S, fill: kind === 'return' ? C.dim : C.text, anchor: 'middle', role: 'msg-text' }));
          sc.mark(mx2 - labW / 2, my2 - FS_S, mx2 + labW / 2, my2 + 3);
        }
      }
    }

    if (!ps.length) { emptyHint(sc, '时序图：暂无内容'); }

    return { sc: sc, simplified: false };
  }

  /* =========================================================================
   * 组装 SVG
   * ========================================================================= */

  var markers_cur = null;

  function wrapScene(sc, opts, extraNote) {
    var title = str(opts.title);
    var pad = PAD;
    var bodyW;
    var bodyH;
    if (!sc.ok) {
      bodyW = 90;
      bodyH = 26;
      sc.minX = 0; sc.minY = 0; sc.maxX = bodyW; sc.maxY = bodyH;
    }
    bodyW = Math.max(1, sc.maxX - sc.minX);
    bodyH = Math.max(1, sc.maxY - sc.minY);

    var note = str(extraNote);
    var titleH = title ? 30 : 0;
    var noteH = note ? 24 : 0;
    var W = Math.max(64, Math.ceil(bodyW + pad * 2));
    var H = Math.max(48, Math.ceil(bodyH + pad * 2 + titleH + noteH));

    var scale = 1;
    if (typeof opts.width === 'number' && isFinite(opts.width) && opts.width > 8 && opts.width < W) {
      scale = opts.width / W;
    }
    var Wf = Math.max(1, Math.ceil(W * scale));
    var Hf = Math.max(1, Math.ceil(H * scale));
    var sc2 = Math.round(scale * 10000) / 10000;

    var gx = pad - sc.minX;
    var gy = pad - sc.minY + titleH;

    var inner = '';
    if (title) {
      inner += txt(pad, 16, title, { size: 14, fill: C.text, anchor: 'start', weight: '600', role: 'title' });
    }
    inner += '<g transform="translate(' + n(gx) + ',' + n(gy) + ')">' + sc.parts.join('') + '</g>';
    if (note) {
      inner += txt(pad, H - 8, note, { size: FS_S, fill: C.warn, anchor: 'start', role: 'note' });
    }
    if (scale !== 1) {
      inner = '<g transform="scale(' + sc2 + ')">' + inner + '</g>';
    }

    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + Wf + '" height="' + Hf +
      '" viewBox="0 0 ' + Wf + ' ' + Hf + '" font-family="' + FONT +
      '" xml:space="preserve" role="img" aria-label="' + esc(title || 'UML 图') + '">' +
      markers_cur.defs + inner + '</svg>';

    return { svg: svg, width: Wf, height: Hf };
  }

  /* =========================================================================
   * 入口
   * ========================================================================= */

  /* 各类型的必填数组字段：缺失 / 非数组 / 空数组都算非法 spec（面板用它做「粘 JSON 先校验」） */
  var SPEC_FIELDS = {
    usecase: ['actors', 'usecases'],
    class: ['classes'],
    state: ['states'],
    sequence: ['participants']
  };

  function validateSpec(t, spec) {
    if (spec === null || spec === undefined || typeof spec !== 'object' || isArr(spec)) {
      return 'spec 必须是对象';
    }
    var need = SPEC_FIELDS[t] || [];
    for (var i = 0; i < need.length; i++) {
      var f = need[i];
      if (!isArr(spec[f])) {
        return 'spec.' + f + ' 必须是数组';
      }
      if (!spec[f].length) {
        return '这张图没有可渲染的节点（' + f + ' 为空）';
      }
    }
    return '';
  }

  function render(type, spec, opts) {
    try {
      var t = str(type).toLowerCase().trim();
      if (TYPES.indexOf(t) < 0) {
        return { error: '未知图形类型：' + str(type) };
      }
      var bad = validateSpec(t, spec);
      if (bad) { return { error: bad }; }
      var o = (opts && typeof opts === 'object') ? opts : {};
      markers_cur = markers();

      var built;
      var note = '';
      var nodeCount = 0;
      if (t === 'usecase') {
        nodeCount = arr(spec.actors).length + arr(spec.usecases).length;
      } else if (t === 'class') {
        nodeCount = arr(spec.classes).length;
      } else if (t === 'state') {
        nodeCount = arr(spec.states).length;
      } else {
        nodeCount = arr(spec.participants).length;
      }
      if (nodeCount > MAXNODE) {
        note = '节点较多（' + nodeCount + ' 个，超过 ' + MAXNODE + '）已简化显示，建议拆分查看。';
      }

      if (t === 'usecase') { built = buildUsecase(spec, o); }
      else if (t === 'class') { built = buildClass(spec, o); }
      else if (t === 'state') { built = buildState(spec, o); }
      else { built = buildSequence(spec, o); }

      return wrapScene(built.sc, o, note);
    } catch (e) {
      var msg = (e && e.message) ? e.message : str(e);
      if (typeof console !== 'undefined' && console && typeof console.warn === 'function') {
        try { console.warn('[PLM_UML] 渲染失败：' + msg); } catch (e2) { /* 忽略 */ }
      }
      return { error: '渲染失败：' + msg };
    }
  }

  var api = {
    VERSION: VERSION,
    types: TYPES.slice(),
    render: render
  };

  root.PLM_UML = api;

})(typeof window !== 'undefined' && window ? window : (typeof global !== 'undefined' ? global : this));
