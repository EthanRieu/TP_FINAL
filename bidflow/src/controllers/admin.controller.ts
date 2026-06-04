import { Request, Response } from 'express';
import { z } from 'zod';
import { Auction } from '../models/Auction';
import { Product } from '../models/Product';
import { User } from '../models/User';
import { wrap } from '../utils/asyncWrapper';
import { ApiError } from '../utils/ApiError';
import { getIO } from '../socket';
import { EVENTS } from '../socket/events';

// ── Reporting ────────────────────────────────────────────────────────────────

export const getReports = wrap(async (_req: Request, res: Response) => {
  const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [byStatus, conversion, topSellers, commission] = await Promise.all([
    // enchères par statut
    Auction.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    // taux de conversion settled / (settled + closed)
    Auction.aggregate([
      { $match: { status: { $in: ['settled', 'closed'] } } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          settled: { $sum: { $cond: [{ $eq: ['$status', 'settled'] }, 1, 0] } },
        },
      },
      { $project: { rate: { $divide: ['$settled', '$total'] }, _id: 0 } },
    ]),
    // top 5 vendeurs par chiffre d'affaires
    Auction.aggregate([
      { $match: { status: 'settled' } },
      { $group: { _id: '$seller', revenue: { $sum: '$finalPrice' } } },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'u',
        },
      },
      { $unwind: '$u' },
      { $project: { email: '$u.email', revenue: 1, _id: 0 } },
    ]),
    // total des commissions sur les 30 derniers jours
    Auction.aggregate([
      { $match: { status: 'settled', updatedAt: { $gte: since30d } } },
      { $group: { _id: null, total: { $sum: '$commission' } } },
    ]),
  ]);

  res.json({
    byStatus,
    conversion: conversion[0] ?? null,
    topSellers,
    commission: commission[0] ?? null,
  });
});

// ── Users ────────────────────────────────────────────────────────────────────

export const suspendUser = wrap(async (req: Request, res: Response) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: false },
    { new: true },
  );
  if (!user) throw new ApiError(404, 'Utilisateur introuvable');

  // Cascade : annuler toutes les enchères actives du vendeur
  const auctions = await Auction.find({
    seller: user._id,
    status: { $in: ['active', 'scheduled'] },
  });
  for (const auction of auctions) {
    await Auction.findByIdAndUpdate(auction._id, {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason: 'Vendeur suspendu',
    });
    await Product.findByIdAndUpdate(auction.product, { status: 'suspended' });
    getIO().to(auction._id.toString()).emit(EVENTS.AUCTION_CLOSED, {
      auctionId: auction._id,
      winner: null,
      finalPrice: null,
      commission: null,
      reserveMet: false,
    });
  }

  res.json({ message: 'Utilisateur suspendu', userId: user._id });
});

export const activateUser = wrap(async (req: Request, res: Response) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { isActive: true },
    { new: true },
  );
  if (!user) throw new ApiError(404, 'Utilisateur introuvable');
  res.json({ message: 'Utilisateur réactivé', userId: user._id });
});

// ── Products ─────────────────────────────────────────────────────────────────

export const suspendProduct = wrap(async (req: Request, res: Response) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    {
      status: 'suspended',
      suspendedAt: new Date(),
      suspendedBy: req.user!._id,
    },
    { new: true },
  );
  if (!product) throw new ApiError(404, 'Produit introuvable');

  // Cascade : annuler l'enchère active liée à ce produit
  const auction = await Auction.findOneAndUpdate(
    { product: product._id, status: { $in: ['active', 'scheduled'] } },
    {
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelReason: 'Produit suspendu',
    },
    { new: true },
  );
  if (auction) {
    getIO().to(auction._id.toString()).emit(EVENTS.AUCTION_CLOSED, {
      auctionId: auction._id,
      winner: null,
      finalPrice: null,
      commission: null,
      reserveMet: false,
    });
  }

  res.json({ message: 'Produit suspendu', productId: product._id });
});

export const activateProduct = wrap(async (req: Request, res: Response) => {
  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { status: 'draft', $unset: { suspendedAt: '', suspendedBy: '' } },
    { new: true }
  );
  if (!product) throw new ApiError(404, 'Produit introuvable');
  res.json({ message: 'Produit réactivé', productId: product._id });
});


// ── Users ─────────────────────────────────────────────────────────────────────

export const listUsers = wrap(async (_req: Request, res: Response) => {
  const users = await User.find().select('email roles isActive createdAt').sort({ createdAt: -1 });
  res.json(users);
});

// ── Seller requests ───────────────────────────────────────────────────────────

export const listSellerRequests = wrap(async (_req: Request, res: Response) => {
  const users = await User.find({ 'sellerRequest.status': 'pending' }).select(
    'email sellerRequest createdAt',
  );
  res.json(users);
});

const sellerRequestSchema = z.object({
  action: z.enum(['approve', 'reject']),
});

export const handleSellerRequest = wrap(async (req: Request, res: Response) => {
  const { action } = sellerRequestSchema.parse(req.body);
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'Utilisateur introuvable');
  if (user.sellerRequest?.status !== 'pending') {
    throw new ApiError(400, 'Aucune demande en attente');
  }

  if (action === 'approve') {
    await User.findByIdAndUpdate(user._id, {
      $addToSet: { roles: 'seller' },
      'sellerRequest.status': 'approved',
    });
  } else {
    await User.findByIdAndUpdate(user._id, {
      'sellerRequest.status': 'rejected',
    });
  }
  res.json({
    message: action === 'approve' ? 'Demande approuvée' : 'Demande refusée',
  });
});
