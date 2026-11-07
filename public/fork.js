// "Fork me" and zip downloads are counted in the play statistics (/stats) so we
// can see which game people take. GitHub's own fork count is the other half.
(function () {
  // Each game has its own repo: github.com/vrgli/<game>. The parent page lists them all.
  var GAMES = ['tariff-wars', 'wallop', 'nuclear-negotiations'];
  function repo(game) { return 'https://github.com/vrgli/' + (GAMES.indexOf(game) >= 0 ? game : 'games'); }
  function track(ev, game) { if (window.vgTrack) window.vgTrack(ev, { game: game }); }
  document.querySelectorAll('a.fork[data-game]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); track('fork_click', a.dataset.game); setTimeout(function () { location.href = repo(a.dataset.game); }, 120); });
  });
  document.querySelectorAll('[data-fork]').forEach(function (el) {
    el.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); track('fork_click', el.dataset.fork); setTimeout(function () { location.href = repo(el.dataset.fork); }, 120); });
  });
  document.querySelectorAll('a[download]').forEach(function (a) {
    a.addEventListener('click', function () { track('download', (a.getAttribute('href').match(/([a-z-]+)\.zip$/) || [])[1]); });
  });
})();
