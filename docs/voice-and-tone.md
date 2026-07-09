# Voice & tone — admin copy

Every label, button, and message in the admin is product copy.
Without a written voice, each string relies on the contributor's instinct, and the UI drifts.
This doc is the contract: check any admin string against it and either keep it or rewrite it.

Scope: the React admin under `src/` (labels, buttons, empty states, toasts, confirms, error messages).
It does **not** govern theme content or the public docs — that's the theme author's voice, not ours.

## Voice rules

Sentence case for labels, buttons, and headings — not Title Case.
Terse: one clause per label, no marketing copy.
No exclamation marks, no emoji.
No jargon — prefer the plain word:

| Say | Not |
|-----|-----|
| page | document |
| draft | unpublished |
| delete | remove |
| upload | attach |

US English spelling throughout.

## Tone by surface

**Buttons** — imperative verb + noun.
"Save page", not "Save".
"Create backup", not "Backup".

**Empty states** — friendly, with one call to action.
"No pages yet — create your first one."

**Errors** — describe, then propose (Yifrah's two-step).
Say what happened in the user's terms and what they can do next.
Never the words *invalid*, *failed*, *error*.
"Slug should be lowercase letters and hyphens", not "Invalid slug".

**Success toasts** — past tense, no exclamation.
"Page saved."

**Confirms** — state the consequence explicitly.
"Delete 3 pages. This cannot be undone."

## Banned words (admin context)

These read as system-centric or punitive.
Rewrite every occurrence in user-facing copy:

`error`, `failed`, `invalid`, `system`, `permission`, `fatal`, `illegal`, `validation`.

Code is exempt — `catch (error)`, `tone: 'error'`, `invalidateQueries`, and similar identifiers are not copy.
The rule applies only to strings a user reads.

## How to apply

When you add or change an admin string, check it against the voice rules and the surface-specific tone rule above.
When you touch a screen, opportunistically fix any existing string that violates the contract.
A banned-word grep over `src/` (excluding `node_modules`) is the quick audit — most hits are code; the copy ones are few.
