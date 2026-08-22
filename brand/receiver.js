const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8791;
const OUTPUT_DIR = path.join(__dirname, '..');

const server = http.createServer((req, res) => {
  if (req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { name, dataUrl } = JSON.parse(body);
        
        // Remove data URL prefix
        const base64Data = dataUrl.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64Data, 'base64');
        
        const outputPath = path.join(OUTPUT_DIR, name);
        fs.writeFileSync(outputPath, buffer);
        
        console.log(`Saved: ${name} (${buffer.length} bytes)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, path: outputPath }));
      } catch (err) {
        console.error('Error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Asset receiver running. Send POST with {name, dataUrl}');
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`Asset receiver running on http://127.0.0.1:${PORT}`);
  console.log('Output directory:', OUTPUT_DIR);
});
