import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api.js';
import { Alert, Button, Card, Field, Input, Select } from '../../components/ui/index.js';
import { IconTrash } from '../../components/icons.jsx';
import EmailProviderPicker from './EmailProviderPicker.jsx';

const DEFAULT_EMAIL = {
  smtp_host: '',
  smtp_port: 587,
  smtp_user: '',
  smtp_pass: '',
  smtp_encryption: 'tls',
  from_address: '',
  from_name: '',
  fallback_to_mail: true,
};

// Fresh forms start blank — the operator builds the field list themselves
// from "+ Add field". Mirrors how Manage fields (taxonomies) works, and
// avoids shipping placeholder fields the operator has to rename / delete.
const DEFAULT_CONTACT = {
  to: '',
  subject_prefix: '[Contact]',
  fields: [],
  honeypot_field: 'website',
  rate_limit_per_hour: 5,
  success_redirect: '/contact?sent=1',
  store_submissions: true,
};

const FIELD_TYPES = [
  { value: 'text',     label: 'Text'     },
  { value: 'email',    label: 'Email'    },
  { value: 'tel',      label: 'Phone'    },
  { value: 'url',      label: 'URL'      },
  { value: 'textarea', label: 'Long text'},
  { value: 'select',   label: 'Dropdown' },
  { value: 'checkbox', label: 'Checkbox' },
];

