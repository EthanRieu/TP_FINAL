import { Schema, model } from 'mongoose';
import { IAuction } from '../types';

const AuctionSchema = new Schema<IAuction>(
  {
    product:  { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    seller:   { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['draft', 'scheduled', 'active', 'closed', 'settled', 'cancelled'],
      default: 'draft',
    },
    startAt: { type: Date, required: true },
    endAt:   { type: Date, required: true },
    startPrice:   { type: Number, required: true, min: 0 },
    currentPrice: { type: Number, required: true, min: 0 },
    reservePrice: { type: Number, select: false },
    reserveMet:   { type: Boolean, default: false },
    currentWinner:  { type: Schema.Types.ObjectId, ref: 'User' },
    extensionCount: { type: Number, default: 0 },
    finalPrice: Number,
    commission: Number,
    winner:     { type: Schema.Types.ObjectId, ref: 'User' },
    watchers: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    cancelledAt:  Date,
    cancelReason: String,
  },
  { timestamps: true }
);

AuctionSchema.index({ status: 1, endAt: 1 });
AuctionSchema.index({ seller: 1 });
AuctionSchema.index({ product: 1 });

export const Auction = model<IAuction>('Auction', AuctionSchema);
