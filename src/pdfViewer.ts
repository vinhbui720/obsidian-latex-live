// PdfView: an Obsidian leaf hosting an iframe pointing at the local
// preview server. The iframe handles all PDF rendering, click capture,
// and SSE reload.

import { ItemView, WorkspaceLeaf } from "obsidian";

export const PDF_VIEW_TYPE = "latex-pdf-view";

export class PdfView extends ItemView {
  private iframe: HTMLIFrameElement | null = null;
  private viewerUrl: string;

  constructor(leaf: WorkspaceLeaf, viewerUrl: string) {
    super(leaf);
    this.viewerUrl = viewerUrl;
  }

  getViewType(): string {
    return PDF_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "LaTeX preview";
  }

  getIcon(): string {
    return "file-text";
  }

  async onOpen(): Promise<void> {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("latex-pdf-container");

    this.iframe = container.createEl("iframe", {
      cls: "latex-pdf-iframe",
      attr: { frameborder: "0", src: this.viewerUrl },
    });
  }

  setViewerUrl(url: string) {
    this.viewerUrl = url;
    if (this.iframe) this.iframe.src = url;
  }

  reload() {
    if (this.iframe) {
      // Add cache-buster so the SSE re-fires "hello".
      const sep = this.viewerUrl.includes("?") ? "&" : "?";
      this.iframe.src = `${this.viewerUrl}${sep}t=${Date.now()}`;
    }
  }

  async onClose(): Promise<void> {
    this.iframe = null;
  }
}
