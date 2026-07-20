import { useEffect, useRef } from 'react';
import Editor from '@toast-ui/editor';
import '@toast-ui/editor/dist/toastui-editor.css';
import { getCsrf, ADMIN_BASE } from './api.js';

/**
 * Mount and own a Toast UI Editor instance for the page editor.
 *
 * Returns `{ edRef, editorElRef }` — the parent renders `<div ref={editorElRef} />`
 * to give Toast UI a host element, and reads `edRef.current` when it needs
 * to call commands (`getMarkdown`, `setHTML`, `exec('addImage', …)`, …).
 *
 * The editor is initialised exactly once per mount and **never** re-created
 * mid-life. Refetches after save must not tear the editor down (cursor focus
 * would jump to the top), and renames must not tear it down either (the
 * latest body lives in the editor's internal state, not in `initialBody`).
 *
 * `pagePath` flows through a ref so per-post image uploads always carry the
 * current path without forcing a re-init.
 */
export function useToastUiEditor({
  isNew,
  bodyReady,
  initialBody,
  pagePath,
  onDirty,
  onOpenMediaPicker,
}) {
  const editorElRef = useRef(null);
  const edRef = useRef(null);
  const initializedRef = useRef(false);

  // Hot refs — values that the editor's hooks need to read at *call time*,
  // not at *init time*. Updating a ref doesn't re-run effects, so we get
  // fresh values without recreating the editor.
  const pagePathRef = useRef(pagePath);
  const onOpenMediaPickerRef = useRef(onOpenMediaPicker);
  const onDirtyRef = useRef(onDirty);
  pagePathRef.current = pagePath;
  onOpenMediaPickerRef.current = onOpenMediaPicker;
  onDirtyRef.current = onDirty;

  useEffect(() => {
    if (!editorElRef.current) return undefined;
    if (initializedRef.current) return undefined;
    if (!bodyReady) return undefined;

    // Replace Toast UI's built-in image popup with a custom toolbar button
    // that opens the React MediaPicker. Mounted into a raw <button> so
    // Toast UI's toolbar styles still apply.
    const imageButton = document.createElement('button');
    imageButton.className = 'toastui-editor-toolbar-icons image';
    imageButton.style.margin = '0';
    imageButton.setAttribute('aria-label', 'Insert image');
    imageButton.setAttribute('type', 'button');
    imageButton.addEventListener('click', () => onOpenMediaPickerRef.current());

    // If the saved body contains tags that Toast UI's ProseMirror schema
    // can't represent (iframe, script, video, audio, object, embed), open
    // the editor in markdown mode so the source survives. Opening in
    // WYSIWYG would parse the markdown, drop those tags from the editor
    // state, and silently destroy them on the very next save.
    const initialEditType =
      !isNew && /<(iframe|script|video|audio|object|embed)\b/i.test(initialBody || '')
        ? 'markdown'
        : 'wysiwyg';

    const ed = new Editor({
      el: editorElRef.current,
      // `100%` lets the editor fill its flex parent (the wrapper sets a
      // bounded height with `flex-1 min-h-0`). Hard-coded 600px would leave
      // the bottom of the page empty on tall viewports.
      height: '100%',
      initialEditType,
      previewStyle: 'vertical',
      usageStatistics: false,
      hideModeSwitch: true,
      initialValue: !isNew ? initialBody : '',
      toolbarItems: [
        ['heading', 'bold', 'italic', 'strike'],
        ['hr', 'quote'],
        ['ul', 'ol', 'task', 'indent', 'outdent'],
        ['table', 'link',
          { name: 'image', tooltip: 'Insert image', el: imageButton },
        ],
        ['code', 'codeblock'],
        ['scrollSync'],
      ],
      hooks: {
        addImageBlobHook(blob, callback) {
          const fd = new FormData();
          fd.append('file', blob);
          const path = pagePathRef.current;
          if (path) fd.append('page_path', path);
          fetch(`${ADMIN_BASE}/admin/api/media`, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'X-CSRF-Token': getCsrf() },
            body: fd,
          })
            .then((r) => r.json())
            .then((json) => {
              if (json?.ok && json.url) callback(json.url, blob.name || '');
            })
            .catch(() => { /* ignore */ });
        },
      },
    });
    // Toast UI emits a `change` event during initial-value setup. If we
    // attach the dirty-marking listener synchronously the editor is born
    // already dirty — every post switch then triggers a phantom
    // "Discard unsaved changes?" prompt on the next nav click. Defer
    // attachment to the next macrotask so any init-time emissions have
    // already fired by the time we start listening.
    let aborted = false;
    setTimeout(() => {
      if (aborted) return;
      ed.on('change', () => onDirtyRef.current(true));
    }, 0);
    edRef.current = ed;
    initializedRef.current = true;

    return () => {
      aborted = true;
      try { ed.destroy?.(); } catch { /* ignore */ }
      edRef.current = null;
      initializedRef.current = false;
    };
    // Init runs once per mount on `bodyReady`; `pagePath` and the callbacks
    // are read through refs above so changing them doesn't tear the editor
    // down. `initialBody` is captured via closure on first init only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, bodyReady]);

  return { edRef, editorElRef };
}
