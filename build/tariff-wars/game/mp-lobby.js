// ============================================================================
// "HOST A GAME" — the shared online setup + lobby UI.
// ============================================================================
// One flow for every Fitz & Pop arcade game that can be played online:
//
//   1. HOST A GAME opens a setup screen where the host composes the table —
//      how many seats are people, how many are AI, plus whatever settings the
//      game itself has (Presina's hand ladder; another game's dragons and
//      whether You.Goat.Magic! amulets are in play).
//   2. Creating the table produces ONE share link.
//   3. The people invited open it, SEE the settings the host chose, supply
//      anything only they can supply (their own amulet code), and press READY.
//   4. When every human seat is taken and ready, the match begins by itself.
//
// This file is deliberately GAME-AGNOSTIC and byte-identical across the three
// game repos, so a fix here can be copied straight across. Everything specific
// to a game is passed IN:
//
//   spec.title        heading on the setup screen
//   spec.seatRule     { min, max, fixed } — what the game's engine can seat
//   spec.fields       the setting controls to render (see FIELD TYPES below)
//   spec.summary(cfg) one line describing a composed table, for the lobby
//   spec.seatCfg      optional per-PLAYER lobby input (KK's amulet code)
//
// FIELD TYPES
//   { kind:'seats' }                       humans / AI steppers (always present)
//   { kind:'choice', key, label, options } one-of, rendered as rows
//   { kind:'toggle', key, label, hint }    on/off
//   { kind:'perseat', key, label, options } one choice per seat (KK dragons)
// ============================================================================

const esc = (s) => String(s == null ? '' : s)
  .replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let overlay = null;
