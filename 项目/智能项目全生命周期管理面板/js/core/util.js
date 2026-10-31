/* util.js —— 通用工具（无依赖） */
(function (global) {
  'use strict';

  var CN = '零一二三四五六七八九';

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function toDate(s) {
    if (!s) return null;
    if (s instanceof Date) return isNaN(s.getTime()) ? null : s;
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s));
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    return isNaN(d.getTime()) ? null : d;
  }

  var uidSeq = 0;
  function uid(prefix) {
    uidSeq = (uidSeq + 1) % 1296;
    return (prefix || 'x') + '_' + Date.now().toString(36).slice(-5) +
      Math.random().toString(36).slice(2, 4) + uidSeq.toString(36);
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function clone(o) {
    if (o == null || typeof o !== 'object') return o;
    try { return structuredClone(o); } catch (e) { /* 老浏览器兜底 */ }
    return JSON.parse(JSON.stringify(o));
  }

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function nowISO() { return new Date().toISOString(); }

  function addDays(dateStr, n) {
    var d = toDate(dateStr) || new Date();
    d.setDate(d.getDate() + (+n || 0));
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /* b - a，单位天；无效日期返回 null */
  function daysBetween(a, b) {
    var da = toDate(a), db = toDate(b);
    if (!da || !db) return null;
    var ms = new Date(db.getFullYear(), db.getMonth(), db.getDate()) -
      new Date(da.getFullYear(), da.getMonth(), da.getDate());
    return Math.round(ms / 86400000);
  }

  function fmtDate(s) {
    var d = toDate(s);
    if (!d) return s ? String(s) : '—';
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  function fmtDateShort(s) {
    var d = toDate(s);
    if (!d) return '—';
    return (d.getMonth() + 1) + '/' + d.getDate();
  }

  function fmtMoney(n) {
    if (n == null || n === '' || isNaN(+n)) return '—';
    var v = +n;
    if (Math.abs(v) >= 10000) return (v / 10000).toFixed(v % 10000 ? 2 : 0) + ' 亿';
    return v.toLocaleString('zh-CN') + ' 万';
  }

  function fmtNum(n, digits) {
    if (n == null || isNaN(+n)) return '—';
    return (+n).toFixed(digits == null ? 0 : digits);
  }

  function byId(arr, id) {
    if (!arr) return null;
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function sum(arr, fn) {
    return (arr || []).reduce(function (acc, x) { return acc + (+(fn ? fn(x) : x) || 0); }, 0);
  }

  function groupBy(arr, fn) {
    var out = Object.create(null);
    (arr || []).forEach(function (x) {
      var k = fn(x);
      (out[k] || (out[k] = [])).push(x);
    });
    return out;
  }

  function unique(arr) {
    var seen = Object.create(null), out = [];
    (arr || []).forEach(function (x) { if (!seen[x]) { seen[x] = 1; out.push(x); } });
    return out;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function pct(a, b) { return b ? clamp(Math.round((a / b) * 100), 0, 100) : 0; }

  /* 截断长文本，中英文都按视觉宽度粗算 */
  function truncate(s, max) {
    s = String(s || '');
    var w = 0, out = '';
    for (var i = 0; i < s.length; i++) {
      var ch = s.charAt(i);
      w += /[\u4e00-\u9fa5\uff00-\uffef]/.test(ch) ? 1 : 0.55;
      if (w > max - 0.6) return out + '…';
      out += ch;
    }
    return out;
  }

  /* 视觉宽度：中文 1、其他 0.55（与 UML 渲染器保持一致） */
  function textWidth(s, fontSize) {
    s = String(s || '');
    var w = 0;
    for (var i = 0; i < s.length; i++) {
      w += /[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/.test(s.charAt(i)) ? 1 : 0.55;
    }
    return w * (fontSize || 12);
  }

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 0);
  }

  function pickFile(accept, cb) {
    var input = document.createElement('input');
    input.type = 'file';
    if (accept) input.accept = accept;
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () { cb(String(fr.result), f.name); };
      fr.readAsText(f, 'utf-8');
    };
    input.click();
  }

  /* SVG 字符串 → PNG dataURL（用于图片导出） */
  function svgToPng(svgText, scale, cb) {
    scale = scale || 2;
    var m = /viewBox="([\d.\-]+)\s+([\d.\-]+)\s+([\d.]+)\s+([\d.]+)"/.exec(svgText);
    var w = m ? +m[3] : 800, h = m ? +m[4] : 600;
    var img = new Image();
    var svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    var url = URL.createObjectURL(svgBlob);
    img.onload = function () {
      var cv = document.createElement('canvas');
      cv.width = Math.ceil(w * scale);
      cv.height = Math.ceil(h * scale);
      var ctx = cv.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      try { cb(cv.toDataURL('image/png')); } catch (e) { cb(null); }
    };
    img.onerror = function () { URL.revokeObjectURL(url); cb(null); };
    img.src = url;
  }

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms || 200);
    };
  }

  global.PLM = global.PLM || {};
  global.PLM.util = {
    CN_CHARS: CN,
    pad: pad, toDate: toDate, uid: uid, esc: esc, clone: clone,
    today: today, nowISO: nowISO, addDays: addDays, daysBetween: daysBetween,
    fmtDate: fmtDate, fmtDateShort: fmtDateShort, fmtMoney: fmtMoney, fmtNum: fmtNum,
    byId: byId, sum: sum, groupBy: groupBy, unique: unique, clamp: clamp, pct: pct,
    truncate: truncate, textWidth: textWidth,
    download: download, pickFile: pickFile, svgToPng: svgToPng, debounce: debounce
  };
})(typeof window !== 'undefined' ? window : globalThis);
