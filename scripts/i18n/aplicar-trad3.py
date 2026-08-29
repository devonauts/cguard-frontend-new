#!/usr/bin/env python3
"""
Mete las traducciones planas de `traducir3/<idioma>.json` en `src/locales/<idioma>.json`.

Sólo AÑADE: si la clave ya existía en el idioma destino, se respeta lo que había
(alguien pudo afinarla a mano). Anida por los puntos de la clave.
"""
import json, os, sys

AQUI = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(AQUI, 'traducir3')
LOC = os.path.join(AQUI, '..', '..', 'src', 'locales')

def hojas(o, pre=''):
    if isinstance(o, dict):
        for k, v in o.items(): yield from hojas(v, f'{pre}.{k}' if pre else k)
    else: yield pre, o

fallo = False
for idioma in ['en','pt','de','fr','it','pl','nl']:
    p = os.path.join(DIR, f'{idioma}.json')
    if not os.path.exists(p):
        print(f'  {idioma}: SIN ENTREGAR'); fallo = True; continue
    tr = json.load(open(p, encoding='utf-8'))
    dst = os.path.join(LOC, f'{idioma}.json')
    d = json.load(open(dst, encoding='utf-8'))
    antes = len(list(hojas(d)))
    puestas = ya = 0; malas = []
    for k, v in sorted(tr.items()):
        partes = k.split('.'); o = d; ok = True
        for x in partes[:-1]:
            if x in o and not isinstance(o[x], dict):
                malas.append(f'{k}: «{x}» ya es texto'); ok = False; break
            o = o.setdefault(x, {})
        if not ok: continue
        if partes[-1] in o: ya += 1; continue
        o[partes[-1]] = v; puestas += 1
    if malas:
        print(f'  {idioma}: COLISIÓN de estructura, no se escribe'); [print('    ✗',m) for m in malas[:5]]
        fallo = True; continue
    json.dump(d, open(dst, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'  {idioma}: +{puestas} (ya estaban {ya})  {antes} → {len(list(hojas(d)))}')

sys.exit(1 if fallo else 0)
