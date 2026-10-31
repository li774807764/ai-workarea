/* bus.js —— 极简事件总线 */
(function (global) {
  'use strict';
  var map = Object.create(null);

  var bus = {
    on: function (evt, fn) {
      (map[evt] || (map[evt] = [])).push(fn);
      return function () { bus.off(evt, fn); };
    },
    off: function (evt, fn) {
      var arr = map[evt];
      if (!arr) return;
      var i = arr.indexOf(fn);
      if (i > -1) arr.splice(i, 1);
    },
    once: function (evt, fn) {
      var un = bus.on(evt, function (p) { un(); fn(p); });
      return un;
    },
    emit: function (evt, payload) {
      var arr = map[evt];
      if (!arr || !arr.length) return;
      // 快照，避免回调里增删监听导致漏发
      arr.slice().forEach(function (fn) {
        try { fn(payload); } catch (e) { console.error('[bus] 监听器异常 ' + evt, e); }
      });
    },
    clear: function () { map = Object.create(null); }
  };

  global.PLM = global.PLM || {};
  global.PLM.bus = bus;
})(typeof window !== 'undefined' ? window : globalThis);
