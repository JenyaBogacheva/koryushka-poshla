# M2 — Read-Only Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the HTTP + WebSocket server and a minimal React client that watches a server-driven scripted Scrabble game render in real time. End of M2: `npm run dev`, open the browser, watch the M1 demo play itself.

**Architecture:** Additive layer over the M1 engine. A new `server/index.ts` Express + `ws` process holds a `Game`, runs the scripted move list with a delay, and broadcasts a `state` snapshot after each mutation. A new `client/` (Vite + React 19 + Tailwind 4 + Zustand) connects to `/ws`, dispatches `state` messages into the store, and re-renders. No client → server messages in M2. No interaction. No identity flow. No redaction.

**Tech Stack:** Express 4, `ws` 8, Vite 5, React 19, Tailwind 4 (CSS-first), Zustand 4, `concurrently` for dev, all on top of TypeScript 5 + Node 20 already in M1.

**Spec reference:** `docs/superpowers/specs/2026-05-01-m2-readonly-client-design.md`

**Scope of this plan:** M2 only. M3 (interactive place-and-submit), M4 (all rules in UI), M5 (polish + deploy) get their own plans.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `package.json` | Modify | Add deps (express, ws, vite, react, tailwind, zustand, concurrently) and dev/build/start scripts |
| `tsconfig.json` | Modify | Exclude `client/**` so the root config keeps targeting Node-only modules |
| `shared/premiums.ts` | Create (moved) | Premium-square map — moved from `server/premiums.ts` so client and server share it |
| `server/premiums.ts` | Delete | Re-exported from new location during the move; deleted at end of Task 1 |
| `server/scripted-game.ts` | Create | Builds the scripted `Game`, exposes a `runScriptedGame` async runner with a `delayMs` knob and an `onSnapshot` callback. Single source of truth for both `npm run demo` and the M2 server. |
| `scripts/demo-game.ts` | Modify | Becomes a thin wrapper around `runScriptedGame` with `delayMs: 0` and a console-printing snapshot callback. |
| `server/index.ts` | Create | Express + `ws` bootstrap. Serves `client/dist` in prod, exposes `/ws`, runs scripted runner with `delayMs: 2000`, broadcasts `state` after each mutation. |
| `tests/integration/m2-server.test.ts` | Create | Boots the server in-process on an ephemeral port, connects a single fake WS client, asserts the snapshot stream. |
| `client/index.html` | Create | Vite entry HTML. |
| `client/vite.config.ts` | Create | Vite config — React plugin, `/ws` proxy → `:3000`, `@shared` path alias. |
| `client/tsconfig.json` | Create | TS config for the client (JSX, DOM lib, paths to `@shared`). |
| `client/postcss.config.js` | Create | Tailwind 4 PostCSS plugin. |
| `client/src/main.tsx` | Create | React root. |
| `client/src/App.tsx` | Create | Top layout: board + 3 player cards. |
| `client/src/store.ts` | Create | Zustand store — `state: GameState \| null`, `connected: boolean`. |
| `client/src/ws.ts` | Create | WebSocket client; opens `/ws`, dispatches `state` into the store; reconnects after 1s. |
| `client/src/components/Tile.tsx` | Create | Tile visual: letter + small point value. |
| `client/src/components/Square.tsx` | Create | Single board cell — premium styling when empty, placed `<Tile/>` when occupied. |
| `client/src/components/Board.tsx` | Create | 15×15 grid of `<Square/>`. |
| `client/src/components/Rack.tsx` | Create | 7-slot rack of `<Tile/>`. |
| `client/src/components/PlayerCard.tsx` | Create | Name, score, `<Rack/>`; turn highlight. |
| `client/src/styles/index.css` | Create | Tailwind 4 directives + `:root` palette CSS variables. |
| `CLAUDE.md` | Modify | Add the new dev/build commands and a one-line note about the client. |

---

## Task 1: Move `premiums` into `shared/` so the client can import it

The premium-square map is pure data and is needed by both server (scoring) and client (square coloring). Move it from `server/` to `shared/` first; this is a tiny refactor that keeps the engine green and unlocks the client without copying tables.

**Files:**
- Create: `shared/premiums.ts`
- Delete: `server/premiums.ts`
- Modify: `server/scoring.ts`, `server/board.ts`, `tests/premiums.test.ts`, anywhere else that imports `./premiums.js` (run grep)

- [ ] **Step 1: Find all import sites of `server/premiums.ts`**

```bash
grep -rn "premiums" server/ tests/ shared/ scripts/ --include="*.ts"
```

Expected: a handful of imports like `from './premiums.js'` or `from '../server/premiums.js'`.

- [ ] **Step 2: Create `shared/premiums.ts` with the existing content**

Copy the contents of `server/premiums.ts` verbatim into `shared/premiums.ts`. The file already has `import type { Premium, PremiumMap } from '@shared/types';` — that import works unchanged from the new location (just becomes a sibling import). Update it accordingly:

