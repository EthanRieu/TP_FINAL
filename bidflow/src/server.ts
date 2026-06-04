import 'dotenv/config';
import http from 'http';
import { createApp } from './app';
import { connectDB } from './config/db';
import { initSocket } from './socket';

const PORT = process.env.PORT ?? 3000;

async function main() {
  await connectDB();
  const app = createApp();
  const httpServer = http.createServer(app);
  initSocket(httpServer);
  httpServer.listen(PORT, () => {
    console.log(`BidFlow API running on http://localhost:${PORT}`);
  });
}

main().catch(console.error);