function ensureOverlay(accent) {
  if (overlay) return overlay;
  overlay = document.createElement('div');
  overlay.id = 'fpl-overlay';
  overlay.innerHTML = `
    <div class="fpl-card">
      <div class="fpl-title" id="fpl-title">Host a Game</div>
      <div class="fpl-body" id="fpl-body">Connecting…</div>
      <div class="fpl-actions" id="fpl-actions"></div>
      <button class="fpl-close" id="fpl-close" title="Back">✕</button>
    </div>`;
  const style = document.createElement('style');
  style.textContent = `
    #fpl-overlay{position:fixed;inset:0;z-index:10000;display:flex;align-items:center;justify-content:center;
      background:rgba(8,8,14,.88);font-family:system-ui,-apple-system,sans-serif;color:#f4f4f8;
      overflow:auto;padding:2rem 1rem}
    #fpl-overlay[hidden]{display:none}
    #fpl-overlay .fpl-card{position:relative;background:#17141f;border:1px solid #342f42;border-radius:16px;
      padding:1.7rem 1.9rem;max-width:560px;width:100%;box-shadow:0 24px 70px rgba(0,0,0,.6);text-align:center;
      margin:auto}
    /* This overlay is injected into three DIFFERENT games' pages. other games
       Krowns in particular uppercases and letter-spaces broadly, which squeezed
       the toggle row into a one-word column. Neutralise the host page's text
       treatment inside the card so the same markup reads identically in all
       three games. */
    #fpl-overlay .fpl-card, #fpl-overlay .fpl-card *{
      text-transform:none;letter-spacing:normal;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;
      box-sizing:border-box}
    #fpl-overlay .fpl-sec{text-transform:uppercase;letter-spacing:2px}
    #fpl-overlay .fpl-title{font-size:1.3rem;font-weight:800;color:${accent};margin-bottom:1rem;letter-spacing:.5px}
    #fpl-overlay .fpl-body{font-size:.97rem;line-height:1.55;color:#d8d2e0}
    #fpl-overlay .fpl-actions{margin-top:1.3rem;display:flex;gap:.6rem;justify-content:center;flex-wrap:wrap}
    #fpl-overlay button.fpl-btn{background:${accent};color:#191119;border:0;padding:.68rem 1.25rem;border-radius:9px;
      font-size:.95rem;font-weight:800;cursor:pointer}
    #fpl-overlay button.fpl-btn:disabled{opacity:.4;cursor:not-allowed}
    #fpl-overlay button.fpl-btn.ghost{background:#2e2839;color:#f4f4f8}
    #fpl-overlay .fpl-close{position:absolute;top:.5rem;right:.6rem;background:none;border:0;color:#8a8398;
      font-size:1.15rem;cursor:pointer}

    /* ---- setup screen ---- */
    #fpl-overlay .fpl-sec{margin:1.1rem 0 .3rem;font-size:.72rem;letter-spacing:2px;text-transform:uppercase;
      color:#8a8398;text-align:left}
    #fpl-overlay .fpl-seatrow{display:flex;gap:.8rem;justify-content:center;flex-wrap:wrap}
    #fpl-overlay .fpl-step{display:flex;align-items:center;gap:.55rem;background:#0f0c16;border:1px solid #3a3350;
      border-radius:11px;padding:.5rem .7rem}
    #fpl-overlay .fpl-step .lbl{font-size:.85rem;color:#b9b2c8;min-width:4.2rem;text-align:left}
    #fpl-overlay .fpl-step button{width:2rem;height:2rem;border-radius:7px;border:1px solid #4a4265;
      background:#221c30;color:#fff;font-size:1.1rem;font-weight:800;cursor:pointer;line-height:1}
    #fpl-overlay .fpl-step button:disabled{opacity:.3;cursor:not-allowed}
    #fpl-overlay .fpl-step .num{min-width:1.6rem;font-size:1.15rem;font-weight:800;color:${accent}}
    #fpl-overlay .fpl-tot{margin-top:.55rem;font-size:.82rem;color:#8a8398}
    #fpl-overlay .fpl-opt{display:flex;align-items:center;gap:12px;width:100%;text-align:left;cursor:pointer;
      background:#0f0c16;border:1px solid #3a3350;border-radius:10px;padding:.6rem .8rem;margin:.32rem 0;
      color:#f4f4f8;font:inherit;transition:border-color .12s,transform .08s}
    #fpl-overlay .fpl-opt:hover{border-color:${accent};transform:translateY(-1px)}
    #fpl-overlay .fpl-opt.on{border-color:${accent};background:#1d1729;box-shadow:0 0 0 1px ${accent} inset}
    #fpl-overlay .fpl-opt .n{font-weight:800;flex:1 1 auto;min-width:0}
    #fpl-overlay .fpl-opt .s{color:${accent};font-weight:700;font-variant-numeric:tabular-nums;flex:0 0 auto}
    #fpl-overlay .fpl-opt .h{color:#8a8398;font-size:.8rem;flex:0 1 auto;max-width:46%;text-align:right;
      line-height:1.3}
    #fpl-overlay .fpl-opt .tick{flex:0 0 1.1rem;width:1.1rem;color:${accent};font-weight:800}
    #fpl-overlay .fpl-perseat{display:flex;align-items:center;gap:.5rem;margin:.3rem 0}
    #fpl-overlay .fpl-perseat .who{font-size:.85rem;color:#b9b2c8;min-width:5.2rem;text-align:left}
    #fpl-overlay .fpl-perseat select{flex:1;background:#0f0c16;border:1px solid #3a3350;border-radius:8px;
      color:#f4f4f8;padding:.45rem .55rem;font:inherit;font-size:.88rem}

    /* ---- lobby ---- */
    #fpl-overlay .fpl-code{font-size:1.9rem;font-weight:800;letter-spacing:.34rem;color:#fff;margin:.5rem 0 .2rem}
    #fpl-overlay .fpl-link{display:flex;gap:.5rem;margin:.7rem 0}
    #fpl-overlay .fpl-link input{flex:1;background:#0f0c16;border:1px solid #3a3350;border-radius:8px;color:#cfc7dd;
      padding:.55rem .7rem;font-size:.8rem}
    #fpl-overlay .fpl-setup-line{display:flex;align-items:center;gap:10px;justify-content:center;flex-wrap:wrap;
      margin:.7rem 0;padding:.55rem .9rem;border-radius:10px;
      background:${accent}22;border:1px solid ${accent}8c;color:#ffeec0;font-size:.9rem}
    #fpl-overlay .fpl-setup-line b{font-size:.98rem}
    #fpl-overlay .fpl-roster{margin:.8rem 0 .2rem;display:flex;flex-direction:column;gap:.3rem}
    #fpl-overlay .fpl-p{display:flex;align-items:center;gap:.6rem;background:#0f0c16;border:1px solid #302a42;
      border-radius:9px;padding:.45rem .7rem;font-size:.9rem;text-align:left}
    #fpl-overlay .fpl-p.me{border-color:${accent}}
    #fpl-overlay .fpl-p .nm{flex:1;font-weight:700}
    #fpl-overlay .fpl-p .rk{color:${accent};font-weight:800;font-size:.78rem}
    #fpl-overlay .fpl-p .st{font-size:.78rem;color:#8a8398}
    #fpl-overlay .fpl-p .st.ok{color:#7ddc9a;font-weight:800}
    #fpl-overlay .fpl-p .av{width:1.5rem;height:1.5rem;border-radius:50%;object-fit:cover;flex:0 0 auto}
    #fpl-overlay .fpl-seatcfg{margin:.8rem 0 .2rem;text-align:left}
    #fpl-overlay .fpl-seatcfg input{width:100%;box-sizing:border-box;background:#0f0c16;border:1px solid #3a3350;
      border-radius:8px;color:#f4f4f8;padding:.55rem .7rem;font:inherit;font-size:.85rem}
    #fpl-overlay .fpl-seatcfg .msg{font-size:.8rem;margin-top:.3rem;min-height:1.1em}
    #fpl-overlay .fpl-seatcfg .msg.ok{color:#7ddc9a}
    #fpl-overlay .fpl-seatcfg .msg.bad{color:#ff9b9b}
    #fpl-overlay .fpl-spin{margin-top:.7rem;font-size:.83rem;color:#8a8398}`;
  document.head.appendChild(style);
  document.body.appendChild(overlay);
  overlay.querySelector('#fpl-close').onclick = () => { window.location.href = window.location.pathname; };
  return overlay;
}

