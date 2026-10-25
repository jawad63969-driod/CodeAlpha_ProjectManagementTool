import type { NextFunction, Request, Response } from 'express';
import type { OrgRole } from '@taskforge/shared';
import { AppError } from '../core/errors.js';
import { authRepository } from '../auth/auth.repository.js';
import { extractBearer, verifyAccessToken } from '../auth/tokens.js';
import type { AuthContext } from '../auth/context.js';

/**
 * Verifies the access token, then confirms the account and its membership are
 * still active.
 *
 * The membership lookup is one point read on a unique index. It could be skipped
 * by trusting the role inside the JWT, but then a deactivated member would keep
 * working until their token expired. Correctness wins over one indexed read.
 */
export const authenticate = (req: Request, _res: Response, next: NextFunction): void => {
  try {
    const token = extractBearer(req.get('authorization'));
    if (!token) throw AppError.unauthenticated('No access token supplied');

    const claims = verifyAccessToken(token);

    const user = authRepository.findUserById(claims.sub);
    if (!user || !user.isActive) throw AppError.unauthenticated('This account is no longer active');

    const membership = authRepository.findMembership(claims.org, claims.sub);
    if (!membership) throw AppError.unauthenticated('You are no longer a member of this workspace');
    if (membership.status !== 'ACTIVE') throw AppError.forbidden('Your access to this workspace is suspended');

    const auth: AuthContext = {
      userId: user.id,
      organizationId: claims.org,
      orgRole: membership.role as OrgRole,
      sessionId: claims.sid ?? null,
      projectRoleCache: new Map(),
    };
    req.auth = auth;
    next();
  } catch (error) {
    next(error);
  }
};

/** Narrows `req.auth` for handlers that run after `authenticate`. */
export const requireAuth = (req: Request): AuthContext => {
  if (!req.auth) throw AppError.unauthenticated();
  return req.auth;
};
