// arcade.vrg.li play statistics — pseudonymous, no cookies, no account.
// What it sends is listed on /privacy. A random id lives in localStorage so
// returning players can be told apart; clearing site data resets it.
(function () {
  var game = (document.currentScript && document.currentScript.dataset.game) || null;
  var uid; try { uid = localStorage.getItem('vg_uid'); if (!uid) { uid = crypto.randomUUID(); localStorage.setItem('vg_uid', uid); } } catch (e) { uid = null; }
  var sid; try { sid = sessionStorage.getItem('vg_sid'); if (!sid) { sid = Math.random().toString(36).slice(2, 12); sessionStorage.setItem('vg_sid', sid); } } catch (e) { sid = null; }
  var t0 = Date.now(), visible = 0, lastVis = document.visibilityState === 'visible' ? Date.now() : null;
  function seen() { if (lastVis) { visible += Date.now() - lastVis; lastVis = document.visibilityState === 'visible' ? Date.now() : null; } else if (document.visibilityState === 'visible') lastVis = Date.now(); }
  function send(ev, extra) {
    var body = Object.assign({
      ev: ev, game: game, page: location.pathname, uid: uid, sid: sid,
      lang: navigator.language, screen: screen.width + 'x' + screen.height + '@' + (window.devicePixelRatio || 1),
      tz: (Intl.DateTimeFormat().resolvedOptions() || {}).timeZone, ref: document.referrer || '',
      touch: 'ontouchstart' in window ? 1 : 0,
    }, extra || {});
    var data = JSON.stringify(body);
    if (navigator.sendBeacon) navigator.sendBeacon('/e', new Blob([data], { type: 'application/json' }));
    else fetch('/e', { method: 'POST', body: data, headers: { 'Content-Type': 'application/json' }, keepalive: true }).catch(function () {});
  }
  document.addEventListener('visibilitychange', seen);
  send('view');
  setInterval(function () { seen(); send('heartbeat', { duration: Math.round(visible / 1000) }); }, 60000);
  window.addEventListener('pagehide', function () { seen(); send('end', { duration: Math.round(visible / 1000), extra: { total: Math.round((Date.now() - t0) / 1000) } }); });
  window.vgTrack = function (ev, extra) { send(ev, extra); };
})();
