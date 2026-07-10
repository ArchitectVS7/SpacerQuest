#!/bin/sh
set -e

echo "=== SpacerQuest Startup ==="
echo "NODE_ENV: $NODE_ENV"
echo "PORT: $PORT"
echo "DATABASE_URL set: $([ -n "$DATABASE_URL" ] && echo 'yes' || echo 'NO')"
echo "REDIS_URL set: $([ -n "$REDIS_URL" ] && echo 'yes' || echo 'NO')"

# Run migrations with a 30-second timeout
echo "Running Prisma migrations..."
if timeout 30 npx prisma migrate deploy 2>&1; then
  echo "Migrations complete."
else
  EXIT_CODE=$?
  if [ $EXIT_CODE -eq 143 ]; then
    echo "ERROR: Migration timed out after 30s (database may be unreachable)"
  else
    echo "ERROR: Migration failed with exit code $EXIT_CODE"
  fi
  echo "Attempting to start server anyway..."
fi

echo "Starting server..."
exec node dist/app/index.js
