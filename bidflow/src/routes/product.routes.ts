import { Router } from 'express';
import { productController } from '../controllers/product.controller';
import { authenticate } from '../middleware/auth';
import { requireRole } from '../middleware/requireRole';
import { upload } from '../config/multer';

const router = Router();

router.get('/',     productController.getProducts);
router.get('/:id',  productController.getProduct);
router.post('/',    authenticate, requireRole('seller'), upload.array('photos', 5), productController.createProduct);
router.patch('/:id', authenticate, requireRole('seller'), productController.updateProduct);
router.delete('/:id', authenticate, requireRole('seller'), productController.deleteProduct);

export default router;
