# Pointing coffer.fun at the live site

Registrar: **Porkbun**. The app is deployed and serving at
**https://coffer-app-production.up.railway.app** (Railway project `coffer`,
service `coffer-app`, Postgres attached). Both custom domains are registered
on the Railway side and are only waiting on DNS.

## Current state (verified by dig/nslookup)

```
coffer.fun            ->  207.207.210.107 / .229   (pixie.porkbun.com — parking)
www.coffer.fun        ->  CNAME pixie.porkbun.com  (parking)
*.coffer.fun          ->  CNAME pixie.porkbun.com  (WILDCARD parking)
_railway-verify       ->  caught by the wildcard
```

**The wildcard is the trap.** Porkbun ships a `*` record on new domains, so
every subdomain — including Railway's `_railway-verify` TXT — resolves to the
parking page. Adding the TXT records is not enough: the parking records must
be removed or the verification silently never succeeds.

## Records to end up with

| Type  | Host                  | Answer |
| ----- | --------------------- | ------ |
| ALIAS | *(blank = root)*      | `k6t35tbz.up.railway.app` |
| TXT   | `_railway-verify`     | `railway-verify=6582c5924b9661c3f3b7418d568a202f326094c344423137d0926158fb6735ae` |
| CNAME | `www`                 | `frpizk1r.up.railway.app` |
| TXT   | `_railway-verify.www` | `railway-verify=722174ee85b70c614ee952870846d56339947fcc26ee4ff0a4250df009a0f768` |

Delete first: the root A records, the `www` CNAME, and the `*` wildcard —
all pointing at `pixie.porkbun.com`.

## Recommended: do it over the API

Porkbun's DNS web UI froze the browser renderer twice mid-edit (its staged
records are lost on reload, so partial work silently vanishes) and does not
render the existing-records table at all. The API is reliable and verifiable.

1. Porkbun → **Account → API Access** (porkbun.com/account/api) → create a key.
   You get an **API key** (`pk1_…`) and a **secret key** (`sk1_…`).
2. In **Domain Management**, open `coffer.fun`'s details and switch **API
   ACCESS** on for that domain (off by default — the API returns
   "Domain is not opted in to api access" without it).
3. Then everything below is scriptable:

```bash
# list current records (find the parking + wildcard ids)
curl -sX POST https://api.porkbun.com/api/json/v3/dns/retrieve/coffer.fun \
  -H 'content-type: application/json' \
  -d '{"apikey":"pk1_…","secretapikey":"sk1_…"}'

# delete one by id
curl -sX POST https://api.porkbun.com/api/json/v3/dns/delete/coffer.fun/<ID> \
  -H 'content-type: application/json' \
  -d '{"apikey":"pk1_…","secretapikey":"sk1_…"}'

# create the root ALIAS
curl -sX POST https://api.porkbun.com/api/json/v3/dns/create/coffer.fun \
  -H 'content-type: application/json' \
  -d '{"apikey":"pk1_…","secretapikey":"sk1_…",
       "type":"ALIAS","name":"","content":"k6t35tbz.up.railway.app","ttl":"600"}'
```

## Verify

```bash
railway domain list -s coffer-app     # wait for verified / certificate issued
curl -s https://coffer.fun/api/health # expect {"ok":true,"db":true,...}
```