```ts
import type { Premium, PremiumMap } from './types.js';

const PATTERN: string[] = [
  'w..L...w...L..w',
  '.W...l...l...W.',
  '..W...L.L...W..',
  'L..W...L...W..L',
  '....W.....W....',
  '.l...l...l...l.',
  '..L...L.L...L..',
  'w..L...*...L..w',
  '..L...L.L...L..',
  '.l...l...l...l.',
  '....W.....W....',
  'L..W...L...W..L',
  '..W...L.L...W..',
  '.W...l...l...W.',
  'w..L...w...L..w',
];

function decode(ch: string): Premium {
  switch (ch) {
    case 'w': return 'TW';
    case 'W': return 'DW';
    case 'l': return 'TL';
    case 'L': return 'DL';
    case '*': return 'CENTER';
    case '.': return null;
    default: throw new Error(`Unknown premium char: ${ch}`);
  }
}

export const PREMIUMS: PremiumMap = PATTERN.map((row) =>
  Array.from(row).map(decode),
);
```

- [ ] **Step 3: Update server import sites to use `@shared/premiums`**

For every import found in Step 1 inside `server/` and `tests/` (anything that's not the file we just created), change `from './premiums.js'` (or `'../server/premiums.js'`) to `from '@shared/premiums.js'`.

Expected files at minimum: `server/scoring.ts`, possibly `server/board.ts`, possibly `tests/premiums.test.ts`. Confirm via the grep.

- [ ] **Step 4: Delete `server/premiums.ts`**

```bash
rm server/premiums.ts
```

- [ ] **Step 5: Typecheck and run all tests**

```bash
npm run typecheck && npm test
```

Expected: PASS — same 96 tests as M1, no behavior change.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: move premiums map to shared/ for client reuse"
```

---

## Task 2: Extract scripted runner so demo and server share one game definition

Pull the scripted move loop out of `scripts/demo-game.ts` into `server/scripted-game.ts`, exposing an async `runScriptedGame(game, opts)` with a snapshot callback and a delay knob. The script becomes a thin caller; the M2 server (Task 4) is the second caller.

**Files:**
- Create: `server/scripted-game.ts`
- Modify: `scripts/demo-game.ts`
- Test: existing `npm run demo` still produces the same final scoreboard

- [ ] **Step 1: Write `server/scripted-game.ts`**

```ts
import { Game } from './game.js';
import type { GameState, Placement, Slot, Tile } from '@shared/types';
import { SIZE } from './board.js';

export type ScriptedRunOptions = {
  /** Delay between moves in milliseconds. 0 in tests/demo, ~2000 in the live server so a human can watch. */
  delayMs: number;
  /** Called once after each successful Game mutation (joinPlayer, startGame, submitMove/passTurn, endGame). */
  onSnapshot: (state: GameState) => void;
};

const NUM_TURNS = 9;

function pickPlayedAs(t: Tile): string {
  if (t.isBlank) return 'А';
  return t.letter;
}

function findEmptyAdjacent(board: GameState['board']): { row: number; col: number } | null {
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r]![c] !== null) continue;
      for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr]![nc] !== null) {
          return { row: r, col: c };
        }
      }
    }
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return ms === 0 ? Promise.resolve() : new Promise((res) => setTimeout(res, ms));
}

export function buildScriptedGame(): Game {
  const g = new Game({ seed: 42 });
  g.joinPlayer(0, 'Женя');
  g.joinPlayer(1, 'Мама');
  g.joinPlayer(2, 'Папа');
  g.startGame();
  return g;
}

export async function runScriptedGame(g: Game, opts: ScriptedRunOptions): Promise<void> {
  // Emit the initial post-startGame snapshot so listeners see the dealt racks.
  opts.onSnapshot(g.snapshot());
  await sleep(opts.delayMs);

  for (let turn = 0; turn < NUM_TURNS; turn++) {
    const s = g.snapshot();
    const slot = s.turnIndex as Slot;
    const player = s.players[slot]!;
    const tile = player.rack[0];

    if (!tile) {
      g.passTurn(slot);
    } else {
      let placement: Placement;
      if (turn === 0) {
        placement = { tileId: tile.id, row: 7, col: 7, playedAs: pickPlayedAs(tile) };
      } else {
        const spot = findEmptyAdjacent(s.board);
        if (!spot) {
          g.passTurn(slot);
          opts.onSnapshot(g.snapshot());
          await sleep(opts.delayMs);
          continue;
        }
        placement = { tileId: tile.id, row: spot.row, col: spot.col, playedAs: pickPlayedAs(tile) };
      }
      const result = g.submitMove(slot, [placement]);
      if (!result.ok) g.passTurn(slot);
    }

    opts.onSnapshot(g.snapshot());
    await sleep(opts.delayMs);
  }

  g.endGame(0);
  opts.onSnapshot(g.snapshot());
}
```

- [ ] **Step 2: Rewrite `scripts/demo-game.ts` to use the runner**

```ts
import type { GameState } from '@shared/types';
import { buildScriptedGame, runScriptedGame } from '../server/scripted-game.js';

