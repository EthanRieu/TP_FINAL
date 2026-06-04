import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth';
import { validate } from '../middleware/validate';

const router = Router();

router.post('/register', validate(authController.registerSchema), authController.register);
router.post('/login',    validate(authController.loginSchema),    authController.login);
router.post('/upgrade-seller', authenticate, authController.upgradeSeller);

export default router;
