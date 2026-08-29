#!/usr/bin/env python3
"""
Coherencia ENTRE los dos bloques del mismo idioma.

Partir el diccionario en A y B permite dos traductores en paralelo, pero abre un
riesgo: la misma frase española puede aparecer en los dos bloques y salir
traducida de dos maneras. Aquí se comparan las frases españolas que están en
ambos y se listan las que no coinciden.
"""
import json, os, sys
from collections import defaultdict

B = os.path.join(os.path.dirname(__file__), 'bloques')

def hojas(o, pre=''):
    if isinstance(o, dict):
        for k, v in o.items(): yield from hojas(v, f'{pre}.{k}' if pre else k)
    else: yield pre, o

for lg in (sys.argv[1:] or ['de','fr','it','pl','nl']):
    fa, fb = f'{B}/{lg}-A.json', f'{B}/{lg}-B.json'
    if not (os.path.exists(fa) and os.path.exists(fb)):
        print(f'· {lg}: faltan bloques'); continue
    esa, esb = dict(hojas(json.load(open(f'{B}/es-A.json')))), dict(hojas(json.load(open(f'{B}/es-B.json'))))
    ta, tb = dict(hojas(json.load(open(fa)))), dict(hojas(json.load(open(fb))))
    # frase española → traducciones vistas en cada bloque
    mapa = defaultdict(lambda: (set(), set()))
    for k, v in esa.items():
        if isinstance(v, str) and len(v) > 3 and isinstance(ta.get(k), str): mapa[v][0].add(ta[k])
    for k, v in esb.items():
        if isinstance(v, str) and len(v) > 3 and isinstance(tb.get(k), str): mapa[v][1].add(tb[k])
    # Comparar CADA frase da ruido: «dauerhaft» y «endgültig» son las dos
    # correctas para un aviso largo, y a nadie le importa cuál salga. Lo que sí
    # importa son los RÓTULOS (cortos, se leen de un vistazo y se comparan entre
    # pantallas) y las frases donde cambia un término del oficio.
    OFICIO = ('sitio', 'sede', 'puesto', 'estación', 'estacion', 'turno', 'ronda',
              'vigilante', 'cliente', 'novedad', 'consigna', 'relevo', 'supervisor')
    choques = {es: (a, b) for es, (a, b) in mapa.items() if a and b and not (a & b)
               and (len(es) <= 40 or any(w in es.lower() for w in OFICIO))}
    print(f'{"✓" if not choques else "✗"} {lg}: {len(choques)} divergencias que importan (rótulos y términos del oficio)')
    for es, (a, b) in sorted(choques.items(), key=lambda x: len(x[0]))[:10]:
        print(f'    «{es[:52]}»\n        A: {sorted(a)[0][:52]}\n        B: {sorted(b)[0][:52]}')
