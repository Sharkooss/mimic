import { buildServer } from './server.js';
import { setupSocket } from './socket.js';
import { env } from './env.js';
import { pruneEmptyRooms } from './game/rooms.js';

async function main(): Promise<void> {
  const app = await buildServer();
  setupSocket(app.server);

  // Nettoyage périodique des salons abandonnés.
  const pruneTimer = setInterval(pruneEmptyRooms, 10 * 60 * 1000);
  pruneTimer.unref();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    app.log.info(`🎨 Mimic server prêt sur http://${env.HOST}:${env.PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  const shutdown = async (signal: string): Promise<void> => {
    app.log.info(`Arrêt (${signal})…`);
    await app.close();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main();
