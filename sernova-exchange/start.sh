#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
echo "Iniciando SERNOVA EXCHANGE en http://localhost:8765"
exec node server.js
