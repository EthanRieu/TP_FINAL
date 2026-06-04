import { Request, Response, NextFunction } from 'express';
import { ApiError } from '../utils/ApiError';

const lastBidTime = new Map<string, number>();

export function bidRateLimiter(req: Request, _res: Response, next: NextFunction) {
  const id = req.user?._id.toString();
  if (!id) return next();

  if (Date.now() - (lastBidTime.get(id) ?? 0) < 1000) {
    throw new ApiError(429, 'Une seule mise par seconde autorisée');
  }
  lastBidTime.set(id, Date.now());
  next();
}
