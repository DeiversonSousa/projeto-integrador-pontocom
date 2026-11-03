import { Router } from 'express';
import { ModerationController } from '../controllers/moderationController';
import { authenticate, authorizeRoles } from '../middlewares/authMiddleware';

const router = Router();

// Todas as rotas de moderação requerem perfil ADMIN
router.use(authenticate, authorizeRoles('ADMIN'));

router.get('/pendentes', ModerationController.listPending);
router.post('/:id/aprovar', ModerationController.approve);
router.post('/:id/reprovar', ModerationController.reject);
router.get('/denuncias', ModerationController.listReports);
router.post('/:id/suspender', ModerationController.suspendPublication);

export default router;

