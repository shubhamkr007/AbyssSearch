import { randomBytes } from 'node:crypto';

import { Algorithm, hash, verify } from '@node-rs/argon2';

/**
 * Length of the human-visible key prefix stored in clear text for display and
 * fast candidate lookup (e.g. "pk_live_ab12cd"). The full key is only ever
 * shown once at issuance; we persist an argon2id hash of it.
 */
const PREFIX_LENGTH = 16;

export interface GeneratedKey {
  /** Full secret, returned to the caller exactly once. */
  plaintext: string;
  /** Clear-text prefix persisted for display + lookup. */
  keyPrefix: string;
}

export function generateApiKey(): GeneratedKey {
  const random = randomBytes(24).toString('base64url');
  const plaintext = `pk_live_${random}`;
  return { plaintext, keyPrefix: keyPrefixOf(plaintext) };
}

export function keyPrefixOf(plaintext: string): string {
  return plaintext.slice(0, PREFIX_LENGTH);
}

export async function hashApiKey(plaintext: string): Promise<string> {
  return hash(plaintext, { algorithm: Algorithm.Argon2id });
}

export async function verifyApiKey(
  storedHash: string,
  plaintext: string,
): Promise<boolean> {
  try {
    return await verify(storedHash, plaintext);
  } catch {
    // Malformed hash or mismatch -> treat as non-match rather than throwing.
    return false;
  }
}
