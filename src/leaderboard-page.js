// /leaderboard — top players by game, readable by anyone. Names and avatars are
// what players chose to sign in with; nothing else about them is shown.
const esc = (v) => String(v == null ? '' : v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Bare branded page shell, shared with the sign-in notices in auth.js.
export function page(title, body, app = 'Arcade') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · arcade.vrg.li</title><link rel="icon" href="/favicon.ico"><link rel="stylesheet" href="/arcade.css">
<style>.av{width:24px;height:24px;border-radius:50%;object-fit:cover;background:var(--panel);border:1px solid var(--line);vertical-align:middle;margin-right:10px}
.av.i{display:inline-flex;align-items:center;justify-content:center;font:700 11px/1 var(--mono);color:var(--yl)}
td.p{white-space:nowrap}tr.me td{background:rgba(255,212,0,.08)}tr.me td.p{color:var(--yl)}td.n{color:var(--mute);width:36px}</style></head>
<body><script src="/vrg-chrome.js" data-app="${esc(app)}" data-public="1"></script>
<main class="wrap"><p class="kicker">VRG · ARCADE</p><h1>${esc(title)}</h1>${body}
<footer><a href="/">ARCADE</a><a href="/source/">SOURCE</a><a href="/stats">STATS</a><a href="/privacy">PRIVACY</a></footer></main></body></html>`;
}

const avatar = (r) => r.avatar
  ? `<img class="av" src="${esc(r.avatar)}" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML='<span class=&quot;av i&quot;>${esc((r.name || 'P')[0].toUpperCase())}</span>'">`
  : `<span class="av i">${esc((r.name || 'P')[0].toUpperCase())}</span>`;

function board(title, rows, cols, me) {
  if (!rows || !rows.length) return `<section><h2>${esc(title)}</h2><p class="mute">nobody on the board yet</p></section>`;
  return `<section><h2>${esc(title)}</h2><table><thead><tr><th>#</th><th>PLAYER</th>${cols.map(([, h]) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${
    rows.map((r, i) => `<tr${me && r.id === me ? ' class="me"' : ''}><td class="n">${i + 1}</td><td class="p">${avatar(r)}${esc(r.name || 'Player')}</td>${
      cols.map(([k]) => `<td>${esc(Number(r[k] || 0).toLocaleString('en'))}</td>`).join('')}</tr>`).join('')}</tbody></table></section>`;
}

// data = the Accounts DO's /leaderboard payload; me = signed-in account id or null.
export function leaderboardPage(data, me) {
  const body = `<p class="lead">Top 50 per game. Sign in from any game to get on the board.</p>
${board('Wallop', data.wallop, [['teeth', 'TEETH'], ['noise', 'NOISE'], ['battles', 'BATTLES']], me)}
${board('Tariff Wars', data.tariff_wars, [['won', 'GAMES WON'], ['margin_total', 'MARGIN OVER RUNNER-UP'], ['games', 'GAMES']], me)}`;
  return page('Leaderboard', body, 'Arcade · leaderboard');
}
