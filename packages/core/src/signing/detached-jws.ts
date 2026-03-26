import { CompactSign, compactVerify, decodeProtectedHeader, type CryptoKey } from 'jose';

const DETACHED_SEPARATOR = '..';

export async function signDetachedJws(
  payload: Uint8Array,
  privateKey: CryptoKey,
  kid: string,
  alg: string = 'ES256',
): Promise<string> {
  const jws = await new CompactSign(payload).setProtectedHeader({ alg, kid }).sign(privateKey);

  const parts = jws.split('.');
  return `${parts[0]}${DETACHED_SEPARATOR}${parts[2]}`;
}

export async function verifyDetachedJws(
  signature: string,
  payload: Uint8Array,
  publicKey: CryptoKey,
): Promise<{ valid: true; kid: string } | { valid: false; error: string }> {
  try {
    const parts = signature.split('..');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return { valid: false, error: 'Invalid detached JWS format: expected header..signature' };
    }

    const header = decodeProtectedHeader(`${parts[0]}..${parts[1]}`);
    const kid = header.kid;
    if (!kid) {
      return { valid: false, error: 'Missing kid in JWS header' };
    }

    const payloadB64 = bufferToBase64Url(payload);
    const fullJws = `${parts[0]}.${payloadB64}.${parts[1]}`;

    await compactVerify(fullJws, publicKey);
    return { valid: true, kid };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown verification error';
    return { valid: false, error: message };
  }
}

export function extractKidFromSignature(signature: string): string | null {
  try {
    const parts = signature.split('..');
    if (parts.length !== 2 || !parts[0]) return null;
    const header = decodeProtectedHeader(`${parts[0]}..${parts[1]}`);
    return header.kid ?? null;
  } catch {
    return null;
  }
}

function bufferToBase64Url(buf: Uint8Array): string {
  const binStr = Array.from(buf, (b) => String.fromCharCode(b)).join('');
  return btoa(binStr).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
