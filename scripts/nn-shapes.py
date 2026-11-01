#!/usr/bin/env python3
# Nuclear Negotiations table shapes. A wheel with fewer seats than the other is modelled as a
# ring with the same number of angular slots and one EMPTY chair ('_'), so "facing" stays
# "same slot" and a one-seat turn moves the empty chair along with the wheel.
# R = rogue, L = ordinary leader, _ = empty chair. Only rogue/empty positions matter.
import itertools, sys
from collections import deque

def war(o, i): return any(a == 'R' and b == 'R' for a, b in zip(o, i))
def rotate(ring): return (ring[-1],) + ring[:-1]           # one slot clockwise

def legal(o, i, empty_swap):
    m = []
    for k in range(len(o)):
        a, b = o[k], i[k]
        if (a == 'R') == (b == 'R'): continue                 # no rogue, or both (war)
        other = b if a == 'R' else a
        if other == '_' and not empty_swap: continue
        m.append(k)
    return m

def apply(o, i, k, rotating='outer'):
    o, i = list(o), list(i); o[k], i[k] = i[k], o[k]; o, i = tuple(o), tuple(i)
    return (rotate(o), i) if rotating == 'outer' else (o, rotate(i))

def rings(slots, rogues, leaders):
    """every arrangement of a ring with given counts (rest empty)"""
    out = set()
    for pos in itertools.permutations(range(slots)):
        r = ['_'] * slots
        for p in pos[:rogues]: r[p] = 'R'
        for p in pos[rogues:rogues + leaders]: r[p] = 'L'
        out.add(tuple(r))
    return out

def analyse(name, slots, outer_rogues, outer_leaders, inner_rogues, inner_leaders, empty_swap, rotating='outer'):
    starts = {(o, i) for o in rings(slots, outer_rogues, outer_leaders) for i in rings(slots, inner_rogues, inner_leaders) if not war(o, i)}
    seen, q = set(starts), deque(starts); edges = {}
    while q:
        s = q.popleft(); o, i = s
        edges[s] = {}
        for k in legal(o, i, empty_swap):
            t = apply(o, i, k, rotating); edges[s][k] = t
            if not war(*t) and t not in seen: seen.add(t); q.append(t)
    states = list(edges)
    nomove = [s for s in states if not edges[s]]
    allfatal = [s for s in states if edges[s] and all(war(*t) for t in edges[s].values())]
    safe_moves = sum(1 for s in states for t in edges[s].values() if not war(*t))
    all_moves = sum(len(edges[s]) for s in states)
    # Duel solve: mover loses if every move is fatal (or no move). Retrograde to a fixpoint.
    val = {}
    for s in states:
        if not edges[s] or all(war(*t) for t in edges[s].values()): val[s] = 'L'
    changed = True
    while changed:
        changed = False
        for s in states:
            if s in val: continue
            succ = [t for t in edges[s].values() if not war(*t)]
            if any(val.get(t) == 'L' for t in succ): val[s] = 'W'; changed = True
            elif all(val.get(t) == 'W' for t in succ): val[s] = 'L'; changed = True
    W = sum(1 for s in states if val.get(s) == 'W'); L = sum(1 for s in states if val.get(s) == 'L'); D = len(states) - W - L
    sW = sum(1 for s in starts if val.get(s) == 'W'); sL = sum(1 for s in starts if val.get(s) == 'L'); sD = len(starts) - sW - sL
    print(f"\n== {name} ==  (rotating: {rotating}, swap into empty chair: {empty_swap})")
    print(f"reachable positions {len(states)}, legal starts {len(starts)}")
    print(f"positions with NO legal move: {len(nomove)}   positions where EVERY move is nuclear war: {len(allfatal)}")
    print(f"safe moves {safe_moves}/{all_moves} ({100*safe_moves/all_moves:.0f}%)")
    print(f"duel, perfect play: mover wins {W}, mover loses {L}, endless {D}  | from the deal: win {sW}, lose {sL}, endless {sD}")
    for s in (allfatal + nomove)[:3]: print("   e.g.", 'outer', ''.join(s[0]), 'inner', ''.join(s[1]))

analyse("Standard 4 vs 4, one rogue each", 4, 1, 3, 1, 3, False)
for es in (False, True):
    analyse("5 outer (2 rogues) vs 4 inner (1 rogue)", 5, 2, 3, 1, 3, es)
    analyse("4 outer (1 rogue) vs 5 inner (2 rogues)", 5, 1, 3, 2, 3, es)
analyse("4 outer (1 rogue) vs 5 inner (2 rogues), inner wheel turns", 5, 1, 3, 2, 3, True, rotating='inner')
analyse("5 vs 5, two rogues each", 5, 2, 3, 2, 3, False)
