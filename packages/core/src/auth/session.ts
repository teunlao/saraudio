export type ProviderId = string;

export interface SessionAuthIssueResult {
  token: string;
  /** Time to live in seconds (client may subtract a small safety buffer). */
  expiresIn: number;
  /** Provider identifier (e.g., 'deepgram', 'soniox'). */
  provider: ProviderId;
  /** Optional provider-specific metadata useful for logs/diagnostics. */
  meta?: Record<string, unknown>;
}
/**
 * Minimal server-side adapter a provider must implement to issue short‑lived
 * session credentials (access token / temporary key) for browser clients.
 *
 * The adapter is intentionally small and transport‑agnostic: it does not expose
 * any client streaming/batch behavior — only a single "issue" operation that
 * returns a normalized { token, expiresIn } payload.
 */
export interface SessionAuthAdapter {
  /** Stable identifier used by routers and logs. */
  id: ProviderId;
  /**
   * Issue a short‑lived credential for the current session.
   * @param input Optional inputs like desired TTL.
   */
  issue(input?: { ttlSeconds?: number }): Promise<SessionAuthIssueResult>;
}
