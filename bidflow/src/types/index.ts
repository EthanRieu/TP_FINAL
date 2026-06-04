import { Document, Types } from 'mongoose';

export type UserRole = 'buyer' | 'seller' | 'moderator';
export type SellerRequestStatus = 'pending' | 'approved' | 'rejected';
export type ProductStatus = 'draft' | 'in_auction' | 'sold' | 'suspended';
export type ProductCondition = 'new' | 'like_new' | 'good' | 'fair' | 'poor';
export type AuctionStatus = 'draft' | 'scheduled' | 'active' | 'closed' | 'settled' | 'cancelled';

export interface IUser extends Document {
  email: string;
  password: string;
  roles: UserRole[];
  isActive: boolean;
  sellerRequest?: { status: SellerRequestStatus; requestedAt: Date };
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidate: string): Promise<boolean>;
  hasRole(role: UserRole): boolean;
}

export interface IProduct extends Document {
  seller: Types.ObjectId;
  title: string;
  description: string;
  photos: string[];
  category: string;
  condition: ProductCondition;
  status: ProductStatus;
  suspendedAt?: Date;
  suspendedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAuction extends Document {
  product: Types.ObjectId;
  seller: Types.ObjectId;
  status: AuctionStatus;
  startAt: Date;
  endAt: Date;
  startPrice: number;
  currentPrice: number;
  reservePrice?: number;
  reserveMet: boolean;
  currentWinner?: Types.ObjectId;
  extensionCount: number;
  finalPrice?: number;
  commission?: number;
  winner?: Types.ObjectId;
  watchers: Types.ObjectId[];
  cancelledAt?: Date;
  cancelReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IBid extends Document {
  auction: Types.ObjectId;
  bidder: Types.ObjectId;
  amount: number;
  isAuto: boolean;
  confirmedOverride: boolean;
  createdAt: Date;
}

export interface JwtPayload {
  userId: string;
  roles: UserRole[];
}
