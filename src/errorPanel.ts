// Error panel: sidebar view listing compile errors/warnings.
// Click an item → callback to navigate the editor to that location.

import { ItemView, WorkspaceLeaf } from "obsidian";
import { LatexError } from "./types";

export const ERROR_PANEL_VIEW_TYPE = "latex-error-panel";

export class ErrorPanelView extends ItemView {
  private errors: LatexError[] = [];
  private warnings: LatexError[] = [];
  private showWarnings = false;
  private compiling = false;
  private lastDurationMs: number | null = null;

  onItemClick?: (err: LatexError) => void;

  getViewType(): string {
    return ERROR_PANEL_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "LaTeX errors";
  }

  getIcon(): string {
    return "alert-triangle";
  }

  async onOpen(): Promise<void> {
    this.render();
  }

  setShowWarnings(v: boolean) {
    this.showWarnings = v;
    this.render();
  }

  setCompiling(v: boolean) {
    this.compiling = v;
    this.render();
  }

  setResult(errors: LatexError[], warnings: LatexError[], durationMs: number) {
    this.errors = errors;
    this.warnings = warnings;
    this.lastDurationMs = durationMs;
    this.compiling = false;
    this.render();
  }

  private render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("latex-error-panel");

    const header = container.createDiv({ cls: "latex-error-header" });
    if (this.compiling) {
      header.createSpan({ text: "⏳ Compiling…", cls: "latex-status-compiling" });
    } else if (this.errors.length === 0) {
      const txt =
        this.lastDurationMs !== null
          ? `✓ No errors (${this.lastDurationMs} ms)`
          : "✓ No errors";
      header.createSpan({ text: txt, cls: "latex-status-ok" });
    } else {
      header.createSpan({
        text: `✗ ${this.errors.length} error(s)` +
          (this.warnings.length > 0
            ? `, ${this.warnings.length} warning(s)`
            : ""),
        cls: "latex-status-err",
      });
    }

    const list = container.createEl("ul", { cls: "latex-error-list" });

    for (const err of this.errors) {
      this.renderItem(list, err);
    }

    if (this.showWarnings) {
      for (const w of this.warnings) {
        this.renderItem(list, w);
      }
    }
  }

  private renderItem(list: HTMLElement, err: LatexError) {
    const item = list.createEl("li", {
      cls: `latex-error-item latex-error-${err.type}`,
    });
    const icon = err.type === "error" ? "✗" : "⚠";
    item.createEl("span", { text: icon, cls: "latex-error-icon" });
    const body = item.createDiv({ cls: "latex-error-body" });
    if (err.file) {
      body.createEl("div", {
        text: `${shortenPath(err.file)}:${err.line + 1}`,
        cls: "latex-error-loc",
      });
    }
    body.createEl("div", { text: err.message, cls: "latex-error-msg" });
    item.addEventListener("click", () => this.onItemClick?.(err));
  }

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }
}

function shortenPath(p: string): string {
  const parts = p.split("/");
  if (parts.length <= 3) return p;
  return ".../" + parts.slice(-3).join("/");
}
