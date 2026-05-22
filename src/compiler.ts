// Compiler: wraps `latexmk -lualatex` for fast incremental compiles.
// Each compile run:
//   1. Symlinks the LaTeX project root from the vault into a stable workspace
//      under PLUGIN_OUTPUT_DIR/<project-hash>/src.
//   2. Runs latexmk inside the workspace with --output-directory pointing at
//      a per-project build dir, so .aux/.log/.synctex.gz cache survives between
//      runs (= fast incremental builds).
//   3. Parses the log for errors and warnings.

import { spawn } from "child_process";
import * as path from "path";
import * as fs from "fs";
import * as crypto from "crypto";
import { CompileResult, LatexError, PluginSettings } from "./types";

export interface CompileRequest {
  // Absolute path to the root .tex file inside the vault.
  rootTexPath: string;
  // Absolute path to the project root dir (the dir containing rootTexPath
  // or its higher ancestor for multi-file projects).
  projectDir: string;
  // Where the plugin keeps its build workspaces.
  workspaceRoot: string;
}

export class LatexCompiler {
  constructor(private settings: PluginSettings) {}

  setSettings(settings: PluginSettings) {
    this.settings = settings;
  }

  /**
   * Stable hash for a vault project dir → workspace folder name.
   * Uses a short sha256 of the absolute path; survives across plugin reloads.
   */
  static workspaceFor(projectDir: string, workspaceRoot: string): {
    workspaceDir: string;
    srcLink: string;
    buildDir: string;
  } {
    const hash = crypto
      .createHash("sha256")
      .update(projectDir)
      .digest("hex")
      .slice(0, 12);
    const workspaceDir = path.join(workspaceRoot, hash);
    return {
      workspaceDir,
      srcLink: path.join(workspaceDir, "src"),
      buildDir: path.join(workspaceDir, "build"),
    };
  }

  async compile(req: CompileRequest): Promise<CompileResult> {
    const t0 = Date.now();
    const { workspaceDir, srcLink, buildDir } = LatexCompiler.workspaceFor(
      req.projectDir,
      req.workspaceRoot,
    );

    fs.mkdirSync(workspaceDir, { recursive: true });
    fs.mkdirSync(buildDir, { recursive: true });

    // Ensure srcLink points to the vault project dir. Use a symlink so the
    // workspace transparently sees the latest .tex/media without copying.
    await this.ensureSymlink(req.projectDir, srcLink);

    // Compute relative path against the *real* project dir (not the symlink),
    // then run latexmk with cwd = srcLink so all relative \input{} resolutions
    // still work and synctex records workspace paths.
    const relRoot = path.relative(req.projectDir, req.rootTexPath);
    if (relRoot.startsWith("..") || path.isAbsolute(relRoot)) {
      throw new Error(
        `Root .tex (${req.rootTexPath}) is outside project dir (${req.projectDir})`,
      );
    }

    const args = [
      "-lualatex",
      "-interaction=nonstopmode",
      "-halt-on-error",
      "-file-line-error",
      "-synctex=1",
      `-output-directory=${buildDir}`,
      ...(this.settings.extraLatexmkArgs
        ? this.settings.extraLatexmkArgs.split(/\s+/).filter(Boolean)
        : []),
      relRoot,
    ];

    const log = await this.runLatexmk(args, srcLink);
    const errors = this.parseErrors(log, srcLink, req.projectDir);
    const warnings = this.parseWarnings(log, srcLink, req.projectDir);

    const pdfName = path.basename(relRoot, ".tex") + ".pdf";
    const synctexName = path.basename(relRoot, ".tex") + ".synctex.gz";
    const pdfPath = path.join(buildDir, pdfName);
    const synctexPath = path.join(buildDir, synctexName);

    const pdfExists = fs.existsSync(pdfPath);

    return {
      success: pdfExists && errors.length === 0,
      pdfPath: pdfExists ? pdfPath : null,
      synctexPath: fs.existsSync(synctexPath) ? synctexPath : null,
      errors,
      warnings,
      rawLog: log,
      durationMs: Date.now() - t0,
    };
  }

  private async ensureSymlink(target: string, linkPath: string): Promise<void> {
    try {
      const cur = await fs.promises.readlink(linkPath);
      if (cur === target) return;
      await fs.promises.unlink(linkPath);
    } catch {
      // not a link / doesn't exist → fall through to create
      try {
        const st = await fs.promises.lstat(linkPath);
        if (st.isDirectory()) {
          // Was a real dir; remove only if empty (safety).
          await fs.promises.rmdir(linkPath);
        } else if (st.isFile()) {
          await fs.promises.unlink(linkPath);
        }
      } catch {
        // doesn't exist
      }
    }
    await fs.promises.symlink(target, linkPath, "dir");
  }

  private runLatexmk(args: string[], cwd: string): Promise<string> {
    return new Promise((resolve) => {
      let log = "";
      const proc = spawn(this.settings.latexmkPath, args, {
        cwd,
        env: process.env,
      });
      proc.stdout.on("data", (d) => (log += d.toString()));
      proc.stderr.on("data", (d) => (log += d.toString()));
      proc.on("error", (err) => {
        log += `\n[plugin] failed to spawn latexmk: ${err.message}\n`;
        resolve(log);
      });
      proc.on("close", () => resolve(log));
    });
  }

  /**
   * Parse `-file-line-error` style messages:
   *   /abs/or/relative/path.tex:42: ! Undefined control sequence.
   * latexmk runs with cwd = srcLink, so relative paths resolve against it.
   */
  private parseErrors(
    log: string,
    srcLink: string,
    projectDir: string,
  ): LatexError[] {
    const out: LatexError[] = [];
    // file-line-error format. Robust to ./foo.tex, foo.tex, /abs/foo.tex.
    const re = /^(.+?\.tex):(\d+):\s*(?:!\s*)?(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(log))) {
      const file = this.resolveFile(m[1], srcLink, projectDir);
      const line = Math.max(0, parseInt(m[2], 10) - 1);
      const message = m[3].trim();
      if (!message) continue;
      out.push({ file, line, message, type: "error" });
    }
    return dedupe(out);
  }

  private parseWarnings(
    log: string,
    srcLink: string,
    projectDir: string,
  ): LatexError[] {
    const out: LatexError[] = [];
    // LaTeX/Package/Class Warning, with optional "on input line N" anywhere
    // in the message (we extract line separately so we don't over-trim text).
    const re = /^(?:LaTeX|Package|Class)\s+\w*\s*[Ww]arning:?\s*(.+)$/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(log))) {
      const full = m[1].trim();
      const lineMatch = /on input line\s+(\d+)/.exec(full);
      const line = lineMatch ? Math.max(0, parseInt(lineMatch[1], 10) - 1) : 0;
      out.push({ file: "", line, message: full.replace(/\.$/, ""), type: "warning" });
    }
    return out;
  }

  private resolveFile(p: string, srcLink: string, projectDir: string): string {
    let resolved = path.isAbsolute(p) ? p : path.resolve(srcLink, p);
    // Map workspace srcLink/* back to projectDir/* so the editor can open
    // the real vault file.
    if (resolved.startsWith(srcLink)) {
      resolved = path.join(projectDir, resolved.slice(srcLink.length));
    }
    return resolved;
  }
}

function dedupe(errors: LatexError[]): LatexError[] {
  const seen = new Set<string>();
  const out: LatexError[] = [];
  for (const e of errors) {
    const k = `${e.file}|${e.line}|${e.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(e);
  }
  return out;
}
