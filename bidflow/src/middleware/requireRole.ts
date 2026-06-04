import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../types';
import { ApiError } from '../utils/ApiError';

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) throw new ApiError(401, 'Non authentifié');
    const ok = roles.some((r) => req.user!.roles.includes(r));
    if (!ok) throw new ApiError(403, `Rôle requis : ${roles.join(' ou ')}`);
    next();
  };
}
