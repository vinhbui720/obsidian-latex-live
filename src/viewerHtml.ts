// Viewer HTML: a small pdf.js wrapper served from the local HTTP server.
// We embed pdf.js from a CDN-pinned URL to keep the plugin build small.
// (User wanted "live output streamed to Obsidian"; this iframe is what
// renders that stream and routes clicks back to the plugin via /click.)

export const VIEWER_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>LaTeX Live Preview</title>
<style>
  html, body { margin: 0; padding: 0; height: 100%; background: #1e1e1e; color: #ddd; font-family: sans-serif; }
  #toolbar { display: flex; gap: 8px; align-items: center; padding: 4px 8px; background: #2a2a2a; border-bottom: 1px solid #444; font-size: 12px; }
  #toolbar button { background: #3a3a3a; border: 1px solid #555; color: #ddd; padding: 2px 8px; cursor: pointer; border-radius: 3px; }
  #toolbar button:hover { background: #4a4a4a; }
  #status { margin-left: auto; opacity: 0.7; }
  #viewer { position: absolute; top: 32px; left: 0; right: 0; bottom: 0; overflow: auto; }
  .page { display: block; margin: 16px auto; box-shadow: 0 2px 8px rgba(0,0,0,0.5); background: white; cursor: crosshair; position: relative; }
  .highlight { position: absolute; background: rgba(255, 235, 59, 0.4); border: 1px solid #fbc02d; pointer-events: none; transition: opacity 0.4s; }
</style>
</head>
<body>
<div id="toolbar">
  <button id="zoomOut">−</button>
  <span id="zoomLevel">100%</span>
  <button id="zoomIn">+</button>
  <button id="reload">↻</button>
  <span id="status">connecting…</span>
</div>
<div id="viewer"></div>

<script type="module">
  import * as pdfjsLib from "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.min.mjs";
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.4.168/build/pdf.worker.min.mjs";

  const viewerEl = document.getElementById("viewer");
  const statusEl = document.getElementById("status");
  const zoomLevelEl = document.getElementById("zoomLevel");
  let scale = 1.2;
  let currentPdf = null;
  let pageDims = []; // {width, height} per page at scale 1

  async function loadPdf() {
    const url = "/pdf?v=" + Date.now();
    statusEl.textContent = "loading…";
    try {
      const loadingTask = pdfjsLib.getDocument({ url, withCredentials: false });
      const pdf = await loadingTask.promise;
      currentPdf = pdf;
      await renderAll();
      statusEl.textContent = pdf.numPages + " page(s)";
    } catch (e) {
      statusEl.textContent = "no pdf yet";
      viewerEl.innerHTML = "";
    }
  }

  async function renderAll() {
    if (!currentPdf) return;
    viewerEl.innerHTML = "";
    pageDims = [];
    for (let i = 1; i <= currentPdf.numPages; i++) {
      const page = await currentPdf.getPage(i);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement("canvas");
      canvas.className = "page";
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.dataset.page = String(i);
      viewerEl.appendChild(canvas);
      const ctx = canvas.getContext("2d");
      await page.render({ canvasContext: ctx, viewport }).promise;
      pageDims[i - 1] = {
        width: viewport.width,
        height: viewport.height,
        scale,
        unscaledHeight: page.getViewport({ scale: 1 }).height,
      };
      attachClickHandler(canvas, i);
    }
  }

  function attachClickHandler(canvas, pageNum) {
    canvas.addEventListener("click", async (ev) => {
      const rect = canvas.getBoundingClientRect();
      const dims = pageDims[pageNum - 1];
      // Convert click position back to PDF coordinates (in TeX points).
      // pdf.js viewport y goes top-down; SyncTeX expects bottom-up but
      // \`synctex view\` accepts top-down x/y too.
      const xCss = ev.clientX - rect.left;
      const yCss = ev.clientY - rect.top;
      const xPdf = (xCss / dims.width) * (dims.width / dims.scale);
      const yPdf = (yCss / dims.height) * dims.unscaledHeight;
      try {
        await fetch("/click", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ page: pageNum, x: xPdf, y: yPdf }),
        });
      } catch {}
    });
  }

  function highlight(page, x, y) {
    const canvas = viewerEl.querySelector('canvas[data-page="' + page + '"]');
    if (!canvas) return;
    const dims = pageDims[page - 1];
    if (!dims) return;
    const el = document.createElement("div");
    el.className = "highlight";
    const left = (x / (dims.width / dims.scale)) * dims.width + canvas.offsetLeft;
    const top = (y / dims.unscaledHeight) * dims.height + canvas.offsetTop;
    el.style.left = (left - 30) + "px";
    el.style.top = (top - 8) + "px";
    el.style.width = "120px";
    el.style.height = "20px";
    viewerEl.appendChild(el);
    canvas.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => { el.style.opacity = "0"; }, 1500);
    setTimeout(() => { el.remove(); }, 2000);
  }

  // SSE: listen for "reload" / "navigate" / "error" from the plugin.
  function connect() {
    const es = new EventSource("/events");
    es.addEventListener("hello", () => { statusEl.textContent = "connected"; loadPdf(); });
    es.addEventListener("reload", () => { loadPdf(); });
    es.addEventListener("navigate", (e) => {
      try { const d = JSON.parse(e.data); highlight(d.page, d.x, d.y); } catch {}
    });
    es.addEventListener("error", (e) => {
      try { const d = JSON.parse(e.data); statusEl.textContent = "✗ " + d.message; } catch {}
    });
    es.onerror = () => { statusEl.textContent = "reconnecting…"; };
  }

  document.getElementById("zoomIn").addEventListener("click", () => {
    scale = Math.min(scale + 0.2, 4); zoomLevelEl.textContent = Math.round(scale * 100) + "%"; renderAll();
  });
  document.getElementById("zoomOut").addEventListener("click", () => {
    scale = Math.max(scale - 0.2, 0.3); zoomLevelEl.textContent = Math.round(scale * 100) + "%"; renderAll();
  });
  document.getElementById("reload").addEventListener("click", () => loadPdf());

  zoomLevelEl.textContent = Math.round(scale * 100) + "%";
  connect();
</script>
</body>
</html>`;
