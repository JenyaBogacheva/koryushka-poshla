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

  const snapshots: GameState[] = [];

  function broadcast(message: object): void {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  wss.on('connection', (socket) => {
    // Replay full snapshot history so late-connecting clients see every mutation.
    for (const state of snapshots) {
      socket.send(JSON.stringify({ type: 'state', state }));
    }
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  const actualPort = (httpServer.address() as AddressInfo).port;

  const game = buildScriptedGame();
  const done = runScriptedGame(game, {
    delayMs,
    onSnapshot: (state) => {
      snapshots.push(state);
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
