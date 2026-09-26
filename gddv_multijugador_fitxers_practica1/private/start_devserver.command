#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PUBLIC_DIR="$SCRIPT_DIR/../public"

if ! command -v php >/dev/null 2>&1; then
  echo "Error: no s'ha trobat PHP al PATH."
  echo
  echo "Assegura't que PHP està instal·lat i disponible al PATH."
  echo
  read -r -p "Prem Enter per finalitzar..."
  exit 1
fi

cd "$PUBLIC_DIR" || exit 1

echo "PHP @ $PWD"
php -S localhost:8000
