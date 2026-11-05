import { python } from '@codemirror/lang-python';
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { indentWithTab } from '@codemirror/commands';
import { Decoration, EditorView, keymap, type DecorationSet } from '@codemirror/view';
import { Prec, StateEffect, StateField } from '@codemirror/state';
import { tags as t } from '@lezer/highlight';
import { basicSetup } from 'codemirror';
import { useEffect, useRef } from 'preact/hooks';

const cozyHighlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.definitionKeyword, t.operatorKeyword], color: 'var(--syn-keyword)', fontWeight: '600' },
  { tag: [t.string, t.special(t.string)], color: 'var(--syn-string)' },
  { tag: t.comment, color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: [t.number, t.bool, t.null], color: 'var(--syn-number)' },
  { tag: t.function(t.definition(t.variableName)), color: 'var(--syn-function)', fontWeight: '600' },
  { tag: t.function(t.variableName), color: 'var(--syn-function)' },
  { tag: t.propertyName, color: 'var(--syn-property)' },
  { tag: [t.operator, t.punctuation, t.bracket], color: 'var(--ink-soft)' },
]);

const cozyTheme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'var(--editor-bg)', color: 'var(--ink)', fontSize: '15px' },
  '.cm-scroller': { fontFamily: 'var(--font-code)', lineHeight: '1.6' },
  '.cm-content': { caretColor: 'var(--wood-dark)', padding: '12px 0' },
  '.cm-gutters': { backgroundColor: 'var(--editor-gutter)', color: 'var(--ink-faint)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'var(--editor-active)' },
  '.cm-activeLineGutter': { backgroundColor: 'var(--editor-active)', color: 'var(--ink-soft)' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--editor-selection) !important' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor': { borderLeftColor: 'var(--wood-dark)', borderLeftWidth: '2px' },
  '.cm-tooltip': { backgroundColor: 'var(--parchment)', border: '1px solid var(--line)' },
  '.cm-running-line': { backgroundColor: 'var(--running-line)', boxShadow: 'inset 3px 0 0 var(--gold)' },
});

/** Highlights the line the apprentice is carrying out. */
const setRunningLine = StateEffect.define<number | null>();
const runningLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes);
    for (const e of tr.effects) {
      if (!e.is(setRunningLine)) continue;
      const n = e.value;
      if (n === null || n < 1 || n > tr.state.doc.lines) return Decoration.none;
      const line = tr.state.doc.line(n);
      return Decoration.set([Decoration.line({ class: 'cm-running-line' }).range(line.from)]);
    }
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

interface Props {
  initial: string;
  activeLine: number | null;
  onChange(code: string): void;
  /** Ctrl/Cmd+Enter. */
  onRun(): void;
}

export function CodeEditor({ initial, activeLine, onChange, onRun }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onChange, onRun });
  handlers.current = { onChange, onRun };

  useEffect(() => {
    const v = new EditorView({
      doc: initial,
      parent: host.current!,
      extensions: [
        basicSetup,
        python(),
        indentUnit.of('    '),
        keymap.of([indentWithTab]),
        Prec.highest(keymap.of([{ key: 'Mod-Enter', run: () => (handlers.current.onRun(), true) }])),
        syntaxHighlighting(cozyHighlight),
        cozyTheme,
        runningLine,
        EditorView.contentAttributes.of({ 'aria-label': 'Your spell (Python code)' }),
        EditorView.updateListener.of((u) => u.docChanged && handlers.current.onChange(u.state.doc.toString())),
      ],
    });
    view.current = v;
    return () => v.destroy();
    // The editor owns its text after mount; remount (via key) to replace it.
  }, []);

  useEffect(() => {
    view.current?.dispatch({ effects: setRunningLine.of(activeLine) });
  }, [activeLine]);

  return <div class="code-editor" ref={host} />;
}
