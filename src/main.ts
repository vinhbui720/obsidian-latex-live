// LaTeX Live plugin entry point.
//
// Wires together: compiler ↔ preview server ↔ PDF view ↔ error panel ↔
// inline diagnostics ↔ SyncTeX.

import {
  Plugin,
  TFile,
  Notice,
  MarkdownView,
  WorkspaceLeaf,
  TAbstractFile,
} from "obsidian";
import * as path from "path";
import * as os from "os";
import { LatexCompiler } from "./compiler";
import { PreviewServer } from "./server";
import { PdfView, PDF_VIEW_TYPE } from "./pdfViewer";
import { ErrorPanelView, ERROR_PANEL_VIEW_TYPE } from "./errorPanel";
import { SyncTexParser } from "./syncTeX";
import {
  errorsField,
  setErrorsEffect,
  createErrorPlugin,
} from "./inlineError";
import { LatexSettingTab } from "./settings";
import {
  PluginSettings,
  DEFAULT_SETTINGS,
  CompileResult,
  LatexError,
} from "./types";
import { VIEWER_HTML } from "./viewerHtml";

export default class LatexLivePlugin extends Plugin {
  settings!: PluginSettings;

  private compiler!: LatexCompiler;
  private server!: PreviewServer;
  private syncTex!: SyncTexParser;

  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private compiling = false;
  private queuedAfterCurrent = false;
  private lastResult: CompileResult | null = null;
  private lastWasClean = true;
  private lastCompiledRoot: string | null = null;

  // Plugin-local workspace where build artifacts live.
  // Outside the vault so it never gets synced/committed.
  private workspaceRoot = path.join(os.homedir(), ".cache", "obsidian-latex-live");

