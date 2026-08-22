# Coffer brand assets

Same identity as the product: ink `#0a0a08`, amber `#ffb000`, Space Mono
display / IBM Plex Mono text, dot grid, hard 1px rules, no gradients or
rounded corners. Someone who sees the X account and then the site should
recognise them as one thing.

| File | Size | Use |
| ---- | ---- | --- |
| `coffer-pfp.png` | 400×400 | X profile picture (also works as favicon source) |
| `coffer-banner.png` | 1500×500 | X header |

## Why they look like this

**Profile picture** — the amber block "C" is the exact mark used in the app
sidebar and favicon, so the avatar is already familiar before anyone reads a
word. X crops avatars to a circle: the letter is centred and the inner rule
inset far enough that the crop cuts only dead amber, never the frame corners
in a way that reads as broken.

**Banner** — X overlays the avatar on the bottom-LEFT and crops the top and
bottom edges on narrow screens. So every pixel that matters sits right of
400px and vertically centred: nothing important can be covered or cut. The
three chips lead with the claims that survive scrutiny — what depositors
keep, what a trader structurally cannot do, and that the record is public.

## Regenerating

`gen.html` draws both to canvas at exact pixel size (the approach the PnL
share cards use), and `recv.mjs` writes the posted data URLs to disk.

```bash
cd brand
python -m http.server 8791 --bind 127.0.0.1 &   # serve gen.html
node recv.mjs &                                  # writes PNGs it is POSTed
```

Open http://127.0.0.1:8791/gen.html, then in the console:

```js
const send = (name, dataUrl) => fetch('http://127.0.0.1:8792', {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ name, dataUrl }),
});
send('coffer-pfp.png', __assets.pfp);
send('coffer-banner.png', __assets.banner);
```

Edit the drawing code in `gen.html` to change either asset. Do NOT screenshot
the browser for these — the pane scales screenshots and you get a blurry
800px-wide image instead of the exact size X wants.