let lastTurn = -1;

function printSnapshot(state: GameState): void {
  const turn = state.history.length;
  if (turn !== lastTurn) {
    lastTurn = turn;
    const last = state.history[turn - 1];
    if (last) {
      const player = state.players[last.slot]!;
      const placement = last.placements[0]!;
      console.log(
        `Turn ${turn - 1}: ${player.name} placed ${placement.playedAs} at (${placement.row},${placement.col}) — ` +
        `+${last.totalScore} (${last.wordsFormed.map((w) => w.word).join(', ')})`,
      );
    }
  }
}

async function main(): Promise<void> {
  const g = buildScriptedGame();
  await runScriptedGame(g, { delayMs: 0, onSnapshot: printSnapshot });
  const final = g.snapshot();
  console.log('\n=== Final scores ===');
  const sorted = [...final.players].sort((a, b) => b.score - a.score);
  for (const p of sorted) console.log(`  ${p.name.padEnd(8)} ${p.score}`);
  console.log(`Winner: ${sorted[0]!.name}`);
}

main();
```

- [ ] **Step 3: Run the demo and confirm the same final scores as before the refactor**

```bash
npm run demo
```

Expected: A list of 9 turn lines (some may be passes for late turns) followed by a `=== Final scores ===` block with three players and a winner. The exact scores must match what the demo produced before this task. If they differ, the runner extraction changed behavior — fix.

- [ ] **Step 4: Run typecheck and tests**

```bash
npm run typecheck && npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/scripted-game.ts scripts/demo-game.ts
git commit -m "refactor: extract scripted runner to server/scripted-game.ts"
```

---

## Task 3: Install server runtime deps and write a minimal Express + ws bootstrap

Get the server process up. No game wired yet — just an HTTP server, a `/ws` endpoint, and a placeholder broadcaster. We'll wire the scripted runner in Task 4.

**Files:**
- Modify: `package.json`
- Create: `server/index.ts`

- [ ] **Step 1: Install runtime + dev deps**

```bash
npm install express@^4.19.0 ws@^8.16.0
npm install -D @types/express@^4.17.0 @types/ws@^8.5.0 concurrently@^8.2.0
```

Expected: `package.json` and `package-lock.json` updated. No errors.

- [ ] **Step 2: Add `start` script to `package.json`**

Open `package.json` and update the `scripts` block (keep existing entries):

```jsonc
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "demo": "tsx scripts/demo-game.ts",
  "start": "NODE_ENV=production tsx server/index.ts",
  "dev:server": "tsx watch server/index.ts"
}
```

(Client and combined `dev` scripts come in Task 5.)

- [ ] **Step 3: Write `server/index.ts`**

```ts
import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT ?? 3000);
const IS_PROD = process.env.NODE_ENV === 'production';

const app = express();

if (IS_PROD) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const clientDist = path.resolve(__dirname, '../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

function broadcast(message: object): void {
  const payload = JSON.stringify(message);
  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

wss.on('connection', (socket) => {
  // Placeholder: real snapshot comes in Task 4. For now, send an empty hello so we can verify wiring.
  socket.send(JSON.stringify({ type: 'hello' }));
});

httpServer.listen(PORT, () => {
  console.log(`[scrabble] listening on http://localhost:${PORT} (ws: /ws)`);
});

// Exported for tests in Task 4.
export { httpServer, wss, broadcast };
```

- [ ] **Step 4: Smoke-check the server starts**

```bash
npm run dev:server
```

Expected: `[scrabble] listening on http://localhost:3000 (ws: /ws)` printed; process stays alive. Press Ctrl+C to stop.

- [ ] **Step 5: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json server/index.ts
git commit -m "feat(server): Express + ws bootstrap on /ws"
```

---

## Task 4: Wire scripted runner into the server, broadcast state snapshots, integration-test

Boot a `Game`, run the scripted moves with a delay, and broadcast `{ type: 'state', state }` after every mutation. New connections get the latest snapshot immediately. Cover with an integration test that boots the server in-process, connects a fake WS client, and asserts the snapshot sequence.

**Files:**
- Modify: `server/index.ts`
- Create: `tests/integration/m2-server.test.ts`

- [ ] **Step 1: Refactor `server/index.ts` to expose a startable factory**

Replace the entire file with:

```ts
import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameState } from '@shared/types';
import { buildScriptedGame, runScriptedGame } from './scripted-game.js';

export type ServerOptions = {
  port?: number;       // 0 means ephemeral; default 3000
  delayMs?: number;    // scripted runner delay; default 2000 (live), 0 (tests)
  serveStatic?: boolean; // serve client/dist; default = NODE_ENV==='production'
};

export type RunningServer = {
  httpServer: HttpServer;
  wss: WebSocketServer;
  port: number;
  /** Resolves when the scripted runner finishes (game ends). */
  done: Promise<void>;
  close: () => Promise<void>;
};

export async function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const port = opts.port ?? Number(process.env.PORT ?? 3000);
  const delayMs = opts.delayMs ?? 2000;
  const serveStatic = opts.serveStatic ?? process.env.NODE_ENV === 'production';

  const app = express();
  if (serveStatic) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDist = path.resolve(__dirname, '../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  let latest: GameState | null = null;

  function broadcast(message: object): void {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  wss.on('connection', (socket) => {
    if (latest) socket.send(JSON.stringify({ type: 'state', state: latest }));
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  const actualPort = (httpServer.address() as AddressInfo).port;

  const game = buildScriptedGame();
  const done = runScriptedGame(game, {
    delayMs,
    onSnapshot: (state) => {
      latest = state;
      broadcast({ type: 'state', state });
    },
  });

  const close = async (): Promise<void> => {
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  return { httpServer, wss, port: actualPort, done, close };
}

// Direct CLI invocation: `tsx server/index.ts` or `npm start`.
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  startServer().then(({ port }) => {
    console.log(`[scrabble] listening on http://localhost:${port} (ws: /ws)`);
  });
}
```

- [ ] **Step 2: Manual sanity check — server starts and game runs**

```bash
npm run dev:server
```

Expected: server prints listen line; nothing crashes; the scripted runner is internally pumping moves every 2s. Stop with Ctrl+C.

- [ ] **Step 3: Write the integration test**

Create `tests/integration/m2-server.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import WebSocket from 'ws';
import type { GameState } from '@shared/types';
import { startServer } from '../../server/index.js';

type Msg = { type: 'state'; state: GameState };

function collectMessages(url: string, until: (msg: Msg) => boolean): Promise<Msg[]> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const received: Msg[] = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString()) as Msg;
      if (msg.type !== 'state') return;
      received.push(msg);
      if (until(msg)) {
        ws.close();
        resolve(received);
      }
    });
    ws.on('error', reject);
  });
}

