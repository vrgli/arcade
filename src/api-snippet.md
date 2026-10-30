# Wiring accounts, sign-in and the leaderboard into `src/index.js`

Paste-ready. Nothing below touches existing routes.

## 1. Imports and DO export (top of `src/index.js`)

```js
import { Accounts } from './accounts.js';
import { handleAuth, getSession } from './auth.js';
import { leaderboardPage } from './leaderboard-page.js';
export { Room, Stats, Accounts };   // replace the existing `export { Room, Stats };`
```

## 2. Helpers (module scope, next to `record`)

```js
const accounts = (env) => env.ACCOUNTS.get(env.ACCOUNTS.idFromName('arcade'));
const acct = (env, path, body) => accounts(env).fetch('https://accounts' + path, body ? { method: 'POST', body: JSON.stringify(body) } : undefined).then((r) => r.json());
const PROVIDER_KEYS = { google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'], github: ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET'], discord: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET'], apple: ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'] };
const providers = (env) => Object.fromEntries(Object.entries(PROVIDER_KEYS).map(([k, ks]) => [k, !!env.SESSION_SECRET && ks.every((n) => !!env[n])]));
```

## 3. Routes (inside `fetch`, before `return env.ASSETS.fetch(req);`)

```js
    // Sign-in, accounts, leaderboard — see auth.js / accounts.js.
    if (p.startsWith('/auth/')) return handleAuth(req, env, url);

    if (p === '/api/me') {
      const s = await getSession(req, env);
      const d = s ? await acct(env, '/account?id=' + s.accountId) : { account: null };
      return Response.json({ account: d.account || null, wallop: d.wallop || null, tariff_wars: d.tariff_wars || null, providers: providers(env) }, { headers: { 'Cache-Control': 'no-store' } });
    }
    if (p === '/api/wallop/sync' && req.method === 'POST') {
      const s = await getSession(req, env);
      if (!s) return Response.json({ error: 'sign in first' }, { status: 401 });
      const b = await req.json().catch(() => ({}));
      return Response.json(await acct(env, '/wallop/sync', { accountId: s.accountId, noise: b.noise, teeth: b.teeth, battles: b.battles, bets: b.bets, bets_won: b.bets_won }));
    }
    if (p === '/api/tw/result' && req.method === 'POST') {
      const s = await getSession(req, env);
      if (!s) return Response.json({ error: 'sign in first' }, { status: 401 });
      const b = await req.json().catch(() => ({}));
      return Response.json(await acct(env, '/tw/result', { accountId: s.accountId, won: !!b.won, margin: b.margin }));
    }
    if (p === '/api/rename' && req.method === 'POST') {
      const s = await getSession(req, env);
      if (!s) return Response.json({ error: 'sign in first' }, { status: 401 });
      const b = await req.json().catch(() => ({}));
      return Response.json(await acct(env, '/rename', { accountId: s.accountId, name: b.name }));
    }
    if (p === '/leaderboard' || p === '/leaderboard.json') {
      const data = await acct(env, '/leaderboard');
      if (p === '/leaderboard.json') {
        const strip = (rows) => rows.map(({ id, ...r }) => r);   // account ids stay out of the public JSON
        return Response.json({ wallop: strip(data.wallop), tariff_wars: strip(data.tariff_wars) });
      }
      const s = await getSession(req, env);
      return new Response(leaderboardPage(data, s && s.accountId), { headers: { 'Content-Type': 'text/html;charset=utf-8' } });
    }
```

## 4. `wrangler.toml`

Add `/auth/*`, `/leaderboard` and `/leaderboard.json` to `run_worker_first` (`/api/*` is already there):

```toml
run_worker_first = ["/mp-socket", "/api/*", "/auth/*", "/leaderboard", "/leaderboard.json", "/e", "/stats", "/stats.json", "/arcade", "/arcade/", "/vs/*", "/play/tariff-wars"]
```

Then append:

```toml
[[durable_objects.bindings]]
name = "ACCOUNTS"
class_name = "Accounts"

[[migrations]]
tag = "v3"
new_sqlite_classes = ["Accounts"]
```

## 5. Secrets

`SESSION_SECRET` is required for any sign-in at all; generate it with `openssl rand -hex 32`. Each provider switches itself on when all of its vars are present (`GET /auth/providers` reports which are live).

```
wrangler secret put SESSION_SECRET
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put GITHUB_CLIENT_ID
wrangler secret put GITHUB_CLIENT_SECRET
wrangler secret put DISCORD_CLIENT_ID
wrangler secret put DISCORD_CLIENT_SECRET
wrangler secret put APPLE_CLIENT_ID
wrangler secret put APPLE_TEAM_ID
wrangler secret put APPLE_KEY_ID
wrangler secret put APPLE_PRIVATE_KEY
```

`APPLE_PRIVATE_KEY` is the whole `.p8` file, headers included. Paste it multi-line or with literal `\n` — `auth.js` accepts both. Local dev: the same names in `.dev.vars`; callbacks use `url.origin`, so `http://localhost:8787/auth/<provider>/callback` works once registered at the provider.

## 6. Client contract

- Sign-in buttons link to `/auth/google`, `/auth/github`, `/auth/discord`, `/auth/apple`, each with `?next=<current path>`. Show only those `GET /api/me` reports `providers[x] === true`.
- Sign-out: `<form method="post" action="/auth/logout">`.
- `POST /api/wallop/sync` body `{noise, teeth, battles, bets, bets_won}` → `{wallop, bonusApplied}`; `bonusApplied` is true exactly once per account (+250 noise).
- `POST /api/tw/result` body `{won, margin}` → `{tariff_wars}`.
- `/privacy` needs a paragraph on the `vg_s` cookie and what an account stores (provider, provider id, name, avatar URL, game tallies). The footer line "NO ACCOUNT · NO COOKIES" on `/` is no longer true once this ships.
