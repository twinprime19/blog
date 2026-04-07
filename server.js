import { serve } from '@hono/node-server';
import { createServer } from 'net';
import { app, port } from './app.js';

// Check if a port is available by briefly binding to it
function checkPort(p) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen(p);
  });
}

let usePort = port;
if (!await checkPort(port)) {
  for (let p = port + 1; p <= 1999; p++) {
    if (await checkPort(p)) { usePort = p; break; }
  }
  if (usePort === port) {
    console.error(`No available port in range ${port}–1999`);
    process.exit(1);
  }
  console.log(`Port ${port} in use, using ${usePort}`);
}

serve({ fetch: app.fetch, port: usePort }, () => {
  console.log(`Blog running at http://localhost:${usePort}`);
});
