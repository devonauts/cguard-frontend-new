#!/usr/bin/env python3
"""
Verificador de los bloques traducidos del CRM.

Igual que el de las apps, pero adaptado a dos diferencias del CRM:
- El trabajo llega partido en bloques (A y B); se valida cada uno contra su
  fuente y, al final, la unión contra el es.json completo.
- El CRM es un panel de escritorio: hay más aire que en 390 px. Sólo se vigila
  el ancho en `sidebar.*`, encabezados de tabla y botones, que es donde aprieta.
"""
import json, os, re, sys

BASE = os.path.join(os.path.dirname(__file__), 'bloques')

def hojas(o, pre=''):
    if isinstance(o, dict):
        for k, v in o.items(): yield from hojas(v, f'{pre}.{k}' if pre else k)
    else: yield pre, o

def interp(s):
    return sorted(re.findall(r'\{\{\s*([\w.]+)\s*\}\}', s)) if isinstance(s, str) else []

def revisa(lg, bloque):
    f = os.path.join(BASE, f'{lg}-{bloque}.json')
    if not os.path.exists(f): return None
    base = dict(hojas(json.load(open(os.path.join(BASE, f'es-{bloque}.json'), encoding='utf-8'))))
    try: tr = dict(hojas(json.load(open(f, encoding='utf-8'))))
    except json.JSONDecodeError as e: return {'fatal': f'JSON inválido: {e}'}

    faltan, sobran = sorted(set(base)-set(tr)), sorted(set(tr)-set(base))
    perdidas, iguales, anchos = [], [], []
    ESTRECHO = ('sidebar.',)
    for k, v in base.items():
        t = tr.get(k)
        if not isinstance(v, str) or not isinstance(t, str): continue
        # Lo que rompe en pantalla es usar una variable que el código NO pasa:
        # sale literal, «{{foo}}». Usar MENOS de las disponibles es seguro —el
        # neerlandés dice «{{count}} gepubliceerde dienst{{plural}}» donde el
        # español repite {{plural}} dos veces, y ambas variables existen. Por eso
        # se comparan CONJUNTOS y sólo se marca lo que sobra en la traducción.
        invent = set(interp(t)) - set(interp(v))
        if invent: perdidas.append(f'{k}: inventa {sorted(invent)}')
        if t.strip() == v.strip() and len(v) > 8 and not re.fullmatch(r'[\W\d]+', v.strip()):
            iguales.append(f'{k} = {v[:45]}')
        # Distinguir etiqueta de mensaje por LONGITUD no funciona: «Error al
        # cargar clientes» es corto en español y aun así es un aviso con sitio
        # de sobra. Lo que sí lo dice es el NOMBRE de la clave. Sólo aprietan
        # los rótulos, botones, pestañas y encabezados de tabla.
        hoja = k.rsplit('.', 1)[-1].lower()
        rama = k.lower()
        es_mensaje = any(w in rama for w in (
            'error', 'toast', 'msg', 'message', 'hint', 'help', 'desc', 'sub',
            'placeholder', 'confirm', 'empty', 'banner', 'tooltip', 'notice',
            'warning', 'success', 'body', 'text', 'aria'))
        es_etiqueta = (not es_mensaje) and (
            hoja in ('title', 'label', 'name', 'add', 'edit', 'save', 'cancel',
                     'delete', 'view', 'close', 'create', 'search', 'filter')
            or any(w in rama for w in ('.nav.', '.tab', '.col', '.tbl.', '.actions.',
                                       '.menu.', '.header.', '.btn')))
        if es_etiqueta and len(t) > 20 and len(v) and len(t)/len(v) > 1.45:
            anchos.append((round(len(t)/len(v),2), k, v, t))
    anchos.sort(reverse=True)
    return {'claves': len(tr), 'faltan': faltan, 'sobran': sobran,
            'interp': perdidas, 'iguales': iguales, 'anchos': anchos}

if __name__ == '__main__':
    idiomas = sys.argv[1:] or ['de','fr','it','pl','nl']
    fallo = 0
    for lg in idiomas:
        for bl in ['A','B']:
            r = revisa(lg, bl)
            if r is None: print(f'· {lg}-{bl}: aún no existe'); continue
            if r.get('fatal'): print(f'✗ {lg}-{bl}: {r["fatal"]}'); fallo = 1; continue
            malo = r['faltan'] or r['sobran'] or r['interp']
            print(f'{"✗" if malo else "✓"} {lg}-{bl}: {r["claves"]} claves | faltan {len(r["faltan"])} | '
                  f'sobran {len(r["sobran"])} | interp rotas {len(r["interp"])} | '
                  f'sin traducir {len(r["iguales"])} | menú ancho {len(r["anchos"])}')
            for x in r['faltan'][:4]: print(f'    falta:  {x}')
            for x in r['interp'][:4]: print(f'    interp: {x}')
            for x in r['iguales'][:3]: print(f'    igual:  {x}')
            if malo: fallo = 1
    sys.exit(fallo)
