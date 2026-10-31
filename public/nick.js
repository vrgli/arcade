// First sign-in: pick a unique nickname. Shown on any page that includes this
// file when /api/me says the account has no nickname yet. The provider's own
// name is never displayed.
(function () {
  var CSS = '#vgNick{position:fixed;inset:0;z-index:2147483100;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.7);font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Helvetica,Arial,sans-serif}'+
    '#vgNick .box{width:min(420px,calc(100vw - 28px));background:#111419;border:1px solid #23262d;border-radius:16px;padding:22px;color:#e8eaed;box-shadow:0 20px 60px rgba(0,0,0,.7)}'+
    '#vgNick .k{font:700 10px/1 ui-monospace,Menlo,monospace;letter-spacing:.2em;color:#ffd400;margin:0 0 10px}#vgNick h2{margin:0 0 8px;font-size:22px;line-height:1.15}#vgNick p{margin:0 0 14px;color:#c4c8ce;font-size:14px}'+
    '#vgNick input{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:10px;border:1px solid #3b4049;background:#0f1115;color:#fff;font:700 18px/1 ui-monospace,Menlo,monospace;letter-spacing:.04em;outline:none}#vgNick input:focus{border-color:#ffd400}'+
    '#vgNick .err{min-height:18px;margin:8px 0 10px;font:600 12px/1.4 ui-monospace,Menlo,monospace;color:#ff6f61}'+
    '#vgNick button{width:100%;padding:12px;border:0;border-radius:10px;background:#ffd400;color:#111;font:800 13px/1 ui-monospace,Menlo,monospace;letter-spacing:.12em;cursor:pointer}#vgNick button[disabled]{opacity:.5}';
  function show(current) {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    var w = document.createElement('div'); w.id = 'vgNick';
    w.innerHTML = '<div class="box"><p class="k">ONE LAST THING</p><h2>Pick your nickname.</h2><p>This is the name on the leaderboard and at the table. 3 to 20 characters: letters, digits, underscore. It has to be unique.</p>' +
      '<input id="vgNickIn" maxlength="20" autocomplete="off" spellcheck="false" placeholder="e.g. tariff_king" value="' + (current || '').replace(/[^A-Za-z0-9_]/g, '').slice(0, 20) + '">' +
      '<div class="err" id="vgNickErr"></div><button id="vgNickGo">SAVE NICKNAME</button></div>';
    document.body.appendChild(w);
    var inp = w.querySelector('#vgNickIn'), err = w.querySelector('#vgNickErr'), go = w.querySelector('#vgNickGo');
    setTimeout(function () { inp.focus(); inp.select(); }, 50);
    function submit() {
      var v = inp.value.trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(v)) { err.textContent = '3 to 20 characters, letters, digits or underscore only.'; return; }
      go.disabled = true; err.textContent = '';
      fetch('/api/rename', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: v }) })
        .then(function (r) { return r.json(); }).then(function (d) {
          if (d && d.error) { err.textContent = d.error === 'taken' ? 'That nickname is taken. Try another.' : 'Could not save, try again.'; go.disabled = false; return; }
          if (window.vgTrack) window.vgTrack('nickname', {});
          location.reload();
        }).catch(function () { err.textContent = 'Could not save, try again.'; go.disabled = false; });
    }
    go.onclick = submit; inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
  }
  fetch('/api/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
    if (d && d.account && !d.account.nick_set) show('');
  }).catch(function () {});
})();
