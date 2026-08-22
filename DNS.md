# coffer.fun — LIVE

**https://coffer.fun** and **https://www.coffer.fun** are serving the app over
HTTPS. Verified 2026-08-22: `/api/health` returns `{"ok":true,"db":true}`, the
SPA and its deep links load, and the Railway certificate is `VALID`.

Backing service: Railway project `coffer`, service `coffer-app`, Postgres
attached. Direct URL (still works): https://coffer-app-production.up.railway.app

## What the DNS ended up as

| Type  | Host                  | Answer |
| ----- | --------------------- | ------ |
| ALIAS | *(root)*              | `k6t35tbz.up.railway.app` |
| CNAME | `www`                 | `frpizk1r.up.railway.app` |
| TXT   | `_railway-verify`     | `railway-verify=6582c592…` |
| TXT   | `_railway-verify.www` | `railway-verify=722174ee…` |

Porkbun's four `NS` records were left untouched — deleting those would take
the domain offline entirely.

## The thing that would have silently broken it

Porkbun ships a **wildcard** parking record on new domains:

```
*.coffer.fun  ->  CNAME pixie.porkbun.com
```

It swallows every subdomain, including Railway's `_railway-verify` TXT, so
ownership validation can never pass while it exists — with no error message
saying why. Both it and the root ALIAS parking record had to be deleted, not
just overridden. If a domain ever sits in `VALIDATING_OWNERSHIP` forever,
this is the first thing to check.

Note: the DNS *web UI* froze the browser renderer twice mid-edit, and because
it stages records client-side until a final Submit, a freeze silently discards
everything. The API below is the reliable path.

## Re-checking or changing records later

Needs an API key (Account → API Access) plus **API ACCESS switched on for the
domain** in Domain Management — it is off by default and the API rejects the
domain without it.

```bash
curl -sX POST https://api.porkbun.com/api/json/v3/dns/retrieve/coffer.fun   -H 'content-type: application/json'   -d '{"apikey":"pk1_…","secretapikey":"sk1_…"}'
```

```bash
railway domain status <domain-id>      # Verified / Certificate status
curl -s https://coffer.fun/api/health  # {"ok":true,"db":true,...}
```
