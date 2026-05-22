// Inline errors: CodeMirror 6 decoration that underlines lines with compile
// errors and shows the message at the end of the line.

import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { StateEffect, StateField, RangeSetBuilder } from "@codemirror/state";
import { LatexError } from "./types";

export const setErrorsEffect = StateEffect.define<LatexError[]>();

export const errorsField = StateField.define<LatexError[]>({
  create: () => [],
  update(errors, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setErrorsEffect)) return effect.value;
    }
    return errors;
  },
});

class ErrorWidget extends WidgetType {
  constructor(private message: string, private type: "error" | "warning") {
    super();
  }
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = `latex-inline-${this.type}`;
    span.textContent = `  ⟵ ${this.message}`;
    return span;
  }
  eq(other: ErrorWidget): boolean {
    return other.message === this.message && other.type === this.type;
  }
}

export function createErrorPlugin(getCurrentFile: () => string | null) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = this.build(view);
      }
      update(u: ViewUpdate) {
        const errorsChanged =
          u.state.field(errorsField, false) !==
          u.startState.field(errorsField, false);
        if (u.docChanged || u.viewportChanged || errorsChanged) {
          this.decorations = this.build(u.view);
        }
      }
      build(view: EditorView): DecorationSet {
        const builder = new RangeSetBuilder<Decoration>();
        const errors = view.state.field(errorsField, false) ?? [];
        const currentFile = getCurrentFile();

        // Sort by line ascending, required by RangeSetBuilder.
        const sorted = [...errors].sort((a, b) => a.line - b.line);

        for (const err of sorted) {
          if (
            err.file &&
            currentFile &&
            !err.file.endsWith(currentFile) &&
            !currentFile.endsWith(err.file)
          ) {
            continue;
          }
          const lineNum = Math.min(err.line + 1, view.state.doc.lines);
          const line = view.state.doc.line(lineNum);
          builder.add(
            line.from,
            line.to,
            Decoration.mark({
              class: `latex-error-underline latex-error-underline-${err.type}`,
            }),
          );
          builder.add(
            line.to,
            line.to,
            Decoration.widget({
              widget: new ErrorWidget(err.message, err.type),
              side: 1,
            }),
          );
        }
        return builder.finish();
      }
    },
    { decorations: (v) => v.decorations },
  );
}