  async onload(): Promise<void> {
    await this.loadSettings();

    // Register .tex as a viewable file extension so it shows up in the file
    // explorer and opens with the markdown editor (CodeMirror). Without this,
    // Obsidian hides unknown extensions entirely.
    this.registerExtensions(["tex"], "markdown");

    this.compiler = new LatexCompiler(this.settings);
    this.syncTex = new SyncTexParser(this.settings.synctexPath);
    this.server = new PreviewServer(this.settings.serverHost, VIEWER_HTML);
    this.server.onPdfClick = (loc) => this.onPdfClick(loc);

    try {
      const port = await this.server.start(this.settings.preferredPort);
      console.log(`[latex-live] preview server listening on ${this.server.getViewerUrl()} (port ${port})`);
    } catch (e) {
      console.error("[latex-live] failed to start preview server:", e);
      new Notice("LaTeX Live: preview server failed to start. See console.");
    }

    // Views.
    this.registerView(
      PDF_VIEW_TYPE,
      (leaf) => new PdfView(leaf, this.server.getViewerUrl()),
    );
    this.registerView(
      ERROR_PANEL_VIEW_TYPE,
      (leaf) => {
        const v = new ErrorPanelView(leaf);
        v.setShowWarnings(this.settings.showWarnings);
        v.onItemClick = (err) => this.navigateToSource(err.file, err.line);
        return v;
      },
    );

    // Settings tab.
    this.addSettingTab(new LatexSettingTab(this.app, this));

    // Commands.
    this.addCommand({
      id: "compile",
      name: "Compile LaTeX",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "B" }],
      callback: () => this.compileActive(),
    });
    this.addCommand({
      id: "open-preview",
      name: "Open PDF preview",
      hotkeys: [{ modifiers: ["Mod", "Shift"], key: "P" }],
      callback: () => this.openPdfView(),
    });
    this.addCommand({
      id: "open-error-panel",
      name: "Toggle LaTeX error panel",
      callback: () => this.openErrorPanel(),
    });
    this.addCommand({
      id: "sync-pdf-to-cursor",
      name: "Sync PDF to cursor",
      hotkeys: [{ modifiers: ["Mod", "Alt"], key: "J" }],
      callback: () => this.syncPdfToCursor(),
    });

    // Auto compile on edit.
    this.registerEvent(
      this.app.workspace.on("editor-change", (_editor, info) => {
        if (!(info instanceof MarkdownView)) return;
        const f = info.file;
        if (!f || f.extension !== "tex") return;
        if (!this.settings.autoCompile) return;
        this.scheduleCompile(f);
      }),
    );

    // Auto-follow cursor → highlight PDF.
    this.registerEvent(
      this.app.workspace.on("editor-change", () => {
        if (this.settings.autoFollowCursor) {
          this.syncPdfToCursor().catch(() => undefined);
        }
      }),
    );

    // Editor extension for inline errors.
    this.registerEditorExtension([
      errorsField,
      createErrorPlugin(() => {
        const view = this.app.workspace.getActiveViewOfType(MarkdownView);
        return view?.file?.path ?? null;
      }),
    ]);
  }

  async onunload(): Promise<void> {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    try { await this.server.stop(); } catch {}
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.compiler.setSettings(this.settings);
    this.syncTex.setCommand(this.settings.synctexPath);
  }

  /** Recompute UI (panel filter, inline filter) after settings flip. */
  refreshDiagnostics() {
    const panel = this.getErrorPanel();
    if (panel) panel.setShowWarnings(this.settings.showWarnings);
    this.applyInlineErrors(this.lastResult);
  }

  private scheduleCompile(file: TFile) {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.compileFile(file).catch((e) =>
        console.error("[latex-live] compile failed:", e),
      );
    }, this.settings.debounceDelay);
  }

  private async compileActive(): Promise<void> {
    const v = this.app.workspace.getActiveViewOfType(MarkdownView);
    const f = v?.file;
    if (!f || f.extension !== "tex") {
      new Notice("LaTeX Live: open a .tex file first.");
      return;
    }
    await this.compileFile(f);
  }

  private async compileFile(file: TFile): Promise<void> {
    if (this.compiling) {
      this.queuedAfterCurrent = true;
      return;
    }
    this.compiling = true;
    const panel = this.getErrorPanel();
    if (panel) panel.setCompiling(true);

    try {
      const root = await this.findRootFile(file);
      const rootAbs = this.absPath(root);
      const projectDir = path.dirname(rootAbs);
      this.lastCompiledRoot = rootAbs;

      const result = await this.compiler.compile({
        rootTexPath: rootAbs,
        projectDir,
        workspaceRoot: this.workspaceRoot,
      });
      this.lastResult = result;
      this.applyInlineErrors(result);
      if (panel) {
        panel.setResult(result.errors, result.warnings, result.durationMs);
      }

      if (result.success && result.pdfPath) {
        this.server.updatePdf(result.pdfPath);
        this.lastWasClean = true;
      } else {
        this.server.notifyError(`${result.errors.length} error(s)`);
        if (
          this.settings.notifyFirstError &&
          this.lastWasClean &&
          result.errors.length > 0
        ) {
          new Notice(
            `LaTeX Live: ✗ ${result.errors.length} error(s) – see panel`,
            4000,
          );
        }
        this.lastWasClean = false;
      }
    } finally {
      this.compiling = false;
      if (this.queuedAfterCurrent) {
        this.queuedAfterCurrent = false;
        this.compileFile(file).catch(() => undefined);
      }
    }
  }

  private applyInlineErrors(result: CompileResult | null) {
    if (!result) return;
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) return;
    const cm = (view.editor as unknown as { cm?: { dispatch: Function } }).cm;
    if (!cm) return;
    const items = this.settings.showInlineErrors
      ? [
          ...result.errors,
          ...(this.settings.showWarnings ? result.warnings : []),
        ]
      : [];
    cm.dispatch({ effects: setErrorsEffect.of(items) });
  }

  /** Find the root .tex file by reading `% !TEX root = ...` comments. */
  private async findRootFile(file: TFile): Promise<TFile> {
    const visited = new Set<string>();
    let current: TFile = file;
    for (let i = 0; i < 5; i++) {
      if (visited.has(current.path)) break;
      visited.add(current.path);
      const content = await this.app.vault.read(current);
      const m = content.match(/^%\s*!TEX\s+root\s*=\s*(.+)$/im);
      if (!m) break;
      const rel = m[1].trim().replace(/^["']|["']$/g, "");
      const dir = current.parent?.path ?? "";
      const rootPath = path.normalize(dir ? `${dir}/${rel}` : rel);
      const next = this.app.vault.getAbstractFileByPath(rootPath);
      if (next instanceof TFile) {
        current = next;
      } else {
        break;
      }
    }
    return current;
  }

  private absPath(file: TFile): string {
    const base = (this.app.vault.adapter as unknown as { basePath: string })
      .basePath;
    return path.join(base, file.path);
  }

  private vaultRelative(absPath: string): string | null {
    const base = (this.app.vault.adapter as unknown as { basePath: string })
      .basePath;
    if (!absPath.startsWith(base)) return null;
    return absPath.slice(base.length).replace(/^\/+/, "");
  }

  private async navigateToSource(absPath: string, line: number) {
    const rel = this.vaultRelative(absPath);
    if (!rel) return;
    const file = this.app.vault.getAbstractFileByPath(rel);
    if (!(file instanceof TFile)) return;
    const leaf = this.app.workspace.getLeaf();
    await leaf.openFile(file);
    const view = leaf.view;
    if (!(view instanceof MarkdownView)) return;
    view.editor.setCursor({ line, ch: 0 });
    view.editor.scrollIntoView(
      { from: { line, ch: 0 }, to: { line, ch: 0 } },
      true,
    );
  }

  private async onPdfClick(loc: { page: number; x: number; y: number }) {
    if (!this.lastResult?.synctexPath) return;
    const target = await this.syncTex.pdfToSource(
      this.lastResult.synctexPath,
      loc.page,
      loc.x,
      loc.y,
    );
    if (!target) return;
    await this.navigateToSource(target.file, target.line);
  }

  private async syncPdfToCursor() {
    if (!this.lastResult?.synctexPath) {
      new Notice("LaTeX Live: no compiled PDF yet.");
      return;
    }
    const v = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!v?.file) return;
    const abs = this.absPath(v.file);
    const line = v.editor.getCursor().line;
    const target = await this.syncTex.sourceToPdf(
      this.lastResult.synctexPath,
      abs,
      line,
    );
    if (!target) return;
    this.server.navigateTo(target.page, target.x, target.y);
  }

  private async openPdfView() {
    const existing = this.app.workspace.getLeavesOfType(PDF_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: PDF_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(leaf);
  }

  private async openErrorPanel() {
    const existing = this.app.workspace.getLeavesOfType(ERROR_PANEL_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const right = this.app.workspace.getRightLeaf(false);
    if (!right) return;
    await right.setViewState({ type: ERROR_PANEL_VIEW_TYPE, active: true });
    this.app.workspace.revealLeaf(right);
  }

  private getErrorPanel(): ErrorPanelView | null {
    const leaves = this.app.workspace.getLeavesOfType(ERROR_PANEL_VIEW_TYPE);
    const v = leaves[0]?.view;
    return v instanceof ErrorPanelView ? v : null;
  }
}
