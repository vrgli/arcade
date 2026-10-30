// Socket.IO-shaped client over a plain WebSocket, for the arcade.vrg.li relay.
// mp-client.js calls io(), socket.on(ev, fn) and socket.emit(ev, data, ack) — that
// is the whole surface it needs. The connection is opened lazily on the first
// mp:create / mp:join, because the table code decides which server object the
// socket must land on.
function identity() {
  let uid = localStorage.getItem('vg_uid');
  if (!uid) { uid = crypto.randomUUID(); localStorage.setItem('vg_uid', uid); }
  let name = localStorage.getItem('vg_name');
  if (!name) {
    name = (window.prompt('Your name at the table?') || '').trim().slice(0, 24) || 'Player';
    localStorage.setItem('vg_name', name);
  }
  return { uid, name };
}

class Sock {
  constructor() { this.h = {}; this.ws = null; this.acks = new Map(); this.n = 0; }
  on(ev, fn) { (this.h[ev] = this.h[ev] || []).push(fn); return this; }
  _fire(ev, data) { (this.h[ev] || []).forEach((f) => { try { f(data); } catch (e) { console.error(e); } }); }
  _open(query) {
    const { uid, name } = identity();
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/mp-socket?${query}&uid=${encodeURIComponent(uid)}&name=${encodeURIComponent(name)}`);
    let opened = false;
    const ready = new Promise((resolve, reject) => {
      ws.onopen = () => { opened = true; resolve(); };
      ws.onerror = () => { if (!opened) reject(new Error('could not reach the table server')); };
    });
    ws.onmessage = (e) => {
      let f; try { f = JSON.parse(e.data); } catch (err) { return; }
      if (f.ack != null) { const cb = this.acks.get(f.ack); this.acks.delete(f.ack); if (cb) cb(f.data); return; }
      if (f.ev) this._fire(f.ev, f.data);
    };
    ws.onclose = () => { if (this.ws === ws) { this.ws = null; if (opened) this._fire('disconnect', 'transport close'); } };
    ready.catch((err) => this._fire('connect_error', err));
    this.ws = ws; this.ready = ready;
  }
  emit(ev, data, cb) {
    if (typeof data === 'function') { cb = data; data = undefined; }
    if (!this.ws) {
      if (ev === 'mp:create') this._open('create=1');
      else if (ev === 'mp:join') this._open('room=' + encodeURIComponent(String((data && data.code) || '').toUpperCase()));
      else { if (cb) cb({ error: 'not_connected' }); return this; }
    }
    const frame = { ev, data };
    if (cb) { frame.ack = ++this.n; this.acks.set(frame.ack, cb); }
    this.ready.then(() => this.ws && this.ws.send(JSON.stringify(frame))).catch(() => { if (cb) { this.acks.delete(frame.ack); cb({ error: 'offline' }); } });
    return this;
  }
}

export function io() { return new Sock(); }
