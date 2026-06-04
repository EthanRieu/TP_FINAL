import { Request, Response } from 'express';
import { z } from 'zod';
import { Bid } from '../models/Bid';
import { bidService } from '../services/bid.service';
import { ApiError } from '../utils/ApiError';
import { wrap } from '../utils/asyncWrapper';

const placeBidSchema = z.object({
  amount: z.number().positive(),
  confirmed: z.boolean().optional().default(false),
});

export const placeBid = wrap(async (req: Request, res: Response) => {
  const { amount, confirmed } = placeBidSchema.parse(req.body);

  const bid = await bidService.placeBid(
    req.params.id as string,
    req.user!._id.toString(),
    amount,
    confirmed,
  );

  res.status(201).json(bid);
});

export const getBids = wrap(async (req: Request, res: Response) => {
  const bids = await Bid.find({ auction: req.params.id as string })
    .populate('bidder', 'email')
    .sort({ createdAt: -1 });

  if (!bids) throw new ApiError(404, 'Enchère introuvable');

  res.json(bids);
});
