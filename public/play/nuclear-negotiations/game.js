/* Nuclear Negotiations — solo table UI. Rules live in engine.js (window.NN), sounds in sound.js (window.SND). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var G = null, rot = 0, busy = true, best = 0, tick = null, deadline = 0, stage = -1;
  var ANG = [225, 315, 45, 135];                 // positions 0..3 clockwise from top-left, degrees (0 = right, 90 = down)
  var R_OUT = 41, R_IN = 21;                      // seat ring radii, % of the table
  var IDLE = { don: 'bob', vlad: 'tilt', ursula: 'sway', zel: 'nod', modi: 'breathe', bibi: 'shake', obama: 'lean', mbs: 'float' };
  var dealing = false;
  try { best = parseInt(localStorage.getItem('nn-best'), 10) || 0; } catch (e) {}
  $('best').textContent = best;
  // Signed in: the account's longest run wins over this browser's if it is longer.
  try { fetch('/api/me', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (d) { var b = d.nuclear_negotiations && d.nuclear_negotiations.best; if (b > best) { best = b; $('best').textContent = best; try { localStorage.setItem('nn-best', best); } catch (e) {} } }).catch(function () {}); } catch (e) {}
  $('btnSound').textContent = SND.on ? '🔊' : '🔇';

  function pos(el, r, deg) { var a = deg * Math.PI / 180; el.style.left = (50 + r * Math.cos(a)) + '%'; el.style.top = (50 + r * Math.sin(a)) + '%'; }
  function seat(id, k, ring) {
    var el = document.createElement('div'); el.className = 'seat idle-' + IDLE[id]; el.dataset.k = k;
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
  function render(state) {
    var o = $('outer'), i = $('inner'); o.innerHTML = ''; i.innerHTML = '';
    for (var k = 0; k < 4; k++) { o.appendChild(seat(state.outer[k], k, 'o')); i.appendChild(seat(state.inner[k], k, 'i')); }
    o.style.transform = 'rotate(' + rot + 'deg)';
  }
  function markLegal() {
    var L = NN.legal(G);
    Array.prototype.forEach.call(document.querySelectorAll('.seat.rogue'), function (el) { if (L.indexOf(+el.dataset.k) >= 0) el.classList.add('can'); });
  }
  function status(t) { $('statusTxt').textContent = t; }
  function banner(t, sub) { var b = $('banner'); b.hidden = true; $('bannerTxt').textContent = t; $('bannerSub').textContent = sub || ''; void b.offsetWidth; b.hidden = false; setTimeout(function () { b.hidden = true; }, 1400); }
  function face(id) { var c = PX.draw(id, 2); c.title = NN.name(id); return c; }
  function paintLog() {
    var lines = G ? G.log : [];
    $('log').innerHTML = lines.map(function (l) { return /NUCLEAR/.test(l) ? '<span class="war">' + l + '</span>' : l; }).join('\n') || '—';
    $('log').scrollTop = 1e6;
    $('moves').textContent = G ? G.moves : 0;
  }

  // ── the clock ──
  // The phases and their clock are rules (engine.js). The first HURRY UP is announced here;
  // ESCALATION and the return to HURRY UP are announced by escalateFx / calmFx.
  function armClock() {
    var ms = NN.clockMs(G.moves);
    if (G.moves === NN.SPELL && stage !== G.moves) { stage = G.moves; banner('HURRY UP', '1 SECOND A MOVE'); SND.play('hurry'); }
    clearInterval(tick); deadline = Date.now() + ms; $('centre').classList.add('clock'); paintClock();
    var lastTick = -1;
    tick = setInterval(function () {
      if (busy || !G || G.over) { clearInterval(tick); return; }
      var left = deadline - Date.now();
      if (left <= 0) { clearInterval(tick); SND.play('timeout'); var L = NN.legal(G); play(L[Math.floor(Math.random() * L.length)], true); return; }
      var sec = Math.ceil(left / 1000); if (sec !== lastTick && left < 3000) { lastTick = sec; SND.play('tick'); }
      paintClock();
    }, 50);
  }
  function paintClock() { var left = Math.max(0, deadline - Date.now()); $('centre').textContent = (left / 1000).toFixed(1); $('centre').classList.toggle('hot', left < 1000); }
  function stopClock() { clearInterval(tick); $('centre').classList.remove('clock', 'hot'); $('centre').textContent = ''; }

  // ── the game ──
  // Signed in, the server deals the seed and later replays the moves before a run reaches the
  // leaderboard. Guests, a ?seed= practice table or a failed call play unranked with a local seed.
  function deal() {
    if (dealing) return; dealing = true;
    SND.unlock(); SND.play('deal');
    var m = location.search.match(/[?&]seed=(\d+)/);
    if (m && !G) return begin(+m[1], false);
    fetch('/api/nn/start', { method: 'POST', credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { begin(d && d.seed != null ? d.seed : null, !!(d && d.seed != null)); }, function () { begin(null, false); });
  }
  function begin(seed, ranked) {
    dealing = false;
    G = NN.newGame(seed); G.ranked = ranked; rot = 0; busy = true; stage = -1; stopClock();
    $('seed').textContent = G.seed; $('nuke').hidden = true; $('banner').hidden = true;
    closeSheets(); $('start').hidden = true;
    render(G); paintLog();
    G.log.unshift('outer A ' + NN.name(G.outer[0]) + ' · B ' + NN.name(G.outer[1]) + ' · D ' + NN.name(G.outer[2]) + ' · C ' + NN.name(G.outer[3]), 'inner 1 ' + NN.name(G.inner[0]) + ' · 2 ' + NN.name(G.inner[1]) + ' · 4 ' + NN.name(G.inner[2]) + ' · 3 ' + NN.name(G.inner[3]));
    paintLog();
    if (window.vgTrack) vgTrack('nn_deal', { seed: G.seed });
    status('The leaders take their seats…');
    var n = 3, cd = $('countdown'); cd.hidden = false; $('cdNum').textContent = n; SND.play('count');
    var t = setInterval(function () {
      n--; if (n > 0) { $('cdNum').textContent = n; SND.play('count'); return; }
      clearInterval(t); cd.hidden = true; revealRogues();
    }, 1000);
  }
  function revealRogues() {
    NN.reveal(G); render(G); SND.play('reveal');
    Array.prototype.forEach.call(document.querySelectorAll('.seat.rogue'), function (el) { el.classList.add('ignite'); });
    $('table').classList.add('shake'); setTimeout(function () { $('table').classList.remove('shake'); }, 500);
    banner('ROGUE REVEAL', rogueNames().toUpperCase() + ' HAVE GONE ROGUE');
    paintLog(); status('ROGUE REVEAL · ' + rogueNames() + ' have gone rogue. Tap a rogue to swap.');
    setTimeout(function () { busy = false; markLegal(); armClock(); }, 900);
  }
  function rogueNames() { return Object.keys(G.rogue).map(NN.name).join(' and '); }

  function play(k, timeout) {
    if (busy || !G || G.over || NN.legal(G).indexOf(k) < 0) return;
    busy = true; stopClock();
    var tmp = JSON.parse(JSON.stringify(G)); var t = tmp.outer[k]; tmp.outer[k] = tmp.inner[k]; tmp.inner[k] = t;
    var line = NN.notation(G, k);
    Array.prototype.forEach.call(document.querySelectorAll('.seat[data-k="' + k + '"]'), function (el) { el.classList.add('swap'); el.classList.remove('can'); });
    SND.play('swap');
    status(line + (timeout ? ' · TIME IS UP, the table moves for you' : ' · swapping…'));
    setTimeout(function () {
      var saved = G; G = tmp; render(G); G = saved;   // paint the swapped table, not yet turned
      setTimeout(function () {
        var res = NN.apply(G, k); if (timeout) G.log[G.log.length - 1] += ' (timeout)'; rot += 90; render(G); paintLog(); SND.play('turn');
        status(line + ' · the outer wheel turns');
        setTimeout(function () {
          if (G.over) return nuke(res);
          var ev = NN.after(G);
          if (ev && ev.escalate) return escalateFx(ev.escalate);
          if (ev && ev.calm) return calmFx(ev.calm);
          nextMove();
        }, 800);
      }, 150);
    }, 420);
  }
  function nextMove() { busy = false; markLegal(); armClock(); status('Move ' + (G.moves + 1) + ' · rogues at ' + NN.rogues(G) + ' · tap a rogue'); }
  function escalateFx(pick) {
    render(G); SND.play('reveal'); paintLog();
    Array.prototype.forEach.call(document.querySelectorAll('.seat.rogue'), function (el) { el.classList.add('ignite'); });
    $('table').classList.add('shake'); setTimeout(function () { $('table').classList.remove('shake'); }, 500);
    banner('ESCALATION', NN.name(pick.id).toUpperCase() + ' HAS GONE ROGUE');
    status('ESCALATION · ' + NN.name(pick.id) + ' joins the rogues for ' + NN.SPELL + ' moves');
    if (window.vgTrack) vgTrack('nn_escalate', { moves: G.moves, seed: G.seed });
    setTimeout(nextMove, 1300);
  }
  function calmFx(id) {
    render(G); SND.play('hurry'); paintLog();
    banner('HURRY UP', NN.name(id).toUpperCase() + ' STANDS DOWN');
    status('HURRY UP · ' + NN.name(id) + ' is no longer rogue');
    setTimeout(nextMove, 1300);
  }
  function nuke(res) {
    var k = res.war, w = $('nkWhy'); w.innerHTML = '';
    SND.play('nuke');
    w.appendChild(face(G.outer[k])); w.appendChild(document.createTextNode(NN.name(G.outer[k]).toUpperCase() + ' AND '));
    w.appendChild(face(G.inner[k])); w.appendChild(document.createTextNode(NN.name(G.inner[k]).toUpperCase() + ' FACE EACH OTHER · YOU LASTED ' + G.moves + ' MOVE' + (G.moves === 1 ? '' : 'S')));
    $('cloud').innerHTML = ''; $('cloud').appendChild(PX.draw('nuke', 16)); $('nuke').hidden = false;
    $('table').classList.add('shake'); setTimeout(function () { $('table').classList.remove('shake'); }, 500);
    if (G.moves > best) { best = G.moves; $('best').textContent = best; try { localStorage.setItem('nn-best', best); } catch (e) {} }
    status('');
    if (window.vgTrack) vgTrack('nn_over', { moves: G.moves, seed: G.seed });
    // A ranked run sends the positions played; the server replays them from the seed it dealt.
    if (G.ranked) fetch('/api/nn/result', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ks: G.ks }) }).catch(function () {});
  }

  // ── chrome ──
  function openSheet(id) { closeSheets(); $('scrim').hidden = false; $(id).hidden = false; }
  function closeSheets() { $('scrim').hidden = true; ['how', 'logSheet'].forEach(function (id) { $(id).hidden = true; }); }
  $('btnDeal').onclick = deal; $('btnAgain').onclick = deal; $('btnNew').onclick = deal;
  $('btnHow').onclick = function () { openSheet('how'); };
  $('btnLog').onclick = $('btnLog2').onclick = function () { paintLog(); openSheet('logSheet'); };
  $('btnSound').onclick = function () { SND.on = !SND.on; SND.unlock(); $('btnSound').textContent = SND.on ? '🔊' : '🔇'; if (SND.on) SND.play('count'); };
  $('btnCopy').onclick = function () {
    if (!G) return;
    var txt = NN.logText(G);
    (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { status('Log copied.'); }, function () { window.prompt('Copy the log', txt); });
  };
  Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (b) { b.onclick = closeSheets; });
  $('scrim').onclick = function () { if ($('start').hidden) closeSheets(); };
  $('scrim').hidden = false;                                              // start sheet is up
  render({ outer: NN.LEADERS.slice(0, 4).map(function (l) { return l.id; }), inner: NN.LEADERS.slice(4).map(function (l) { return l.id; }), rogue: {} });
})();
