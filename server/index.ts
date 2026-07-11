/**
 * Node.js WebSocket server entry point for the DJI serial bridge.
 * Creates a WebSocket server on port 8765 and broadcasts controller state to all clients.
 */
import { WebSocketServer, WebSocket } from 'ws';
import { DjiBridge } from './serial-bridge.js';
import { createDefaultState } from '../shared/types.js';

const WS_PORT = 8765;

console.log('====================================================');
console.log(' DJI Mavic Mini / RC-N1 USB-to-Web Joystick Bridge  ');
console.log('           (Node.js TypeScript Edition)              ');
console.log('====================================================');

async function main(): Promise<void> {
  const bridge = new DjiBridge();

  let wss: WebSocketServer;
  try {
    wss = new WebSocketServer({ host: '127.0.0.1', port: WS_PORT });
  } catch (err) {
    if (err instanceof Error && 'code' in err && (err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
      console.error(`\n[WS SERVER] Port ${WS_PORT} is already in use.`);
      console.error('[WS SERVER] Another bridge is likely already running. Reuse that instance or stop it before starting a new one.');
      process.exit(0);
    }
    throw err;
  }

  console.log(`\n[WS SERVER] Server listening on ws://127.0.0.1:${WS_PORT}`);

  // Send initial state to newly connected clients
  wss.on('connection', (ws, req) => {
    console.log(`[WS CLIENT] Browser client connected from ${req.socket.remoteAddress}`);
    ws.send(JSON.stringify(bridge.state));

    ws.on('close', () => {
      console.log(`[WS CLIENT] Browser client disconnected`);
    });
  });

  /** Broadcast a JSON message to all connected WebSocket clients. */
  function broadcast(message: string): void {
    wss.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  }

  bridge.on('state', (state) => {
    broadcast(JSON.stringify(state));
  });

  // Heartbeat checker — marks controller as disconnected after 1.5s silence
  setInterval(() => {
    if (bridge.state.dji_connected && (Date.now() - bridge.getLastPacketTime() > 1500)) {
      bridge.state.dji_connected = false;
      bridge.state.status = 'Controller Offline / Telemetry Timeout';
      console.log('[DJI STATUS] Telemetry timed out. Is the controller ON?');
      broadcast(JSON.stringify(bridge.state));
    }
  }, 500);

  // Start the bridge
  bridge.start().catch(err => {
    console.error('[FATAL] Bridge failed:', err);
    process.exit(1);
  });

  console.log('\n----------------------------------------------------');
  console.log('1. Run "npm run dev:client" to start the Vite dev server.');
  console.log('2. Make sure your DJI controller is connected and switched on.');
  console.log('3. Keep this terminal running in the background.');
  console.log('Press Ctrl+C to terminate this bridge script.');
  console.log('----------------------------------------------------');
}

main().catch(err => {
  console.error('[FATAL] Bridge startup failed:', err);
  process.exit(1);
});
