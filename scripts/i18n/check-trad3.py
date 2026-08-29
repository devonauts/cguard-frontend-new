#!/usr/bin/env python3
"""
Verifica las traducciones planas de `traducir3/`.

Cada regla de aquí nació de un falso positivo o de un fallo real; los comentarios
explican por qué el umbral es el que es, para no volver a aflojarlo por error.
"""
import json, re, sys, os

AQUI = os.path.dirname(os.path.abspath(__file__))
DIR = os.path.join(AQUI, 'traducir3')
ES = json.load(open(os.path.join(DIR, 'pendientes.json'), encoding='utf-8'))

# pt e it comparten mucho léxico con el español: una cadena idéntica suele ser un
# cognado legítimo («Total», «Normal»), no una traducción olvidada. En de/fr/pl/nl
# sí es un fallo, salvo préstamos ya asentados.
COGNADOS = {'pt', 'it'}
PRESTAMOS = {'supervisor','checklist','offline','online','monitor','sms','email','wifi','gps',
             'cctv','pdf','csv','excel','bodycam','radio','chat','web','app','pin','ok','id',
             'total','normal','nota','manual','error','pausa','no','si','tablet','router','hub',
             'fotos','foto','video','videos','audio','logo','panel','alarma','tarifa',
             # marcas y nombres de color: coinciden por ser lo mismo en ambos idiomas
             'whatsapp','telegram','magenta','general','cian','lima','ambar',
             'disponible','urgente','normal','simple','mobile','service'}

# Una abreviatura de tres letras que coincide no prueba nada: «Lun» es lunes en
# español y *lundi* en francés, «Mar» es martes y *mardi*. Exigir que difieran
# obligaría a inventar una abreviatura peor que la correcta.
ABREV = re.compile(r'^[A-Za-zÀ-ÿ]{1,3}\.?$')

# El rótulo se detecta por el NOMBRE de la clave, no por su longitud: «Error al
# cargar clientes» es corto y aun así es un aviso, no una etiqueta de columna.
ROTULO = re.compile(r'(^sidebar\.|\.actions\.|\.tbl\.|\.label$|\.title$|labelKey|\.status\.|\.badge)', re.I)
AVISO  = re.compile(r'(error|toast|hint|placeholder|desc|message|aviso|ayuda)', re.I)

def variables(s):
    # CONJUNTO, no lista: usar MENOS variables de las que pasa el código es
    # legítimo; INVENTAR una la pinta literal en pantalla como {{loQueSea}}.
    return set(re.findall(r'\{\{\s*(\w+)', s))

fallos, avisos = [], []
for idioma in ['en','pt','de','fr','it','pl','nl']:
    p = os.path.join(DIR, f'{idioma}.json')
    if not os.path.exists(p):
        avisos.append(f'{idioma}: todavía no entregado'); continue
    tr = json.load(open(p, encoding='utf-8'))
    f = []
    if set(tr) != set(ES):
        f.append(f'  claves distintas: faltan {len(set(ES)-set(tr))}, sobran {len(set(tr)-set(ES))}')
    for k, es in ES.items():
        t = tr.get(k)
        if t is None: continue
        if not str(t).strip():
            f.append(f'  VACÍA  {k}'); continue
        inventadas = variables(t) - variables(es)
        if inventadas:
            f.append(f'  VARIABLE INVENTADA {sorted(inventadas)}  {k}: «{t}»')
        if t == es and idioma not in COGNADOS:
            if (t.strip().lower() not in PRESTAMOS and not ABREV.match(t.strip())
                    and not re.fullmatch(r'[\W\d\s]*|\{\{.*\}\}', t)):
                f.append(f'  SIN TRADUCIR  {k}: «{t}»')
        # ancho: el ratio solo engaña («Hoy»→«Aujourd\'hui» es ×3,67 y son 11
        # caracteres, cabe en cualquier sitio). Hace falta un umbral ABSOLUTO.
        if ROTULO.search(k) and not AVISO.search(k) and len(t) > 16 and len(t) > len(es) * 1.4:
            avisos.append(f'{idioma} ANCHO  {k}: «{es}» → «{t}» ({len(es)}→{len(t)})')
    print(f'  {idioma}: {len(tr)} claves · {len(f)} fallos')
    fallos += [f'{idioma}{x}' for x in f]

print(f'\n  FALLOS: {len(fallos)}')
for x in fallos[:40]: print('   ✗', x)
print(f'  avisos de ancho/pendientes: {len(avisos)}')
for x in avisos[:15]: print('   ·', x)
sys.exit(1 if fallos else 0)
