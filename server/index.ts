import express from 'express';
import { createServer, type Server as HttpServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket, type RawData } from 'ws';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ClientMessage, ServerMessage, GameState, LobbySlot, Slot } from '@shared/types';
import { Game } from './game.js';
import { createEmptyBoard } from './board.js';
import { createSeats, seat, unseat, allSeated, namesInSlotOrder, type Seats } from './connections.js';
import { saveActiveGame, loadActiveGame, archiveFinishedGame, listGameSummaries, loadArchive } from './persistence.js';
import { loadFamilyConfig, type FamilyConfig } from './family.js';

export type ServerOptions = {
  port?: number;
  serveStatic?: boolean;
  dataDir?: string;
};

export type RunningServer = {
  httpServer: HttpServer;
  wss: WebSocketServer;
  port: number;
  close: () => Promise<void>;
};

export async function startServer(opts: ServerOptions = {}): Promise<RunningServer> {
  const port = opts.port ?? Number(process.env.PORT ?? 3000);
  const serveStatic = opts.serveStatic ?? process.env.NODE_ENV === 'production';
  const dataDir = opts.dataDir ?? path.resolve(process.cwd(), 'data');

  const app = express();

  app.get('/api/history', (_req, res) => {
    res.json(listGameSummaries(dataDir));
  });

  app.get('/api/history/:id', (req, res) => {
    const id = req.params['id'] ?? '';
    if (!/^g-\d+$/.test(id)) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    const archive = loadArchive(dataDir, id);
    if (archive === null) {
      res.status(404).json({ error: 'not found' });
      return;
    }
    res.json(archive);
  });

  if (serveStatic) {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const clientDist = path.resolve(__dirname, '../client/dist');
    app.use(express.static(clientDist));
    app.get('*', (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
  }

  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  const seats: Seats = createSeats();
  let game: Game | null = null;
  const loadedFamily = loadFamilyConfig(dataDir);
  if (loadedFamily === null) {
    throw new Error(
      `[scrabble] no family config. Set FAMILY_PASSWORD + FAMILY_NAME_0/1/2 env vars, ` +
      `or copy ${path.join(dataDir, 'family.example.json')} to ${path.join(dataDir, 'family.json')} and edit.`,
    );
  }
  const familyConfig: FamilyConfig = loadedFamily;
  console.log(`[scrabble] family: ${familyConfig.players.map((p) => p.name).join(', ')}`);

  const loaded = loadActiveGame(dataDir);
  if (loaded !== null) {
    game = Game.fromState(loaded);
  }

  function sendMsg(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  function lobbySnapshot(): GameState {
    return {
      phase: 'waiting',
      players: ([0, 1, 2] as Slot[]).map((i) => ({
        slot: i,
        name: seats[i]!.name ?? familyConfig.players[i].name,
        connected: seats[i]!.ws !== null,
        rack: [],
        rackVisible: true,
        score: 0,
        redrawEligible: false,
        canRevert: false,
      })) as unknown as GameState['players'],
      turnIndex: 0,
      board: createEmptyBoard(),
      bag: [],
      centerBonusUsed: false,
      events: [],
      startedAt: null,
      drawState: null,
    };
  }

  function currentState(): GameState {
    const state = game !== null ? game.snapshot() : lobbySnapshot();
    for (let i = 0; i < 3; i++) {
      state.players[i]!.connected = seats[i]!.ws !== null;
    }
    return state;
  }

  function broadcastState(): void {
    const payload: ServerMessage = { type: 'state', state: currentState() };
    const data = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }

  function handleEngineAction(ws: WebSocket, fn: () => void): void {
    if (game === null) {
      sendMsg(ws, { type: 'error', message: 'Game not started' });
      return;
    }
    try {
      fn();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Engine error';
      sendMsg(ws, { type: 'error', message });
      return;
    }
    try {
      saveActiveGame(dataDir, game.snapshot());
    } catch (err) {
      console.error('[scrabble] saveActiveGame failed:', err);
    }
    broadcastState();
    // Games can end three ways: explicit endGame, bagEmptyAndRackEmpty, or sixPasses.
    // The latter two happen inside submitMove/passTurn, so archive here, not just in
    // the 'endGame' handler — otherwise game stays non-null and 'newGame' is ignored.
    if (game.snapshot().phase === 'finished') {
      try {
        archiveFinishedGame(dataDir);
      } catch (err) {
        console.error('[scrabble] archiveFinishedGame failed:', err);
      }
      game = null;
    }
  }

  function handleSubmitMove(slot: Slot, msg: Extract<ClientMessage, { type: 'submitMove' }>, ws: WebSocket): void {
    if (game === null) {
      sendMsg(ws, { type: 'error', message: 'Game not started' });
      return;
    }
    const result = game.submitMove(slot, msg.placements, msg.helperSlot);
    if (!result.ok) {
      sendMsg(ws, { type: 'moveRejected', reason: humanReadableReason(result.error) });
      return;
    }
    try {
      saveActiveGame(dataDir, game.snapshot());
    } catch (err) {
      console.error('[scrabble] saveActiveGame failed:', err);
    }
    broadcastState();
    sendMsg(ws, { type: 'moveAccepted', moveRecord: result.moveRecord, dictionaryWarnings: result.dictionaryWarnings });
  }

  function lobbyMessage(): ServerMessage {
    return {
      type: 'lobby',
      slots: ([0, 1, 2] as Slot[]).map((i) => ({
        slot: i,
        name: seats[i]!.name ?? familyConfig.players[i].name,
        connected: seats[i]!.ws !== null,
      })) as [LobbySlot, LobbySlot, LobbySlot],
    };
  }

  function broadcastLobby(): void {
    const data = JSON.stringify(lobbyMessage());
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  }

  function attachInGameHandler(ws: WebSocket, slot: Slot): void {
    ws.on('message', (raw: RawData) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        sendMsg(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }
      switch (msg.type) {
        case 'join':
          sendMsg(ws, { type: 'error', message: 'Already joined' });
          return;
        case 'submitMove':
          handleSubmitMove(slot, msg, ws);
          return;
        case 'pass':
          handleEngineAction(ws, () => game!.passTurn(slot));
          return;
        case 'redraw':
          handleEngineAction(ws, () => game!.redrawRack(slot));
          return;
        case 'swapAll':
          handleEngineAction(ws, () => game!.swapAllAndPass(slot));
          return;
        case 'claimBlank':
          handleEngineAction(ws, () => game!.claimBlank(slot, msg.row, msg.col, msg.myTileId));
          return;
        case 'endGame':
          handleEngineAction(ws, () => game!.endGame(slot));
          return;
        case 'revertLastTurn':
          handleEngineAction(ws, () => game!.revertLastTurn(slot));
          return;
        case 'drawTile':
          handleEngineAction(ws, () => game!.drawForOrderTile(slot));
          return;
        case 'previewMove': {
          if (game === null) return;
          const preview = game.previewMove(slot, msg.placements);
          if (preview.ok) {
            sendMsg(ws, {
              type: 'movePreview',
              preview: {
                ok: true,
                totalScore: preview.totalScore,
                bingoBonus: preview.bingoBonus,
                wordsFormed: preview.wordsFormed,
                dictionaryWarnings: preview.dictionaryWarnings,
              },
            });
          } else {
            sendMsg(ws, { type: 'movePreview', preview: { ok: false, reason: humanReadableReason(preview.error) } });
          }
          return;
        }
        case 'toggleRackVisible':
          sendMsg(ws, { type: 'error', message: 'not yet implemented' });
          return;
        case 'newGame': {
          // Recover from a stuck finished game (e.g. older server build that didn't
          // archive on auto-end): treat it as if endGame had cleaned up.
          if (game !== null && game.snapshot().phase === 'finished') {
            try {
              archiveFinishedGame(dataDir);
            } catch (err) {
              console.error('[scrabble] archiveFinishedGame failed:', err);
            }
            game = null;
          }
          if (game !== null) return; // ignore if game already running (race)
          if (!allSeated(seats)) {
            sendMsg(ws, { type: 'error', message: 'Не все игроки подключены' });
            return;
          }
          game = new Game({ seed: Date.now() });
          const names = namesInSlotOrder(seats);
          game.joinPlayer(0, names[0]);
          game.joinPlayer(1, names[1]);
          game.joinPlayer(2, names[2]);
          game.startGame();
          try { saveActiveGame(dataDir, game.snapshot()); } catch (err) { console.error('[scrabble] saveActiveGame failed:', err); }
          broadcastState();
          return;
        }
        default:
          sendMsg(ws, { type: 'error', message: 'Unknown message type' });
      }
    });
  }

  function handleJoin(ws: WebSocket, msg: Extract<ClientMessage, { type: 'join' }>): void {
    const slot = msg.slot;
    const name = msg.name?.trim();
    if (slot !== 0 && slot !== 1 && slot !== 2) {
      sendMsg(ws, { type: 'error', message: 'Bad slot' });
      ws.close(1008, 'Bad slot');
      return;
    }
    if (!name) {
      sendMsg(ws, { type: 'error', message: 'Name required' });
      ws.close(1008, 'Name required');
      return;
    }

    const expectedName = familyConfig.players[slot].name;
    if (name !== expectedName) {
      sendMsg(ws, { type: 'error', message: 'Wrong name for this slot' });
      ws.close(1008, 'Wrong name for this slot');
      return;
    }
    if (msg.password !== familyConfig.password) {
      sendMsg(ws, { type: 'error', message: 'Wrong password' });
      ws.close(1008, 'Wrong password');
      return;
    }

    if (game !== null) {
      const persistedName = game.snapshot().players[slot]!.name;
      if (persistedName !== '' && persistedName !== name) {
        sendMsg(ws, { type: 'error', message: 'Slot taken' });
        ws.close(1008, 'Slot taken');
        return;
      }
    }

    const result = seat(seats, slot, name, ws);
    if (!result.ok) {
      sendMsg(ws, { type: 'error', message: result.reason });
      ws.close(1008, result.reason);
      return;
    }

    if (result.replaced !== null) {
      try {
        result.replaced.close(1000, 'replaced by same-name client');
      } catch {
        /* ignore */
      }
    }

    if (game !== null) {
      game.joinPlayer(slot, name);
    } else if (allSeated(seats)) {
      game = new Game({ seed: Date.now() });
      const names = namesInSlotOrder(seats);
      game.joinPlayer(0, names[0]);
      game.joinPlayer(1, names[1]);
      game.joinPlayer(2, names[2]);
      game.startGame();
      try {
        saveActiveGame(dataDir, game.snapshot());
      } catch (err) {
        console.error('[scrabble] saveActiveGame failed:', err);
      }
    }

    attachInGameHandler(ws, slot);
    broadcastState();
    broadcastLobby();
  }

  wss.on('connection', (ws) => {
    sendMsg(ws, lobbyMessage());

    const preJoinHandler = (raw: RawData): void => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        sendMsg(ws, { type: 'error', message: 'Invalid JSON' });
        return;
      }
      if (msg.type !== 'join') {
        sendMsg(ws, { type: 'error', message: 'Join first' });
        return;
      }
      ws.off('message', preJoinHandler);
      handleJoin(ws, msg);
    };
    ws.on('message', preJoinHandler);

    ws.on('close', () => {
      const which = unseat(seats, ws);
      if (which === null) return;
      broadcastState();
      broadcastLobby();
    });
  });

  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  const actualPort = (httpServer.address() as AddressInfo).port;

  const close = async (): Promise<void> => {
    for (const client of wss.clients) client.terminate();
    await new Promise<void>((resolve) => wss.close(() => resolve()));
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  };

  return { httpServer, wss, port: actualPort, close };
}

function humanReadableReason(error: { kind: string }): string {
  switch (error.kind) {
    case 'not-your-turn': return 'Сейчас не ваш ход';
    case 'not-playing': return 'Игра не в процессе';
    case 'invalid-helper': return 'Неверный помощник';
    case 'no-placements': return 'Нет плиток для хода';
    case 'out-of-range': return 'Плитка вне поля';
    case 'duplicate-target': return 'Две плитки в одну клетку';
    case 'duplicate-tile': return 'Дублирующаяся плитка';
    case 'cell-occupied': return 'Клетка уже занята';
    case 'tile-not-in-rack': return 'Плитки нет на стойке';
    case 'illegal-substitution': return 'Недопустимая замена буквы';
    case 'illegal-blank-letter': return 'Недопустимая буква для бланка';
    case 'first-move-must-cover-center': return 'Первый ход должен закрывать центральную клетку';
    case 'first-move-must-be-one-group': return 'Первый ход должен быть одной группой';
    case 'group-not-connected': return 'Слова должны соединяться с уже сыгранными';
    default: return `Ошибка: ${error.kind}`;
  }
}

const isMain = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  startServer()
    .then((server) => {
      console.log(`[scrabble] listening on http://localhost:${server.port} (ws: /ws)`);
    })
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
