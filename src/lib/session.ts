import { cookies } from "next/headers";
import { SESSION_COOKIE } from "./session-constants";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Read-only view of the anonymous owner id.
 *
 * The cookie itself is minted by src/proxy.ts. If it is somehow absent, which
 * would mean a caller skipped the proxy, a throwaway id is returned: that request
 * sees an empty docket instead of an error, and the next request gets a real
 * cookie. Returning an error here would be worse, because it would tell a
 * visitor their plates had vanished.
 */
export async function getOwnerId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(SESSION_COOKIE)?.value;
  if (existing && UUID_RE.test(existing)) return existing;
  return crypto.randomUUID();
}

export function isOwnerId(value: string): boolean {
  return UUID_RE.test(value);
}

const SHARE_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/**
 * A share code is a capability: whoever holds it can read that one docket. It is
 * therefore drawn from a 31-character alphabet with the ambiguous characters
 * removed, 12 characters long, which is roughly 2^59 of keyspace.
 */
export function newShareCode(length = 12): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) {
    code += SHARE_ALPHABET[byte % SHARE_ALPHABET.length];
  }
  return code;
}
