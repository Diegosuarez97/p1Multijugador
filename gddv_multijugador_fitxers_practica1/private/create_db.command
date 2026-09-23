#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DB_FILE="$SCRIPT_DIR/users.db"

if [[ -f "$DB_FILE" ]]; then
  echo "Ja existeix una base de dades anomenada \"users.db\""
  echo
  echo "Elimina-la abans si la vols recrear des de zero"
  read -r -p "Prem Enter per finalitzar..."
  exit 0
fi

if ! command -v sqlite3 >/dev/null 2>&1; then
  echo "Error: no s'ha trobat sqlite3 al PATH."
  echo "Instal·la SQLite abans de continuar."
  read -r -p "Prem Enter per finalitzar..."
  exit 1
fi

if sqlite3 "$DB_FILE" "CREATE TABLE IF NOT EXISTS users (user_id INTEGER PRIMARY KEY, user_name varchar(63), user_password varchar(255), nickname varchar(150));" \
  && sqlite3 "$DB_FILE" "CREATE UNIQUE INDEX user_name_UNIQUE ON users (user_name ASC);"; then
  echo "S'ha creat la base de dades \"users.db\""
  echo
  echo "Pots carregar-la amb: sqlite3 users.db"
else
  echo "Error: no s'ha pogut crear la base de dades \"users.db\""
  rm -f "$DB_FILE"
  read -r -p "Prem Enter per finalitzar..."
  exit 1
fi

read -r -p "Prem Enter per finalitzar..."
