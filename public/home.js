// Home: sign-in control in the brand bar, and the "play for free" interstitial.
(function () {
  var PROV = [['google','Google'],['github','GitHub'],['discord','Discord'],['apple','Apple']];
  var providers = {}, account = null, target = '/';
  var $ = function (s) { return document.querySelector(s); };
  function openSheet() { $('#scrim').hidden = false; $('#guest').hidden = false; }
  function closeSheet() { $('#scrim').hidden = true; $('#guest').hidden = true; }
  document.querySelectorAll('[data-close]').forEach(function (b) { b.onclick = closeSheet; }); $('#scrim').onclick = closeSheet;
  function paintProviders(next) {
    $('#providers').innerHTML = PROV.map(function (p) { return providers[p[0]]
      ? '<a href="/auth/' + p[0] + '?next=' + encodeURIComponent(next) + '">' + p[1] + '</a>'
      : '<span title="not switched on yet">' + p[1] + ' · soon</span>'; }).join('');
  }
  fetch('/api/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) {
    providers = d.providers || {}; account = d.account || null;
    var a = $('#acctBtn');
    if (account) { a.innerHTML = (account.avatar ? '<img src="' + account.avatar + '" alt="">' : '') + String(account.name || 'YOU').toUpperCase(); a.href = '/leaderboard'; a.title = 'Leaderboard'; }
    else { a.textContent = 'SIGN IN'; a.classList.add('acct'); a.href = '#'; a.onclick = function (e) { e.preventDefault(); target = '/'; $('#gName').textContent = 'THE ARCADE'; $('#guestGo').textContent = 'Not now'; $('#guestGo').href = '#'; $('#guestGo').onclick = function (ev) { ev.preventDefault(); closeSheet(); }; paintProviders('/'); openSheet(); }; }
    var ba = $('#barActions'); if (ba) ba.hidden = false;
  }).catch(function () { var ba = $('#barActions'); if (ba) ba.hidden = false; });
  document.querySelectorAll('a.play').forEach(function (a) {
    a.addEventListener('click', function (e) {
      if (account) return;                       // signed in: straight into the game
      e.preventDefault(); target = a.getAttribute('href');
      $('#gName').textContent = (a.dataset.game || 'THE GAME').toUpperCase();
      $('#guestGo').textContent = 'Play as a guest'; $('#guestGo').href = target; $('#guestGo').onclick = null;
      paintProviders(target); openSheet();
      if (window.vgTrack) window.vgTrack('play_click', { game: a.dataset.game });
    });
  });
})();
