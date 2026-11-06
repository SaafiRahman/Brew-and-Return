import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';
import { python, pythonLanguage } from '@codemirror/lang-python';
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
  '.cm-tooltip-autocomplete ul li': { padding: '2px 8px !important' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--wood)', color: 'var(--parchment)' },
  '.cm-completionDetail': { color: 'var(--ink-faint)', fontStyle: 'normal', marginLeft: '10px' },
  '.cm-tooltip-autocomplete ul li[aria-selected] .cm-completionDetail': { color: 'var(--parchment-deep)' },
  '.cm-completionInfo': { backgroundColor: 'var(--paper)', border: '1px solid var(--line)', padding: '4px 8px', maxWidth: '260px' },
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

/** What the spell can use right now, for autocomplete. */
export interface SpellVocabulary {
  /** Potions the player has learned, e.g. [{ id: 'health', price: 3 }]. */
  potions: { id: string; price: number }[];
}

const COMMANDS: Completion[] = [
  { label: 'brew', type: 'function', detail: '(potion)', info: 'Walk to the cauldron and brew a potion, like brew(Potion.health).' },
  { label: 'serve', type: 'function', detail: '()', info: "Walk to the counter and hand over every potion you're holding." },
  { label: 'order', type: 'function', detail: '()', info: 'Find out what the customer at the counter wants.' },
  { label: 'Potion', type: 'class', info: 'Every potion you know. Type a dot after it to see them.' },
  { label: 'print', type: 'function', detail: '(…)', info: 'Your apprentice says something out loud.' },
];

/** Suggest the game's commands, and learned potions after `Potion.` */
function spellCompletions(vocab: () => SpellVocabulary) {
  return (ctx: CompletionContext): CompletionResult | null => {
    const dotted = ctx.matchBefore(/\bPotion\.\w*/);
    if (dotted) {
      return {
        from: dotted.from + 'Potion.'.length,
        options: vocab().potions.map((p) => ({ label: p.id, type: 'constant', detail: `sells for ${p.price} 🪙` })),
        validFor: /^\w*$/,
      };
    }
    const word = ctx.matchBefore(/\w+/);
    if (!word || (word.from === word.to && !ctx.explicit)) return null;
    // Not after a dot (that's some other object's attribute).
    if (word.from > 0 && ctx.state.sliceDoc(word.from - 1, word.from) === '.') return null;
    return { from: word.from, options: COMMANDS, validFor: /^\w*$/ };
  };
}

interface Props {
  initial: string;
  vocabulary(): SpellVocabulary;
  activeLine: number | null;
  onChange(code: string): void;
  /** Ctrl/Cmd+Enter. */
  onRun(): void;
}

export function CodeEditor({ initial, activeLine, vocabulary, onChange, onRun }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const handlers = useRef({ onChange, onRun, vocabulary });
  handlers.current = { onChange, onRun, vocabulary };

  useEffect(() => {
    const v = new EditorView({
      doc: initial,
      parent: host.current!,
      extensions: [
        basicSetup,
        python(),
        pythonLanguage.data.of({ autocomplete: spellCompletions(() => handlers.current.vocabulary()) }),
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
