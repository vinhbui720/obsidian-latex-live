// LaTeX completion suggestions.
//
// Triggers when the user types `\` in a .tex file and pops up an Obsidian
// EditorSuggest popup with common LaTeX commands and environments.
//
// Two kinds of completions:
//   1. Plain commands  →  inserts `\foo` (cursor placed after).
//   2. Snippets        →  inserts a multi-line template with the cursor
//                          parked at the first $1 placeholder.
//                          (Obsidian doesn't have native tab stops, so we
//                           just put the cursor at the first slot.)

import {
  Editor,
  EditorPosition,
  EditorSuggest,
  EditorSuggestContext,
  EditorSuggestTriggerInfo,
  TFile,
} from "obsidian";

export interface LatexCompletion {
  /** Token shown in the popup and used for matching, without leading `\`. */
  label: string;
  /** Short description displayed below the label. */
  description?: string;
  /** Final inserted text. The literal substring `$|` marks where to place
   *  the cursor after insertion. Leading `\` is added automatically if
   *  insertText doesn't already contain one. */
  insertText: string;
  /** Sort weight; higher means more important. */
  weight?: number;
  category: "command" | "environment" | "math" | "structure";
}

const SNIPPETS: LatexCompletion[] = [
  // Document structure
  { label: "documentclass", category: "structure", weight: 90,
    insertText: "\\documentclass[$|]{article}", description: "Document class" },
  { label: "usepackage", category: "structure", weight: 90,
    insertText: "\\usepackage{$|}", description: "Import a package" },
  { label: "begin{document}", category: "environment", weight: 85,
    insertText: "\\begin{document}\n$|\n\\end{document}", description: "Document body" },
  { label: "title", category: "structure", weight: 70,
    insertText: "\\title{$|}", description: "Document title" },
  { label: "author", category: "structure", weight: 70,
    insertText: "\\author{$|}", description: "Document author" },
  { label: "maketitle", category: "structure", weight: 65,
    insertText: "\\maketitle", description: "Render the title block" },
  { label: "tableofcontents", category: "structure", weight: 50,
    insertText: "\\tableofcontents", description: "Render the TOC" },

  // Sections
  { label: "section", category: "structure", weight: 88,
    insertText: "\\section{$|}", description: "Section heading" },
  { label: "subsection", category: "structure", weight: 80,
    insertText: "\\subsection{$|}", description: "Subsection heading" },
  { label: "subsubsection", category: "structure", weight: 70,
    insertText: "\\subsubsection{$|}", description: "Sub-subsection heading" },
  { label: "paragraph", category: "structure", weight: 50,
    insertText: "\\paragraph{$|}", description: "Paragraph heading" },

  // Common environments
  { label: "begin{equation}", category: "environment", weight: 85,
    insertText: "\\begin{equation}\n    $|\n\\end{equation}", description: "Numbered equation" },
  { label: "begin{equation*}", category: "environment", weight: 80,
    insertText: "\\begin{equation*}\n    $|\n\\end{equation*}", description: "Unnumbered equation" },
  { label: "begin{align}", category: "environment", weight: 85,
    insertText: "\\begin{align}\n    $|\n\\end{align}", description: "Aligned equations" },
  { label: "begin{align*}", category: "environment", weight: 80,
    insertText: "\\begin{align*}\n    $|\n\\end{align*}", description: "Aligned, unnumbered" },
  { label: "begin{itemize}", category: "environment", weight: 85,
    insertText: "\\begin{itemize}\n    \\item $|\n\\end{itemize}", description: "Bulleted list" },
  { label: "begin{enumerate}", category: "environment", weight: 82,
    insertText: "\\begin{enumerate}\n    \\item $|\n\\end{enumerate}", description: "Numbered list" },
  { label: "begin{description}", category: "environment", weight: 60,
    insertText: "\\begin{description}\n    \\item[$|] \n\\end{description}", description: "Description list" },
  { label: "begin{figure}", category: "environment", weight: 80,
    insertText: "\\begin{figure}[htbp]\n    \\centering\n    \\includegraphics[width=0.8\\linewidth]{$|}\n    \\caption{}\n    \\label{fig:}\n\\end{figure}",
    description: "Figure with image" },
  { label: "begin{table}", category: "environment", weight: 78,
    insertText: "\\begin{table}[htbp]\n    \\centering\n    \\begin{tabular}{ll}\n        $|\n    \\end{tabular}\n    \\caption{}\n    \\label{tab:}\n\\end{table}",
    description: "Table with caption" },
  { label: "begin{tabular}", category: "environment", weight: 75,
    insertText: "\\begin{tabular}{ll}\n    $|\n\\end{tabular}", description: "Tabular content" },
  { label: "begin{matrix}", category: "math", weight: 60,
    insertText: "\\begin{matrix}\n    $|\n\\end{matrix}", description: "Matrix (no delimiters)" },
  { label: "begin{pmatrix}", category: "math", weight: 65,
    insertText: "\\begin{pmatrix}\n    $|\n\\end{pmatrix}", description: "Matrix with ( )" },
  { label: "begin{bmatrix}", category: "math", weight: 65,
    insertText: "\\begin{bmatrix}\n    $|\n\\end{bmatrix}", description: "Matrix with [ ]" },
  { label: "begin{cases}", category: "math", weight: 60,
    insertText: "\\begin{cases}\n    $| & \\text{if } \\\\\n     & \\text{otherwise}\n\\end{cases}", description: "Piecewise function" },
  { label: "begin{proof}", category: "environment", weight: 50,
    insertText: "\\begin{proof}\n    $|\n\\end{proof}", description: "Proof environment (amsthm)" },

  // References & citations
  { label: "label", category: "command", weight: 80,
    insertText: "\\label{$|}", description: "Anchor for cross-references" },
  { label: "ref", category: "command", weight: 80,
    insertText: "\\ref{$|}", description: "Cross-reference" },
  { label: "eqref", category: "command", weight: 75,
    insertText: "\\eqref{$|}", description: "Equation reference (amsmath)" },
  { label: "cite", category: "command", weight: 75,
    insertText: "\\cite{$|}", description: "Citation" },
  { label: "footnote", category: "command", weight: 50,
    insertText: "\\footnote{$|}", description: "Footnote" },

  // Text formatting
  { label: "textbf", category: "command", weight: 80,
    insertText: "\\textbf{$|}", description: "Bold text" },
  { label: "textit", category: "command", weight: 80,
    insertText: "\\textit{$|}", description: "Italic text" },
  { label: "emph", category: "command", weight: 75,
    insertText: "\\emph{$|}", description: "Emphasis" },
  { label: "underline", category: "command", weight: 50,
    insertText: "\\underline{$|}", description: "Underlined" },
  { label: "texttt", category: "command", weight: 50,
    insertText: "\\texttt{$|}", description: "Monospace text" },
  { label: "textsc", category: "command", weight: 40,
    insertText: "\\textsc{$|}", description: "Small caps" },

  // Math symbols (frequent)
  { label: "frac", category: "math", weight: 90,
    insertText: "\\frac{$|}{}", description: "Fraction" },
  { label: "sqrt", category: "math", weight: 80,
    insertText: "\\sqrt{$|}", description: "Square root" },
  { label: "sum", category: "math", weight: 80,
    insertText: "\\sum_{$|}^{}", description: "Summation" },
  { label: "prod", category: "math", weight: 70,
    insertText: "\\prod_{$|}^{}", description: "Product" },
  { label: "int", category: "math", weight: 80,
    insertText: "\\int_{$|}^{}", description: "Integral" },
  { label: "lim", category: "math", weight: 70,
    insertText: "\\lim_{$|}", description: "Limit" },
  { label: "infty", category: "math", weight: 70, insertText: "\\infty", description: "∞" },
  { label: "alpha", category: "math", weight: 75, insertText: "\\alpha", description: "α" },
  { label: "beta", category: "math", weight: 75, insertText: "\\beta", description: "β" },
  { label: "gamma", category: "math", weight: 75, insertText: "\\gamma", description: "γ" },
  { label: "delta", category: "math", weight: 75, insertText: "\\delta", description: "δ" },
  { label: "epsilon", category: "math", weight: 70, insertText: "\\epsilon", description: "ϵ" },
  { label: "varepsilon", category: "math", weight: 60, insertText: "\\varepsilon", description: "ε" },
  { label: "theta", category: "math", weight: 70, insertText: "\\theta", description: "θ" },
  { label: "lambda", category: "math", weight: 70, insertText: "\\lambda", description: "λ" },
  { label: "mu", category: "math", weight: 70, insertText: "\\mu", description: "μ" },
  { label: "pi", category: "math", weight: 75, insertText: "\\pi", description: "π" },
  { label: "rho", category: "math", weight: 60, insertText: "\\rho", description: "ρ" },
  { label: "sigma", category: "math", weight: 70, insertText: "\\sigma", description: "σ" },
  { label: "phi", category: "math", weight: 70, insertText: "\\phi", description: "ϕ" },
  { label: "varphi", category: "math", weight: 60, insertText: "\\varphi", description: "φ" },
  { label: "omega", category: "math", weight: 70, insertText: "\\omega", description: "ω" },
  { label: "Omega", category: "math", weight: 60, insertText: "\\Omega", description: "Ω" },
  { label: "Sigma", category: "math", weight: 60, insertText: "\\Sigma", description: "Σ" },
  { label: "Delta", category: "math", weight: 65, insertText: "\\Delta", description: "Δ" },
  { label: "nabla", category: "math", weight: 65, insertText: "\\nabla", description: "∇" },
  { label: "partial", category: "math", weight: 70, insertText: "\\partial", description: "∂" },
  { label: "cdot", category: "math", weight: 70, insertText: "\\cdot", description: "·" },
  { label: "times", category: "math", weight: 70, insertText: "\\times", description: "×" },
  { label: "leq", category: "math", weight: 65, insertText: "\\leq", description: "≤" },
  { label: "geq", category: "math", weight: 65, insertText: "\\geq", description: "≥" },
  { label: "neq", category: "math", weight: 65, insertText: "\\neq", description: "≠" },
  { label: "approx", category: "math", weight: 60, insertText: "\\approx", description: "≈" },
  { label: "equiv", category: "math", weight: 50, insertText: "\\equiv", description: "≡" },
  { label: "rightarrow", category: "math", weight: 60, insertText: "\\rightarrow", description: "→" },
  { label: "leftarrow", category: "math", weight: 50, insertText: "\\leftarrow", description: "←" },
  { label: "Rightarrow", category: "math", weight: 60, insertText: "\\Rightarrow", description: "⇒" },
  { label: "in", category: "math", weight: 65, insertText: "\\in", description: "∈" },
  { label: "subset", category: "math", weight: 50, insertText: "\\subset", description: "⊂" },
  { label: "cup", category: "math", weight: 45, insertText: "\\cup", description: "∪" },
  { label: "cap", category: "math", weight: 45, insertText: "\\cap", description: "∩" },
  { label: "mathbb", category: "math", weight: 70, insertText: "\\mathbb{$|}", description: "Blackboard bold (\\mathbb{R} etc.)" },
  { label: "mathcal", category: "math", weight: 60, insertText: "\\mathcal{$|}", description: "Calligraphic letters" },
  { label: "mathbf", category: "math", weight: 65, insertText: "\\mathbf{$|}", description: "Bold math" },
  { label: "vec", category: "math", weight: 65, insertText: "\\vec{$|}", description: "Vector arrow" },
  { label: "hat", category: "math", weight: 60, insertText: "\\hat{$|}", description: "Hat accent" },
  { label: "bar", category: "math", weight: 55, insertText: "\\bar{$|}", description: "Bar accent" },
  { label: "tilde", category: "math", weight: 55, insertText: "\\tilde{$|}", description: "Tilde accent" },
  { label: "dot", category: "math", weight: 55, insertText: "\\dot{$|}", description: "Dot accent" },

  // Misc
  { label: "includegraphics", category: "command", weight: 75,
    insertText: "\\includegraphics[width=0.8\\linewidth]{$|}", description: "Include an image" },
  { label: "newcommand", category: "command", weight: 50,
    insertText: "\\newcommand{\\$|}{}", description: "Define a macro" },
  { label: "newenvironment", category: "command", weight: 40,
    insertText: "\\newenvironment{$|}{}{}", description: "Define an environment" },
  { label: "input", category: "command", weight: 60,
    insertText: "\\input{$|}", description: "Include another .tex file" },
  { label: "include", category: "command", weight: 55,
    insertText: "\\include{$|}", description: "Include with pagebreak" },
  { label: "today", category: "command", weight: 50,
    insertText: "\\today", description: "Today's date" },
  { label: "noindent", category: "command", weight: 40,
    insertText: "\\noindent", description: "Suppress paragraph indent" },
  { label: "newpage", category: "command", weight: 40,
    insertText: "\\newpage", description: "Force a page break" },
  { label: "hline", category: "command", weight: 40,
    insertText: "\\hline", description: "Horizontal line in tabular" },
  { label: "item", category: "command", weight: 65,
    insertText: "\\item $|", description: "List item" },
];

