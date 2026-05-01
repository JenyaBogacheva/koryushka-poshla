# Scrabble (Корюшка пошла)

Family-style three-player Russian Scrabble (Эрудит) for browser play.
Server-authoritative engine · WebSocket protocol · React 19 UI.

## Development

```bash
nvm use            # Node 20
npm install
npm run dev        # Vite :5173 + Express+WS :3000
# Open http://localhost:5173/?slot=0&name=Имя (three tabs, slots 0–2)
npm test           # Vitest suite
npm run typecheck  # strict TS check (root + client)
npm run demo       # full-game smoke test, no UI
npm run build      # produce client/dist/
npm start          # production: single Express on :3000 serves client + /ws
```

## Production / Render

- Deploy is configured via `render.yaml` — a single free-tier web service that serves
  the bundled client and the `/ws` WebSocket endpoint on one port (`$PORT`).
- The `data/` directory is **ephemeral** on Render's free tier: in-progress games and
  archived history are wiped on every redeploy. The family is expected to finish a game
  in one sitting; past games persist only between redeploys, not across them.
- Free-tier dynos spin down after ~15 minutes of inactivity. The first connection after
  sleep takes roughly 30 seconds while the dyno wakes up — this is not a bug.
