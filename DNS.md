# Pointing coffer.fun at the live site

The app is deployed and serving at
**https://coffer-app-production.up.railway.app** (Railway project `coffer`,
service `coffer-app`, Postgres attached). Both custom domains are already
registered on the Railway side and are waiting on DNS.

Add these four records at Dynadot (Domains → coffer.fun → DNS / Nameservers →
use Dynadot DNS, not forwarding):

| Type  | Name / Host       | Value |
| ----- | ----------------- | ----- |
| CNAME | `@` (root)        | `k6t35tbz.up.railway.app` |
| TXT   | `_railway-verify` | `railway-verify=6582c5924b9661c3f3b7418d568a202f326094c344423137d0926158fb6735ae` |
| CNAME | `www`             | `frpizk1r.up.railway.app` |
| TXT   | `_railway-verify.www` | `railway-verify=722174ee85b70c614ee952870846d56339947fcc26ee4ff0a4250df009a0f768` |

Notes:
- Dynadot's DNS UI splits "Record Type / Subdomain / Value". For the root
  CNAME leave the subdomain blank. If Dynadot refuses a CNAME at the apex
  (some registrars do — it is against strict DNS rules), use their **ALIAS**
  or **A-record forwarding to Railway** option, or move the domain to
  Cloudflare DNS which supports CNAME flattening at the root.
- The TXT records prove ownership; without them the TLS certificate stays in
  `VALIDATING_OWNERSHIP` and HTTPS will not issue.
- Propagation is usually minutes, occasionally hours.

Check progress any time:

```bash
railway domain list -s coffer-app
```

Then confirm the live site:

```bash
curl -s https://coffer.fun/api/health
```