export class LatexCompletionProvider extends EditorSuggest<LatexCompletion> {
  private items: LatexCompletion[];

  constructor(app: any) {
    super(app);
    this.items = SNIPPETS;
  }

  /**
   * Trigger when the cursor sits at the end of a `\command` token.
   * Looks back from the cursor for `\\` followed by [a-zA-Z]*.
   */
  onTrigger(
    cursor: EditorPosition,
    editor: Editor,
    file: TFile | null,
  ): EditorSuggestTriggerInfo | null {
    if (!file || file.extension !== "tex") return null;

    const line = editor.getLine(cursor.line);
    const left = line.slice(0, cursor.ch);
    // Match \cmd (no spaces); also match \begin{partial} for env completion.
    const m = /\\([a-zA-Z]*(?:\{[a-zA-Z]*)?)$/.exec(left);
    if (!m) return null;
    const start = cursor.ch - m[0].length;
    return {
      start: { line: cursor.line, ch: start },
      end: cursor,
      query: m[1], // without leading backslash
    };
  }

  getSuggestions(ctx: EditorSuggestContext): LatexCompletion[] {
    const q = ctx.query.toLowerCase();
    if (q.length === 0) {
      return [...this.items].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0)).slice(0, 30);
    }
    return this.items
      .map((item) => ({ item, score: scoreMatch(item.label.toLowerCase(), q) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || (b.item.weight ?? 0) - (a.item.weight ?? 0))
      .slice(0, 40)
      .map((x) => x.item);
  }

  renderSuggestion(item: LatexCompletion, el: HTMLElement): void {
    el.addClass("latex-suggest");
    const row = el.createDiv({ cls: "latex-suggest-row" });
    row.createSpan({ text: "\\" + item.label, cls: "latex-suggest-label" });
    row.createSpan({ text: item.category, cls: `latex-suggest-cat latex-suggest-cat-${item.category}` });
    if (item.description) {
      el.createDiv({ text: item.description, cls: "latex-suggest-desc" });
    }
  }

  selectSuggestion(item: LatexCompletion, _ev: MouseEvent | KeyboardEvent): void {
    if (!this.context) return;
    const editor = this.context.editor;
    const { start, end } = this.context;

    // Replace the typed `\foo` with the snippet. We use `$|` as the cursor
    // marker; if absent, place the cursor at the end of the insertion.
    const tpl = item.insertText.startsWith("\\")
      ? item.insertText
      : "\\" + item.insertText;
    const cursorMarker = "$|";
    const idx = tpl.indexOf(cursorMarker);
    const rendered = idx >= 0 ? tpl.replace(cursorMarker, "") : tpl;

    editor.replaceRange(rendered, start, end);

    // Position the cursor.
    let cursor: EditorPosition;
    if (idx >= 0) {
      const before = tpl.slice(0, idx);
      const lines = before.split("\n");
      cursor = lines.length === 1
        ? { line: start.line, ch: start.ch + lines[0].length }
        : { line: start.line + lines.length - 1, ch: lines[lines.length - 1].length };
    } else {
      const lines = rendered.split("\n");
      cursor = lines.length === 1
        ? { line: start.line, ch: start.ch + rendered.length }
        : { line: start.line + lines.length - 1, ch: lines[lines.length - 1].length };
    }
    editor.setCursor(cursor);
  }
}

/**
 * Simple fuzzy-ish scoring:
 *   +5 for prefix match
 *   +3 for substring match
 *   +0.5 per character of query found in order (subsequence match)
 */
function scoreMatch(label: string, query: string): number {
  if (label === query) return 100;
  if (label.startsWith(query)) return 50 + (label.length === query.length ? 10 : 0);
  if (label.includes(query)) return 30;
  let li = 0;
  let qi = 0;
  let score = 0;
  while (li < label.length && qi < query.length) {
    if (label[li] === query[qi]) {
      score += 0.5;
      qi++;
    }
    li++;
  }
  return qi === query.length ? score : 0;
}