describe('M2 server: scripted runner over WS', () => {
  it('broadcasts a state snapshot after every mutation, ending in phase=finished', async () => {
    const server = await startServer({ port: 0, delayMs: 0, serveStatic: false });
    try {
      const url = `ws://localhost:${server.port}/ws`;
      const messages = await collectMessages(url, (m) => m.state.phase === 'finished');

      // First message: phase 'playing', three named players, board empty.
      const first = messages[0]!;
      expect(first.state.phase).toBe('playing');
      expect(first.state.players.map((p) => p.name)).toEqual(['Женя', 'Мама', 'Папа']);

      // Last message: phase 'finished' with a populated history.
      const last = messages[messages.length - 1]!;
      expect(last.state.phase).toBe('finished');
      expect(last.state.history.length).toBeGreaterThan(0);

      // Scores never decrease over the snapshot stream.
      for (let slot = 0 as 0 | 1 | 2; slot < 3; slot = (slot + 1) as 0 | 1 | 2) {
        let prev = 0;
        for (const m of messages) {
          const score = m.state.players[slot]!.score;
          expect(score).toBeGreaterThanOrEqual(prev);
          prev = score;
        }
      }

      await server.done;
    } finally {
      await server.close();
    }
  });
});
```

- [ ] **Step 4: Run the integration test**

```bash
npm test -- tests/integration/m2-server.test.ts
```

Expected: 1 test passes. If it hangs, check that `delayMs: 0` is being passed and that the runner reaches `endGame`.

- [ ] **Step 5: Run the full suite**

```bash
npm run typecheck && npm test
```

Expected: 96 + 1 = 97 tests pass.

- [ ] **Step 6: Commit**

```bash
git add server/index.ts tests/integration/m2-server.test.ts
git commit -m "feat(server): broadcast state snapshots via scripted runner"
```

---

## Task 5: Scaffold the Vite + React + Tailwind 4 client

Create the `client/` directory with Vite, React 19, Tailwind 4, and the palette CSS variables. End of task: `npm run dev:client` shows a blank page that says "connecting…". WebSocket wiring comes in Task 6.

**Files:**
- Modify: `package.json`, `tsconfig.json`, `.gitignore` (if `client/dist` not already excluded)
- Create: `client/index.html`, `client/vite.config.ts`, `client/tsconfig.json`, `client/postcss.config.js`, `client/src/main.tsx`, `client/src/App.tsx`, `client/src/styles/index.css`

- [ ] **Step 1: Install client deps**

```bash
npm install react@^19.0.0 react-dom@^19.0.0 zustand@^4.5.0
npm install -D @types/react@^19.0.0 @types/react-dom@^19.0.0 @vitejs/plugin-react@^4.3.0 vite@^5.4.0 tailwindcss@^4.0.0 @tailwindcss/postcss@^4.0.0 postcss@^8.4.0
```

Expected: `package.json` updated. No errors.

- [ ] **Step 2: Add client + combined dev/build scripts to `package.json`**

Update the `scripts` block to (preserving existing keys):

```jsonc
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit && tsc --noEmit -p client/tsconfig.json",
  "demo": "tsx scripts/demo-game.ts",
  "start": "NODE_ENV=production tsx server/index.ts",
  "dev:server": "tsx watch server/index.ts",
  "dev:client": "vite --config client/vite.config.ts",
  "dev": "concurrently -n server,client -c blue,green \"npm:dev:server\" \"npm:dev:client\"",
  "build": "vite build --config client/vite.config.ts"
}
```

- [ ] **Step 3: Exclude `client/**` from the root tsconfig**

Edit `tsconfig.json` and add `"exclude": ["client/**"]` (the root config targets Node-only modules; the client has its own tsconfig in Step 5).

- [ ] **Step 4: Add `client/dist` to `.gitignore`**

Append `client/dist` if not already present.

- [ ] **Step 5: Create `client/tsconfig.json`**

```jsonc
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "baseUrl": "..",
    "paths": {
      "@shared/*": ["shared/*"]
    }
  },
  "include": ["src/**/*", "vite.config.ts"]
}
```

- [ ] **Step 6: Create `client/vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  root: path.resolve(__dirname),
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:3000',
        ws: true,
      },
    },
  },
  build: {
    outDir: path.resolve(__dirname, 'dist'),
    emptyOutDir: true,
  },
});
```

- [ ] **Step 7: Create `client/postcss.config.js`**

```js
export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};
```

- [ ] **Step 8: Create `client/src/styles/index.css`**

```css
@import 'tailwindcss';

