import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import {
  getReports,
  listUsers,
  suspendUser,
  activateUser,
  suspendProduct,
  listSellerRequests,
  handleSellerRequest,
  activateProduct,
} from '../controllers/admin.controller';

const router = Router();

router.use(authenticate, requireRole('moderator'));

router.get('/reports',                    getReports);
router.get('/users',                      listUsers);
router.get('/seller-requests',            listSellerRequests);
router.patch('/seller-requests/:id',      handleSellerRequest);
router.patch('/users/:id/suspend',        suspendUser);
router.patch('/users/:id/activate',       activateUser);
router.patch('/products/:id/suspend',     suspendProduct);
router.patch('/products/:id/activate',    activateProduct);

export default router;
