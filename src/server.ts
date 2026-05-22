// PreviewServer: serves the compiled PDF + an embedded viewer over localhost.
//
// Endpoints:
//   GET  /              → viewer.html (pdf.js wrapper with click/SSE wiring)
//   GET  /pdf?v=...     → current PDF bytes (cache-busting via ?v=)
//   GET  /events        → Server-Sent Events stream; "reload" message after
//                         each successful compile, "errors" for compile fail.
//   POST /click         → JSON body { page, x, y } from viewer; triggers
//                         the onPdfClick callback (used for PDF → editor sync).

import * as http from "http";
import * as fs from "fs";
import { URL } from "url";

export interface PdfClick {
  page: number;
  x: number;
  y: number;
}

export class PreviewServer {
  private server: http.Server | null = null;
  private port = 0;
  private host: string;
  private currentPdf: string | null = null;
  private currentPdfVersion = 0;
  private sseClients = new Set<http.ServerResponse>();
  private viewerHtml: string;

  onPdfClick?: (loc: PdfClick) => void;

  constructor(host: string, viewerHtml: string) {
    this.host = host;
    this.viewerHtml = viewerHtml;
  }

  setViewerHtml(html: string) {
    this.viewerHtml = html;
  }

  async start(preferredPort: number = 0): Promise<number> {
    if (this.server) return this.port;

    this.server = http.createServer((req, res) => this.handle(req, res));
    return new Promise((resolve, reject) => {
      this.server!.once("error", reject);
      this.server!.listen(preferredPort, this.host, () => {
        const addr = this.server!.address();
        if (addr && typeof addr === "object") this.port = addr.port;
        resolve(this.port);
      });
    });
  }

  async stop(): Promise<void> {
    for (const c of this.sseClients) {
      try { c.end(); } catch {}
    }
    this.sseClients.clear();
    if (this.server) {
      await new Promise<void>((r) => this.server!.close(() => r()));
      this.server = null;
    }
  }

  getPort(): number {
    return this.port;
  }

  getViewerUrl(): string {
    return `http://${this.host}:${this.port}/`;
  }

  /** Tell connected viewers a new PDF is available; they reload via SSE. */
  updatePdf(pdfPath: string) {
    this.currentPdf = pdfPath;
    this.currentPdfVersion++;
    this.broadcast("reload", { version: this.currentPdfVersion });
  }

  notifyError(message: string) {
    this.broadcast("error", { message });
  }

  /** Tell the viewer to highlight a specific (page, x, y). */
  navigateTo(page: number, x: number, y: number) {
    this.broadcast("navigate", { page, x, y });
  }

  private broadcast(event: string, data: unknown) {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of this.sseClients) {
      try { c.write(payload); } catch {}
    }
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    // CORS: allow Obsidian iframe origin. We're on 127.0.0.1; permissive is fine.
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && (pathname === "/" || pathname === "/index.html")) {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(this.viewerHtml);
      return;
    }

    if (req.method === "GET" && pathname === "/pdf") {
      this.servePdf(res);
      return;
    }

    if (req.method === "GET" && pathname === "/events") {
      this.handleSse(req, res);
      return;
    }

    if (req.method === "POST" && pathname === "/click") {
      this.handleClick(req, res);
      return;
    }

    if (req.method === "GET" && pathname === "/version") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: this.currentPdfVersion }));
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("not found");
  }

  private servePdf(res: http.ServerResponse) {
    if (!this.currentPdf || !fs.existsSync(this.currentPdf)) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("no pdf yet");
      return;
    }
    const stat = fs.statSync(this.currentPdf);
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Length": stat.size,
      "Cache-Control": "no-store",
    });
    fs.createReadStream(this.currentPdf).pipe(res);
  }

  private handleSse(req: http.IncomingMessage, res: http.ServerResponse) {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`retry: 1000\n\n`);
    res.write(`event: hello\ndata: {"version":${this.currentPdfVersion}}\n\n`);
    this.sseClients.add(res);
    req.on("close", () => this.sseClients.delete(res));
  }

  private handleClick(req: http.IncomingMessage, res: http.ServerResponse) {
    let body = "";
    req.on("data", (c) => (body += c.toString()));
    req.on("end", () => {
      try {
        const data = JSON.parse(body) as PdfClick;
        this.onPdfClick?.(data);
        res.writeHead(204);
        res.end();
      } catch (e) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("bad json");
      }
    });
  }
}
