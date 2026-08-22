# Pointing coffer.fun at the live site

Registrar: **Porkbun**. The app is deployed and serving at
**https://coffer-app-production.up.railway.app** (Railway project `coffer`,
service `coffer-app`, Postgres attached). Both custom domains are already
registered on the Railway side and are only waiting on DNS.

## Where to go

Porkbun → **Domain Management** → find `coffer.fun` → **DNS** (the button in
that row, sometimes shown as "Edit DNS Records"). That opens a table with
columns: **Type · Host · Answer · TTL · Priority**.

Do NOT use Porkbun's *URL Forwarding* — it bounces visitors instead of serving
the site, and HTTPS will not issue.

## The four records

| Type  | Host              | Answer |
| ----- | ----------------- | ------ |
| ALIAS | *(leave blank)*   | `k6t35tbz.up.railway.app` |
| TXT   | `_railway-verify` | `railway-verify=6582c5924b9661c3f3b7418d568a202f326094c344423137d0926158fb6735ae` |
| CNAME | `www`             | `frpizk1r.up.railway.app` |
| TXT   | `_railway-verify.www` | `railway-verify=722174ee85b70c614ee952870846d56339947fcc26ee4ff0a4250df009a0f768` |

Notes specific to Porkbun:
- **Use ALIAS for the root, not CNAME.** Strict DNS forbids a CNAME at a
  domain's apex; Porkbun's ALIAS type exists precisely for this and behaves
  like a CNAME that is legal at the root. (If you only see CNAME, ALIAS is
  usually one entry below it in the Type dropdown.)
- **Host is blank for the root record** — Porkbun already shows `coffer.fun`
  as the suffix, so typing `@` or `coffer.fun` would create
  `@.coffer.fun` / `coffer.fun.coffer.fun`.
- Porkbun pre-creates its own parking/ALIAS records on a new domain. Delete
  any existing root ALIAS/A record and any `www` CNAME first, or the new ones
  will conflict.
- The TXT records prove ownership. Without them the TLS certificate stays in
  `VALIDATING_OWNERSHIP` and HTTPS never issues — the site would only load
  over plain HTTP, if at all.
- TTL: leave the default (600). Propagation is usually minutes.

## Verify

```bash
railway domain list -s coffer-app
```

Then, once it reports verified:

```bash
curl -s https://coffer.fun/api/health
```

Expected: `{"ok":true,"db":true,...}`