// SMTP credentials + per-form configuration. The form mirrors how
// SiteSettings.jsx persists the settings blob — read the whole config
// on mount, mutate the email + forms.contact slices locally, PUT the
// whole thing back. SMTP password is masked with `__SAVED__` when one
// is stored; the user types a fresh value to replace it.
export default function EmailSettings() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings'),
  });

  const [email, setEmail]     = useState(DEFAULT_EMAIL);
  const [contact, setContact] = useState(DEFAULT_CONTACT);
  const [saved, setSaved]     = useState(false);
  const [draggingIdx, setDraggingIdx] = useState(null);
  const [dragOverIdx,  setDragOverIdx]  = useState(null);
  const focusNewRowRef = useRef(false);

  // Hydrate from the server response. We never echo the real password
  // back — it arrives as `"__SAVED__"` when one exists, `""` when not.
  // Keep the placeholder text and only override on Save when the
  // operator typed something different.
  useEffect(() => {
    const s = data?.settings;
    if (!s) return;
    setEmail({ ...DEFAULT_EMAIL, ...(s.email || {}) });
    const c = s.forms?.contact;
    if (c) {
      // Use the server-side fields verbatim — including an empty array.
      // A freshly-installed CMS has no `forms.contact` at all, so this
      // path is only hit after the operator has saved at least once.
      setContact({ ...DEFAULT_CONTACT, ...c, fields: Array.isArray(c.fields) ? c.fields : [] });
    } else {
      setContact(DEFAULT_CONTACT);
    }
  }, [data]);

  // After clicking "+ Add field", focus the new row's Name input so the
  // operator types straight into it without grabbing the mouse.
  useEffect(() => {
    if (!focusNewRowRef.current) return;
    focusNewRowRef.current = false;
    const rows = document.querySelectorAll('[data-field-row]');
    const last = rows[rows.length - 1];
    last?.querySelector('input[data-field-input="name"]')?.focus();
  }, [contact.fields.length]);

  const passwordIsStored = (data?.settings?.email?.smtp_pass ?? '') === '__SAVED__';

  const save = useMutation({
    mutationFn: () => {
      // If the user didn't touch the password field (still equal to the
      // mask token), send empty so the server keeps whatever's stored.
      const out = { ...email };
      if (out.smtp_pass === '__SAVED__') out.smtp_pass = '';
      return api.put('/settings', {
        site: data?.settings?.site || { name: '', base: '/' },
        uploads: data?.settings?.uploads || { max_mb: 5, max_width: 0, max_height: 0 },
        taxonomies: data?.settings?.taxonomies || {},
        seo: data?.settings?.seo || {},
        email: out,
        forms: { ...(data?.settings?.forms || {}), contact },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2200);
    },
  });

  const [testTo, setTestTo]   = useState('');
  const [testRes, setTestRes] = useState(null);
  useEffect(() => { if (!testTo) setTestTo(contact.to || ''); }, [contact.to]);  // eslint-disable-line

  const test = useMutation({
    mutationFn: () => api.post('/email/test', { to: testTo }),
    onMutate: () => setTestRes(null),
    onSuccess: (r) => setTestRes(r),
    onError:   (e) => setTestRes({ ok: false, error: e.message || 'no response from server' }),
  });

  const set  = (patch) => setEmail((p) => ({ ...p, ...patch }));
  const setC = (patch) => setContact((p) => ({ ...p, ...patch }));

  function addField() {
    focusNewRowRef.current = true;
    setC({ fields: [...contact.fields, { name: '', label: '', type: 'text', required: false, placeholder: '' }] });
  }

  function updateField(i, patch) {
    setC({ fields: contact.fields.map((x, j) => i === j ? { ...x, ...patch } : x) });
  }

  function removeField(i) {
    setC({ fields: contact.fields.filter((_, j) => j !== i) });
  }

  function moveField(from, to) {
    if (from === to || to < 0 || to >= contact.fields.length) return;
    const arr = [...contact.fields];
    const [moved] = arr.splice(from, 1);
    arr.splice(to, 0, moved);
    setC({ fields: arr });
  }

  // Drag-and-drop reordering. We use the field's index as the drag
  // payload — when the row is reordered the index becomes stale, but
  // the drop handler reads the live indices off the DOM via the
  // `data-field-row` attribute, so the stale payload is fine.
  function onDragStart(i, e) {
    setDraggingIdx(i);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(i));
  }
  function onDragOver(i, e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverIdx !== i) setDragOverIdx(i);
  }
  function onDrop(i, e) {
    e.preventDefault();
    const from = draggingIdx ?? Number(e.dataTransfer.getData('text/plain'));
    setDraggingIdx(null);
    setDragOverIdx(null);
    if (Number.isInteger(from)) moveField(from, i);
  }
  function onDragEnd() {
    setDraggingIdx(null);
    setDragOverIdx(null);
  }

  if (isLoading) return <div className="text-sm text-zinc-500">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold">Email</h2>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-600">Saved</span>}
          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save changes'}
          </Button>
        </div>
      </div>

      {save.error && <Alert tone="error">{save.error.message}</Alert>}

      <Card>
        <div className="space-y-4">
          <header>
            <h3 className="text-sm font-semibold text-zinc-900">SMTP</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Pick your provider and we'll pre-fill host / port / encryption — you only need to supply the username and password. Choose <strong>PHP mail()</strong> to skip SMTP entirely and let the server send mail.
            </p>
          </header>

          {/* Click a tile -> snap host/port/encryption to that provider's
              canonical values. Leaves user/pass alone so switching providers
              doesn't wipe what the operator typed by mistake. */}
          <EmailProviderPicker
            activeHost={email.smtp_host}
            onPick={(p) => set({
              smtp_host: p.host,
              smtp_port: p.port,
              smtp_encryption: p.encryption,
            })}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            {/* SMTP credentials are only meaningful when smtp_host is set —
                an empty host means PHP mail() is the transport, so we hide
                host/port/encryption/user/pass entirely and only keep the
                sender identity fields (From address / From name). */}
            {email.smtp_host && (
              <>
                <Field label="Host">
                  <Input value={email.smtp_host} onChange={(e) => set({ smtp_host: e.target.value })} placeholder="smtp.postmarkapp.com" />
                </Field>
                <Field label="Port">
                  <Input type="number" min={1} max={65535} value={email.smtp_port} onChange={(e) => set({ smtp_port: Number(e.target.value) || 587 })} />
                </Field>
                <Field label="Encryption">
                  <Select value={email.smtp_encryption} onChange={(e) => set({ smtp_encryption: e.target.value })}>
                    <option value="tls">TLS (STARTTLS)</option>
                    <option value="ssl">SSL</option>
                    <option value="none">None</option>
                  </Select>
                </Field>
                <Field label="Username">
                  <Input value={email.smtp_user} onChange={(e) => set({ smtp_user: e.target.value })} autoComplete="off" placeholder="api token or login" />
                </Field>
                <Field label="Password">
                  <Input
                    type="password"
                    value={email.smtp_pass}
                    onChange={(e) => set({ smtp_pass: e.target.value })}
                    autoComplete="new-password"
                    placeholder={passwordIsStored ? '(unchanged — type to replace)' : ''}
                  />
                  <p className="mt-1 text-[11px] text-zinc-500">
                    Or set <code>MD_SMTP_PASS</code> in <code>config.php</code> and leave this empty — the server reads the env constant when the JSON value is blank.
                  </p>
                </Field>
              </>
            )}
            <Field label="From address">
              <Input type="email" value={email.from_address} onChange={(e) => set({ from_address: e.target.value })} placeholder="noreply@yoursite.com" />
            </Field>
            <Field label="From name">
              <Input value={email.from_name} onChange={(e) => set({ from_name: e.target.value })} placeholder="Your Site" />
            </Field>
          </div>

          {email.smtp_host && (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={!!email.fallback_to_mail}
                onChange={(e) => set({ fallback_to_mail: e.target.checked })}
              />
              <span>Fall back to PHP <code>mail()</code> when SMTP fails. (Convenient on hobby hosts; deliverability suffers.)</span>
            </label>
          )}

          <hr className="border-zinc-200" />

          <div className="space-y-3">
            <h4 className="text-sm font-semibold text-zinc-900">Send a test email</h4>
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <Field label="To">
                  <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@example.com" />
                </Field>
              </div>
              <Button variant="secondary" onClick={() => test.mutate()} disabled={test.isPending || !testTo}>
                {test.isPending ? 'Sending…' : 'Send test'}
              </Button>
            </div>
            {testRes && (
              <Alert tone={testRes.ok ? 'success' : 'error'}>
                {testRes.ok
                  ? <>Sent via <code>{testRes.transport}</code>. {testRes.transport === 'mail' && email.smtp_host
                      ? 'Warning: your SMTP settings aren’t working — PHP mail() picked it up. Most shared hosts deliver mail() messages to spam.' : ''}</>
                  : <>Couldn’t send the test email — <code>{testRes.error}</code>. Check the address and SMTP settings, then try again.</>}
              </Alert>
            )}
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <header>
            <h3 className="text-sm font-semibold text-zinc-900">Contact form</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Public form available at <code>/submit/contact</code>. Submissions land as draft posts under <code>site/content/contact/</code>; the Pages list surfaces the folder.
            </p>
          </header>

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Send to">
              <Input type="email" value={contact.to} onChange={(e) => setC({ to: e.target.value })} placeholder="you@yoursite.com" />
            </Field>
            <Field label="Subject prefix">
              <Input value={contact.subject_prefix} onChange={(e) => setC({ subject_prefix: e.target.value })} />
            </Field>
            <Field label="Rate limit (per hour, per IP)">
              <Input type="number" min={0} max={1000} value={contact.rate_limit_per_hour} onChange={(e) => setC({ rate_limit_per_hour: Number(e.target.value) || 0 })} />
            </Field>
            <Field label="Success redirect">
              <Input value={contact.success_redirect} onChange={(e) => setC({ success_redirect: e.target.value })} placeholder="/contact?sent=1" />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={!!contact.store_submissions}
              onChange={(e) => setC({ store_submissions: e.target.checked })}
            />
            <span>Save every submission as a draft post under <code>site/content/&lt;form&gt;/</code>. The folder appears in the admin Pages list — included in backups, searchable, restorable from trash.</span>
          </label>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-zinc-700">Fields</div>
                <div className="text-[11px] text-zinc-500">Drag rows to reorder. Type into <em>Name</em> first — the Label and Type auto-fill when you tab away.</div>
              </div>
              <Button variant="secondary" size="sm" onClick={addField}>+ Add field</Button>
            </div>

            {contact.fields.length === 0 ? (
              <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50/50 p-6 text-center text-xs text-zinc-500">
                No fields yet. Click <strong>+ Add field</strong> to build the form one field at a time.
              </div>
            ) : (
              <ul className="space-y-2">
                {contact.fields.map((f, i) => (
                  <FieldRow
                    key={i}
                    index={i}
                    field={f}
                    onChange={(patch) => updateField(i, patch)}
                    onRemove={() => removeField(i)}
                    isDragging={draggingIdx === i}
                    isDragOver={dragOverIdx === i && draggingIdx !== i}
                    onDragStart={(e) => onDragStart(i, e)}
                    onDragOver={(e) => onDragOver(i, e)}
                    onDrop={(e) => onDrop(i, e)}
                    onDragEnd={onDragEnd}
                  />
                ))}
              </ul>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

// Auto-derive Type from common Name patterns. Mirrors what the server
// does in SettingsController::guessTypeFromName so the UI shows the same
// type the server will pick on save.
function guessTypeFromName(name) {
  if (name === 'email') return 'email';
  if (name === 'phone' || name === 'tel') return 'tel';
  if (name === 'url' || name === 'website') return 'url';
  if (['message', 'body', 'comment', 'notes'].includes(name)) return 'textarea';
  return 'text';
}

function FieldRow({
  index, field, onChange, onRemove,
  isDragging, isDragOver,
  onDragStart, onDragOver, onDrop, onDragEnd,
}) {
  function onNameBlur(e) {
    const value = e.target.value.trim();
    if (!value) return;
    const updates = {};
    // Auto-derive Label from Name when the operator hasn't typed one
    // themselves — same `snake_case → Sentence case` rule as elsewhere.
    if (!field.label) {
      updates.label = value.charAt(0).toUpperCase()
                    + value.slice(1).replace(/[_-]/g, ' ');
    }
    // Auto-derive Type when it's still the default `text` and the Name
    // is one we recognise. Stops overriding if the operator changed
    // the type already.
    if (field.type === 'text') {
      const guessed = guessTypeFromName(value);
      if (guessed !== 'text') updates.type = guessed;
    }
    if (Object.keys(updates).length) onChange(updates);
  }

  return (
    <li
      data-field-row
      data-field-index={index}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      className={`rounded-md border bg-zinc-50 p-3 transition-colors ${
        isDragging ? 'opacity-50 border-zinc-300' :
        isDragOver ? 'border-zinc-900 ring-2 ring-zinc-900/15' :
                     'border-zinc-200'
      }`}
    >
      <div className="flex items-start gap-3">
        {/* Grip handle — visual cue + drag affordance. The whole row is
            draggable; the handle just shows where to grab. */}
        <div
          className="mt-7 cursor-grab select-none text-zinc-400 active:cursor-grabbing"
          aria-hidden="true"
          title="Drag to reorder"
        >
          <svg width="14" height="20" viewBox="0 0 8 14" fill="currentColor">
            <circle cx="2" cy="2"  r="1.2" />
            <circle cx="6" cy="2"  r="1.2" />
            <circle cx="2" cy="7"  r="1.2" />
            <circle cx="6" cy="7"  r="1.2" />
            <circle cx="2" cy="12" r="1.2" />
            <circle cx="6" cy="12" r="1.2" />
          </svg>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          {/* `minmax(0, 1fr)` lets the columns shrink below their inputs'
              `min-w-[250px]` site-wide minimum. `min-w-0` on each Field
              cooperates so the inputs themselves can also fall below
              that width. Without these, the row overflows its container
              on narrow widths (e.g. when a side panel is open). */}
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_140px]">
            <Field label="Name" className="min-w-0">
              <Input
                data-field-input="name"
                value={field.name}
                onChange={(e) => onChange({ name: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
                onBlur={onNameBlur}
                placeholder="email"
                mono
                className="!min-w-0"
              />
            </Field>
            <Field label="Label" className="min-w-0">
              <Input
                value={field.label}
                onChange={(e) => onChange({ label: e.target.value })}
                placeholder="Email address"
                className="!min-w-0"
              />
            </Field>
            {/* Select wraps the inner <select> in a <span> that carries the
                chevron — className passed to <Select> lands on the span, not
                the select. Use Tailwind's arbitrary-descendant variant
                ([&_select]:…) to reach the inner element. */}
            <Field label="Type" className="min-w-0 [&_select]:!min-w-0">
              <Select value={field.type} onChange={(e) => onChange({ type: e.target.value })}>
                {FIELD_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
          </div>

          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <Field label="Placeholder" className="min-w-0">
              <Input
                value={field.placeholder || ''}
                onChange={(e) => onChange({ placeholder: e.target.value })}
                placeholder="Optional"
                className="!min-w-0"
              />
            </Field>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" checked={!!field.required} onChange={(e) => onChange({ required: e.target.checked })} />
              <span>Required</span>
            </label>
          </div>

          {field.type === 'select' && (
            <Field label="Choices (one per line)">
              <textarea
                className="block w-full rounded-md border border-zinc-200 bg-white px-2 py-1.5 font-mono text-[13px]"
                rows={3}
                value={(field.choices || []).join('\n')}
                onChange={(e) => onChange({ choices: e.target.value.split('\n') })}
                onBlur={(e) => onChange({ choices: e.target.value.split('\n').map((s) => s.trim()).filter(Boolean) })}
              />
            </Field>
          )}
          {field.type === 'checkbox' && (
            <Field label="Checkbox label (text next to the box)">
              <Input
                value={field.cb_label || field.label}
                onChange={(e) => onChange({ cb_label: e.target.value })}
                placeholder="I agree to the terms"
              />
            </Field>
          )}
        </div>

        {/* Trash icon — aligned with the top input row (Name / Label /
            Type). `mt-[18px]` matches the label height + spacing above
            those inputs so the icon's centre lines up with their
            centres. */}
        <button
          type="button"
          onClick={onRemove}
          aria-label="Remove field"
          title="Remove field"
          className="mt-[26px] inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 [&>svg]:h-3.5 [&>svg]:w-3.5"
        >
          {IconTrash}
        </button>
      </div>
    </li>
  );
}
