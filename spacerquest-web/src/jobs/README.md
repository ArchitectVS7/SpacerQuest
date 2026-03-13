# SpacerQuest v4.0 - Background Worker

Background job processor for SpacerQuest that handles scheduled game events.

## Jobs

### Daily Tick (Midnight UTC)
- Resets daily trip counters for all players
- Collects port income (landing fees, fuel sales)
- Evicts inactive port owners (30+ days)
- Checks and processes promotions
- Generates daily news log

### Encounter Generation (Every 5 minutes)
- Simulates bot-vs-bot combat encounters
- Processes alliance system takeover attempts
- Updates port fuel prices based on supply/demand

### Mission Generation (Every 6 hours)
- Generates Space Patrol missions for eligible players
- Checks Nemesis mission eligibility (500+ wins, perfect ship)
- Checks Maligna mission eligibility (Conqueror status)
- Generates special alliance events

## Usage

### Run continuously (production)
```bash
npm run worker
```

### Run all jobs once (testing)
```bash
npm run worker:once
```

## Health Check

The worker exposes a health check endpoint on port 3001 (configurable):

- `GET /health` - Returns worker status and last job run times
- `GET /ready` - Returns readiness status

Example health response:
```json
{
  "status": "healthy",
  "uptime": 3600.5,
  "lastDailyTick": "2026-03-13T00:00:00.000Z",
  "lastEncounterJob": "2026-03-13T02:00:00.000Z",
  "lastMissionJob": "2026-03-13T00:00:00.000Z",
  "errors": []
}
```

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `WORKER_HEALTH_PORT` | `3001` | Port for health check server |
| `WORKER_LOG_LEVEL` | `info` | Log level (info, warn, error, silent) |
| `DATABASE_URL` | (required) | PostgreSQL connection string |

## Running in Docker

Add to docker-compose.yml:

```yaml
worker:
  build: .
  command: node dist/jobs/worker.js
  environment:
    - NODE_ENV=production
    - DATABASE_URL=postgresql://user:pass@db:5432/spacerquest
    - REDIS_URL=redis://redis:6379
  depends_on:
    - db
    - redis
  restart: unless-stopped
```

## Graceful Shutdown

The worker handles SIGINT and SIGTERM signals for graceful shutdown:

```bash
# Send graceful shutdown signal
kill -TERM <pid>
```

## Logs

Example log output:

```
[2026-03-13T00:00:00.000Z] [INFO] 🚀 SpacerQuest v4.0 Background Worker starting...
[2026-03-13T00:00:00.000Z] [INFO] Configuration: encounters=300s, missions=21600s
[2026-03-13T00:00:00.000Z] [INFO] Health server listening on port 3001
[2026-03-13T00:00:00.000Z] [INFO] Daily tick scheduled in 120 minutes (at 2026-03-13T02:00:00.000Z)
[2026-03-13T00:00:00.000Z] [INFO] Encounter job scheduled every 5 minutes
[2026-03-13T00:00:00.000Z] [INFO] Mission job scheduled every 6 hours
[2026-03-13T00:00:00.000Z] [INFO] ✅ Background worker running. Press Ctrl+C to stop.
[2026-03-13T00:05:00.000Z] [INFO] Running encounter generation...
[Encounter Job] Starting encounter generation...
[Encounter Job] Completed: 3 bot combats, 0 takeover attempts
[2026-03-13T00:05:00.000Z] [INFO] Encounter job completed: 3 bot combats, 0 takeover attempts
```

## Testing

Run all jobs once to verify functionality:

```bash
npm run worker:once
```

Expected output:
```
[INFO] 🚀 SpacerQuest v4.0 Background Worker starting...
[INFO] Running all jobs once (test mode)...
[INFO] Running daily tick...
[Daily Tick] Starting daily tick for...
[Daily Tick] Reset X character trip counters
[Daily Tick] Processed X ports, collected X cr
[INFO] Daily tick: X trips, X ports
[INFO] Running encounter generation...
[INFO] Encounters: X combats, X takeovers
[INFO] Running mission generation...
[INFO] Missions: X patrol, X Nemesis
[INFO] All jobs completed
```

## Troubleshooting

### Worker won't start
- Check DATABASE_URL is set correctly
- Verify database is accessible
- Check port 3001 is not in use

### Jobs failing silently
- Check WORKER_LOG_LEVEL is set to 'info'
- Review health endpoint for error messages
- Check database connection pool settings

### High memory usage
- Worker is designed to run long-term
- Memory should stabilize after initial load
- Consider restarting periodically in production
