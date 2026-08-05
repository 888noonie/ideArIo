# B3 Implementation Guide — Structural Hardening

**For:** DeepSeek Flash V4 (implementer)
**By:** GLM 5.2 (architect/auditor)
**Entry state:** `origin/main` at `885c429` (B2 landed). Gates green.
**Exit criteria:** All four findings implemented, gates green, committed
per-finding, pushed. GLM audits after.

B3 is the "needs care" batch. Two of the four can silently brick the app if
gotten wrong (F-04 CSP, F-22 registry split). Read the frozen contracts at
the end before touching anything.

---

## Finding order (do them in this sequence)

1. **F-15** — schema-version envelopes (pure data layer, no UI risk — warmup)
2. **F-22** — model-registry split + lazy-import (touches App.tsx, must not break Settings)
3. **F-19** — link-button gating (touches ChatEntry shape — FROZEN CONTRACT)
4. **F-01** — mailbox entropy + expiry (touches pairing UX — earned invariant)
5. **F-04** — CSP header (last, because it's the one that can silently brick — validate in preview)

F-04 is deliberately last so every other change is already green before you
add a header that could break the whole app if a directive is wrong.

---

## F-15 — Schema-version envelopes for chat-log + note-comments

**Files:** `src/lib/chat-engine.ts`, `src/components/IdeasTab.tsx`
**Frozen contract:** `ChatEntry` shape (the array element type) does NOT
change. Only the *envelope wrapping the array* changes. Old bare-array data
must still load.

### Design

Wrap each persisted array in `{ version, data }`. The loader reads either
shape (bare array = v0, envelope = v1+) and returns the array. The saver
always writes the envelope. This mirrors `yaml-migrations.ts`'s pattern.

### chat-engine.ts

Add a constant and a version-aware loader. Keep `ChatEntry` untouched.

```ts
const STORAGE_KEY = 'ideario-chat-log';
const STORAGE_VERSION = 1;
const MAX_ENTRIES = 200;
// ...existing code...

export function loadChatLog(): ChatEntry[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    // v0: bare array. v1+: { version, data: ChatEntry[] }
    let entries: unknown;
    if (Array.isArray(parsed)) {
      entries = parsed; // v0 — migrate on next save
    } else if (
      parsed &&
      typeof parsed === 'object' &&
      Array.isArray((parsed as { data?: unknown }).data)
    ) {
      entries = (parsed as { data: unknown[] }).data;
    } else {
      return [];
    }
    if (!Array.isArray(entries)) return [];
    return (entries as ChatEntry[]).slice(-MAX_ENTRIES);
  } catch {
    return [];
  }
}

export function saveChatLog(entries: ChatEntry[]): void {
  try {
    const envelope = { version: STORAGE_VERSION, data: entries.slice(-MAX_ENTRIES) };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
  } catch {
    // storage unavailable — fail silently
  }
}
```

`clearChatLog` stays as-is (it just removes the key).

### IdeasTab.tsx

The `NoteComments` type is `Record<string, NoteComment[]>` (an object, not an
array). Wrap the whole object: `{ version, data: NoteComments }`.

```ts
const COMMENTS_VERSION = 1;

function loadComments(): NoteComments {
  try {
    const raw = window.localStorage.getItem(COMMENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      // v0: bare NoteComments object. v1+: { version, data }
      let obj: unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        if ('data' in parsed && 'version' in parsed) {
          obj = (parsed as { data: unknown }).data;
        } else {
          obj = parsed; // v0
        }
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          return obj as NoteComments;
        }
      }
    }
  } catch {
    // storage unavailable / corrupted — start empty
  }
  return {};
}

function saveComments(comments: NoteComments): void {
  try {
    const envelope = { version: COMMENTS_VERSION, data: comments };
    window.localStorage.setItem(COMMENTS_KEY, JSON.stringify(envelope));
  } catch {
    // storage unavailable — fail silently
  }
}
```

**Do NOT** touch `ideario-display-mode` (HistoryTab) — it's a single string
value, not an array/object, and the audit (F-15) explicitly scopes to
chat-log + note-comments. Wrapping a scalar adds complexity for no migration
benefit.

### Verify

- `tsc -b` clean, `lint` clean, `build` green.
- Bundle size should be ~unchanged (this is data-layer only).
- **Backward compat:** the loader must still read a bare array (v0) from an
  existing install. GLM will audit this specifically.

---

## F-22 — Split model-registry accessors, lazy-import the 790-line registry

**Files:** NEW `src/lib/model-id.ts`, `src/App.tsx`, `src/components/ModelSelector.tsx`,
`src/components/SettingsPanel.tsx`, `src/lib/settings-sync.ts`, `src/lib/providers/nim.ts`
**Frozen contract:** `ChatEntry` shape (not touched here, but App.tsx is a
shared integration point — GLM must sign off on App.tsx changes).

### The problem

`src/lib/model-registry.ts` is 790 lines, all 9 models inline. `App.tsx`
imports it at top level for just two tiny accessors:
`loadSelectedModelId` / `saveSelectedModelId` (and the `ModelInfo` type).
That pulls the whole registry into the initial bundle for code only the
Settings tab uses.

### Design (Richard's refinement)

Split the **accessors** into a micro-module that has NO import of the
registry. The registry stays where it is; only its *consumers* lazy-load it.

### Step 1 — Create `src/lib/model-id.ts`

A tiny module with the selected-model persistence + the default id constant.
It must NOT import `model-registry.ts` (that would defeat the purpose).

```ts
// src/lib/model-id.ts
// Tiny accessors for the selected-model id. Deliberately does NOT import
// model-registry.ts — that 790-line module is lazy-loaded only by the
// Settings tab / ModelSelector / NIM provider. App.tsx imports only this.

export const DEFAULT_MODEL_ID = 'deepseek-ai/deepseek-v4-pro';
const SELECTED_MODEL_KEY = 'ideario-selected-model';

export function loadSelectedModelId(): string {
  try {
    const stored = localStorage.getItem(SELECTED_MODEL_KEY);
    if (stored) return stored; // validity checked by the registry on use
  } catch {
    // Ignore localStorage errors
  }
  return DEFAULT_MODEL_ID;
}

export function saveSelectedModelId(id: string): void {
  try {
    localStorage.setItem(SELECTED_MODEL_KEY, id);
  } catch {
    // Ignore localStorage errors
  }
}
```

Note: `loadSelectedModelId` here does NOT call `getModelById` to validate
(the original did). That validation was a nice-to-have; the registry is
checked when the model is actually used (NIM provider, ModelSelector). If
the stored id is stale, the provider falls back. This is the tradeoff for
keeping the registry out of the initial bundle — and it's the right one,
because the validation was the *only* reason App.tsx needed the registry.

### Step 2 — Remove the duplicate accessors from model-registry.ts

In `src/lib/model-registry.ts`, **delete** `loadSelectedModelId` and
`saveSelectedModelId` (lines ~772-790) and the `DEFAULT_MODEL_ID` export
(line 9) — they now live in `model-id.ts`. Keep `getModelById`,
`getDefaultModel`, `MODEL_REGISTRY`, and the `ModelInfo` type.

Wait — `DEFAULT_MODEL_ID` is used by `getDefaultModel()` inside the
registry. Keep a *private* copy in the registry for that, OR have the
registry import it from `model-id.ts` (model-id.ts has no imports, so this
is safe and avoids duplication):

```ts
// top of model-registry.ts
import { DEFAULT_MODEL_ID } from './model-id';
// remove the `export const DEFAULT_MODEL_ID = ...` line
```

This is a one-way dependency: registry → model-id. Never the reverse.

### Step 3 — Update App.tsx

Change the import from `./lib/model-registry` to `./lib/model-id` for the
accessors. The `ModelInfo` *type* import can stay from model-registry
(types are erased at compile time, no runtime cost).

```ts
// App.tsx — before:
import { loadSelectedModelId, saveSelectedModelId } from './lib/model-registry';
import type { ModelInfo } from './lib/model-registry';
// after:
import { loadSelectedModelId, saveSelectedModelId } from './lib/model-id';
import type { ModelInfo } from './lib/model-registry';
```

`ModelInfo` is only used as a type in App.tsx (the `selectedModel` state) —
confirm with grep before assuming. If App.tsx uses `ModelInfo` as a value
(it shouldn't), that's a separate problem.

### Step 4 — settings-sync.ts

`src/lib/settings-sync.ts` imports `loadSelectedModelId` from
`./model-registry`. Change to `./model-id`. This module runs at bridge
sync time, not initial load — but it's still cleaner to point at the
micro-module.

### Step 5 — ModelSelector.tsx, SettingsPanel.tsx, nim.ts

These three are the *legitimate* registry consumers. They stay as
top-level imports of `model-registry` — they're behind the Settings tab
(ModelSelector, SettingsPanel) or the NIM chat path (nim.ts), both of
which are not initial-bundle-critical.

**Optional (only if time permits):** lazy-load the registry in
`ModelSelector.tsx` via `useEffect(() => { import('../lib/model-registry').then(...) }, [])`.
This is the bigger win but riskier (Suspense/loading state). If the
accessor split alone gets the registry out of the initial bundle, skip
the lazy-load. **Check the bundle size before and after the split** — if
the registry is still in the initial chunk (because nim.ts is eagerly
imported by the provider index), then do the lazy-load on nim.ts too.

### Verify

- `tsc -b` clean, `lint` clean, `build` green.
- **Bundle size should drop** — measure `dist/assets/index-*.js` before and
  after. The 790-line registry should move out of the initial chunk. If it
  doesn't, the provider index is pulling it; report this to GLM.
- Settings tab still loads models (manual check or trust the type system).

---

## F-19 — Gate "Queue link" buttons to non-remote entries

**Files:** `src/components/ChatBubble.tsx`, `src/components/ChatPanel.tsx`,
`src/lib/chat-engine.ts`
**Frozen contract:** `ChatEntry` shape — see below for the safe way to add a
flag without breaking the contract.

### The problem

`ChatBubble` renders "Queue link" buttons for ANY url in agent text when
`paired` is true. In `display` role, `mergeRemoteEntries` pulls entries
from the Gist mailbox — a compromised hub can inject agent-attributed
content with attacker URLs, one tap from `window.open`. The mailbox peer
is *usually* your own phone, but defense-in-depth says: don't render
link buttons on content that came over the mailbox.

### Design

Add an optional `remote?: boolean` flag to `ChatEntry`. The frozen contract
says the *existing* fields (`role`, `status`, `ts`, `id`, `content`,
`agentId`, `agentName`, `color`) must not change — adding an optional field
is backward-compatible (old data without it = `undefined` = treated as
local). GLM ruled this is the safe way to extend the contract.

`mergeRemoteEntries` sets `remote: true` on every entry it merges.
`ChatBubble` suppresses link buttons when `entry.remote` is true.

### chat-engine.ts

```ts
export interface ChatEntry {
  id: string;
  role: 'user' | 'agent' | 'system';
  agentId?: string;
  agentName?: string;
  color?: string;
  content: string;
  status: 'done' | 'thinking' | 'error';
  ts: number;
  /** True for entries received over the bridge mailbox (display role). */
  remote?: boolean;
}
```

### ChatPanel.tsx — mergeRemoteEntries

```ts
const mergeRemoteEntries = useCallback((incoming: ChatEntry[]) => {
  if (!mountedRef.current) return;
  setEntries((prev) => {
    const byId = new Map(prev.map((e) => [e.id, e] as const));
    for (const e of incoming) {
      if (e && typeof e.id === 'string') {
        byId.set(e.id, { ...e, remote: true });
      }
    }
    return [...byId.values()].sort((a, b) => a.ts - b.ts);
  });
}, []);
```

Note the spread: we set `remote: true` on the *merged copy*, not mutating
the incoming envelope. Local entries (created by `dispatchLocal`,
`appendSystemEntry`) never set `remote`, so they're `undefined` = local.

### ChatBubble.tsx

Change the url-extraction line:

```ts
// before:
const urls = paired && !isThinking ? extractUrls(entry.content) : [];
// after:
const urls = paired && !isThinking && !entry.remote ? extractUrls(entry.content) : [];
```

That's the whole fix. The `!entry.remote` gate means display-role entries
sourced from the mailbox never get link buttons. Local entries (hub role
or standalone) still do.

### Verify

- `tsc -b` clean, `lint` clean, `build` green.
- **Do NOT** break the `ChatEntry` shape — only the optional `remote` field
  is added. GLM will diff the interface specifically.

---

## F-01 — Mailbox entropy + expiry

**Files:** `src/lib/bridge/mailbox.ts`, `src/components/BridgeTab.tsx`
**Earned invariant:** the uncontrolled pairing-code input (ref pattern) for
the Fermata virtual keyboard. Do NOT change the input UX. Only change what
the code *is* and how long it's valid.

### The problem (Richard's adjudication)

Fable called this CRITICAL with a "brute-force via Gist lookup-by-description"
vector. Richard correctly noted GitHub retired Gist search-by-description —
you can't enumerate mailboxes by code. The real risk is: (a) the code is
shoulder-surfable from the big on-screen pairing display, and (b) it lives
in the mailbox Gist content forever. Severity adjusted to HIGH.

### Design — two layers

**Layer 1: increase entropy.** Keep the 6-digit code as the *user-typed*
pairing token (the Fermata keyboard flow depends on it being short), but
add a high-entropy secret that's derived from the code + a random salt
baked into the Gist description. The description becomes:
`ideario-bridge-<code>-<8-hex-salt>`. The salt is generated by the hub on
mailbox creation and the display reads it from... no, wait — the display
only knows the code. The salt has to be discoverable.

**Simpler approach (recommended):** keep the description as
`ideario-bridge-<code>` (unchanged — the display finds the Gist by this),
but add an **expiry** check inside the mailbox content itself. This is
Layer 2, and it's the one that actually closes the stale-code window.

**Layer 2: expiry.** The hub writes an `expires_at` timestamp into the
mailbox file on creation. `openMailbox` and `poll` reject expired
mailboxes (treat as not-found → the display sees "no mailbox, create
one" → but the hub already exists... so instead: the hub *refreshes* the
expiry on each successful poll).

Let me be concrete. Change `MailboxFile`:

```ts
interface MailboxFile {
  envelopes: BridgeEnvelope[];
  expires_at?: number; // epoch ms; 0/absent = no expiry (back-compat)
}
```

On `createMailboxGist`, set `expires_at` to `Date.now() + MAILBOX_TTL_MS`.
On each `poll`, if the mailbox is near expiry (e.g. < 25% TTL left), the
hub refreshes it (PATCH the file with a new `expires_at`). The display
checks expiry on poll and, if expired, throws a descriptive error
("Pairing code expired — generate a new one on the phone.").

```ts
const MAILBOX_TTL_MS = 24 * 60 * 60 * 1000; // 24h — generous for a pairing session
const MAILBOX_REFRESH_THRESHOLD = MAILBOX_TTL_MS / 4; // refresh in last 25%
```

### mailbox.ts changes

1. `createMailboxGist`: write `{ envelopes: [], expires_at: Date.now() + MAILBOX_TTL_MS }`.
2. `readEnvelopes`: also return `expires_at` (change return type to
   `{ envelopes, expires_at }` or add a sibling reader — keep it simple,
   return the parsed `MailboxFile`).
3. `openMailbox`: after finding/creating, check `expires_at`. If expired,
   throw `new Error('Pairing code expired — generate a new one on the phone.')`.
   This surfaces in BridgeTab as `startError` (the existing honest-error path).
4. `poll` (hub role): if `Date.now() + MAILBOX_REFRESH_THRESHOLD > expires_at`,
   refresh by re-writing the file with a new `expires_at` (keep envelopes).
   This is a cheap extra write on the poll path, only near expiry.

**Entropy note:** Richard's adjudication said "fix stands (entropy +
expiry), severity adjusted." The expiry is the higher-value half. If the
salt-in-description approach above feels risky for the display-discovery
flow, ship expiry alone for B3 and note entropy as deferred — that's an
acceptable deferral with rationale. GLM's recommendation: **ship expiry,
defer the salt** (the salt changes the discovery flow and risks the
Fermata keyboard invariant; expiry closes the stale-code window without
touching discovery).

### BridgeTab.tsx

No change needed — `startError` already surfaces `openMailbox`'s throw.
The expiry error message will appear in the existing red alert. Confirm
this by reading the `startError` rendering (it's at line ~240, the
`role="alert"` paragraph).

### Verify

- `tsc -b` clean, `lint` clean, `build` green.
- The pairing flow still works: hub creates mailbox, display joins with
  6-digit code. The only new behavior is: an expired mailbox throws a
  clear error instead of silently serving stale content.
- **Do NOT** change the pairing input control (uncontrolled ref) or the
  6-digit code length.

---

## F-04 — Content-Security-Policy header

**File:** `vercel.json`
**Risk:** A wrong CSP bricks the app silently. This is the one finding
that MUST be validated in a preview deploy before main.

### The directive (Richard's amendment applied)

The app uses inline `style={{}}` everywhere (`userSelect`, swatch colors,
`--app-h`), so `style-src` MUST include `'unsafe-inline'`. Ollama's URL is
user-configurable (default `http://localhost:11434`), so `connect-src`
needs `http://localhost:*` and `http://127.0.0.1:*`.

Enumerated origins (from grepping `src/lib/providers/*.ts` + bridge + sw):
- **connect-src:** `self`, `https://openrouter.ai`, `https://api.github.com`,
  `https://integrate.api.nvidia.com` (NIM, though it goes via `/api/nim-proxy`
  so self covers it — but the SW fetches raw_url from GitHub on truncated
  gists, so api.github.com is real), `http://localhost:*`, `http://127.0.0.1:*`
  (Ollama, arbitrary local URL)
- **media-src:** `self` + `blob:` (speechSynthesis doesn't need CSP, but
  MediaSession/voice may produce blob URLs — include `blob:` defensively)
- **script-src:** `self` (no inline scripts; the SW is same-origin)
- **style-src:** `self` `'unsafe-inline'` (Tailwind + inline styles)
- **img-src:** `self` `data:` (favicons/icons may be data URIs)
- **default-src:** `self`
- **frame-ancestors:** `none` (this is a standalone PWA, not embeddable)
- **base-uri:** `self`
- **form-action:** `self`

### vercel.json

Add a `Content-Security-Policy` header to the existing headers block. Keep
the existing `X-Content-Type-Options` and `Referrer-Policy`.

```json
"headers": [
  {
    "source": "/(.*)",
    "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "Referrer-Policy", "value": "strict-origin-when-cross-origin" },
      { "key": "Content-Security-Policy", "value": "default-src 'self'; connect-src 'self' https://openrouter.ai https://api.github.com https://integrate.api.nvidia.com http://localhost:* http://127.0.0.1:*; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" }
    ]
  }
]
```

### Critical verification (do NOT skip)

1. `npm run build` green (CSP doesn't affect build, but confirm).
2. **Deploy to Vercel preview** (or at minimum `npm run preview` locally)
   and load the app. Open DevTools → Console. **Zero CSP violations.**
   If you see `Refused to apply inline style` or `Refused to connect to`,
   the directive is wrong — fix before main.
3. Exercise: open Settings (inline styles), start a chat (fetch to
   /api/nim-proxy), open Bridge tab. Each must produce no CSP error.
4. **Only after preview is clean**, commit. In the commit body, note that
   preview was validated.

### Why this is last

If F-04 bricks the app, you want it isolated to its own commit so it's
trivially revertable. Landing it last means the other three findings are
already safely on main.

---

## Frozen contracts (re-read before each finding)

1. **`BridgeEnvelope` shape** (`src/lib/bridge/types.ts`) — do not change
   the existing fields. F-01 adds `expires_at` to `MailboxFile` (an
   internal mailbox type, NOT a `BridgeEnvelope` field) — safe.
2. **`ChatEntry` shape** (`src/lib/chat-engine.ts`) — existing fields do
   not change. F-19 adds an optional `remote?: boolean` — backward
   compatible. F-15 wraps the *array* in an envelope, the element type
   is untouched.
3. **`public/sw.js` cache-key strategy** — do not touch (B2 landed the
   git-SHA injection). No B3 finding touches it.
4. **Pairing input UX** — the uncontrolled ref + 6-digit code is an earned
   invariant. F-01 changes expiry, NOT the input.

## Final gate (before push)

```
npx tsc -b      # 0 errors
npm run lint    # 0 errors (2 pre-existing App.tsx warnings tolerated)
npm run build   # green; note the bundle size (F-22 should shrink it)
```

Then commit per-finding, push, and hand to GLM for audit. GLM will check:
- F-15 backward compat (bare-array v0 still loads)
- F-22 bundle size actually dropped + registry out of initial chunk
- F-19 `ChatEntry` only gained the optional field
- F-01 expiry surfaces honestly + pairing UX untouched
- F-04 CSP validated in preview (this is the one GLM will insist on proof for)

Good luck, DeepSeek. The F-04 CSP is the careful one — when in doubt, add a
directive rather than omit it, and validate in preview before main.
