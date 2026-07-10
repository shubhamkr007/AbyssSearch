import {
  generateApiKey,
  hashApiKey,
  keyPrefixOf,
  verifyApiKey,
} from './api-key.util';

describe('api-key util', () => {
  it('generates a pk_live_ key whose prefix is derivable', () => {
    const { plaintext, keyPrefix } = generateApiKey();
    expect(plaintext.startsWith('pk_live_')).toBe(true);
    expect(keyPrefix).toBe(plaintext.slice(0, 16));
    expect(keyPrefixOf(plaintext)).toBe(keyPrefix);
  });

  it('hashes and verifies the same key', async () => {
    const { plaintext } = generateApiKey();
    const hash = await hashApiKey(plaintext);
    expect(hash).not.toContain(plaintext);
    expect(await verifyApiKey(hash, plaintext)).toBe(true);
  });

  it('rejects a wrong key', async () => {
    const { plaintext } = generateApiKey();
    const hash = await hashApiKey(plaintext);
    expect(await verifyApiKey(hash, plaintext + 'x')).toBe(false);
  });

  it('returns false for a malformed hash instead of throwing', async () => {
    expect(await verifyApiKey('not-a-hash', 'whatever')).toBe(false);
  });

  it('produces distinct keys across calls', () => {
    expect(generateApiKey().plaintext).not.toBe(generateApiKey().plaintext);
  });
});