@theme {
  --color-bg: #f5ebdd;
  --color-tile: #fdf8f0;
  --color-sage-light: #c9e4d8;
  --color-sage: #7eb8a0;
  --color-peach: #f5d4b8;
  --color-terracotta: #d97757;
  --color-ink: #4a3528;
}

html, body, #root {
  height: 100%;
}

body {
  margin: 0;
  background-color: var(--color-bg);
  color: var(--color-ink);
  font-family: Inter, system-ui, -apple-system, 'Segoe UI', sans-serif;
}
```

- [ ] **Step 9: Create `client/index.html`**

```html
<!DOCTYPE html>
<html lang="ru">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Корюшка пошла</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 10: Create `client/src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 11: Create a placeholder `client/src/App.tsx`**

```tsx
export function App(): JSX.Element {
  return (
    <main className="flex h-full items-center justify-center text-ink">
      <p className="text-2xl">connecting…</p>
    </main>
  );
}
```

- [ ] **Step 12: Run the client dev server**

```bash
npm run dev:client
```

Expected: Vite prints "Local: http://localhost:5173". Open the URL — the page shows "connecting…" on the cream background. Stop with Ctrl+C.

- [ ] **Step 13: Run typechecks**

```bash
npm run typecheck
```

Expected: PASS for both root and client.

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat(client): scaffold Vite + React 19 + Tailwind 4"
```

---

## Task 6: Zustand store + WebSocket client + connection plumbing

Wire the client to the server. On boot, open a WebSocket to `/ws`, push `state` messages into the Zustand store, reconnect on disconnect. Replace App's placeholder with a barebones state-aware view (just shows phase + turn name) so we can prove the pipe works before building the board.

**Files:**
- Create: `client/src/store.ts`, `client/src/ws.ts`
- Modify: `client/src/main.tsx`, `client/src/App.tsx`

- [ ] **Step 1: Create `client/src/store.ts`**

```ts
import { create } from 'zustand';
import type { GameState } from '@shared/types';

type Store = {
  state: GameState | null;
  connected: boolean;
  setState: (state: GameState) => void;
  setConnected: (connected: boolean) => void;
};

export const useGameStore = create<Store>((set) => ({
  state: null,
  connected: false,
  setState: (state) => set({ state }),
  setConnected: (connected) => set({ connected }),
}));
```

- [ ] **Step 2: Create `client/src/ws.ts`**

```ts
import type { GameState } from '@shared/types';
import { useGameStore } from './store.js';

type ServerMessage = { type: 'state'; state: GameState } | { type: string };

const RECONNECT_DELAY_MS = 1000;

export function connect(): void {
  const url = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
  const ws = new WebSocket(url);

  ws.addEventListener('open', () => useGameStore.getState().setConnected(true));

  ws.addEventListener('message', (e) => {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(e.data) as ServerMessage;
    } catch {
      console.warn('non-JSON ws message:', e.data);
      return;
    }
    if (msg.type === 'state' && 'state' in msg) {
      useGameStore.getState().setState(msg.state);
    } else {
      console.warn('unknown ws message type:', msg.type);
    }
  });

  const onDown = (): void => {
    useGameStore.getState().setConnected(false);
    setTimeout(connect, RECONNECT_DELAY_MS);
  };
  ws.addEventListener('close', onDown);
  ws.addEventListener('error', onDown);
}
```

