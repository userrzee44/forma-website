import http from 'node:http';
import { readFile } from 'node:fs/promises';
import handler from './api/roblox.js';
const files = { '/': ['index.html','text/html'], '/index.html':['index.html','text/html'], '/style.css':['style.css','text/css'], '/script.js':['script.js','text/javascript'], '/favicon.svg':['favicon.svg','image/svg+xml'] };
http.createServer(async (req,res) => {
  if (new URL(req.url,'http://localhost').pathname === '/api/roblox') {
    res.status = code => { res.statusCode = code; return res; };
    res.json = obj => res.end(JSON.stringify(obj));
    return handler(req,res);
  }
  const file = files[new URL(req.url,'http://localhost').pathname];
  if (!file) { res.writeHead(404); return res.end('Not found'); }
  try { res.setHeader('Content-Type',file[1]); res.end(await readFile(new URL(file[0],import.meta.url))); }
  catch { res.writeHead(500); res.end('Could not load file'); }
}).listen(Number(process.env.PORT)||3000,'127.0.0.1',()=>console.log('Bloxscope running at http://localhost:3000'));
