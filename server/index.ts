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
