#!/usr/bin/env python3
"""
Fusiona en es.json las claves que los diez agentes sacaron del código.

Cada agente escribe su propio `lote-NN-claves.json` (plano: {"a.b.c": "Texto"})
porque diez procesos editando es.json a la vez se pisan y pierden claves sin
avisar. Aquí se juntan, se detectan choques y se escribe una sola vez.
"""
import glob, json, os, sys

AQUI = os.path.dirname(__file__)
ES = os.path.join(AQUI, '..', '..', 'src', 'locales', 'es.json')

def hojas(o, pre=''):
    if isinstance(o, dict):
        for k, v in o.items(): yield from hojas(v, f'{pre}.{k}' if pre else k)
    else: yield pre, o

todas, origen, choques = {}, {}, []
for f in sorted(glob.glob(os.path.join(AQUI, 'constantes', '*-claves.json'))):
    lote = os.path.basename(f).replace('-claves.json', '')
    d = json.load(open(f, encoding='utf-8'))
    plano = d if all(isinstance(v, str) for v in d.values()) else dict(hojas(d))
    for k, v in plano.items():
        if k in todas and todas[k] != v:
            choques.append(f'{k}: «{todas[k]}» ({origen[k]})  vs  «{v}» ({lote})')
        todas[k] = v; origen.setdefault(k, lote)
    print(f'  {lote}: {len(plano)} claves')

print(f'\n  total distintas: {len(todas)} | choques entre lotes: {len(choques)}')
for c in choques[:10]: print(f'    ✗ {c}')

d = json.load(open(ES, encoding='utf-8'))
antes = len(dict(hojas(d)))
puestas, ya, malas = 0, 0, []
for k, v in sorted(todas.items()):
    p = k.split('.'); o = d; ok = True
    for x in p[:-1]:
        if x in o and not isinstance(o[x], dict):
            malas.append(f'{k}: «{x}» ya es texto, no grupo'); ok = False; break
        o = o.setdefault(x, {})
    if not ok: continue
    if p[-1] in o: ya += 1; continue
    o[p[-1]] = v; puestas += 1
despues = len(dict(hojas(d)))
print(f'  añadidas: {puestas} · ya existían: {ya} · imposibles: {len(malas)}  ({antes} → {despues})')
for m in malas[:8]: print(f'    ✗ {m}')
if not (choques or malas):
    json.dump(d, open(ES, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print('  → es.json actualizado')
else:
    print('  NO se escribió: resuelve los choques primero')
    sys.exit(1)
