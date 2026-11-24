import { app } from './app';
import { database } from './config/database';

const port = Number(process.env.PORT ?? 3000);

const server = app.listen(port, () => {
  console.log(`Chat backend listening on port ${port}`);
});

function shutdown(): void {
  server.close(() => {
    void database.end().finally(() => process.exit(0));
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);