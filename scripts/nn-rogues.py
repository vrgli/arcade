#!/usr/bin/env python3
# Nuclear Negotiations: solve the 4v4 table with three rogues (and four, see the bottom). Run: python3 -I scripts/nn-rogues.py
import itertools
from collections import deque
def war(o,i): return any(a=='R' and b=='R' for a,b in zip(o,i))
def rot(r): return (r[-1],)+r[:-1]
def legal(o,i): return [k for k in range(4) if (o[k]=='R')!=(i[k]=='R')]
def apply(o,i,k):
    o,i=list(o),list(i); o[k],i[k]=i[k],o[k]; return rot(tuple(o)),tuple(i)
def rings(n_r):
    out=set()
    for pos in itertools.combinations(range(4),n_r):
        r=['L']*4
        for p in pos: r[p]='R'
        out.add(tuple(r))
    return out
def solve(starts):
    seen=set(starts); q=deque(starts); edges={}
    while q:
        s=q.popleft(); edges[s]={}
        for k in legal(*s):
            t=apply(*s,k); edges[s][k]=t
            if not war(*t) and t not in seen: seen.add(t); q.append(t)
    states=list(edges)
    allfatal=[s for s in states if all(war(*t) for t in edges[s].values())]
    nomove=[s for s in states if not edges[s]]
    # longest guaranteed survival from each state (solo): max over safe moves of 1+survive(next), inf if cycle
    val={}
    for s in states:
        if all(war(*t) for t in edges[s].values()): val[s]='L'
    ch=True
    while ch:
        ch=False
        for s in states:
            if s in val: continue
            succ=[t for t in edges[s].values() if not war(*t)]
            if any(val.get(t)=='L' for t in succ): val[s]='W'; ch=True
            elif all(val.get(t)=='W' for t in succ): val[s]='L'; ch=True
    # solo: states from which perfect play survives forever
    forever=set(s for s in states if s not in val or val[s]!='L')
    ch=True
    while ch:
        ch=False
        for s in list(forever):
            if not any((not war(*t)) and t in forever for t in edges[s].values()): forever.discard(s); ch=True
    safe=sum(1 for s in states for t in edges[s].values() if not war(*t)); allm=sum(len(edges[s]) for s in states)
    return states,allfatal,nomove,val,forever,safe,allm,edges
for label,(ro,ri) in {"3 rogues: 2 outer + 1 inner":(2,1),"3 rogues: 1 outer + 2 inner":(1,2)}.items():
    starts={(o,i) for o in rings(ro) for i in rings(ri) if not war(o,i)}
    states,allfatal,nomove,val,forever,safe,allm,edges=solve(starts)
    W=sum(1 for s in states if val.get(s)=='W'); L=sum(1 for s in states if val.get(s)=='L')
    print(f"\n== 4v4, {label} ==")
    print(f"reachable {len(states)} (starts {len(starts)}), every-move-fatal {len(allfatal)}, no-move {len(nomove)}, safe moves {safe}/{allm}")
    print(f"solo: positions from which a perfect player survives FOREVER: {len(forever)} of {len(states)}; starts that are forever-survivable: {sum(1 for s in starts if s in forever)} of {len(starts)}")
    print(f"duel perfect play: mover wins {W}, loses {L}, endless {len(states)-W-L}")
    # longest survival from doomed starts
    def depth(s,memo={}):
        if s in memo: return memo[s]
        memo[s]=0
        best=0
        for t in edges[s].values():
            if war(*t): continue
            best=max(best,1+depth(t))
        memo[s]=best; return best
    doomed=[s for s in starts if s not in forever]
    if doomed: print("doomed starts: max moves survivable", sorted(set(depth(s) for s in doomed)))
# combined: all 3-rogue states reachable from either