function show(title, bodyHTML, actionsHTML, accent) {
  const o = ensureOverlay(accent); o.hidden = false;
  o.querySelector('#fpl-title').textContent = title;
  o.querySelector('#fpl-body').innerHTML = bodyHTML;
  o.querySelector('#fpl-actions').innerHTML = actionsHTML || '';
  return o;
}
export function hideLobby() { if (overlay) overlay.hidden = true; }
export function showMessage(title, html, accent) { show(title, html, '', accent || '#e8b53a'); }

// ---------------------------------------------------------------------------
// THE SETUP SCREEN — the host composes the table.
// ---------------------------------------------------------------------------
export function showHostSetup(spec, onCreate) {
  const accent = spec.accent || '#e8b53a';
  const rule = spec.seatRule || { min: 2, max: 4 };
  const maxSeats = rule.fixed || rule.max || 4;

  // Working state: the table being composed.
  const st = { humans: 2, ai: rule.fixed ? rule.fixed - 2 : 0, cfg: {} };
  for (const f of spec.fields || []) {
    if (f.kind === 'choice') st.cfg[f.key] = f.options[0].value;
    if (f.kind === 'toggle') st.cfg[f.key] = !!f.value;
    if (f.kind === 'perseat') st.cfg[f.key] = new Array(maxSeats).fill(null);
  }

  function seatsHTML() {
    const totalTxt = rule.fixed
      ? `${st.humans} of ${rule.fixed} seats are people · ${rule.fixed - st.humans} AI`
      : `${st.humans + st.ai} at the table`;
    const aiStep = rule.fixed ? '' : `
      <div class="fpl-step">
        <span class="lbl">AI</span>
        <button data-step="ai" data-d="-1" ${st.ai <= 0 ? 'disabled' : ''}>−</button>
        <span class="num" id="fpl-n-ai">${st.ai}</span>
        <button data-step="ai" data-d="1" ${st.humans + st.ai >= maxSeats ? 'disabled' : ''}>+</button>
      </div>`;
    return `<div class="fpl-seatrow">
      <div class="fpl-step">
        <span class="lbl">People</span>
        <button data-step="humans" data-d="-1" ${st.humans <= 1 ? 'disabled' : ''}>−</button>
        <span class="num" id="fpl-n-humans">${st.humans}</span>
        <button data-step="humans" data-d="1" ${st.humans >= maxSeats || (!rule.fixed && st.humans + st.ai >= maxSeats) ? 'disabled' : ''}>+</button>
      </div>${aiStep}
    </div><div class="fpl-tot">${esc(totalTxt)}${st.humans > 1 ? ` · you'll get a link to send to ${st.humans - 1} ${st.humans === 2 ? 'person' : 'people'}` : ''}</div>`;
  }

  function fieldHTML(f) {
    if (f.kind === 'seats') return `<div class="fpl-sec">${esc(f.label || 'Players')}</div>${seatsHTML()}`;
    if (f.kind === 'choice') {
      return `<div class="fpl-sec">${esc(f.label)}</div>` + f.options.map((o) => `
        <button class="fpl-opt${st.cfg[f.key] === o.value ? ' on' : ''}" data-choice="${esc(f.key)}" data-val="${esc(o.value)}">
          <span class="tick">${st.cfg[f.key] === o.value ? '●' : '○'}</span>
          <span class="n">${esc(o.name)}</span>
          ${o.seq ? `<span class="s">${esc(o.seq)}</span>` : ''}
          ${o.hint ? `<span class="h">${esc(o.hint)}</span>` : ''}
        </button>`).join('');
    }
    if (f.kind === 'toggle') {
      return `<div class="fpl-sec">${esc(f.label)}</div>
        <button class="fpl-opt${st.cfg[f.key] ? ' on' : ''}" data-toggle="${esc(f.key)}">
          <span class="tick">${st.cfg[f.key] ? '☑' : '☐'}</span>
          <span class="n">${esc(f.on || 'Enabled')}</span>
          ${f.hint ? `<span class="h">${esc(f.hint)}</span>` : ''}
        </button>`;
    }
    if (f.kind === 'perseat') {
      const n = rule.fixed || (st.humans + st.ai);
      let h = `<div class="fpl-sec">${esc(f.label)}</div>`;
      for (let i = 0; i < n; i++) {
        const who = i === 0 ? 'You' : (i < st.humans ? `Player ${i + 1}` : `AI ${i + 1}`);
        h += `<div class="fpl-perseat"><span class="who">${esc(who)}</span>
          <select data-perseat="${esc(f.key)}" data-i="${i}">
            <option value="">— none —</option>
            ${f.options.map((o) => `<option value="${esc(o.value)}"${st.cfg[f.key][i] === o.value ? ' selected' : ''}>${esc(o.name)}</option>`).join('')}
          </select></div>`;
      }
      if (f.hint) h += `<div class="fpl-tot">${esc(f.hint)}</div>`;
      return h;
    }
    return '';
  }

  function paint() {
    const body = (spec.fields || []).map(fieldHTML).join('');
    const o = show(spec.title || 'Host a Game', body,
      `<button class="fpl-btn" id="fpl-make">Create the table →</button>`, accent);

    o.querySelectorAll('[data-step]').forEach((b) => b.onclick = () => {
      const k = b.dataset.step, d = Number(b.dataset.d);
      if (k === 'humans') {
        const next = Math.max(1, Math.min(maxSeats, st.humans + d));
        if (rule.fixed) { st.humans = next; st.ai = rule.fixed - next; }
        else if (next + st.ai <= maxSeats) st.humans = next;
      } else {
        st.ai = Math.max(0, Math.min(maxSeats - st.humans, st.ai + d));
      }
      paint();
    });
    o.querySelectorAll('[data-choice]').forEach((b) => b.onclick = () => {
      st.cfg[b.dataset.choice] = b.dataset.val; paint();
    });
    o.querySelectorAll('[data-toggle]').forEach((b) => b.onclick = () => {
      st.cfg[b.dataset.toggle] = !st.cfg[b.dataset.toggle]; paint();
    });
    o.querySelectorAll('[data-perseat]').forEach((sel) => sel.onchange = () => {
      st.cfg[sel.dataset.perseat][Number(sel.dataset.i)] = sel.value || null;
    });
    o.querySelector('#fpl-make').onclick = () => {
      onCreate({ humans: st.humans, ai: rule.fixed ? rule.fixed - st.humans : st.ai, config: { ...st.cfg } });
    };
  }
  paint();
  // Exposed for the headless checks.
  return { state: st, repaint: paint };
}

