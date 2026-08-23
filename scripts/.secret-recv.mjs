// A paste target. The browser cannot hand a clipboard secret to a script,
// but a real paste into a real field is allowed — so serve a field, paste
// into it, and write the value straight to .env. The secret never enters a
// chat transcript, a screenshot, or a tool result.
import http from "node:http";
import { readFileSync, writeFileSync } from "node:fs";

const PAGE = `<!doctype html><meta charset=utf-8>
<style>body{background:#0a0a08;color:#e9e6da;font:14px monospace;padding:40px}
textarea{width:560px;height:90px;background:#111;color:#f9a81b;border:1px solid #333;padding:10px;font:13px monospace}
#s{margin-top:14px;color:#8c8c8c}</style>
<h3>Paste the Privy app secret here (Ctrl+V)</h3>
<textarea id=t autofocus placeholder="paste here"></textarea>
<div id=s>waiting…</div>
<script>
const t=document.getElementById('t'), s=document.getElementById('s');
async function send(){
  const v=t.value.trim(); if(!v) return;
  const r=await fetch('/save',{method:'POST',headers:{'content-type':'application/json'},
    body:JSON.stringify({key:'PRIVY_APP_SECRET',value:v})});
  s.textContent = (await r.text()) === 'ok' ? 'saved ('+v.length+' chars) — you can close this' : 'failed';
  t.value='';
}
t.addEventListener('paste',()=>setTimeout(send,60));
t.addEventListener('input',()=>setTimeout(send,400));
</script>`;

http.createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  if (req.method === "GET") { res.setHeader("content-type","text/html"); return res.end(PAGE); }
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      const { key, value } = JSON.parse(body);
      if (!/^[A-Z0-9_]+$/.test(key) || !value) throw new Error("bad payload");
      let env = ""; try { env = readFileSync(".env", "utf8"); } catch {}
      const line = `${key}="${value}"`;
      env = new RegExp(`^${key}=.*$`, "m").test(env)
        ? env.replace(new RegExp(`^${key}=.*$`, "m"), line)
        : env.trimEnd() + "\n" + line + "\n";
      writeFileSync(".env", env);
      console.log(`wrote ${key} (${value.length} chars)`);
      res.end("ok");
    } catch (e) { res.statusCode = 400; res.end(String(e)); }
  });
}).listen(8797, "127.0.0.1", () => console.log("paste target on 8797"));
