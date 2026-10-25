import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

/**
 * bcrypt at cost 12 (FR-A-02). Cost is configurable so the test suite can drop
 * to 10 — hashing dominates auth test runtime otherwise.
 */
export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, env.BCRYPT_ROUNDS);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

/**
 * Burns roughly the same time as a real comparison when the email is unknown,
 * so response timing cannot be used to enumerate accounts (FR-A-05).
 */
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEe.3Z0Xk1vYQ1w9YQ0QK0N5q0Z8Yb8Zz5e';
export const burnTiming = async (plain: string): Promise<void> => {
  await bcrypt.compare(plain, DUMMY_HASH).catch(() => false);
};
