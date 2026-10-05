/**
 * One HTTP path for every upstream institution.
 *
 * All outbound requests are time-bounded and retried a fixed number of times,
 * because a slow museum API must not become a slow page. Retries happen only on
 * transport failures and 5xx: a 404 or a 400 is an answer and repeating it just
 * wastes the institution's capacity.
 */

export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly provider: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}

const USER_AGENT =
  "OpenPlate/1.0 (rights clearance desk; https://github.com/aniruddhaadak80/openplate)";

export interface FetchOptions {
  provider: string;
  timeoutMs?: number;
  retries?: number;
  /** Next.js data-cache lifetime in seconds. */
  revalidate?: number;
}

export async function fetchJson<T>(url: string, options: FetchOptions): Promise<T> {
  const timeoutMs = options.timeoutMs ?? 6000;
  const retries = options.retries ?? 1;
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json", "user-agent": USER_AGENT },
        next: { revalidate: options.revalidate ?? 900 },
      });
      if (!response.ok) {
        const retryable = response.status >= 500;
        if (!retryable || attempt === retries) {
          throw new UpstreamError(
            `${options.provider} answered HTTP ${response.status}`,
            options.provider,
            response.status,
          );
        }
        lastError = new UpstreamError(
          `${options.provider} answered HTTP ${response.status}`,
          options.provider,
          response.status,
        );
        continue;
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (error instanceof UpstreamError && error.status && error.status < 500) throw error;
      if (attempt === retries) break;
    }
  }

  throw new UpstreamError(
    `${options.provider} did not answer: ${lastError instanceof Error ? lastError.message : "unknown error"}`,
    options.provider,
  );
}

/** ISO timestamp used for every provenance record. */
export function nowIso(): string {
  return new Date().toISOString();
}