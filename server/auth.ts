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

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function isVerificationCodeValid(code: string, storedCode: string | null, expiresAt: Date | null): boolean {
  if (!storedCode || !expiresAt) {
    return false;
  }
  
  if (new Date() > expiresAt) {
    return false;
  }
  
  return code === storedCode;
}
