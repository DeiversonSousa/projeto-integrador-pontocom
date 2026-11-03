import { Router } from 'express';
import { PublicationController } from '../controllers/publicationController';
import { authenticate, optionalAuthenticate, authorizeRoles } from '../middlewares/authMiddleware';

const router = Router();

router.get('/feed', optionalAuthenticate, PublicationController.listFeed);
router.get('/categorias', PublicationController.listCategories);
router.get('/favoritos', authenticate, PublicationController.listFavorites);
router.get('/:id', optionalAuthenticate, PublicationController.getById);

router.post('/', authenticate, authorizeRoles('ORGANIZACAO', 'ADMIN'), PublicationController.create);
router.post('/:id/favoritar', authenticate, PublicationController.toggleFavorite);
router.post('/:id/denunciar', authenticate, PublicationController.report);

export default router;

