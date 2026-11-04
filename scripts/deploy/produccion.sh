#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# DESPLIEGUE DEL CRM (app.cguardpro.com) EN PRODUCCIÓN (VM 192.168.86.19)
#
# Lo ejecuta el flujo `Deploy` de GitHub Actions por SSH desde el ejecutor de la
# oficina:  ssh cguardpro@192.168.86.19 'bash -s -- <sha> <modo> <quién> <run-url>' < este-archivo
#
# El CRM se compila EN el servidor, con su `.env` de producción (la clave real
# de mapas nunca sale de ahí). Después:
#   - respaldo de lo publicado (todo menos assets/: los assets llevan hash y
#     se conservan, así una pestaña abierta con la versión anterior no se rompe)
#   - se copia dist/ sobre /var/www/frontend y el index.html AL FINAL
#   - chequeo: la página responde y sirve el index nuevo
#   - si algo falla después de copiar: se restaura el respaldo
# Cada intento queda en ~/deploy-history.jsonl (lo lee el Superadmin).
# ════════════════════════════════════════════════════════════════════════════
set -Eeuo pipefail
SHA="${1:?falta el commit}"; MODO="${2:-deploy}"; QUIEN="${3:-desconocido}"; RUN_URL="${4:-}"
APP="$HOME/cguard-frontend-new"; WWW=/var/www/frontend; HIST="$HOME/deploy-history.jsonl"
TS=$(date -u +%Y%m%dT%H%M%SZ); INICIO=$(date -u +%FT%TZ); BK="$HOME/crm-rollback-$TS"
exec 9>"$HOME/.deploy-crm.lock"
flock -n 9 || { echo "::error::Ya hay un despliegue del CRM en curso"; exit 1; }

registrar() {
  printf '{"app":"crm","sha":"%s","prev":"%s","mode":"%s","status":"%s","detail":"%s","by":"%s","run":"%s","startedAt":"%s","finishedAt":"%s"}\n' \
    "$SHA" "${PREV:-}" "$MODO" "$1" "${2//\"/\'}" "$QUIEN" "$RUN_URL" "$INICIO" "$(date -u +%FT%TZ)" >> "$HIST"
}

cd "$APP"
git fetch -q origin
git cat-file -e "${SHA}^{commit}" || { registrar fallido "commit desconocido"; echo "::error::Commit $SHA no existe en origin"; exit 1; }
PREV=$(git rev-parse HEAD)
if [ "$PREV" = "$(git rev-parse "$SHA")" ] && [ -f "$WWW/index.html" ]; then
  echo "Ya está desplegado $SHA"; registrar sin-cambios "ya desplegado"; exit 0
fi
if ! git merge-base --is-ancestor "$PREV" "$SHA" && [ "$MODO" != rollback ]; then
  registrar rechazado "no es un avance desde $PREV"
  echo "::error::$SHA no avanza desde lo desplegado ($PREV). Para volver atrás usa el modo rollback."; exit 1
fi

echo "── código $PREV → $SHA"
git reset -q --keep "$SHA"
if ! git diff --quiet "$PREV" "$SHA" -- package.json package-lock.json; then
  echo "── npm ci (cambió el lockfile)"; npm ci --no-audit --no-fund
fi

# Compilar no toca lo publicado: si falla, producción sigue igual.
trap 'trap - ERR; registrar fallido "build falló (línea $LINENO)"; git reset -q --keep "$PREV"; exit 1' ERR
echo "── build"; npm run build
trap - ERR

echo "── respaldo de lo publicado → $BK"
mkdir -p "$BK"; rsync -a --exclude assets "$WWW/" "$BK/"
ls -1dt "$HOME"/crm-rollback-* | tail -n +11 | xargs -r rm -rf   # se guardan los 10 últimos

volver() {
  echo "── VUELTA ATRÁS"
  rsync -a "$BK/" "$WWW/"
  git reset -q --keep "$PREV" || true
}
trap 'trap - ERR; registrar fallido "publicación falló (línea $LINENO)"; volver; exit 1' ERR
echo "── publicar"
rsync -a --exclude /index.html dist/ "$WWW/"   # sólo el index de la raíz espera al final
cp dist/index.html "$WWW/index.html"
sleep 2
CODE=$(curl -s -o /tmp/crm-index.html -w '%{http_code}' -H 'Host: app.cguardpro.com' http://127.0.0.1/ || true)
[ "$CODE" = 200 ] || CODE=$(curl -s -o /tmp/crm-index.html -w '%{http_code}' https://app.cguardpro.com/ || true)
[ "$CODE" = 200 ] || { echo "::error::app.cguardpro.com responde $CODE"; false; }
ENTRADA=$(grep -ho 'publico-[A-Za-z0-9_-]*\.js' dist/p/index.html dist/index.html 2>/dev/null | head -1)   # la raíz sirve la portada pública
[ -n "$ENTRADA" ] && grep -q "$ENTRADA" /tmp/crm-index.html \
  || { echo "::error::el index publicado no es el nuevo"; false; }
trap - ERR

registrar ok "$(git log -1 --format=%s | cut -c1-120)"
echo "✔ CRM en $(git rev-parse --short HEAD) · respaldo en $BK"
