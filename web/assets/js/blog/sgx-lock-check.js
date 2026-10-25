/**
 * SGX 子站自动锁定检查
 * 主站「立即锁定」后，已打开的 blog 标签页切回来时自动跳到锁屏。
 *
 * 原理：会话 Cookie 是 HttpOnly，子域名不同源，BroadcastChannel 收不到，
 * 只能由页面在变为可见时主动问服务器 /api/lock-session-check。
 */
(function () {
  'use strict';

  var LAST_CHECK = 0;
  var CHECK_INTERVAL = 5000; // 节流：5 秒一次
  var MAIN_ORIGIN = 'https://styrigx.com';

  function checkLock() {
    var now = Date.now();
    if (now - LAST_CHECK < CHECK_INTERVAL) return;
    LAST_CHECK = now;

    fetch('/api/lock-session-check', {
      credentials: 'same-origin',
      headers: { 'Cache-Control': 'no-store' },
    })
      .then(function (r) {
        if (r.status === 204) return; // 仍然有效，什么都不做
        if (r.status === 401) {
          return r.json().catch(function () { return { why: 'sig' }; }).then(function (d) {
            var why = (d && d.why) || 'sig';
            var target = MAIN_ORIGIN + '/?lock=1&return=' +
              encodeURIComponent(window.location.href) +
              '&why=' + encodeURIComponent(why);
            window.location.replace(target);
          });
        }
        // 其他状态码：不跳转，下次再查
      })
      .catch(function () {
        // 网络错误：不跳转，下次再查
      });
  }

  // visibilitychange 变为 visible 时检查
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') checkLock();
  });

  // focus 时检查
  window.addEventListener('focus', checkLock);

  // pageshow（含 bfcache 恢复）时检查
  window.addEventListener('pageshow', function (e) {
    if (e && e.persisted) checkLock();
  });
})();
