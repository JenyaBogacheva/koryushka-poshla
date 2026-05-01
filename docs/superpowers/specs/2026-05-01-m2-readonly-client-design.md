# M2 — Read-Only Client Design

**Date:** 2026-05-01
**Status:** Draft for review
**Parent spec:** `docs/superpowers/specs/2026-04-30-scrabble-design.md`

## 1. Goal

Stand up the HTTP + WebSocket server and a minimal React client that watches a server-driven scripted game. End of M2: run `npm run dev`, open the browser, and see a full Scrabble game play itself in real time — board, racks, scores, turn highlight all updating from server snapshots. No user interaction yet; that lands in M3.

This milestone validates: (a) the wire format and snapshot protocol, (b) shared types between client and server, (c) the visual layout, (d) the production single-service deployment shape.

## 2. Scope

**In scope**
- Express + `ws` server (`server/index.ts`).
- Vite + React 19 client under `client/`, styled with Tailwind 4 + CSS variables for the palette.
- Server-side scripted runner that drives a real `Game` instance and broadcasts a `state` snapshot after each mutation.
- One server → client message: `state`.
- Integration test booting the server in-process and asserting the snapshot sequence.

**Deferred to later milestones**
- All client → server messages (`join`, `submitMove`, `swapTiles`, `claimBlank`, `pass`, `redraw`, `toggleRackVisible`, `endGame`).
- Identity flow: slot picker, `localStorage` persistence, `join` handshake.
- Rack visibility redaction (every M2 client sees the full state; redaction lands with `toggleRackVisible` in M4).
- Disconnect / pause overlay.
- Blank picker, substitution picker, history panel, action bar.
- Dictionary advisory display.
- Render deployment (M5).

## 3. Architecture

```
dev:
  Vite (:5173) ──HMR──▶ browser
              │
              └─ proxies /ws ──▶ Express + ws (:3000)
                                       │
                                       ├─ Game (existing M1 engine)
                                       └─ scripted runner (timed move loop)

prod (single Node process):
  Express + ws (:$PORT) ──▶ serves client/dist (static)
                       └──▶ /ws upgrades to WebSocket
```

- **Single Node process in prod.** Render's free tier runs one service; it serves the built React bundle and the WebSocket on the same port.
- **Two processes in dev.** Vite owns HMR and the browser; Express owns `/ws`. Vite proxies `/ws` to Express. Started by one `npm run dev` via `concurrently`.
- **Server pushes only.** Client opens the socket and listens. No client → server traffic in M2.
- **Engine is unchanged.** The M1 modules stay pure and untouched. M2 is additive: a thin Express/ws layer plus a client.

## 4. File Layout

New and modified files:

```
scrabble/
├── package.json                      # adds: express, ws, vite, react, tailwind, zustand, concurrently
├── server/
│   ├── index.ts                      # NEW — Express + ws bootstrap, static + /ws + scripted runner
│   └── scripted-game.ts              # NEW — extracted move list + game builder shared with demo script
├── scripts/
│   └── demo-game.ts                  # MODIFIED — imports from server/scripted-game.ts (single source of truth)
├── client/
│   ├── index.html
│   ├── vite.config.ts                # proxy /ws → :3000, alias @shared
│   ├── tsconfig.json                 # extends root, JSX, paths to @shared
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   └── src/
│       ├── main.tsx                  # React 19 root
│       ├── App.tsx                   # Layout: Board + 3 PlayerCards
│       ├── components/
│       │   ├── Board.tsx             # 15×15 grid
│       │   ├── Square.tsx            # single cell — premium styling + placed tile
│       │   ├── Tile.tsx              # tile visual (letter + small point value)
│       │   ├── PlayerCard.tsx        # name, score, rack, turn highlight
│       │   └── Rack.tsx              # 7-slot rack
│       ├── ws.ts                     # WebSocket client → store
│       ├── store.ts                  # Zustand store: { state: GameState | null, connected: boolean }
│       └── styles/
│           └── index.css             # Tailwind directives + :root palette variables
└── tests/
    └── integration/
        └── m2-server.test.ts         # NEW — boots server in-process, asserts snapshot stream
```

Engine modules under `server/{board,bag,rack,moves,scoring,game,letters,premiums,persistence,dictionary}.ts` and their tests are unchanged.

## 5. Server (`server/index.ts`)

Responsibilities, in order on boot:

1. Build a `Game` from `server/scripted-game.ts`.
2. Start an HTTP server on `process.env.PORT ?? 3000`.
3. In prod (`NODE_ENV === 'production'`), mount `client/dist` as static.
4. Attach a `ws.WebSocketServer` on path `/ws`.
5. On each socket `connection`: send the current snapshot immediately as `{ type: 'state', state }`.
6. Start the scripted runner (see §6). After each move, broadcast a fresh `state` to all connected sockets.

Broadcast helper: `broadcast(message)` iterates `wss.clients`, sends only to `readyState === OPEN`.

Snapshot shape: the full `GameState` from `shared/types.ts` (no redaction in M2).

## 6. Scripted Runner

The runner replaces the `console.log` loop in M1's `scripts/demo-game.ts`. It is configurable:

```ts
type RunnerOptions = { delayMs: number };  // default 2000 in server, 0 in tests

async function runScriptedGame(game: Game, moves: ScriptedMove[], onSnapshot: (s: GameState) => void, opts: RunnerOptions): Promise<void>
```

