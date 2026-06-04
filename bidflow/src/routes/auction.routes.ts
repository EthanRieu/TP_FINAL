import { Router } from 'express';
import { authenticate }    from '../middleware/auth';
import { requireRole }     from '../middleware/requireRole';
import {
  createAuction,
  getAuctions,
  getAuction,
  startAuction,
  cancelAuction,
} from '../controllers/auction.controller';

const router = Router();

router.get('/',    getAuctions);
router.get('/:id', getAuction);

router.post('/',              authenticate, requireRole('seller'), createAuction);
router.post('/:id/start',     authenticate, requireRole('seller'), startAuction);
router.post('/:id/cancel',    authenticate, cancelAuction);

export default router;
