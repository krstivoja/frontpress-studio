import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, getCsrf } from '../../lib/api.js';
import { useToast } from '../../lib/toast.jsx';
import { Card, Button, Checkbox, Alert } from '../../components/ui/index.js';

// Settings → Skills. Lets the operator download the bundled Claude skills
// tailored to their stack: Twig core always ships, PHP-engine and component
// sections are opt-in so a Twig-only theme author doesn't hand their agent
// context (and tokens) it will never use. Server does the composing —
// see cms/lib/SkillBuilder.php + Api/SkillsController.php.

const AXIS_LABELS = {
  twig: 'Twig-engine templates',
  php: 'PHP-engine templates',
  components: 'Reusable components (<Tag/>, component(), Pattern Library)',
};

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}

export default function Skills() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [include, setInclude] = useState({ php: true, components: true });

  const { data, isLoading } = useQuery({
    queryKey: ['skills'],
    queryFn: () => api.get('/skills'),
  });
  const skills = data?.skills || [];

  // Only skills that expose optional sections react to the toggles; preview
  // their tailored size live so the token saving is visible before download.
  const axed = useMemo(() => skills.find((s) => (s.axes || []).length > 0), [skills]);
  const { data: preview } = useQuery({
    queryKey: ['skill-preview', axed?.id, include],
    queryFn: () => api.post('/skills/preview', { skill: axed.id, include }),
    enabled: !!axed,
  });

  const [selected, setSelected] = useState(null); // null → "all" until first toggle
  const allIds = skills.map((s) => s.id);
  const chosen = selected ?? allIds;

  // Guard: an engine-tabbed skill that's selected must keep at least one engine,
  // or its download would carry no template examples at all.
  const noEngine = include.twig === false && include.php === false;
  const blocked = !!axed && chosen.includes(axed.id) && noEngine;

  function toggleSkill(id) {
    const base = selected ?? allIds;
    setSelected(base.includes(id) ? base.filter((x) => x !== id) : [...base, id]);
  }

  async function download() {
    if (chosen.length === 0) {
      toast.show('Pick at least one skill.', { tone: 'error' });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/admin/api/skills/download', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': getCsrf() },
        body: JSON.stringify({ skills: chosen, include }),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const cd = res.headers.get('Content-Disposition') || '';
      const m = /filename="([^"]+)"/.exec(cd);
      a.download = m ? m[1] : `frontpress-skills-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.show(e.message, { tone: 'error', duration: 5000 });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card>
        <header>
          <h2 className="text-base font-semibold">AI skills</h2>
          <p className="mt-1 text-sm text-zinc-600">
            Bundled Claude skills that teach an AI this framework — theme authoring,
            content, fields, and the admin internals. Download them tailored to your
            stack, then drop them where your agent looks for skills.
          </p>
        </header>

        {isLoading ? (
          <p className="mt-4 text-sm text-zinc-500">Loading…</p>
        ) : (
          <div className="mt-4 space-y-3">
            {skills.map((s) => {
              const on = chosen.includes(s.id);
              const isAxed = (s.axes || []).length > 0;
              const size = isAxed && preview ? preview.bytes : s.bytes;
              return (
                <div key={s.id} className="rounded-md border border-zinc-200 bg-white p-4">
                  <label className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300 text-zinc-900"
                      checked={on}
                      onChange={() => toggleSkill(s.id)}
                    />
                    <span className="flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <code className="font-mono text-[13px] font-semibold text-zinc-900">{s.id}</code>
                        <span className="font-mono text-[11px] text-zinc-500">{fmtBytes(size)}</span>
                      </span>
                      <span className="mt-1 block text-[13px] text-zinc-600">{s.description}</span>
                    </span>
                  </label>

                  {isAxed && on && (
                    <div className="mt-3 border-t border-zinc-100 pt-3 pl-7">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">
                        Include optional sections
                      </p>
                      <p className="mt-1 text-[12px] text-zinc-500">
                        Core concepts, content, and fields always ship. Pick the engine(s)
                        you author in and whether to include the component system — dropping
                        what you won't use shrinks the file and saves your agent tokens.
                      </p>
                      <div className="mt-2 space-y-2">
                        {s.axes.map((axis) => (
                          <Checkbox
                            key={axis}
                            label={AXIS_LABELS[axis] || axis}
                            checked={include[axis] !== false}
                            onChange={(e) =>
                              setInclude((prev) => ({ ...prev, [axis]: e.target.checked }))
                            }
                          />
                        ))}
                      </div>
                      {noEngine && (
                        <Alert className="mt-2" tone="warning">
                          Pick at least one engine — otherwise the skill ships with no
                          template examples.
                        </Alert>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            <div className="flex items-center justify-between pt-1">
              <span className="text-[12px] text-zinc-500">
                {chosen.length} skill{chosen.length === 1 ? '' : 's'} selected
              </span>
              <Button onClick={download} disabled={busy || chosen.length === 0 || blocked}>
                {busy ? 'Preparing…' : 'Download .zip'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <h2 className="text-base font-semibold">Where to put them</h2>
        <p className="mt-1 text-sm text-zinc-600">
          The zip holds one folder per skill (<code className="font-mono text-[12px]">&lt;id&gt;/SKILL.md</code>).
          Unzip, then copy the folder to wherever your agent discovers skills.
        </p>
        <div className="mt-3 space-y-3 text-[13px]">
          <Target
            name="Claude Code"
            path="<your-install>/.claude/skills/  (already here) — or a project's .claude/skills/"
          >
            Skills auto-load from <code className="font-mono">.claude/skills/</code> relative to the
            working directory. This install already ships them at its root; copy into a specific
            project to scope them there.
          </Target>
          <Target name="Claude Desktop / claude.ai" path="~/.claude/skills/">
            Copy each <code className="font-mono">&lt;id&gt;/</code> folder into your global skills
            directory to load it in every conversation.
          </Target>
          <Target name="Share with your team" path="<repo>/.claude/skills/  (commit it)">
            Commit the folders to your project repo so every teammate — and their agent — picks up
            the same conventions.
          </Target>
        </div>
        <Alert className="mt-3" tone="info">
          Tip: a Twig-only theme? Uncheck <strong>PHP-engine templates</strong> above — your agent
          gets a leaner file and burns fewer tokens per turn.
        </Alert>
      </Card>
    </div>
  );
}

function Target({ name, path, children }) {
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-medium text-zinc-900">{name}</span>
        <code className="font-mono text-[12px] text-zinc-600">{path}</code>
      </div>
      <p className="mt-1 text-zinc-600">{children}</p>
    </div>
  );
}
