/* Nuclear Negotiations — solo table UI. Rules live in engine.js (window.NN). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var G = null, rot = 0, busy = true, best = 0;
  var ANG = [225, 315, 45, 135];                 // positions 0..3 clockwise from top-left, degrees (0 = right, 90 = down)
  var R_OUT = 41, R_IN = 21;                      // seat ring radii, % of the table
  try { best = parseInt(localStorage.getItem('nn-best'), 10) || 0; } catch (e) {}
  $('best').textContent = best;

  function pos(el, r, deg) { var a = deg * Math.PI / 180; el.style.left = (50 + r * Math.cos(a)) + '%'; el.style.top = (50 + r * Math.sin(a)) + '%'; }
  (function labels() {
    var h = '';
    for (var k = 0; k < 4; k++) h += '<span class="lbl" data-r="o" data-k="' + k + '">' + NN.OUTER[k] + '</span><span class="lbl" data-r="i" data-k="' + k + '">' + NN.INNER[k] + '</span>';
    $('labels').innerHTML = h;
    Array.prototype.forEach.call($('labels').children, function (el) { var k = +el.dataset.k; pos(el, el.dataset.r === "o" ? 55 : 9, ANG[k]); });
  })();

  function seat(id, k, ring) {
    var el = document.createElement('div'); el.className = 'seat'; el.dataset.k = k;
    el.appendChild(PX.draw(id, 6));
    var nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = NN.name(id).toUpperCase(); el.appendChild(nm);
    var slot = ring === 'o' ? ((k - rot / 90) % 4 + 4) % 4 : k;           // outer: the slot before the ring's own rotation
    pos(el, ring === 'o' ? R_OUT : R_IN, ANG[slot]);
    var up = ring === 'o' ? 'rotate(' + (-rot) + 'deg)' : 'none';
    el.style.setProperty('--up', up); el.style.transform = up;
    if (G && G.rogue[id]) el.classList.add('rogue');
    el.onclick = function () { play(k); };
    return el;
  }
  function render(state, opts) {
    opts = opts || {};
    var o = $('outer'), i = $('inner'); o.innerHTML = ''; i.innerHTML = '';
    for (var k = 0; k < 4; k++) { o.appendChild(seat(state.outer[k], k, 'o')); i.appendChild(seat(state.inner[k], k, 'i')); }
    o.style.transform = 'rotate(' + rot + 'deg)';
    if (opts.can) markLegal();
  }
  function markLegal() {
    var L = NN.legal(G);
    Array.prototype.forEach.call(document.querySelectorAll('.seat.rogue'), function (el) { if (L.indexOf(+el.dataset.k) >= 0) el.classList.add('can'); });
  }
  function status(t) { $('statusTxt').textContent = t; }
  function paintLog() {
    var lines = G ? G.log : [];
    $('log').innerHTML = lines.map(function (l) { return /NUCLEAR/.test(l) ? '<span class="war">' + l + '</span>' : l; }).join('\n') || '—';
    $('log').scrollTop = 1e6;
    $('moves').textContent = G ? G.moves : 0;
  }

  function deal() {
    var seed = null, m = location.search.match(/[?&]seed=(\d+)/); if (m) seed = +m[1];
    G = NN.newGame(seed); rot = 0; busy = true;
    $('seed').textContent = G.seed; $('nuke').hidden = true; $('btnAgain').hidden = true; $('centre').textContent = ''; $('centre').classList.remove('btn');
    $('scrim').hidden = true; $('start').hidden = true;
    render(G); paintLog();
    $('log').textContent = 'outer A ' + NN.name(G.outer[0]) + ' · B ' + NN.name(G.outer[1]) + ' · D ' + NN.name(G.outer[2]) + ' · C ' + NN.name(G.outer[3]) + '\ninner 1 ' + NN.name(G.inner[0]) + ' · 2 ' + NN.name(G.inner[1]) + ' · 4 ' + NN.name(G.inner[2]) + ' · 3 ' + NN.name(G.inner[3]);
    if (window.vgTrack) vgTrack('nn_deal', { seed: G.seed });
    status('The leaders take their seats…');
    var n = 3, cd = $('countdown'); cd.hidden = false; $('cdNum').textContent = n;
    var t = setInterval(function () {
      n--; if (n > 0) { $('cdNum').textContent = n; return; }
      clearInterval(t); cd.hidden = true; revealRogues();
    }, 1000);
  }
  function revealRogues() {
    NN.reveal(G); render(G);
    Array.prototype.forEach.call(document.querySelectorAll('.seat.rogue'), function (el) { el.classList.add('ignite'); });
    $('table').classList.add('shake'); setTimeout(function () { $('table').classList.remove('shake'); }, 500);
    paintLog(); status('ROGUE REVEAL · ' + rogueNames() + ' have gone rogue. Tap a rogue to swap.');
    setTimeout(function () { busy = false; markLegal(); }, 700);
  }
  function rogueNames() { return Object.keys(G.rogue).map(NN.name).join(' and '); }

  function play(k) {
    if (busy || !G || G.over || NN.legal(G).indexOf(k) < 0) return;
    busy = true;
    // 1. show the swap in place
    var tmp = JSON.parse(JSON.stringify(G)); var t = tmp.outer[k]; tmp.outer[k] = tmp.inner[k]; tmp.inner[k] = t;
    var line = NN.notation(G, k);
    Array.prototype.forEach.call(document.querySelectorAll('.seat[data-k="' + k + '"]'), function (el) { el.classList.add('swap'); el.classList.remove('can'); });
    status(line + ' · swapping…');
    setTimeout(function () {
      var saved = G; G = tmp; render(G); G = saved;   // paint the swapped table, not yet turned
      // 2. the outer wheel turns one seat clockwise
      setTimeout(function () {
        var res = NN.apply(G, k); rot += 90; render(G); paintLog();
        status(line + ' · the outer wheel turns');
        setTimeout(function () {
          if (G.over) return nuke(res);
          busy = false; markLegal(); status('Move ' + (G.moves + 1) + ' · rogues at ' + NN.rogues(G) + ' · tap a rogue');
        }, 800);
      }, 150);
    }, 420);
  }
  function nuke(res) {
    var k = res.war;
    $('nkWhy').textContent = NN.name(G.outer[k]).toUpperCase() + ' AND ' + NN.name(G.inner[k]).toUpperCase() + ' FACE EACH OTHER AT ' + NN.OUTER[k] + '/' + NN.INNER[k] + ' · YOU LASTED ' + G.moves + ' MOVE' + (G.moves === 1 ? '' : 'S');
    $('cloud').innerHTML = ''; $('cloud').appendChild(PX.draw('nuke', 16)); $('nuke').hidden = false;
    $('table').classList.add('shake'); setTimeout(function () { $('table').classList.remove('shake'); }, 500);
    if (G.moves > best) { best = G.moves; $('best').textContent = best; try { localStorage.setItem('nn-best', best); } catch (e) {} }
    status('NUCLEAR WAR · game over after ' + G.moves + ' moves');
    $('btnAgain').hidden = false;
    if (window.vgTrack) vgTrack('nn_over', { moves: G.moves, seed: G.seed });
  }

  $('btnDeal').onclick = deal; $('btnAgain').onclick = deal; $('btnNew').onclick = deal;
  $('btnCopy').onclick = function () {
    if (!G) return;
    var txt = NN.logText(G);
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { status('Log copied.'); }, function () { window.prompt('Copy the log', txt); });
  };
  function openHow() { $('scrim').hidden = false; $('how').hidden = false; }
  function closeHow() { $('scrim').hidden = true; $('how').hidden = true; }
  $('btnHow').onclick = openHow;
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.onclick = closeHow; });
  $('scrim').onclick = function () { if (!$('how').hidden) closeHow(); };
  $('scrim').hidden = false;                                              // start sheet is up
  render({ outer: NN.LEADERS.slice(0, 4).map(function (l) { return l.id; }), inner: NN.LEADERS.slice(4).map(function (l) { return l.id; }), rogue: {} });
})();
