import { python } from '@codemirror/lang-python';
import { HighlightStyle, indentUnit, syntaxHighlighting } from '@codemirror/language';
import { indentWithTab } from '@codemirror/commands';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
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
});

interface Props {
  initial: string;
  onChange(code: string): void;
  /** Ctrl/Cmd+Enter. */
  onRun(): void;
}

export function CodeEditor({ initial, onChange, onRun }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const handlers = useRef({ onChange, onRun });
  handlers.current = { onChange, onRun };

  useEffect(() => {
    const view = new EditorView({
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
        EditorView.contentAttributes.of({ 'aria-label': 'Your spell (Python code)' }),
        EditorView.updateListener.of((u) => u.docChanged && handlers.current.onChange(u.state.doc.toString())),
      ],
    });
    return () => view.destroy();
    // The editor owns its text after mount; remount (via key) to replace it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div class="code-editor" ref={host} />;
}
