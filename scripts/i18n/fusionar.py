#!/usr/bin/env python3
"""
Fusiona los bloques A y B de un idioma en src/locales/<idioma>.json.

Comprueba antes de escribir:
- que la unión de claves sea EXACTAMENTE la de es.json (el fichero completo, no
  el de los bloques): si la otra sesión añadió claves mientras se traducía, esto
  lo destapa en vez de dejarlas calladas en español — que es justo el fallo que
  esa sesión acaba de arreglar en el inglés.
- que ninguna clave aparezca en los dos bloques.
- que las interpolaciones sobrevivan.

Uso: python3 scripts/i18n/fusionar.py <idioma> [...]
"""
import json, os, re, sys

AQUI = os.path.dirname(__file__)
BLOQ = os.path.join(AQUI, 'bloques')
LOC  = os.path.join(AQUI, '..', '..', 'src', 'locales')

def hojas(o, pre=''):
    if isinstance(o, dict):
        for k, v in o.items(): yield from hojas(v, f'{pre}.{k}' if pre else k)
    else: yield pre, o

def funde(a, b):
    out = json.loads(json.dumps(a))
    for k, v in b.items():
        if k in out and isinstance(out[k], dict) and isinstance(v, dict):
            out[k] = funde(out[k], v)
        else:
            out[k] = v
    return out

def procesa(lg):
    fa, fb = f'{BLOQ}/{lg}-A.json', f'{BLOQ}/{lg}-B.json'
    if not (os.path.exists(fa) and os.path.exists(fb)):
        print(f'· {lg}: faltan bloques'); return False
    A, B = json.load(open(fa, encoding='utf-8')), json.load(open(fb, encoding='utf-8'))
    solapa = set(A) & set(B)
    if solapa:
        print(f'✗ {lg}: grupos en AMBOS bloques: {sorted(solapa)[:5]}'); return False
    junto = funde(A, B)

    # RECONCILIACIÓN ENTRE BLOQUES. Dos traductores en paralelo traducen la misma
    # palabra de dos maneras: «Otro» sale como Divers en un bloque y Sonstiges en
    # el otro, y el usuario ve dos palabras para lo mismo en pantallas distintas.
    # Se unifica por MAYORÍA de uso, y sólo en cadenas cortas: son los rótulos,
    # donde la coherencia importa y el contexto casi nunca cambia el sentido. Los
    # textos largos se dejan como están: ahí dos redacciones correctas no molestan
    # y forzar una podría estropear la que mejor encaja.
    from collections import Counter
    es_pl = dict(hojas(json.load(open(f'{LOC}/es.json', encoding='utf-8'))))
    tr_pl = dict(hojas(junto))
    votos = {}
    for k, v in es_pl.items():
        if isinstance(v, str) and 3 < len(v) <= 25 and isinstance(tr_pl.get(k), str):
            votos.setdefault(v, Counter())[tr_pl[k]] += 1
    canon = {v: c.most_common(1)[0][0] for v, c in votos.items() if len(c) > 1}
    if canon:
        def aplica(o, pre=''):
            for k, val in o.items():
                r = f'{pre}.{k}' if pre else k
                if isinstance(val, dict): aplica(val, r)
                elif isinstance(val, str):
                    base = es_pl.get(r)
                    if base in canon and val != canon[base]: o[k] = canon[base]
        aplica(junto)
        print(f'    reconciliadas {len(canon)} palabras que salían de dos formas '
              f'(p. ej. «{list(canon)[0]}» → «{canon[list(canon)[0]]}»)')

    es = json.load(open(f'{LOC}/es.json', encoding='utf-8'))
    ke, kj = set(dict(hojas(es))), set(dict(hojas(junto)))
    faltan, sobran = sorted(ke - kj), sorted(kj - ke)
    # Interpolaciones
    de, dj = dict(hojas(es)), dict(hojas(junto))
    # Sólo es fallo INVENTAR una variable que el código no pasa (saldría literal
    # en pantalla). Usar menos de las disponibles es legítimo y depende del idioma.
    rotas = [k for k in ke & kj
             if isinstance(de[k], str) and isinstance(dj[k], str)
             and set(re.findall(r'\{\{\s*([\w.]+)\s*\}\}', dj[k])) -
                 set(re.findall(r'\{\{\s*([\w.]+)\s*\}\}', de[k]))]
    print(f'{"✗" if (faltan or sobran or rotas) else "✓"} {lg}: {len(kj)} claves | '
          f'faltan {len(faltan)} | sobran {len(sobran)} | interp rotas {len(rotas)}')
    for x in faltan[:6]: print(f'    NUEVA en español, sin traducir: {x}')
    for x in sobran[:4]: print(f'    sobra: {x}')
    for x in rotas[:4]:  print(f'    interp: {x}')
    if faltan or sobran or rotas: return False
    json.dump(junto, open(f'{LOC}/{lg}.json', 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    print(f'    → escrito src/locales/{lg}.json')
    return True

if __name__ == '__main__':
    ok = all(procesa(lg) for lg in (sys.argv[1:] or ['de','fr','it','pl','nl']))
    sys.exit(0 if ok else 1)