- After each move is applied via `game.submitMove(...)`, call `onSnapshot(game.getState())` and `await sleep(delayMs)`.
- Stops when the move list is exhausted; no loop.
- Throws if `game.submitMove` returns a rejection — the script is supposed to be valid by construction, so a rejection is a bug.

`scripts/demo-game.ts` becomes a thin wrapper: builds the game, calls `runScriptedGame` with `onSnapshot = printScores`, `delayMs: 0`.

`server/index.ts` builds the same game and calls `runScriptedGame` with `onSnapshot = (s) => broadcast({ type: 'state', state: s })`, `delayMs: 2000`.

## 7. Protocol (M2 subset)

**Server → client**

| Type | Payload | Meaning |
|---|---|---|
| `state` | full `GameState` | Snapshot. Sent on connect and after every move applied by the runner. |

**Client → server**: none in M2.

All messages are JSON with a `type` field, matching the parent spec §8.

## 8. Client

### 8.1 Stack

- React 19, TypeScript strict, Vite 5.
- Tailwind 4 (CSS-first config) for layout utilities.
- Palette as CSS variables in `:root`, referenced via Tailwind theme extension so component code uses semantic class names (e.g., `bg-tile`, `text-ink`).
- Zustand for state. One store, two fields: `state: GameState | null`, `connected: boolean`. `ws.ts` is the only writer.

### 8.2 Components

- **`App.tsx`** — page layout. Two columns: board (left, takes most width), player-card column (right). Below board: empty placeholder for the future own-rack + action bar.
- **`Board.tsx`** — receives `state.board`. Renders a 15×15 grid of `<Square/>`. Premium-square styling driven by the same `premiums` module the server uses (see §11 for the exact import path decision).
- **`Square.tsx`** — single cell. Shows premium type if empty, placed `<Tile/>` if occupied. Center star marker when empty.
- **`Tile.tsx`** — letter (large), points (small, bottom-right). Subtle shadow, rounded corners, palette-aware.
- **`PlayerCard.tsx`** — name, score, `<Rack/>`. Highlighted with peach background when its slot equals `state.turnIndex`.
- **`Rack.tsx`** — 7 tile slots, displays whatever `player.rack` contains.

All components are presentational. No event handlers in M2.

### 8.3 WebSocket client (`ws.ts`)

- On module load, open `new WebSocket('/ws')` (relative URL works for both dev via Vite proxy and prod).
- `onopen`: `store.setConnected(true)`.
- `onclose` / `onerror`: `store.setConnected(false)`. Auto-reconnect with a fixed 1s delay (no backoff needed for personal use).
- `onmessage`: parse JSON, dispatch by `type`. For `state`, `store.setState(state)`. Unknown types: warn and ignore.

### 8.4 Styling

Palette (from parent spec §5) lives in `client/src/styles/index.css`:

```css
:root {
  --bg: #f5ebdd;
  --tile: #fdf8f0;
  --sage-light: #c9e4d8;
  --sage: #7eb8a0;
  --peach: #f5d4b8;
  --terracotta: #d97757;
  --ink: #4a3528;
}
```

Tailwind config maps these to theme tokens (`colors.bg`, `colors.tile`, etc.).

## 9. Build & Run

```jsonc
// package.json scripts (additions/changes)
{
  "dev": "concurrently \"npm:dev:server\" \"npm:dev:client\"",
  "dev:server": "tsx watch server/index.ts",
  "dev:client": "vite",
  "build": "vite build",
  "start": "NODE_ENV=production tsx server/index.ts",
  "test": "vitest run",
  "typecheck": "tsc --noEmit",
  "demo": "tsx scripts/demo-game.ts"
}
```

- `npm run dev` starts both. Open http://localhost:5173.
- `npm run build` produces `client/dist/`.
- `npm start` runs the prod single-service.

## 10. Testing

1. **Engine tests** — unchanged.
2. **Integration test** (`tests/integration/m2-server.test.ts`):
   - Import the Express app factory and a `WebSocket` from the `ws` package.
   - Boot on an ephemeral port with `delayMs: 0`.
   - Connect a single client; collect `state` messages until the game ends.
   - Assert: first message has `phase: 'playing'`, scores monotonically non-decreasing, final message matches the expected end state from M1's demo.
3. **No browser tests.** Manual verification: `npm run dev`, watch a game.

## 11. Risks & Open Questions

- **`server/premiums.ts` import from client.** The engine's premium-square map is pure data; client needs the same table to render bonus styling. Plan: re-export from `@shared` or move the table into `shared/`. Decided in implementation, not in design.
- **React 19 + Tailwind 4 freshness.** Both are current as of 2026; minor config tweaks may be required during scaffolding.
- **`tsx` in production.** Acceptable for personal-scale traffic; revisit in M5 deployment if startup time matters on Render free tier.

## 12. Out of Scope (M2-specific)

- Any user interaction in the client.
- `join`/identity, slot picker, localStorage.
- Rack-visibility redaction.
- Dictionary advisory rendering.
- Animations beyond what falls out of React re-rendering.
- Disconnect overlay (the client just shows "connecting…" or stale state when the socket is down).
- Production deployment.
