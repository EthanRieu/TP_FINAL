import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { JwtPayload } from '../types';
import { ApiError } from '../utils/ApiError';

export async function authenticate(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new ApiError(401, 'Token manquant');

    const payload = jwt.verify(header.slice(7), process.env.JWT_SECRET!) as JwtPayload;
    const user = await User.findById(payload.userId);

    if (!user || !user.isActive) throw new ApiError(401, 'Utilisateur invalide ou suspendu');
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(new ApiError(401, 'Token invalide'));
  }
}
