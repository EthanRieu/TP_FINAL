import { Schema, model } from 'mongoose';
import bcrypt from 'bcryptjs';
import { IUser } from '../types';

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, select: false },
    roles: { type: [String], enum: ['buyer', 'seller', 'moderator'], default: ['buyer'] },
    isActive: { type: Boolean, default: true },
    sellerRequest: {
      status: { type: String, enum: ['pending', 'approved', 'rejected'] },
      requestedAt: Date,
    },
  },
  { timestamps: true }
);

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

UserSchema.methods.comparePassword = function (candidate: string) {
  return bcrypt.compare(candidate, this.password);
};

UserSchema.methods.hasRole = function (role: string) {
  return this.roles.includes(role);
};

export const User = model<IUser>('User', UserSchema);
