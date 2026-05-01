import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { GameState } from '@shared/types';
import { buildScriptedGame, runScriptedGame } from './scripted-game.js';

export type ServerOptions = {
  port?: number;
  delayMs?: number;
  serveStatic?: boolean;
};

export type RunningServer = {
  httpServer: HttpServer;
  wss: WebSocketServer;
  port: number;
  /** Starts the scripted runner. Returns a Promise that resolves when the game ends. */
  start: () => Promise<void>;
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

  // Build the game and capture its initial snapshot before we start listening,
  // so any client connecting immediately gets a non-null state.
  const game = buildScriptedGame();
  let latest: GameState = game.snapshot();

  function broadcast(message: object): void {
    const payload = JSON.stringify(message);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(payload);
    }
  }

  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ type: 'state', state: latest }));
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  const actualPort = (httpServer.address() as AddressInfo).port;

  const start = (): Promise<void> =>
    runScriptedGame(game, {
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

  return { httpServer, wss, port: actualPort, start, close };
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer()
    .then(async (server) => {
      console.log(`[scrabble] listening on http://localhost:${server.port} (ws: /ws)`);
      await server.start();
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
