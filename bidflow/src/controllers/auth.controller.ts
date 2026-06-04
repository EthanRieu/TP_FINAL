import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { User } from '../models/User';
import { ApiError } from '../utils/ApiError';
import { wrap } from '../utils/asyncWrapper';
import { validate } from '../middleware/validate';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const register = wrap(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const exists = await User.findOne({ email });
  if (exists) throw new ApiError(409, 'Email déjà utilisé');

  const user = await User.create({ email, password });
  const token = jwt.sign(
    { userId: user._id, roles: user.roles },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as any },
  );
  res.status(201).json({ token });
});

const login = wrap(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+password');
  if (!user) throw new ApiError(401, 'Identifiants invalides');

  const ok = await user.comparePassword(password);
  if (!ok) throw new ApiError(401, 'Identifiants invalides');

  const token = jwt.sign(
    { userId: user._id, roles: user.roles },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN ?? '7d') as any },
  );
  res.json({ token });
});

const upgradeSeller = wrap(async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.hasRole('seller')) throw new ApiError(400, 'Déjà vendeur');

  await User.findByIdAndUpdate(user._id, {
    'sellerRequest.status': 'pending',
    'sellerRequest.requestedAt': new Date(),
  });
  res.json({ message: 'Demande envoyée, en attente de validation' });
});

export const authController = {
  register,
  login,
  upgradeSeller,
  registerSchema,
  loginSchema,
};