// ---------------------------------------------------------------------------
// THE LOBBY — share the link, everyone presses Ready.
// ---------------------------------------------------------------------------
// handlers: { onReady(want), onStartAnyway(), onSeatCfg(value, cb) }
export function renderLobby(spec, { code, room, isHost, mySeat, link, handlers }) {
  const accent = spec.accent || '#e8b53a';
  const seats = (room && room.seats) || [];
  const me = seats.find((s) => s.seat === mySeat);
  const iAmReady = !!(me && me.ready);
  const humansWaiting = seats.filter((s) => !s.isAI && (!s.taken || !s.ready)).length;

  const summary = spec.summary ? spec.summary(room) : '';
  const roster = seats.map((s) => {
    const isMe = s.seat === mySeat;
    const avatar = s.avatar && /^(https?:|\/|\.\/|data:)/.test(s.avatar)
      ? `<img class="av" src="${esc(s.avatar)}" alt="">`
      : `<span class="av" style="text-align:center;line-height:1.5rem">${esc(s.avatar || (s.isAI ? '🤖' : '🧑'))}</span>`;
    const status = s.isAI ? '<span class="st">AI opponent</span>'
      : !s.taken ? '<span class="st">waiting to join…</span>'
      : s.ready ? '<span class="st ok">✓ Ready</span>'
      : '<span class="st">not ready yet</span>';
    return `<div class="fpl-p${isMe ? ' me' : ''}">${avatar}
      <span class="nm">${esc(s.name || (s.isAI ? 'AI' : 'Open seat'))}${isMe ? ' (you)' : ''}</span>
      ${s.rank ? `<span class="rk">#${s.rank}</span>` : ''}
      ${s.amulets ? `<span class="rk">🔮${s.amulets}</span>` : ''}
      ${status}</div>`;
  }).join('');

  // A per-player input only the player themselves can fill in.
  const sc = spec.seatCfg;
  const seatCfgHTML = (sc && room && sc.when(room)) ? `
    <div class="fpl-seatcfg">
      <div class="fpl-sec" style="margin-top:.4rem">${esc(sc.label)}</div>
      <input id="fpl-seatcfg-in" placeholder="${esc(sc.placeholder || '')}" autocomplete="off"
             ${iAmReady ? 'disabled' : ''} value="${esc(sc.value || '')}">
      <div class="msg" id="fpl-seatcfg-msg">${esc(sc.hint || '')}</div>
    </div>` : '';

  const readyBtn = `<button class="fpl-btn${iAmReady ? ' ghost' : ''}" id="fpl-ready">${
    iAmReady ? '✓ Ready — tap to cancel' : "I'm Ready"}</button>`;
  const startBtn = (isHost && humansWaiting > 0)
    ? `<button class="fpl-btn ghost" id="fpl-startnow">Start anyway (absent players become AI)</button>` : '';

  const o = show('Your table', `
    ${isHost ? 'Send this link to the other players:' : 'You have been invited to this table:'}
    ${summary ? `<div class="fpl-setup-line">${summary}</div>` : ''}
    <div class="fpl-code">${esc(code)}</div>
    <div class="fpl-link"><input id="fpl-link-in" readonly value="${esc(link)}"></div>
    <div class="fpl-roster">${roster}</div>
    ${seatCfgHTML}
    <div class="fpl-spin" id="fpl-waiting">${humansWaiting === 0
      ? 'Everyone is ready — dealing…'
      : `Waiting on ${humansWaiting} ${humansWaiting === 1 ? 'player' : 'players'}…`}</div>`,
    `<button class="fpl-btn ghost" id="fpl-copy">Copy link</button>${readyBtn}${startBtn}`, accent);

  const copy = o.querySelector('#fpl-copy');
  if (copy) copy.onclick = async () => {
    try { await navigator.clipboard.writeText(link); copy.textContent = 'Copied!'; } catch (e) {
      const inp = o.querySelector('#fpl-link-in'); if (inp) { inp.select(); document.execCommand('copy'); }
    }
  };
  const rb = o.querySelector('#fpl-ready');
  if (rb) rb.onclick = () => {
    // Flush any debounced per-seat setting BEFORE readying up, so a player who
    // pastes a code and immediately hits Ready still brings their amulets.
    if (sc && sc._t) {
      clearTimeout(sc._t); sc._t = null;
      const live = o.querySelector('#fpl-seatcfg-in');
      if (live) handlers.onSeatCfg(live.value.trim() ? sc.parse(live.value) : null);
    }
    handlers.onReady(!iAmReady);
  };
  const sb = o.querySelector('#fpl-startnow');
  if (sb) sb.onclick = () => handlers.onStartAnyway();

  const inp = o.querySelector('#fpl-seatcfg-in');
  if (inp && sc) {
    const msg = o.querySelector('#fpl-seatcfg-msg');
    // A repaint would otherwise wipe this box mid-typing: sending the code makes
    // the server broadcast a new lobby, which re-renders everything including
    // the input the keystroke came from. So the value, the validation message
    // AND the caret all live on the spec and are restored on every paint.
    if (sc.msg) { msg.className = 'msg ' + (sc.msgClass || ''); msg.textContent = sc.msg; }
    if (sc.focused) {
      try { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { /* not focusable yet */ }
    }
    inp.onfocus = () => { sc.focused = true; };
    inp.onblur = () => { sc.focused = false; };
    const validate = () => {
      sc.value = inp.value;
      if (!inp.value.trim()) {
        sc.msg = sc.hint || ''; sc.msgClass = '';
        msg.className = 'msg'; msg.textContent = sc.msg;
        return null;
      }
      const v = sc.parse(inp.value);
      if (!v) {
        sc.msg = sc.bad || 'That code is not recognised.'; sc.msgClass = 'bad';
        msg.className = 'msg bad'; msg.textContent = sc.msg;
        return null;
      }
      sc.msg = sc.good ? sc.good(v) : 'Accepted.'; sc.msgClass = 'ok';
      msg.className = 'msg ok'; msg.textContent = sc.msg;
      return v;
    };
    inp.oninput = () => {
      const v = validate();
      // Debounced, so a repaint does not land on every keystroke.
      clearTimeout(sc._t);
      sc._t = setTimeout(() => handlers.onSeatCfg(v), 450);
    };
    // Committing on blur/Enter means a paste followed by clicking Ready is never
    // lost to the debounce.
    inp.onchange = () => { clearTimeout(sc._t); handlers.onSeatCfg(validate()); };
    inp.onkeydown = (e) => {
      if (e.key === 'Enter') { clearTimeout(sc._t); handlers.onSeatCfg(validate()); }
    };
  }
  return o;
}
