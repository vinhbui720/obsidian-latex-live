import { App, PluginSettingTab, Setting } from "obsidian";
import type LatexLivePlugin from "./main";

export class LatexSettingTab extends PluginSettingTab {
  constructor(app: App, private plugin: LatexLivePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "LaTeX Live" });

    containerEl.createEl("h3", { text: "Compile" });

    new Setting(containerEl)
      .setName("Auto compile")
      .setDesc("Recompile automatically. See trigger setting below for when.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoCompile).onChange(async (v) => {
          this.plugin.settings.autoCompile = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Compile trigger")
      .setDesc(
        "On save: only recompile when the file is written to disk " +
          "(Ctrl+S / Obsidian autosave). Quiet, recommended. " +
          "On change: recompile after every keystroke (debounced).",
      )
      .addDropdown((d) =>
        d
          .addOption("on-save", "On save (Ctrl+S / autosave)")
          .addOption("on-change", "On change (every keystroke)")
          .setValue(this.plugin.settings.compileTrigger)
          .onChange(async (v) => {
            this.plugin.settings.compileTrigger =
              v === "on-change" ? "on-change" : "on-save";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Debounce delay (ms)")
      .setDesc("Only used in 'on change' mode: wait this long after the last keystroke before compiling.")
      .addSlider((s) =>
        s
          .setLimits(200, 3000, 50)
          .setValue(this.plugin.settings.debounceDelay)
          .setDynamicTooltip()
          .onChange(async (v) => {
            this.plugin.settings.debounceDelay = v;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("latexmk path")
      .setDesc("Command or absolute path to latexmk.")
      .addText((t) =>
        t
          .setPlaceholder("latexmk")
          .setValue(this.plugin.settings.latexmkPath)
          .onChange(async (v) => {
            this.plugin.settings.latexmkPath = v || "latexmk";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("synctex path")
      .setDesc("Command or absolute path to synctex.")
      .addText((t) =>
        t
          .setPlaceholder("synctex")
          .setValue(this.plugin.settings.synctexPath)
          .onChange(async (v) => {
            this.plugin.settings.synctexPath = v || "synctex";
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Extra latexmk args")
      .setDesc("e.g. -shell-escape -bibtex")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.extraLatexmkArgs)
          .onChange(async (v) => {
            this.plugin.settings.extraLatexmkArgs = v;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl("h3", { text: "Diagnostics" });

    new Setting(containerEl)
      .setName("Inline errors")
      .setDesc("Underline lines with errors directly in the editor.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showInlineErrors).onChange(async (v) => {
          this.plugin.settings.showInlineErrors = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Error panel")
      .setDesc("Sidebar list of errors and warnings.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showErrorPanel).onChange(async (v) => {
          this.plugin.settings.showErrorPanel = v;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Show warnings")
      .setDesc("Include LaTeX warnings in the error panel and inline display.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.showWarnings).onChange(async (v) => {
          this.plugin.settings.showWarnings = v;
          await this.plugin.saveSettings();
          this.plugin.refreshDiagnostics();
        }),
      );

    new Setting(containerEl)
      .setName("Notify on first error")
      .setDesc("Show a popup the first time a clean compile starts failing.")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.notifyFirstError).onChange(async (v) => {
          this.plugin.settings.notifyFirstError = v;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("h3", { text: "PDF sync" });

    new Setting(containerEl)
      .setName("Auto-follow cursor")
      .setDesc(
        "As you move the cursor in the editor, auto-scroll/highlight the PDF " +
          "to the matching position. Default OFF; use the manual hotkey instead.",
      )
      .addToggle((t) =>
        t.setValue(this.plugin.settings.autoFollowCursor).onChange(async (v) => {
          this.plugin.settings.autoFollowCursor = v;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl("h3", { text: "Server" });

    new Setting(containerEl)
      .setName("Preferred port")
      .setDesc("0 = auto-pick a free port. Restart Obsidian after changing.")
      .addText((t) =>
        t
          .setValue(String(this.plugin.settings.preferredPort))
          .onChange(async (v) => {
            const n = parseInt(v, 10);
            this.plugin.settings.preferredPort = Number.isFinite(n) ? n : 0;
            await this.plugin.saveSettings();
          }),
      );
  }
}
