import { Schema, model } from 'mongoose';
import { IProduct } from '../types';

const ProductSchema = new Schema<IProduct>(
  {
    seller: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, maxlength: 5000 },
    photos: {
      type: [String],
      validate: [(v: string[]) => v.length <= 5, 'Maximum 5 photos autorisées'],
    },
    category: { type: String, required: true },
    condition: {
      type: String,
      enum: ['new', 'like_new', 'good', 'fair', 'poor'],
      required: true,
    },
    status: {
      type: String,
      enum: ['draft', 'in_auction', 'sold', 'suspended'],
      default: 'draft',
    },
    suspendedAt: Date,
    suspendedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

export const Product = model<IProduct>('Product', ProductSchema);
