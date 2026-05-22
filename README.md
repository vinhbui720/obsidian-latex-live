# obsidian-latex-live

LuaLaTeX live preview for Obsidian: fast incremental compiles, embedded PDF
viewer, bidirectional SyncTeX, inline diagnostics, error panel, and LaTeX command
completion.

## Features

- **Compile on save by default**: edit `.tex`, press `Ctrl+S`, PDF refreshes.
- **Fast incremental compiles** via `latexmk -lualatex` with a per-project build
  cache in `~/.cache/obsidian-latex-live/`.
- **Live PDF preview** rendered by `pdf.js` in an Obsidian leaf, served from a
  local HTTP server with Server-Sent Events for instant reload.
- **Bidirectional SyncTeX**:
  - Click in PDF -> cursor jumps to the matching `.tex` source line.
  - `Ctrl+Alt+J` -> PDF scrolls/highlights the current cursor line.
- **Inline diagnostics**: wavy underlines in the editor plus a clickable error
  panel. Warnings are hidden by default.
- **LaTeX completions/snippets**: type `\` in a `.tex` file for commands,
  environments, math symbols, and templates.
- Build artifacts stay outside the vault, so your vault remains clean.

## Requirements

- Obsidian >= 1.4 desktop
- Linux
- Node.js + npm
- TeX Live tools: `latexmk`, `lualatex`, `synctex`

Ubuntu install:

```bash
sudo apt update
sudo apt install git nodejs npm texlive-full
```

Verify:

```bash
node --version
npm --version
latexmk -version
lualatex -version
synctex --help
```

## Quick install

```bash
mkdir -p ~/projects
cd ~/projects
git clone git@github.com:vinhbui720/obsidian-latex-live.git
cd obsidian-latex-live

# Pass your vault path. If omitted, defaults to:
# /home/vinh/Desktop/v_note/obsidian_note
./setup.sh "/path/to/your/Obsidian Vault"
```

For Vinh's current machine:

```bash
cd ~/projects/obsidian-latex-live
./setup.sh /home/vinh/Desktop/v_note/obsidian_note
```

Then in Obsidian:

1. Reload Obsidian with `Ctrl+R`.
2. Go to **Settings -> Community plugins**.
3. Enable **LaTeX Live**.
4. Open a `.tex` file.
5. Press `Ctrl+S` to save and compile.
6. Press `Ctrl+Shift+P` to open the PDF preview.

## What setup.sh does

`setup.sh` performs the full local installation:

1. Checks vault path contains `.obsidian`.
2. Checks `node` and `npm` exist.
3. Warns if `latexmk`, `lualatex`, or `synctex` are missing.
4. Runs `npm ci --legacy-peer-deps` or `npm install --legacy-peer-deps`.
   Obsidian's package pins some CodeMirror peer versions, so legacy peer
   resolution is intentional here.
5. Runs `npx tsc --noEmit`.
6. Runs `npm run build`.
7. Copies these files into the vault plugin folder:

```text
<vault>/.obsidian/plugins/obsidian-latex-live/
├── main.js
├── manifest.json
└── styles.css
```

## Manual install

If you do not want to use `setup.sh`:

```bash
cd ~/projects/obsidian-latex-live
npm install
npx tsc --noEmit
npm run build

VAULT="/path/to/your/Obsidian Vault"
PLUGIN_DIR="$VAULT/.obsidian/plugins/obsidian-latex-live"
mkdir -p "$PLUGIN_DIR"
cp dist/main.js manifest.json styles.css "$PLUGIN_DIR/"
```

## Development

```bash
cd ~/projects/obsidian-latex-live
npm install
npm run dev
```

`npm run dev` watches `src/` and writes the bundle directly into Vinh's default
vault plugin directory:

```text
/home/vinh/Desktop/v_note/obsidian_note/.obsidian/plugins/obsidian-latex-live/main.js
```

After source changes, reload Obsidian with `Ctrl+R` or use the Hot Reload
community plugin.

## Testing

```bash
cd ~/projects/obsidian-latex-live
npx tsc --noEmit
npm run build
npx tsx tests/smoke.ts
npx tsx tests/real_test.ts
npx tsx tests/synctex_test.ts
```

## Hotkeys

| Hotkey | Action |
|---|---|
| `Ctrl+Shift+B` | Compile current `.tex` manually |
| `Ctrl+Shift+P` | Open PDF preview leaf |
| `Ctrl+Alt+J` | Sync PDF to current cursor line |

Auto compile defaults to **on save**:

```text
edit .tex -> Ctrl+S -> compile -> PDF refreshes
```

You can change this in:

```text
Settings -> LaTeX Live -> Compile trigger
```

Options:

- `On save (Ctrl+S / autosave)` default
- `On change (every keystroke)`

## Multi-file projects

Add this to chapter files so the plugin compiles the right entry point:

```latex
% !TEX root = ../main.tex
```

## Push changes

```bash
cd ~/projects/obsidian-latex-live

npx tsc --noEmit
npm run build
npx tsx tests/smoke.ts

git status
git add -A
git commit -m "your message"
git push origin main
```

## License

MIT
