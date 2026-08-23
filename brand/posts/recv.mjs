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
      const cards = JSON.parse(body);
      let n = 0;
      for (const [name, dataUrl] of Object.entries(cards)) {
        writeFileSync(`./${name}.png`, Buffer.from(dataUrl.split(",")[1], "base64"));
        n++;
      }
      console.log(`wrote ${n} cards`);
      res.end(String(n));
    } catch (e) { res.statusCode = 400; res.end(String(e)); }
  });
}).listen(8795, "127.0.0.1", () => console.log("card recv on 8795"));
