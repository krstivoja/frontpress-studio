import { useEffect, useRef } from 'react';
import Editor, { loader } from '@monaco-editor/react';
import { emmetHTML, emmetCSS } from 'emmet-monaco-es';

// Pin Monaco to a known-good version so a Microsoft release doesn't
// silently change behavior under us. The bundle stays tiny — only the
// loader script (~3 KB) ships from our origin; the editor itself loads
// from the CDN on first navigation to a screen that uses CodeEditor.
loader.config({
  paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs' },
});

// Emmet registers globally on the Monaco instance, so once-per-process
// is enough. Without this guard, each CodeEditor mount would stack a
// fresh completion provider and we'd get duplicate suggestions.
let emmetRegistered = false;
function ensureEmmet(monaco) {
  if (emmetRegistered || !monaco) return;
  emmetRegistered = true;
  // `html` covers .html and .twig (both register as Monaco 'html').
  // Passing the language list explicitly keeps us in control if Monaco
  // ever ships another HTML-flavored id we don't want Emmet on.
  emmetHTML(monaco, ['html']);
  emmetCSS(monaco, ['css', 'scss']);
}

/**
 * Thin React wrapper around `@monaco-editor/react`. Public API matches
 * the previous CodeMirror-backed component so callers don't change:
 *
 *   <CodeEditor
 *     value={...}            // string
 *     onChange={(next) => …} // fires only on real user edits
 *     language="html"        // 'html' | 'css' | 'javascript' | 'plaintext' | …
 *     filename="post.twig"   // optional — auto-derives a language if `language` is the default
 *     className="h-full"
 *     focusLine={42}         // when set, scroll + select that line and focus
 *   />
 *
 * `@monaco-editor/react` already does the right thing with external
 * value updates — it doesn't round-trip them back through `onChange` —
 * so the SYNC_FROM_PROP annotation dance we used with CodeMirror isn't
 * needed here. Switching files no longer flips the parent's dirty flag.
 */
export default function CodeEditor({
  value,
  onChange,
  onCursorChange,
  language = 'html',
  filename = null,
  className = '',
  focusLine = null,
  // Bump to re-run the reveal/focus effect even when `focusLine` is
  // unchanged — e.g. jumping to the code row for the already-selected block.
  focusTick = 0,
  // Snippet autocomplete. Caller passes a list of `{id, label, body, description?}`;
  // typing `@<id>` in the editor surfaces them in Monaco's suggestion
  // dropdown. Enter / Tab inserts `body` and replaces the `@<id>` prefix.
  snippets = null,
}) {
  const editorRef = useRef(null);
  const monacoRef = useRef(null);
  const snippetsRef = useRef(snippets);
  const providerDisposersRef = useRef([]);
  // Mirror the latest snippets prop into a ref so the completion
  // provider — registered once on mount — always reads fresh data
  // without re-registering on every prop tick.
  useEffect(() => { snippetsRef.current = snippets; }, [snippets]);
  const effectiveLanguage = filename ? languageFor(filename) || language : language;

  function handleMount(editor, monaco) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    ensureEmmet(monaco);
    if (onCursorChange) {
      editor.onDidChangeCursorPosition((e) => onCursorChange(e.position.lineNumber));
      onCursorChange(editor.getPosition()?.lineNumber || 1);
    }
    // Register the `@<id>` snippet completion provider now that Monaco
    // exists. Registering on a useEffect timed out — the effect runs
    // before handleMount, so monacoRef was null and the provider was
    // never installed.
    if (snippetsRef.current !== null) {
      providerDisposersRef.current = ['html', 'php'].map((lang) =>
        monaco.languages.registerCompletionItemProvider(lang, makeSnippetProvider(monaco, snippetsRef)),
      );
    }
  }

  useEffect(() => () => {
    providerDisposersRef.current.forEach((d) => d?.dispose?.());
    providerDisposersRef.current = [];
  }, []);

  // Reveal + select the requested line. Bridges the outline-click in the
  // Theme Builder to "jump and highlight" in the code panel.
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !focusLine) return;
    const model = editor.getModel();
    if (!model) return;
    const lineNo = Math.max(1, Math.min(focusLine, model.getLineCount()));
    const endCol = model.getLineMaxColumn(lineNo);
    editor.revealLineInCenter(lineNo);
    editor.setSelection({
      startLineNumber: lineNo,
      startColumn: 1,
      endLineNumber: lineNo,
      endColumn: endCol,
    });
    editor.focus();
  }, [focusLine, focusTick]);

  return (
    <div className={`cm-host text-[13px] ${className}`}>
      <Editor
        value={value ?? ''}
        onChange={(next) => onChange?.(next ?? '')}
        language={effectiveLanguage}
        path={filename || undefined}
        theme="vs"
        onMount={handleMount}
        loading={<div className="p-3 text-xs text-zinc-500">Loading editor…</div>}
        options={{
          automaticLayout: true,
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
          lineNumbers: 'on',
          renderLineHighlight: 'line',
          wordWrap: 'on',
          scrollBeyondLastLine: false,
          tabSize: 2,
          insertSpaces: true,
          smoothScrolling: true,
          padding: { top: 6, bottom: 6 },
        }}
      />
    </div>
  );
}

/**
 * Build a Monaco completion provider for `@<id>` snippet shortcuts.
 * Provider reads from a ref so the same registration always sees the
 * caller's latest snippet list without us re-registering on every prop.
 */
function makeSnippetProvider(monaco, snippetsRef) {
  return {
    triggerCharacters: ['@'],
    provideCompletionItems(model, position) {
      // Walk backward on this line for the most recent `@`. If there
      // isn't one within reach, the user isn't snippet-fishing.
      const line = model.getLineContent(position.lineNumber);
      const upto = line.slice(0, position.column - 1);
      const atIdx = upto.lastIndexOf('@');
      if (atIdx < 0) return { suggestions: [] };
      // Anything after the `@` must be slug-shaped — bail on `user@host`.
      const fragment = upto.slice(atIdx + 1);
      if (fragment !== '' && !/^[a-zA-Z0-9_-]*$/.test(fragment)) {
        return { suggestions: [] };
      }
      const range = {
        startLineNumber: position.lineNumber,
        startColumn:     atIdx + 1,
        endLineNumber:   position.lineNumber,
        endColumn:       position.column,
      };
      const list = snippetsRef.current || [];
      return {
        suggestions: list.map((s) => ({
          label:           '@' + s.id,
          kind:            monaco.languages.CompletionItemKind.Snippet,
          insertText:      s.body,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule?.InsertAsSnippet ?? 4,
          documentation:   s.description || s.label || '',
          detail:          s.label || '',
          range,
        })),
      };
    },
  };
}

// Map a file path / name to a Monaco language id. Returns null when we
// don't have a sensible mapping — the caller's `language` prop wins as
// a fallback.
function languageFor(filename) {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'twig':
    case 'html': return 'html';
    case 'css':
    case 'scss': return 'css';
    case 'js':
    case 'mjs': return 'javascript';
    case 'ts':  return 'typescript';
    case 'json': return 'json';
    case 'md':  return 'markdown';
    case 'php': return 'php';
    case 'yml':
    case 'yaml': return 'yaml';
    default: return null;
  }
}
