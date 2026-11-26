#!/usr/bin/env bash
# Sube las reglas de seguridad y las funciones de notificaciones a tu proyecto de Firebase.
# Uso (en Google Cloud Shell):  ./desplegar.sh ID-DEL-PROYECTO
set -euo pipefail
PROYECTO="${1:?Uso: ./desplegar.sh ID-DEL-PROYECTO}"
cd "$(dirname "$0")"
npm install --prefix functions --no-audit --no-fund
npx -y firebase-tools@13.29.1 deploy --only functions,firestore:rules --project "$PROYECTO" --force
echo "Listo: notificaciones activadas en $PROYECTO"
