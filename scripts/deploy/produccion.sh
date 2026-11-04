#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════════════
# ENTRADA DEL DESPLIEGUE CONTINUO DEL CRM (GitHub Actions → VM)
#
# El flujo `Deploy` lo ejecuta por SSH desde el ejecutor de la oficina:
#   ssh cguardpro@192.168.86.19 'bash -s -- <sha> <modo> <quién>' < este-archivo
#
# 1. Compila EN el servidor (~/cguard-frontend-new), con su `.env` de
#    producción: la URL del API y la clave real de mapas no salen de ahí.
#    Compilar no toca lo publicado; si falla, producción sigue igual.
# 2. Publica con el despliegue oficial del backend:
#      scripts/desplegar.sh crm --dist ~/cguard-frontend-new/dist
#    (valida el artefacto y la URL del API, mismo nombre = mismo contenido,
#    respaldo, publicación, prueba de humo con integridad vía Cloudflare,
#    vuelta atrás, registro en Superadmin › Observabilidad › Versiones y el
#    paquete del programa de escritorio).
# Modo «revertir»: `desplegar.sh --revertir crm` (último respaldo).
# Sólo despliega el commit del CI si sigue siendo la punta de main.
# ════════════════════════════════════════════════════════════════════════════
set -euo pipefail
SHA="${1:?falta el commit}"; MODO="${2:-deploy}"; QUIEN="${3:-desconocido}"
export DEPLOY_QUIEN="github:$QUIEN"
DESPLEGAR="$HOME/cguard-backend/scripts/desplegar.sh"

if [ "$MODO" = revertir ]; then
  exec bash "$DESPLEGAR" --revertir crm
fi

cd "$HOME/cguard-frontend-new"
exec 9>"$HOME/.deploy-crm-build.lock"
flock -n 9 || { echo "::error::ya hay un build del CRM en curso"; exit 1; }
git fetch -q origin main
PUNTA=$(git rev-parse origin/main)
if [ "$PUNTA" != "$(git rev-parse "$SHA")" ]; then
  echo "main ya está en ${PUNTA:0:8}, más nuevo que ${SHA:0:8}: lo despliega la ejecución de ese commit."
  exit 0
fi
# Ya publicado (a mano o por otra ejecución): desplegar.sh deja el commit en el
# index servido. Recompilar lo mismo sólo gasta diez minutos de CPU de producción.
SELLO=$(grep -o 'name="cg-commit" content="[^"]*"' /var/www/frontend/index.html 2>/dev/null | sed 's/.*content="//;s/"$//' || true)
if [ -n "$SELLO" ] && [ "$(git rev-parse "$SELLO" 2>/dev/null || true)" = "$(git rev-parse "$SHA")" ]; then
  echo "El CRM publicado ya es ${SHA:0:8}."; exit 0
fi
PREV=$(git rev-parse HEAD)
git merge --ff-only -q "$SHA"
if ! git diff --quiet "$PREV" "$SHA" -- package.json package-lock.json; then
  echo "── npm ci (cambió el lockfile)"; npm ci --no-audit --no-fund
fi
echo "── build del CRM ${SHA:0:8}"
if ! npm run build; then
  git reset -q --keep "$PREV"
  echo "::error::el build del CRM falló; producción no se tocó"; exit 1
fi
exec bash "$DESPLEGAR" crm --dist "$HOME/cguard-frontend-new/dist"
