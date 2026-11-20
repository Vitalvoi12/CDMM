# CDMM

CDMM is a personal planner for study and time tracking. Plan work in the calendar, organize tasks by subject, and record how you actually spend your time.

[Open CDMM](https://cdmm.vitalvoi.beer/)

## What you can do

- Plan your day with calendar blocks, a daily checklist, and notes.
- Prioritize tasks in an Eisenhower matrix. Drag tasks between quadrants on desktop and give them a planned day so they appear in the calendar checklist.
- Set deadlines and reminders, estimate task duration, and track progress.
- Run focus sessions and compare planned time with actual time. Review study time and weekly goals by subject.

## Run locally

Use Node.js 24. Install dependencies with `npm ci`, then run each command in its own terminal.

```sh
npm run server:dev
npm run dev
```

Open the address printed by Vite. The API runs on port 5175 by default and stores its SQLite database under `data/`.

## Self-host with Docker

GitHub Actions publishes Linux images for amd64 and arm64. For HTTPS, set your hostname in `caddy/Caddyfile`, point its DNS to your server, and run Docker Compose with the base configuration.

```sh
docker compose -f compose.yaml up -d
```

The `data/` directory holds the SQLite database. Keep it when upgrading or moving your instance.
