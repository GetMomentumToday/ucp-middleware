import { generateKeyPair, exportJWK, importJWK, type CryptoKey } from 'jose';
import type { JsonWebKey } from '../types/commerce.js';

export interface SigningKeyPair {
  readonly privateKey: CryptoKey;
  readonly publicJwk: JsonWebKey;
}

const ALG = 'ES256';
const CRV = 'P-256';

export async function generateSigningKeyPair(kid: string): Promise<SigningKeyPair> {
  const { privateKey, publicKey } = await generateKeyPair(ALG, { extractable: true });
  const jwk = await exportJWK(publicKey);
  const publicJwk: JsonWebKey = {
    kty: jwk['kty']!,
    kid,
    crv: jwk['crv']!,
    x: jwk['x']!,
    y: jwk['y']!,
    use: 'sig',
    alg: ALG,
  };
  return { privateKey, publicJwk };
}

export async function importPrivateKey(jwkJson: string): Promise<CryptoKey> {
  const parsed = JSON.parse(jwkJson) as Record<string, unknown>;
  return importJWK(parsed, ALG) as Promise<CryptoKey>;
}

export async function importPublicKeyFromJwk(jwk: JsonWebKey): Promise<CryptoKey> {
  return importJWK(
    { kty: jwk.kty, crv: jwk['crv'] as string, x: jwk['x'] as string, y: jwk['y'] as string },
    ALG,
  ) as Promise<CryptoKey>;
}

export function buildKeyId(prefix: string): string {
  const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `${prefix}_${timestamp}`;
}

export { ALG, CRV };
