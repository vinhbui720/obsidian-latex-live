// SyncTeX: bidirectional source ↔ PDF mapping via the `synctex` CLI.

import { spawn } from "child_process";

export interface SyncTexEditLocation {
  file: string;
  line: number;       // 0-indexed for CodeMirror
  column: number;
}

export interface SyncTexViewLocation {
  page: number;
  x: number;
  y: number;
}

export class SyncTexParser {
  constructor(private cmd: string = "synctex") {}

  setCommand(cmd: string) {
    this.cmd = cmd;
  }

  /** PDF coords → source location ("synctex edit" target). */
  async pdfToSource(
    synctexPath: string,
    page: number,
    x: number,
    y: number,
  ): Promise<SyncTexEditLocation | null> {
    const args = ["view", "-i", `${page}:${x}:${y}:${synctexPath}`];
    const out = await this.run(args);
    if (!out) return null;
    return this.parseEdit(out);
  }

  /** Source line → PDF coords. */
  async sourceToPdf(
    synctexPath: string,
    texFile: string,
    line: number,
  ): Promise<SyncTexViewLocation | null> {
    // synctex edit takes 1-indexed line.
    const args = ["edit", "-o", `${line + 1}:0:${texFile}`, "-d", synctexPath];
    const out = await this.run(args);
    if (!out) return null;
    return this.parseView(out);
  }

  private run(args: string[]): Promise<string> {
    return new Promise((resolve) => {
      let buf = "";
      const proc = spawn(this.cmd, args);
      proc.stdout.on("data", (d) => (buf += d.toString()));
      proc.stderr.on("data", (d) => (buf += d.toString()));
      proc.on("error", () => resolve(""));
      proc.on("close", () => resolve(buf));
    });
  }

  // synctex view output (source location for a PDF click):
  //   Output:.../main.pdf
  //   Input:.../main.tex
  //   Line:42
  //   Column:0
  private parseEdit(out: string): SyncTexEditLocation | null {
    const file = /^Input:(.+)$/m.exec(out)?.[1]?.trim();
    const line = /^Line:(\d+)/m.exec(out)?.[1];
    const col = /^Column:(-?\d+)/m.exec(out)?.[1];
    if (!file || !line) return null;
    return {
      file,
      line: Math.max(0, parseInt(line, 10) - 1),
      column: col ? Math.max(0, parseInt(col, 10)) : 0,
    };
  }

  // synctex edit output (PDF location for a source line):
  //   Output:.../main.pdf
  //   Page:1
  //   x:120.34
  //   y:520.12
  private parseView(out: string): SyncTexViewLocation | null {
    const page = /^Page:(\d+)/m.exec(out)?.[1];
    const x = /^x:([0-9.]+)/m.exec(out)?.[1];
    const y = /^y:([0-9.]+)/m.exec(out)?.[1];
    if (!page || !x || !y) return null;
    return {
      page: parseInt(page, 10),
      x: parseFloat(x),
      y: parseFloat(y),
    };
  }
}
