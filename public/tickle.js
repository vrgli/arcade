// The logo gets tickled: hover (or tap) → a jerk, and confetti bursts out of it.
(function () {
  var el = document.getElementById('vrgLogo'); if (!el) return;
  var cv = document.createElement('canvas'); cv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483001'; document.body.appendChild(cv);
  var ctx = cv.getContext('2d'), parts = [], raf = null, last = 0;
  var COLORS = ['#ffd400', '#ffe766', '#fff5b8', '#e8eaed', '#8b9098', '#ffb300'];
  function size() { cv.width = innerWidth * devicePixelRatio; cv.height = innerHeight * devicePixelRatio; ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); }
  function burst() {
    var r = el.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (var i = 0; i < 90; i++) {
      var a = Math.random() * Math.PI * 2, v = 6 + Math.random() * 11;
      parts.push({ x: cx + (Math.random() - .5) * r.width * .6, y: cy + (Math.random() - .5) * r.height * .5, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6,
        w: 5 + Math.random() * 7, h: 3 + Math.random() * 5, rot: Math.random() * 6.28, vr: (Math.random() - .5) * .4, c: COLORS[i % COLORS.length], life: 1 });
    }
    if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
  }
  function tick(t) {
    var dt = Math.min(40, t - last) / 16.7; last = t; ctx.clearRect(0, 0, innerWidth, innerHeight);
    parts = parts.filter(function (p) { return p.life > 0 && p.y < innerHeight + 40; });
    parts.forEach(function (p) {
      p.vy += 0.35 * dt; p.vx *= 0.985; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= 0.006 * dt;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.globalAlpha = Math.max(0, Math.min(1, p.life * 1.6)); ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h); ctx.restore();
    });
    if (parts.length) raf = requestAnimationFrame(tick); else { raf = null; ctx.clearRect(0, 0, innerWidth, innerHeight); }
  }
  var busy = false;
  function tickle() {
    if (busy) return; busy = true;
    el.classList.remove('jerk'); void el.offsetWidth; el.classList.add('jerk');
    burst(); setTimeout(function () { busy = false; }, 650);
  }
  addEventListener('resize', size); size();
  el.addEventListener('mouseenter', tickle); el.addEventListener('touchstart', tickle, { passive: true }); el.addEventListener('click', tickle);
})();
