# obsidian-latex-live

LuaLaTeX live preview for Obsidian: fast incremental compiles, embedded PDF
viewer that streams in via a local HTTP server, and bidirectional SyncTeX so
clicks on the PDF jump straight to the source line.

## Features

- **Fast incremental compiles** via `latexmk -lualatex` with a per-project
  build cache (subsequent compiles ~0.5–1 s).
- **Live PDF preview** rendered by `pdf.js` in an Obsidian leaf, served from
  a tiny local HTTP server with Server-Sent Events for instant auto-reload.
- **Bidirectional SyncTeX**:
  - Click in the PDF → cursor jumps to that line in the `.tex` source.
  - `Ctrl+Alt+J` (or auto-follow toggle) → PDF scrolls/highlights the line at
    your cursor.
- **Inline editor diagnostics**: wavy underline on the offending line, with
  the LaTeX message rendered next to it.
- **Error panel** sidebar with click-to-jump.
- Warnings hidden by default (LaTeX is noisy); toggleable in settings.
- All compile artifacts live in `~/.cache/obsidian-latex-live/` – the vault
  stays clean, only your `.tex` + media files are tracked.

## Requirements

- Obsidian ≥ 1.4
- Linux (the plugin uses `child_process`/`fs`; `isDesktopOnly: true`)
- TeX Live:
  ```bash
  sudo apt install texlive-full   # or texlive-luatex + texlive-latex-extra
  ```
  Verify:
  ```bash
  latexmk -version && lualatex -version && synctex --help
  ```

## Project layout

```
~/projects/obsidian-latex-live/   ← this repo (dev environment)
├── src/                          TypeScript sources
├── pdfjs/                        (reserved – pdf.js currently loaded from CDN)
├── output/                       (legacy; build artifacts now go to ~/.cache)
├── scripts/install-to-vault.sh   production install script
├── manifest.json
├── styles.css
├── package.json
├── tsconfig.json
└── esbuild.config.mjs

<vault>/.obsidian/plugins/obsidian-latex-live/   ← runtime install
├── main.js                       (built by esbuild)
├── manifest.json
└── styles.css
```

`esbuild.config.mjs` writes the dev build directly into the vault plugin
directory so the only thing you need to do after editing is reload Obsidian
(or use the *Hot Reload* community plugin).

## Development

```bash
cd ~/projects/obsidian-latex-live
npm install
npm run dev          # watches src/ → vault plugin dir
```

Then in Obsidian: **Settings → Community plugins → enable “LaTeX Live”**.

For production:
```bash
npm run build
./scripts/install-to-vault.sh /path/to/vault
```

## Hotkeys

| Hotkey            | Action                          |
|-------------------|---------------------------------|
| `Ctrl+Shift+B`    | Compile current `.tex`          |
| `Ctrl+Shift+P`    | Open PDF preview leaf           |
| `Ctrl+Alt+J`      | Sync PDF to current cursor line |

## Multi-file projects

Add this to chapter files so the plugin compiles the right entry point:

```latex
% !TEX root = ../main.tex
```

## Settings highlights

- **Debounce delay** (default 800 ms): wait after the last keystroke before
  recompiling.
- **Auto-follow cursor** (off): live cursor → PDF highlight (can be jumpy).
- **Show warnings** (off): include LaTeX warnings alongside errors.
- **Preferred port** (0 = auto-pick): the localhost port for the PDF server.

## License

MIT