- [ ] **Step 3: Call `connect()` from `main.tsx`**

Update `client/src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';
import { connect } from './ws.js';
import './styles/index.css';

connect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 4: Replace `App.tsx` with a state-aware sanity view**

```tsx
import { useGameStore } from './store.js';

export function App(): JSX.Element {
  const state = useGameStore((s) => s.state);
  const connected = useGameStore((s) => s.connected);

  if (!connected) return <Center>connecting…</Center>;
  if (!state) return <Center>waiting for state…</Center>;

  const turnName = state.players[state.turnIndex]?.name ?? '—';
  return (
    <Center>
      <p className="text-xl">phase: {state.phase}</p>
      <p className="text-xl">turn: {turnName}</p>
      <p className="text-xl">history: {state.history.length} moves</p>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }): JSX.Element {
  return <main className="flex h-full flex-col items-center justify-center gap-2 text-ink">{children}</main>;
}
```

- [ ] **Step 5: Manual end-to-end check**

In one terminal:

```bash
npm run dev
```

Open http://localhost:5173. Expected: "phase: playing" + "turn: Женя" + "history: 0 moves" updates every ~2 seconds as the scripted game progresses, ending at "phase: finished".

If "connecting…" never resolves: check that the Vite proxy is forwarding `/ws` to `:3000` and that the server is up. If "waiting for state…" persists: the snapshot wasn't sent on connect — verify `latest` is being captured before the first broadcast in `server/index.ts`.

Stop with Ctrl+C.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add client/src
git commit -m "feat(client): zustand store + ws connection"
```

---

## Task 7: Tile + Square components

Two purely-presentational components that render a single tile and a single board cell. They're self-contained — no game logic — so we build them before the Board.

**Files:**
- Create: `client/src/components/Tile.tsx`, `client/src/components/Square.tsx`

- [ ] **Step 1: Create `Tile.tsx`**

```tsx
import type { Cell, Tile as TileT } from '@shared/types';

type Props = {
  /** Cell-mode (board): pass a cell to render the tile as it sits on the board. */
  cell?: Cell;
  /** Rack-mode: pass a raw tile. */
  tile?: TileT;
  /** Pixel size of the tile square. Default 36. */
  size?: number;
};

export function Tile({ cell, tile, size = 36 }: Props): JSX.Element | null {
  const t = cell?.tile ?? tile;
  if (!t) return null;
  const display = cell ? cell.playedAs : (t.isBlank ? '' : t.letter);
  const points = cell ? (cell.fromBlank ? 0 : t.points) : t.points;

  return (
    <div
      className="relative flex items-center justify-center rounded-md bg-tile shadow-sm font-semibold select-none"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
    >
      <span>{display}</span>
      <span
        className="absolute right-0.5 bottom-0 text-ink/70"
        style={{ fontSize: Math.round(size * 0.25) }}
      >
        {points}
      </span>
    </div>
  );
}
```

- [ ] **Step 2: Create `Square.tsx`**

```tsx
import type { Cell, Premium } from '@shared/types';
import { Tile } from './Tile.js';

const PREMIUM_BG: Record<Exclude<Premium, null>, string> = {
  TW: 'bg-terracotta/70',
  DW: 'bg-peach',
  TL: 'bg-sage',
  DL: 'bg-sage-light',
  CENTER: 'bg-peach',
};

const PREMIUM_LABEL: Record<Exclude<Premium, null>, string> = {
  TW: '3W',
  DW: '2W',
  TL: '3L',
  DL: '2L',
  CENTER: '★',
};

type Props = {
  cell: Cell | null;
  premium: Premium;
  size: number;
};

export function Square({ cell, premium, size }: Props): JSX.Element {
  const base = 'relative flex items-center justify-center border border-ink/10';
  const bg = cell ? 'bg-bg' : (premium ? PREMIUM_BG[premium] : 'bg-bg');
  return (
    <div className={`${base} ${bg}`} style={{ width: size, height: size }}>
      {cell ? (
        <Tile cell={cell} size={size - 4} />
      ) : premium ? (
        <span className="text-[10px] font-medium text-ink/60">{PREMIUM_LABEL[premium]}</span>
      ) : null}
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add client/src/components/Tile.tsx client/src/components/Square.tsx
git commit -m "feat(client): Tile and Square components"
```

---

## Task 8: Board component

Full 15×15 grid composed of `<Square/>` cells, fed by the `state.board` and the shared premium map.

**Files:**
- Create: `client/src/components/Board.tsx`

- [ ] **Step 1: Create `Board.tsx`**

