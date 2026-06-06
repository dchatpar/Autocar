/**
 * Password hashing helpers — bcrypt cost 12.
 *
 * Centralized so we never sprinkle the cost factor across the codebase.
 * Cost 12 is the project standard (~250ms per hash on modern hardware).
 */

import bcrypt from "bcrypt";

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new Error("Password must be a non-empty string");
  }
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  if (typeof plain !== "string" || typeof hash !== "string") {
    return false;
  }
  if (plain.length === 0 || hash.length === 0) {
    return false;
  }
  return bcrypt.compare(plain, hash);
}
