// Shared types for the LaTeX Live plugin.

export type ErrorLevel = "error" | "warning";

export interface LatexError {
  line: number;       // 0-indexed, for CodeMirror
  file: string;       // absolute path of the file the error belongs to
  message: string;
  type: ErrorLevel;
}

export interface CompileResult {
  success: boolean;
  pdfPath: string | null;
  synctexPath: string | null;
  errors: LatexError[];
  warnings: LatexError[];
  rawLog: string;
  durationMs: number;
}

export interface PluginSettings {
  // Compile
  latexmkPath: string;          // default "latexmk"
  luaLatexPath: string;         // default "lualatex" (passed to latexmk)
  synctexPath: string;          // default "synctex"
  extraLatexmkArgs: string;     // free-form extra args
  autoCompile: boolean;
  debounceDelay: number;        // ms after last keystroke before triggering compile

  // UI
  showInlineErrors: boolean;
  showErrorPanel: boolean;
  showWarnings: boolean;
  notifyFirstError: boolean;    // popup only on first error after clean state
  autoFollowCursor: boolean;    // editor cursor → highlight in PDF (off by default)

  // Server
  serverHost: string;           // default "127.0.0.1"
  preferredPort: number;        // 0 = auto-pick
}

export const DEFAULT_SETTINGS: PluginSettings = {
  latexmkPath: "latexmk",
  luaLatexPath: "lualatex",
  synctexPath: "synctex",
  extraLatexmkArgs: "",
  autoCompile: true,
  debounceDelay: 800,

  showInlineErrors: true,
  showErrorPanel: true,
  showWarnings: false,
  notifyFirstError: true,
  autoFollowCursor: false,

  serverHost: "127.0.0.1",
  preferredPort: 0,
};
