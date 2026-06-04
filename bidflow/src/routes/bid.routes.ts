import { Router } from 'express';
import { authenticate }  from '../middleware/auth';
import { requireRole }   from '../middleware/requireRole';
import { bidRateLimiter } from '../middleware/bidRateLimiter';
import { placeBid, getBids } from '../controllers/bid.controller';

const router = Router();

router.get('/:id/bids',  getBids);
router.post('/:id/bids', authenticate, requireRole('buyer'), bidRateLimiter, placeBid);

export default router;
