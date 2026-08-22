import http from "node:http";
import { writeFileSync } from "node:fs";
http.createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "content-type");
  if (req.method === "OPTIONS") return res.end();
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    try {
      const { name, dataUrl } = JSON.parse(body);
      const b64 = dataUrl.split(",")[1];
      writeFileSync(`./${name}`, Buffer.from(b64, "base64"));
      console.log(`wrote ${name}`);
      res.end("ok");
    } catch (e) { res.statusCode = 400; res.end(String(e)); }
  });
}).listen(8792, "127.0.0.1", () => console.log("recv on 8792"));
