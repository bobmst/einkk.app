// Documents from a contract newer than this page knows (#90). The engine bumps a contract's
// minor version for optional fields the page can ignore, and its major version only for a
// change the page can't read safely. A document of a higher major is set aside, never drawn,
// and the page asks to be reloaded: a cached old page meets the new documents first.

/** The contract major versions this build of the page reads (contracts/*.schema.json). */
export const KNOWN_MAJOR = 0;

/** True when the document says it comes from a newer major contract than this page knows. */
export function tooNew(doc: unknown): boolean {
  if (!doc || typeof doc !== "object") return false;
  const version = (doc as { schema_version?: unknown }).schema_version;
  if (typeof version !== "string") return false;               // none stated: read as before
  const major = Number(version.split(".")[0]);
  return Number.isFinite(major) && major > KNOWN_MAJOR;
}

interface Docs {
  season: unknown;
  predictions: Record<string, unknown>;
  history: unknown;
  finals?: unknown;
}

/**
 * The same documents with every one too new for this page set aside as null: a season,
 * history or finals document, or a server's prediction (null, not removed, so the page
 * doesn't go and fetch it again by key). `outdated` says whether anything was, so the page
 * can ask to be reloaded.
 */
export function screenVersions<T extends Docs>(data: T): T & { outdated: boolean } {
  let outdated = false;
  const drop = <D>(doc: D): D | null => {
    if (tooNew(doc)) {
      outdated = true;
      return null;
    }
    return doc;
  };
  const predictions: Record<string, unknown> = {};
  for (const [server, p] of Object.entries(data.predictions)) predictions[server] = drop(p);
  return {
    ...data,
    season: drop(data.season),
    history: drop(data.history),
    ...(data.finals !== undefined ? { finals: drop(data.finals) } : {}),
    predictions,
    outdated,
  };
}
