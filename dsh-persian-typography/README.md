# @local/dsh-persian-typography

Persian typography for the DeepSeek Harness Web UI: a bundled Vazirmatn variable
font plus per-block right-to-left normalization for conversation text.

## What it does

- **Font.** Registers the bundled Vazirmatn variable font (`assets/vazirmatn-var.woff2`,
  SIL OFL 1.1 — see `OFL.txt`) through the FontFace API, so no CSP `font-src` rule can
  block it and no network request is made. On first activation it sets the theme's text
  font preference to `Vazirmatn` *only when no text font was chosen yet*; the built-in
  Settings → General → Text font row remains the single source of truth afterwards.
- **Direction.** A rAF-coalesced MutationObserver walks the conversation DOM and gives
  every text block (`p`, headings, list items' lists, tables, blockquotes, table cells,
  user bubbles, composer) an explicit `dir` picked from the **majority** of its prose
  letters, so a Persian sentence that opens with an English term still reads RTL.
  Code spans are excluded from that vote. `pre` stays LTR, inline `code`/`kbd`/`samp`
  are bidi-isolated, RTL lists move their padding to the right, and RTL blockquotes
  flip their rule side. The composer follows its own content while typing.
- **Settings.** Two General rows: *Persian text direction* (on/off) and *Persian font*
  (toggles `Vazirmatn` at the front of the text-font list).

The normalizer anchors on stable `data-conversation-*` / `data-chat-flow-kind`
attributes, never on hashed CSS-module class names, so it survives UI rebuilds.
Turning the direction toggle off removes every attribute and dir the plugin added.

## Layout

| Path | Purpose |
|---|---|
| `src/client.js` | Browser module source (font placeholder + normalizer + settings rows) |
| `build.mjs` | Inlines the base64 font into `client.js`; run after editing `src/client.js` |
| `client.js` | Generated browser bundle — the served artifact |
| `index.js` | Host half (no behavior; the Client module owns rendering) |
| `cordis.patch.yml` | Inserts the plugin row |

## Rebuild and reinstall

```sh
node build.mjs          # regenerate client.js from src/client.js + assets
```

Then reinstall/replace the bundle through Plugin Manager. A page refresh is required
for an already-open page to boot a newly installed client module.
