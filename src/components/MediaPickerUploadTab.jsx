import { useEffect, useState } from 'react';
import { useFileUpload } from '../lib/hooks.js';
import { ADMIN_BASE } from '../lib/api.js';
import { Alert, Dropzone } from './ui/index.js';

// Upload tab for the MediaPicker — drop-zone + click-to-pick. On a successful
// `POST /admin/api/media` the new file is auto-selected via `onPick`. The
// hidden polite live region narrates upload progress + success so screen-
// reader users hear the same beats sighted users see.
export default function MediaPickerUploadTab({ onPick, pagePath }) {
  const { upload, busy, error } = useFileUpload({
    endpoint: `${ADMIN_BASE}/admin/api/media`,
    extraFields: pagePath ? { page_path: pagePath } : {},
    invalidate: [['media']],
  });
  const [status, setStatus] = useState('');

  useEffect(() => {
    if (busy) setStatus('Uploading image…');
  }, [busy]);

  async function uploadFile(file) {
    if (!file) return;
    try {
      const data = await upload(file);
      setStatus(`Uploaded ${file.name}.`);
      onPick({ url: data.url, alt: file.name });
    } catch { /* error surfaced via the hook + announced via <Alert tone="error"> */ }
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <Dropzone
        accept="image/*"
        disabled={busy}
        label="Drop an image here"
        buttonLabel={busy ? 'Uploading…' : 'Choose file'}
        onFiles={(files) => uploadFile(files[0])}
      />
      <div role="status" aria-live="polite" className="sr-only">{status}</div>
    </div>
  );
}
