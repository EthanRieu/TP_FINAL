import express from 'express';
import cors from 'cors';
import path from 'path';
import { ApiError } from './utils/ApiError';
import authRoutes from './routes/auth.routes';
import productRoutes from './routes/product.routes';
import auctionRoutes from './routes/auction.routes';
import bidRoutes from './routes/bid.routes';
import adminRoutes from './routes/admin.routes';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use('/api/auth', authRoutes);
  app.use('/api/products', productRoutes);
  app.use('/api/auctions', auctionRoutes);
  app.use('/api/bids', bidRoutes);
  app.use('/api/admin', adminRoutes);

  // Error handler global
  app.use(
    (
      err: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      if (err instanceof ApiError) {
        return res
          .status(err.statusCode)
          .json({ message: err.message, ...err.meta });
      }
      console.error(err);
      res.status(500).json({ message: 'Erreur serveur interne' });
    },
  );

  return app;
}
