import { Request, Response } from 'express';
import { z } from 'zod';
import { Auction } from '../models/Auction';
import { Product } from '../models/Product';
import { auctionService } from '../services/auction.service';
import { ApiError } from '../utils/ApiError';
import { wrap } from '../utils/asyncWrapper';

const createSchema = z.object({
  productId: z.string(),
  startPrice: z.number().positive(),
  reservePrice: z.number().positive().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
});

export const createAuction = wrap(async (req: Request, res: Response) => {
  const body = createSchema.parse(req.body);
  const sellerId = req.user!._id.toString();

  const product = await Product.findById(body.productId);
  if (!product) throw new ApiError(404, 'Produit introuvable');
  if (product.seller.toString() !== sellerId)
    throw new ApiError(403, 'Ce produit ne vous appartient pas');
  if (product.status !== 'draft')
    throw new ApiError(400, 'Le produit doit être en draft');

  const startAt = new Date(body.startAt);
  const endAt = new Date(body.endAt);
  if (endAt <= startAt)
    throw new ApiError(400, 'endAt doit être après startAt');

  const auction = await Auction.create({
    product: body.productId,
    seller: sellerId,
    startPrice: body.startPrice,
    currentPrice: body.startPrice,
    reservePrice: body.reservePrice,
    startAt,
    endAt,
    status: 'scheduled',
  });

  await Product.findByIdAndUpdate(body.productId, { status: 'in_auction' });

  res.status(201).json(auction);
});

export const getAuctions = wrap(async (req: Request, res: Response) => {
  const { status } = req.query;
  const filter: Record<string, unknown> = {};
  if (status) filter.status = status;

  const auctions = await Auction.find(filter)
    .populate('product', 'title photos category')
    .populate('seller', 'email')
    .sort({ createdAt: -1 });

  res.json(auctions);
});

export const getAuction = wrap(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  await auctionService.lazyClose(id);

  const auction = await Auction.findById(id)
    .populate('product', 'title photos description category condition')
    .populate('seller', 'email')
    .populate('currentWinner', 'email')
    .populate('winner', 'email');

  if (!auction) throw new ApiError(404, 'Enchère introuvable');

  res.json(auction);
});

export const startAuction = wrap(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const auction = await Auction.findById(id);
  if (!auction) throw new ApiError(404, 'Enchère introuvable');
  if (auction.seller.toString() !== req.user!._id.toString())
    throw new ApiError(403, 'Non autorisé');
  if (auction.status !== 'scheduled')
    throw new ApiError(400, "L'enchère doit être en statut scheduled");

  const updated = await Auction.findByIdAndUpdate(
    id,
    { status: 'active' },
    { new: true },
  );

  auctionService.scheduleClose(id, auction.endAt);

  res.json(updated);
});

export const cancelAuction = wrap(async (req: Request, res: Response) => {
  const id = req.params.id as string;
  const auction = await Auction.findById(id);
  if (!auction) throw new ApiError(404, 'Enchère introuvable');

  const isSeller = auction.seller.toString() === req.user!._id.toString();
  const isModerator = req.user!.roles.includes('moderator');
  if (!isSeller && !isModerator) throw new ApiError(403, 'Non autorisé');

  if (!['scheduled', 'active'].includes(auction.status)) {
    throw new ApiError(400, "Impossible d'annuler une enchère terminée");
  }

  const { reason } = req.body;

  await Auction.findByIdAndUpdate(id, {
    status: 'cancelled',
    cancelledAt: new Date(),
    cancelReason: reason,
  });

  await Product.findByIdAndUpdate(auction.product, { status: 'draft' });

  res.json({ message: 'Enchère annulée' });
});
