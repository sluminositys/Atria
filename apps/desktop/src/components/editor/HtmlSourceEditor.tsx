import { useEffect, useRef } from "react";
import { autocompletion, closeBrackets, closeBracketsKeymap, completionKeymap } from "@codemirror/autocomplete";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { html } from "@codemirror/lang-html";
import {
  bracketMatching,
  defaultHighlightStyle,
  foldGutter,
  foldKeymap,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { highlightSelectionMatches, searchKeymap } from "@codemirror/search";
import { EditorState } from "@codemirror/state";
import {
  crosshairCursor,
  drawSelection,
  dropCursor,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
  rectangularSelection,
} from "@codemirror/view";

interface HtmlSourceEditorProps {
  value: string;
  ariaLabel: string;
  autoFocus?: boolean;
  language?: "html" | "text";
  readOnly?: boolean;
  onChange(value: string): void;
  onSave?(): void;
}

const atriaTheme = EditorView.theme({
  "&": {
    height: "100%",
    minHeight: "0",
    color: "#20242a",
    backgroundColor: "#ffffff",
    fontSize: "13px",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
    lineHeight: "1.62",
  },
  ".cm-content": { padding: "14px 0 80px" },
  ".cm-line": { padding: "0 18px 0 8px" },
  ".cm-gutters": {
    color: "#98a2b3",
    backgroundColor: "#fafafa",
    borderRight: "1px solid #ececea",
  },
  ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "#f5f7fa" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground": { backgroundColor: "#dbeafe" },
  "&.cm-focused": { outline: "none" },
});

export function HtmlSourceEditor({
  value,
  ariaLabel,
  autoFocus = false,
  language = "html",
  readOnly = false,
  onChange,
  onSave,
}: HtmlSourceEditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSaveRef.current = onSave;
  }, [onChange, onSave]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const saveKeymap = {
      key: "Mod-s",
      preventDefault: true,
      run: () => {
        onSaveRef.current?.();
        return true;
      },
    };
    const state = EditorState.create({
      doc: value,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        bracketMatching(),
        closeBrackets(),
        autocompletion(),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        highlightSelectionMatches(),
        language === "html" ? html({ autoCloseTags: true, matchClosingTags: true }) : [],
        atriaTheme,
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
        EditorView.contentAttributes.of({ "aria-label": ariaLabel, spellcheck: "false" }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString());
        }),
        keymap.of([
          saveKeymap,
          indentWithTab,
          ...closeBracketsKeymap,
          ...defaultKeymap,
          ...searchKeymap,
          ...historyKeymap,
          ...foldKeymap,
          ...completionKeymap,
        ]),
      ],
    });
    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    if (autoFocus) window.requestAnimationFrame(() => view.focus());
    return () => {
      viewRef.current = null;
      view.destroy();
    };
  }, [ariaLabel, autoFocus, language, readOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return <div ref={hostRef} />;
}
