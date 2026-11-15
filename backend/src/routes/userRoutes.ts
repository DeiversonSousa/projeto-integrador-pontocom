import { Router } from 'express';
import { UserController } from '../controllers/userController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

router.put('/preferences', authenticate, UserController.updatePreferences);
router.get('/quota', authenticate, UserController.getNotificationQuota);
router.get('/carteira', authenticate, UserController.getWallet);
router.post('/comprar-cash', authenticate, UserController.buyCash);
router.delete('/lgpd-delete', authenticate, UserController.deleteAccountLGPD);

export default router;