```tsx
import type { Board as BoardT } from '@shared/types';
import { PREMIUMS } from '@shared/premiums';
import { Square } from './Square.js';

const SQUARE_SIZE = 36;
const GRID = 15;

type Props = { board: BoardT };

export function Board({ board }: Props): JSX.Element {
  return (
    <div
      className="grid gap-px rounded-md bg-ink/20 p-px shadow-md"
      style={{
        gridTemplateColumns: `repeat(${GRID}, ${SQUARE_SIZE}px)`,
        gridTemplateRows: `repeat(${GRID}, ${SQUARE_SIZE}px)`,
        width: GRID * SQUARE_SIZE + (GRID + 1),
      }}
    >
      {board.flatMap((row, r) =>
        row.map((cell, c) => (
          <Square
            key={`${r},${c}`}
            cell={cell}
            premium={PREMIUMS[r]![c]!}
            size={SQUARE_SIZE}
          />
        )),
      )}
    </div>
  );
}
```

- [ ] **Step 2: Drop the placeholder layout into `App.tsx` to render the board**

Replace `App.tsx` with:

```tsx
import { useGameStore } from './store.js';
import { Board } from './components/Board.js';

export function App(): JSX.Element {
  const state = useGameStore((s) => s.state);
  const connected = useGameStore((s) => s.connected);

  if (!connected) return <Center>connecting…</Center>;
  if (!state) return <Center>waiting for state…</Center>;

  return (
    <main className="flex h-full items-start justify-center gap-8 p-8">
      <Board board={state.board} />
      <aside className="w-64">
        <p className="text-sm uppercase tracking-wide text-ink/60">Phase</p>
        <p className="mb-4 text-lg">{state.phase}</p>
        <p className="text-sm uppercase tracking-wide text-ink/60">Turn</p>
        <p className="text-lg">{state.players[state.turnIndex]?.name ?? '—'}</p>
      </aside>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }): JSX.Element {
  return <main className="flex h-full items-center justify-center text-ink">{children}</main>;
}
```

- [ ] **Step 3: Manual check — board renders**

```bash
npm run dev
```

Open http://localhost:5173. Expected: a 15×15 grid with premium-square colors and labels. As the scripted game runs, tiles appear in the middle of the board over time. Stop with Ctrl+C.

- [ ] **Step 4: Typecheck**

```bash
npm run typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add client/src/components/Board.tsx client/src/App.tsx
git commit -m "feat(client): 15x15 Board component"
```

---

## Task 9: Rack + PlayerCard + final layout

Three player cards in the right column, each with name, score, and rack. Active turn gets the peach highlight.

**Files:**
- Create: `client/src/components/Rack.tsx`, `client/src/components/PlayerCard.tsx`
- Modify: `client/src/App.tsx`

- [ ] **Step 1: Create `Rack.tsx`**

```tsx
import type { Tile as TileT } from '@shared/types';
import { Tile } from './Tile.js';

const RACK_SIZE = 7;
const TILE_SIZE = 32;

type Props = { tiles: TileT[] };

export function Rack({ tiles }: Props): JSX.Element {
  const slots: (TileT | null)[] = Array.from({ length: RACK_SIZE }, (_, i) => tiles[i] ?? null);
  return (
    <div className="flex gap-1 rounded-md bg-ink/10 p-1">
      {slots.map((t, i) => (
        <div
          key={i}
          className="flex items-center justify-center rounded bg-bg/50"
          style={{ width: TILE_SIZE, height: TILE_SIZE }}
        >
          {t ? <Tile tile={t} size={TILE_SIZE - 4} /> : null}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create `PlayerCard.tsx`**

```tsx
import type { Player, Slot } from '@shared/types';
import { Rack } from './Rack.js';

type Props = {
  player: Player;
  isCurrentTurn: boolean;
};

