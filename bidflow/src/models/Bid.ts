import { Schema, model } from 'mongoose';
import { IBid } from '../types';

const BidSchema = new Schema<IBid>(
  {
    auction:           { type: Schema.Types.ObjectId, ref: 'Auction', required: true, index: true },
    bidder:            { type: Schema.Types.ObjectId, ref: 'User', required: true },
    amount:            { type: Number, required: true, min: 0 },
    isAuto:            { type: Boolean, default: false },
    confirmedOverride: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Bid = model<IBid>('Bid', BidSchema);
