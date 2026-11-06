// The display clock (solo_raid_predict ADR 0007): the time the page renders as now.
// Real in production, always. In rehearsal mode (uat and previews, which /api/health
// reports as mode "rehearsal") a link can freeze it, to show the site exactly as it
// stood at a chosen moment:
//   ?at=<ISO time>  freeze the clock there;
//   ?frame=<id>     read the outbox documents under frames/<id>/ (a frame the private
//                   engine computed for one moment) with the clock frozen at that
//                   moment (frames/<id>/frame.json, contracts/frame.schema.json).
// Only the display is frozen: the Worker's intake still checks the real time, so the
// report forms are disabled while it is.

const FRAME_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

let frozen: number | null = null;

/** The time the page shows as now. */
export function now(): number {
  return frozen ?? Date.now();
}

/** The frozen instant, or null when the clock is real. */
export function frozenAt(): number | null {
  return frozen;
}

/** Freeze the clock at `ms`, or let it run (null). Only `applyView` and tests call it. */
export function freeze(ms: number | null): void {
  frozen = ms;
}

export interface View {
  frame: string | null;          // the frame's id, read from frames/<id>/
  at: number | null;             // ?at=, ms
}

const REAL: View = { frame: null, at: null };

/**
 * What the link asks for, honoured in rehearsal mode only: production ignores ?at= and
 * ?frame= whatever the URL says. An unreadable time or a frame id outside the contract's
 * pattern is ignored too.
 */
export function viewFrom(mode: string | undefined, search: string): View {
  if (mode !== "rehearsal") return REAL;
  const q = new URLSearchParams(search);
  const frame = q.get("frame");
  // a "+09:00" offset typed into a link arrives as " 09:00" (+ is a space in a query)
  const raw = q.get("at")?.replace(" ", "+");
  const at = raw ? Date.parse(raw) : NaN;
  return {
    frame: frame && FRAME_ID.test(frame) ? frame : null,
    at: Number.isFinite(at) ? at : null,
  };
}

/** The outbox key of a document as the view reads it. */
export function viewKey(view: View, key: string): string {
  return view.frame ? `frames/${view.frame}/${key}` : key;
}
