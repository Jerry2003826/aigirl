import bcrypt from 'bcrypt';
import crypto from 'crypto';

const SALT_ROUNDS = 10;
const VERIFICATION_CODE_LENGTH = 6;
const VERIFICATION_CODE_EXPIRY_MINUTES = 15;

export function generateVerificationCode(): string {
  const code = crypto.randomInt(100000, 999999).toString();
  return code;
}

export function getVerificationCodeExpiry(): Date {
  const expiry = new Date();
  expiry.setMinutes(expiry.getMinutes() + VERIFICATION_CODE_EXPIRY_MINUTES);
  return expiry;
}

/** Hash verification code before storing (L5: never store plaintext codes). */
export async function hashVerificationCode(code: string): Promise<string> {
  return bcrypt.hash(code, 10);
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/** Backward compat: detect bcrypt hash vs legacy plaintext. */
function timingSafeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export async function isVerificationCodeValid(
  code: string,
  stored: string | null,
  expiresAt: Date | null
): Promise<boolean> {
  if (!stored || !expiresAt) return false;
  if (new Date() > expiresAt) return false;
  if (stored.startsWith('$2')) {
    return bcrypt.compare(code, stored);
  }
  return timingSafeEqual(code, stored);
}
