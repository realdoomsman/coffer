const http = require('http');
const { spawn } = require('child_process');

console.log('Starting Coffer API...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Working directory:', process.cwd());
console.log('Node version:', process.version);

// Simple health check server
const healthServer = http.createServer((req, res) => {
  console.log(`Health check: ${req.method} ${req.url}`);
  if (req.url === '/api/health/ping') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ pong: true, uptime: process.uptime() }));
  } else if (req.url === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, db: false, uptime: process.uptime() }));
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

healthServer.listen(8787, '0.0.0.0', () => {
  console.log('Health check server listening on port 8787');
  console.log('Health endpoints: /api/health/ping, /api/health');
  
  // Start the actual API
  console.log('Starting main API...');
  const apiProcess = spawn('npx', ['tsx', 'apps/api/src/index.ts'], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, PORT: '8787' }
  });
  
  apiProcess.on('error', (error) => {
    console.error('Failed to start API:', error);
  });
  
  apiProcess.on('exit', (code) => {
    console.log(`API process exited with code ${code}`);
    process.exit(code || 0);
  });
});