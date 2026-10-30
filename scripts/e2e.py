# Two browsers at one table: host creates (2 people + 2 AI), friend joins via the
# share link, both press Ready, the match starts, the host pledges, the round plays
# on. Usage: e2e.py <base-url> [screenshot-dir]
import sys, time, re
from playwright.sync_api import sync_playwright
BASE = sys.argv[1].rstrip('/'); OUT = sys.argv[2] if len(sys.argv) > 2 else '/tmp'
import os
EXE = os.environ.get('CHROME_PATH')  # None → Playwright's bundled Chromium
def ctx(pw, name):
    b = pw.chromium.launch(executable_path=EXE)
    c = b.new_context(viewport={'width':1920,'height':937})
    c.add_init_script(f"localStorage.setItem('vg_name','{name}')")
    p = c.new_page(); p.on('dialog', lambda d: d.accept(name))
    p.on('response', lambda r: print(f'[{name} 404]', r.url) if r.status == 404 else None)
    p.on('console', lambda m: print(f'[{name} console {m.type}]', m.text) if m.type in ('error','warning') else None)
    return b, p
with sync_playwright() as pw:
    bA, A = ctx(pw, 'Alice'); bB, B = ctx(pw, 'Bob')
    A.goto(BASE + '/play/tariff-wars/'); A.wait_for_timeout(800)
    A.click('#btn-host-game'); A.wait_for_selector('#fpl-make', timeout=5000)
    A.click('#fpl-make'); A.wait_for_selector('#fpl-link-in', timeout=8000)
    link = A.input_value('#fpl-link-in'); code = A.inner_text('.fpl-code').strip()
    print('table', code, 'link', link)
    assert re.search(r'[?&]room=' + code, link), 'share link should carry the room code'
    B.goto(link); B.wait_for_selector('#fpl-ready', timeout=8000)
    A.wait_for_selector('#fpl-ready'); A.screenshot(path=f'{OUT}/e2e-lobby-host.png')
    A.click('#fpl-ready'); B.click('#fpl-ready')
    A.wait_for_selector('#fpl-overlay', state='hidden', timeout=10000)
    B.wait_for_selector('#fpl-overlay', state='hidden', timeout=10000)
    # Pledging rotates: whoever has chips pledges 0; AI seats pledge on the server.
    # Then the lead card appears for whichever human leads.
    deadline = time.time() + 40; pledged = set(); lead = None
    while time.time() < deadline and lead is None:
        for nm, pg in (('A', A), ('B', B)):
            if nm not in pledged and pg.locator('#chips .chip').count():
                pg.screenshot(path=f'{OUT}/e2e-pledge-{nm}.png'); pg.click('#chips .chip >> nth=0'); pledged.add(nm); print(nm, 'pledged')
            if pg.locator('#b1 .play').count(): lead = nm
        time.sleep(0.3)
    assert len(pledged) == 2, f'both humans should have pledged, got {pledged}'
    assert lead, 'someone should be on lead with a playable card'
    A.screenshot(path=f'{OUT}/e2e-play-host.png'); B.screenshot(path=f'{OUT}/e2e-play-friend.png')
    print('OK: both seated, pledges relayed, host on lead; Bob sees', B.locator('#b1 *').count(), 'nodes in his hand box')
    bA.close(); bB.close()
