import { useCallback, useState } from 'react';
import { IdeaCanvas } from './IdeaCanvas';
import type { IdearioYAML, SavedIdeario } from '../types/ideario';

interface IdeasTabProps {
  /** The ideario currently open in the canvas (may be null). */
  ideario: IdearioYAML | null;
  savedIdeas: SavedIdeario[];
  /** Load a saved note into the canvas above. */
  onOpenIdea: (idea: SavedIdeario) => void;
}

interface NoteComment {
  ts: number;
  text: string;
}

type NoteComments = Record<string, NoteComment[]>;

const COMMENTS_KEY = 'ideario-note-comments';

function loadComments(): NoteComments {
  try {
    const raw = window.localStorage.getItem(COMMENTS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as NoteComments;
      }
    }
  } catch {
    // storage unavailable / corrupted — start empty
  }
  return {};
}

function saveComments(comments: NoteComments): void {
  try {
    window.localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
  } catch {
    // storage unavailable — fail silently
  }
}

/** Display date for a note: created_at (schema v1.1+) or the id timestamp. */
function noteDate(idea: SavedIdeario): string {
  let d: Date | null = null;
  if (idea.created_at) {
    const parsed = new Date(idea.created_at);
    if (!Number.isNaN(parsed.getTime())) d = parsed;
  }
  if (!d) {
    const match = /^idea-(\d+)-/.exec(idea.id);
    if (match) d = new Date(Number(match[1]));
  }
  return d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Undated';
}

/**
 * Ideas tab: the live IdeaCanvas for the current ideario plus the saved
 * ideas rendered as collapsible "jotted notes" — collapsed shows title +
 * date; expanded shows summary, tags, transcript, and inline comments
 * (persisted per F3 in `ideario-note-comments`).
 */
export function IdeasTab({ ideario, savedIdeas, onOpenIdea }: IdeasTabProps) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [comments, setComments] = useState<NoteComments>(loadComments);
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const toggle = useCallback((id: string) => {
    setOpenId((prev) => (prev === id ? null : id));
  }, []);

  const addComment = useCallback((ideaId: string) => {
    const text = (drafts[ideaId] ?? '').trim();
    if (!text) return;
    const next: NoteComments = {
      ...comments,
      [ideaId]: [...(comments[ideaId] ?? []), { ts: Date.now(), text }],
    };
    setComments(next);
    saveComments(next);
    setDrafts((prev) => ({ ...prev, [ideaId]: '' }));
  }, [comments, drafts]);

  return (
    <div className="h-full flex flex-col min-h-0 p-4 gap-4">
      {/* Current ideario canvas */}
      <div className="ario-panel flex-none h-[38%] min-h-0">
        <IdeaCanvas ideario={ideario} />
      </div>

      {/* Jotted notes */}
      <div className="flex-1 min-h-0 overflow-y-auto chat-scroll flex flex-col gap-2 pr-1">
        {savedIdeas.length === 0 ? (
          <p className="text-ario-muted text-sm text-center py-6">
            No saved ideas yet — say “save this” in Voice Chat to jot one down.
          </p>
        ) : (
          savedIdeas.map((idea) => {
            const open = openId === idea.id;
            const ideaComments = comments[idea.id] ?? [];
            return (
              <div
                key={idea.id}
                className="flex-none rounded-2xl bg-ario-card border border-white/10 overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggle(idea.id)}
                  aria-expanded={open}
                  className="w-full min-h-14 px-4 flex items-center justify-between gap-3 text-left
                             focus:outline-none focus:ring-2 focus:ring-inset focus:ring-ario-turquoise/50"
                >
                  <span className="flex-1 min-w-0">
                    <span className="block text-ario-text text-base font-medium truncate">
                      {idea.title || 'Untitled note'}
                    </span>
                    <span className="block text-ario-muted text-xs mt-0.5">{noteDate(idea)}</span>
                  </span>
                  <svg
                    className={`w-5 h-5 flex-none text-ario-muted transition-transform ${open ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.8}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </button>

                {open && (
                  <div className="history-expand px-4 pb-4 flex flex-col gap-3 border-t border-white/5">
                    {idea.summary && (
                      <p className="text-ario-text text-sm leading-relaxed whitespace-pre-wrap pt-3">
                        {idea.summary}
                      </p>
                    )}
                    {idea.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {idea.tags.map((tag) => (
                          <span
                            key={tag}
                            className="px-2 py-1 text-xs rounded-full bg-ario-turquoise/10 text-ario-turquoise border border-ario-turquoise/20"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                    {idea.transcript && (
                      <div>
                        <p className="text-ario-muted text-xs uppercase tracking-wider mb-1">Transcript</p>
                        <p className="text-ario-muted text-sm leading-relaxed whitespace-pre-wrap">
                          {idea.transcript}
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => onOpenIdea(idea)}
                      className="self-start min-h-12 px-4 rounded-2xl bg-ario-turquoise/10 border border-ario-turquoise/40
                                 text-ario-turquoise text-sm font-medium transition-colors
                                 hover:bg-ario-turquoise/20 focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
                    >
                      Open in canvas
                    </button>

                    {/* Inline comments (persisted per F3) */}
                    <div className="border-t border-white/5 pt-3 flex flex-col gap-2">
                      <p className="text-ario-muted text-xs uppercase tracking-wider">
                        Comments{ideaComments.length > 0 ? ` (${ideaComments.length})` : ''}
                      </p>
                      {ideaComments.map((comment) => (
                        <div key={comment.ts} className="rounded-xl bg-ario-grey/60 px-3 py-2">
                          <p className="text-ario-text text-sm whitespace-pre-wrap">{comment.text}</p>
                          <p className="text-ario-muted/70 text-xs mt-1">
                            {new Date(comment.ts).toLocaleString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                      ))}
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={drafts[idea.id] ?? ''}
                          onChange={(e) =>
                            setDrafts((prev) => ({ ...prev, [idea.id]: e.target.value }))
                          }
                          placeholder="Add a comment…"
                          enterKeyHint="done"
                          className="flex-1 min-h-12 px-4 rounded-2xl bg-ario-grey/60 text-ario-text text-sm
                                     border border-white/10 placeholder:text-ario-muted/60
                                     focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50"
                          style={{ userSelect: 'text', WebkitUserSelect: 'text' }}
                          aria-label={`Comment on ${idea.title || 'note'}`}
                        />
                        <button
                          type="button"
                          onClick={() => addComment(idea.id)}
                          disabled={!(drafts[idea.id] ?? '').trim()}
                          className="min-h-12 min-w-12 flex-none flex items-center justify-center rounded-2xl
                                     bg-ario-turquoise/15 border border-ario-turquoise/50 text-ario-turquoise
                                     transition-all active:scale-95 hover:bg-ario-turquoise/25
                                     focus:outline-none focus:ring-2 focus:ring-ario-turquoise/50
                                     disabled:opacity-40 disabled:cursor-not-allowed"
                          aria-label="Add comment"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
