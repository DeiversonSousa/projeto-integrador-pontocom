import { Router } from 'express';
import { ChatController } from '../controllers/chatController';
import { authenticate } from '../middlewares/authMiddleware';

const router = Router();

// Todas as rotas de chat requerem autenticação
router.get('/conversas', authenticate, ChatController.listConversations);
router.post('/iniciar', authenticate, ChatController.startOrGetConversation);
router.get('/conversas/:id/mensagens', authenticate, ChatController.getMessages);
router.post('/conversas/:id/mensagens', authenticate, ChatController.sendMessage);

export default router;