export function PlayerCard({ player, isCurrentTurn }: Props): JSX.Element {
  const bg = isCurrentTurn ? 'bg-peach' : 'bg-tile';
  return (
    <div className={`rounded-md ${bg} p-3 shadow-sm`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-base font-semibold">{player.name || `Slot ${player.slot}`}</span>
        <span className="text-xl font-bold tabular-nums">{player.score}</span>
      </div>
      <Rack tiles={player.rack} />
    </div>
  );
}

// Slot import kept for the typecheck; remove if unused.
export type _Slot = Slot;
```

(The `_Slot` re-export is just a placeholder so the import doesn't go unused after refactors. Delete the import + line if your linter prefers — the file works without them.)

Cleaner: drop the unused Slot import entirely:

```tsx
import type { Player } from '@shared/types';
import { Rack } from './Rack.js';

type Props = {
  player: Player;
  isCurrentTurn: boolean;
};

export function PlayerCard({ player, isCurrentTurn }: Props): JSX.Element {
  const bg = isCurrentTurn ? 'bg-peach' : 'bg-tile';
  return (
    <div className={`rounded-md ${bg} p-3 shadow-sm`}>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-base font-semibold">{player.name || `Slot ${player.slot}`}</span>
        <span className="text-xl font-bold tabular-nums">{player.score}</span>
      </div>
      <Rack tiles={player.rack} />
    </div>
  );
}
```

Use the cleaner version.

- [ ] **Step 3: Update `App.tsx` to use PlayerCards**

```tsx
import { useGameStore } from './store.js';
import { Board } from './components/Board.js';
import { PlayerCard } from './components/PlayerCard.js';

export function App(): JSX.Element {
  const state = useGameStore((s) => s.state);
  const connected = useGameStore((s) => s.connected);

  if (!connected) return <Center>connecting…</Center>;
  if (!state) return <Center>waiting for state…</Center>;

  return (
    <main className="flex h-full items-start justify-center gap-8 p-8">
      <Board board={state.board} />
      <aside className="flex w-72 flex-col gap-3">
        <header className="text-sm uppercase tracking-wide text-ink/60">
          {state.phase === 'finished' ? 'Game over' : `${state.players[state.turnIndex]?.name ?? '—'}'s turn`}
        </header>
        {state.players.map((p) => (
          <PlayerCard key={p.slot} player={p} isCurrentTurn={p.slot === state.turnIndex && state.phase === 'playing'} />
        ))}
      </aside>
    </main>
  );
}

function Center({ children }: { children: React.ReactNode }): JSX.Element {
  return <main className="flex h-full items-center justify-center text-ink">{children}</main>;
}
```

- [ ] **Step 4: Manual check — full layout**

```bash
npm run dev
```

Open http://localhost:5173. Expected:
- Board on the left with premium-square colors.
- Right column header reading "Женя's turn" (or whoever's turn it is), turning into "Game over" at the end.
- Three player cards stacked vertically: name, score (starts at 0, climbs as the game runs), 7-slot rack with current tiles.
- Active player's card highlighted peach; others off-white.
- Tiles drop onto the board roughly every 2 seconds.

Stop with Ctrl+C.

- [ ] **Step 5: Typecheck and full test suite**

```bash
npm run typecheck && npm test
```

Expected: PASS, 97 tests.

- [ ] **Step 6: Commit**

```bash
git add client/src
git commit -m "feat(client): Rack and PlayerCard, finalize layout"
```

---

## Task 10: Production build + CLAUDE.md updates + final verification

Verify the prod path works (`npm run build` + `npm start` serves the bundle on a single port), and update `CLAUDE.md` so the new dev workflow is documented for future sessions.

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Run a prod build**

```bash
npm run build
```

Expected: `client/dist/` populated with `index.html` and an `assets/` folder. No errors.

- [ ] **Step 2: Run the prod server**

```bash
npm start
```

Expected: server logs `[scrabble] listening on http://localhost:3000 (ws: /ws)`. Open http://localhost:3000 directly (no Vite). Expected: full app loads, WebSocket connects (URL becomes `ws://localhost:3000/ws`), scripted game runs end-to-end. Stop with Ctrl+C.

- [ ] **Step 3: Update `CLAUDE.md`**

Open `CLAUDE.md` and update the "Build & Development" section:

```markdown
## Build & Development

```bash
nvm use            # node 20 per .nvmrc
npm install
npm run dev        # vite (:5173) + express+ws (:3000) — open http://localhost:5173
npm run build      # produce client/dist/
npm start          # production: single Express process on :3000 serves client + /ws
npm test           # vitest run
npm run typecheck  # root + client
npm run demo       # tsx scripts/demo-game.ts — full game end-to-end (no UI)
```

Before committing, always run: `npm run typecheck && npm test`.
```

Also add a one-liner to the "Repository Layout" section after the existing `server/` block:

```markdown
- `client/` — Vite + React 19 + Tailwind 4 read-only renderer
  - `src/components/` — Board, Square, Tile, Rack, PlayerCard
  - `src/store.ts`, `src/ws.ts` — Zustand store + WebSocket client
```

- [ ] **Step 4: Final full check**

```bash
npm run typecheck && npm test
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: M2 dev/build commands + client layout"
```

---

## Wrap-up

At this point:
- `feat/m2-readonly-client` contains the full M2 layer.
- `npm run dev` opens the browser and shows a self-playing Scrabble game.
- `npm test` includes one new integration test alongside the M1 engine tests.
- `npm run build && npm start` serves the prod bundle on a single port.
- The client and server share `shared/types.ts` and `shared/premiums.ts`.

Open a PR against `main` once the human is satisfied with the visuals.

---

## Self-Review Notes (for the plan author)

- **Spec coverage:** §3 architecture → Tasks 3, 4, 5; §4 file layout → Task 1 (premiums move) + all subsequent tasks; §5 server → Tasks 3, 4; §6 scripted runner → Task 2; §7 protocol → Task 4; §8 client (stack + components + ws + styling) → Tasks 5, 6, 7, 8, 9; §9 build/run scripts → Tasks 3, 5, 10; §10 testing → Task 4; §11 risks (premiums import) → resolved in Task 1.
- **Type consistency:** `RunningServer.done`, `ScriptedRunOptions.onSnapshot`, store `setState`/`setConnected` names match across tasks.
- **No placeholders:** all code blocks are concrete; the only "TBD-shaped" item (premiums import path) is resolved by moving the file to `shared/`.
