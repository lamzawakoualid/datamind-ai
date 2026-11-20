import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function resolveMasterKey(overrideKey?: string): Buffer {
  const raw = overrideKey || process.env.ENCRYPTION_MASTER_KEY || 'datamind-dev-master-key-change-in-production';
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex');
  }
  return crypto.createHash('sha256').update(raw).digest();
}

export function encryptSecret(plaintext: string, overrideKey?: string): string {
  const key = resolveMasterKey(overrideKey);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `enc:v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptSecret(ciphertext: string, overrideKey?: string): string {
  if (!ciphertext.startsWith('enc:v1:')) {
    throw new Error('Format de secret chiffré invalide.');
  }
  const parts = ciphertext.split(':');
  if (parts.length !== 5) {
    throw new Error('Structure AES-256-GCM corrompue.');
  }
  const [, , ivHex, tagHex, dataHex] = parts;
  const key = resolveMasterKey(overrideKey);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ]);
  return decrypted.toString('utf8');
}

export function maskEncryptedPreview(ciphertext: string): string {
  if (!ciphertext) return 'Non défini';
  const tail = ciphertext.slice(-6);
  return `AES-256-GCM ••••••${tail}`;
}
