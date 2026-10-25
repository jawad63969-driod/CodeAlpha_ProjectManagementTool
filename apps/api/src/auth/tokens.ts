import crypto from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AppError } from '../core/errors.js';

export interface AccessTokenClaims extends JwtPayload {
  sub: string;
  org: string;
  sid: string;
}

/** Short-lived, stateless. The membership row is still checked per request. */
export const signAccessToken = (claims: { userId: string; organizationId: string; sessionId: string }): string =>
  jwt.sign(
    { org: claims.organizationId, sid: claims.sessionId },
    env.JWT_ACCESS_SECRET,
    { subject: claims.userId, expiresIn: env.ACCESS_TOKEN_TTL as SignOptions['expiresIn'] },
  );

export const verifyAccessToken = (token: string): AccessTokenClaims => {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    if (typeof payload === 'string' || !payload.sub || typeof payload['org'] !== 'string') {
      throw AppError.unauthenticated('Malformed access token');
    }
    return payload as AccessTokenClaims;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) throw AppError.sessionExpired('Access token has expired');
    if (error instanceof AppError) throw error;
    throw AppError.unauthenticated('Invalid access token');
  }
};

/**
 * Refresh tokens are opaque random strings, not JWTs. There is nothing to read
 * in them, and only their SHA-256 hash is ever stored (ADR-002), so a database
 * leak does not yield usable tokens.
 */
export const generateRefreshToken = (): string => crypto.randomBytes(48).toString('base64url');

export const hashRefreshToken = (token: string): string =>
  crypto.createHash('sha256').update(token).digest('hex');

export const refreshTokenExpiry = (): string => {
  const expires = new Date();
  expires.setDate(expires.getDate() + env.REFRESH_TOKEN_TTL_DAYS);
  return expires.toISOString();
};

/** Seconds until the access token expires — returned to the client for silent refresh. */
export const accessTokenTtlSeconds = (): number => {
  const match = /^(\d+)([smhd])$/.exec(env.ACCESS_TOKEN_TTL);
  if (!match) return 900;
  const value = Number(match[1]);
  const unit = match[2] as 's' | 'm' | 'h' | 'd';
  return value * { s: 1, m: 60, h: 3600, d: 86400 }[unit];
};

export const extractBearer = (header: string | undefined): string | null => {
  if (!header) return null;
  return header.startsWith('Bearer ') ? header.slice(7).trim() || null : null;
};
