import { Router } from 'express';
import { PublicationController } from '../controllers/publicationController';
import { authenticate, optionalAuthenticate } from '../middlewares/authMiddleware';

const router = Router();

router.get('/feed', optionalAuthenticate, PublicationController.listFeed);
router.get('/categorias', PublicationController.listCategories);
router.get('/favoritos', authenticate, PublicationController.listFavorites);
router.get('/:id', optionalAuthenticate, PublicationController.getById);

// Publicar: cidadãos, autônomos e organizações podem publicar (não-admin vai para moderação pendente)
router.post('/', authenticate, PublicationController.create);

// Edição e exclusão de publicações (Admin ou Autor)
router.put('/:id', authenticate, PublicationController.update);
router.delete('/:id', authenticate, PublicationController.delete);

// Sistema de Cash: destacar post no topo do feed
router.post('/:id/destacar', authenticate, PublicationController.destacar);

// Interações comunitárias
router.post('/:id/favoritar', authenticate, PublicationController.toggleFavorite);
router.post('/:id/denunciar', authenticate, PublicationController.report);

export default router;

