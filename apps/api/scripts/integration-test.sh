#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
API_DIR="$ROOT_DIR/apps/api"
COMPOSE_FILE="$ROOT_DIR/docker-compose.yml"
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgres://payvault:payvault@localhost:5433/payvault_test?sslmode=disable}"

cleanup() {
  docker compose -f "$COMPOSE_FILE" stop postgres-test >/dev/null 2>&1 || true
  if [[ -n "${MIGRATE_RUNNER:-}" && -f "$MIGRATE_RUNNER" ]]; then
    rm -f "$MIGRATE_RUNNER"
  fi
}
trap cleanup EXIT

docker compose -f "$COMPOSE_FILE" up -d postgres-test
container_id="$(docker compose -f "$COMPOSE_FILE" ps -q postgres-test)"
for _ in {1..30}; do
  status="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
  if [[ "$status" == "healthy" || "$status" == "running" ]]; then
    break
  fi
  sleep 1
done

MIGRATE_RUNNER="$(mktemp "$API_DIR/integration-migrate-XXXXXX.go")"
cat > "$MIGRATE_RUNNER" <<'GOEOF'
package main

import (
	"fmt"
	"os"
	"path/filepath"

	"github.com/golang-migrate/migrate/v4"
	_ "github.com/golang-migrate/migrate/v4/database/postgres"
	_ "github.com/golang-migrate/migrate/v4/source/file"
)

func main() {
	dbURL := os.Getenv("TEST_DATABASE_URL")
	if dbURL == "" {
		panic("TEST_DATABASE_URL is required")
	}

	migrationsDir, err := filepath.Abs("migrations")
	if err != nil {
		panic(err)
	}

	m, err := migrate.New("file://"+migrationsDir, dbURL)
	if err != nil {
		panic(err)
	}
	defer m.Close()

	if err := m.Up(); err != nil && err != migrate.ErrNoChange {
		panic(err)
	}

	fmt.Println("migrations applied")
}
GOEOF

(
  cd "$API_DIR"
  go run "$(basename "$MIGRATE_RUNNER")"
  go test -tags integration -v ./internal/services/...
)
