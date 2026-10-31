// Player accounts. One Durable Object with SQLite storage, named 'arcade'.
// Holds what a sign-in gives us (provider, opaque subject, display name, avatar
// URL) and per-game tallies. No e-mail, no IP. Called only by the Worker over
// stub.fetch('https://accounts/...'); nothing here is reachable from a browser.
const LIMIT = 10_000_000;
const now = () => new Date().toISOString();
const int = (v) => Math.min(LIMIT, Math.max(0, Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : 0));
const cleanName = (v) => String(v == null ? '' : v).replace(/[<>]/g, '').trim().slice(0, 24);
const hex16 = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');

export class Accounts {
  constructor(state) {
    this.sql = state.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, subject TEXT NOT NULL,
      name TEXT, avatar TEXT, created TEXT NOT NULL, last_seen TEXT NOT NULL,
      UNIQUE(provider, subject)
    )`);
    // nick_set: 1 once the player chose their own nickname (added 2026-10-31).
    try { this.sql.exec(`ALTER TABLE accounts ADD COLUMN nick_set INTEGER DEFAULT 0`); } catch (e) {}
    this.sql.exec(`CREATE TABLE IF NOT EXISTS wallop (
      account_id TEXT PRIMARY KEY, noise INTEGER DEFAULT 0, teeth INTEGER DEFAULT 0, battles INTEGER DEFAULT 0,
      bets INTEGER DEFAULT 0, bets_won INTEGER DEFAULT 0, bonus_given INTEGER DEFAULT 0, updated TEXT
    )`);
    this.sql.exec(`CREATE TABLE IF NOT EXISTS tariff_wars (
      account_id TEXT PRIMARY KEY, games INTEGER DEFAULT 0, won INTEGER DEFAULT 0,
      margin_total INTEGER DEFAULT 0, best_margin INTEGER DEFAULT 0, updated TEXT
    )`);
  }

  one(q, ...a) { return this.sql.exec(q, ...a).toArray()[0] || null; }
  account(id) { return this.one(`SELECT * FROM accounts WHERE id=?`, id); }
  wallop(id) { return this.one(`SELECT * FROM wallop WHERE account_id=?`, id); }
  tw(id) { return this.one(`SELECT * FROM tariff_wars WHERE account_id=?`, id); }

  async fetch(req) {
    const url = new URL(req.url);
    const p = url.pathname;
    const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
    const bad = (m) => Response.json({ error: m }, { status: 400 });

    // Create on first sign-in, refresh on later ones. The provider's name is only
    // taken when we have none yet, so a /rename is not undone by the next login.
    if (p === '/upsert' && req.method === 'POST') {
      const provider = String(body.provider || ''), subject = String(body.subject || '');
      if (!provider || !subject) return bad('provider and subject required');
      // The provider's real name is never stored or shown: a player is 'Player'
      // until they pick a nickname (#12).
      const avatar = body.avatar ? String(body.avatar).slice(0, 512) : null, t = now();
      this.sql.exec(
        `INSERT INTO accounts (id,provider,subject,name,avatar,created,last_seen) VALUES (?,?,?,?,?,?,?)
         ON CONFLICT(provider,subject) DO UPDATE SET
           avatar = COALESCE(excluded.avatar, accounts.avatar), last_seen = excluded.last_seen`,
        hex16(), provider, subject, 'Player', avatar, t, t);
      return Response.json({ account: this.one(`SELECT * FROM accounts WHERE provider=? AND subject=?`, provider, subject) });
    }

    if (p === '/account') {
      const id = url.searchParams.get('id') || '';
      const account = this.account(id);
      return Response.json(account ? { account, wallop: this.wallop(id), tariff_wars: this.tw(id) } : { account: null });
    }

    // Wallop is a client-side simulation; the reported balances are taken as-is
    // (clamped). First sync ever hands out a one-off 250 Noise welcome bonus.
    if (p === '/wallop/sync' && req.method === 'POST') {
      const id = String(body.accountId || '');
      if (!this.account(id)) return bad('no such account');
      const row = this.wallop(id);
      let noise = int(body.noise), bonusApplied = false;
      if (!row || !row.bonus_given) { noise = Math.min(LIMIT, noise + 250); bonusApplied = true; }
      this.sql.exec(
        `INSERT INTO wallop (account_id,noise,teeth,battles,bets,bets_won,bonus_given,updated) VALUES (?,?,?,?,?,?,1,?)
         ON CONFLICT(account_id) DO UPDATE SET noise=excluded.noise, teeth=excluded.teeth, battles=excluded.battles,
           bets=excluded.bets, bets_won=excluded.bets_won, bonus_given=1, updated=excluded.updated`,
        id, noise, int(body.teeth), int(body.battles), int(body.bets), int(body.bets_won), now());
      return Response.json({ wallop: this.wallop(id), bonusApplied });
    }

    // One finished Tariff Wars game. margin = winner's lead over the runner-up.
    if (p === '/tw/result' && req.method === 'POST') {
      const id = String(body.accountId || '');
      if (!this.account(id)) return bad('no such account');
      const won = body.won ? 1 : 0, margin = won ? int(body.margin) : 0;
      this.sql.exec(
        `INSERT INTO tariff_wars (account_id,games,won,margin_total,best_margin,updated) VALUES (?,1,?,?,?,?)
         ON CONFLICT(account_id) DO UPDATE SET games=games+1, won=won+excluded.won, margin_total=margin_total+excluded.margin_total,
           best_margin=MAX(best_margin, excluded.best_margin), updated=excluded.updated`,
        id, won, margin, margin, now());
      return Response.json({ tariff_wars: this.tw(id) });
    }

    if (p === '/leaderboard') {
      const rows = (q) => this.sql.exec(q).toArray();
      return Response.json({
        wallop: rows(`SELECT a.id, a.name, a.avatar, w.teeth, w.noise, w.battles FROM wallop w JOIN accounts a ON a.id=w.account_id
                      ORDER BY w.teeth DESC, w.noise DESC LIMIT 50`),
        tariff_wars: rows(`SELECT a.id, a.name, a.avatar, t.won, t.margin_total, t.games FROM tariff_wars t JOIN accounts a ON a.id=t.account_id
                           ORDER BY t.won DESC, t.margin_total DESC LIMIT 50`),
      });
    }

    if (p === '/rename' && req.method === 'POST') {
      const id = String(body.accountId || ''), name = String(body.name || '').trim();
      if (!/^[A-Za-z0-9_]{3,20}$/.test(name)) return Response.json({ error: 'invalid' });
      const clash = this.one(`SELECT id FROM accounts WHERE lower(name)=lower(?) AND id<>?`, name, id);
      if (clash) return Response.json({ error: 'taken' });
      this.sql.exec(`UPDATE accounts SET name=?, nick_set=1 WHERE id=?`, name, id);
      const account = this.account(id);
      return account ? Response.json({ account }) : bad('no such account');
    }

    return new Response('not found', { status: 404 });
  }
}
