import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import http from 'http';

import authRoutes from './routes/authRoutes';
import userRoutes from './routes/userRoutes';
import publicationRoutes from './routes/publicationRoutes';
import moderationRoutes from './routes/moderationRoutes';
import { query } from './config/db';
import { SocketService } from './services/socketService';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Criar servidor HTTP (necessário para Socket.io)
const httpServer = http.createServer(app);

// Inicializar WebSocket (Socket.io)
SocketService.init(httpServer);

// Middlewares globais
app.use(cors({
  origin: '*', // Em produção, trocar pelo domínio real
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Rota de Healthcheck e status do sistema
app.get('/api/health', async (_req, res) => {
  try {
    const dbRes = await query('SELECT NOW() as current_time, COUNT(*)::int as total_publicacoes FROM publicacoes');
    res.json({
      status: 'UP',
      projeto: 'Portal de Notificações por Região',
      instituicao: 'SENAI FATESG - Projeto Integrador',
      horarioServidor: dbRes.rows[0].current_time,
      totalPublicacoes: dbRes.rows[0].total_publicacoes,
      ambiente: process.env.NODE_ENV || 'development'
    });
  } catch (err: any) {
    res.status(500).json({ status: 'DOWN', error: err.message });
  }
});

// Rotas da API REST
app.use('/api/auth', authRoutes);
app.use('/api/usuarios', userRoutes);
app.use('/api/publicacoes', publicationRoutes);
app.use('/api/moderacao', moderationRoutes);

// Servir frontend estático integrado
const frontendPath = path.resolve(__dirname, '../../frontend');
app.use(express.static(frontendPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Iniciar servidor via httpServer (não app.listen) para suportar WebSockets
httpServer.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 Portal de Notificações - SENAI FATESG rodando!`);
  console.log(`📡 API REST:       http://localhost:${PORT}/api`);
  console.log(`💻 Frontend Web:   http://localhost:${PORT}`);
  console.log(`❤️ Healthcheck:    http://localhost:${PORT}/api/health`);
  console.log(`🔌 WebSocket:      Socket.io ativo`);
  console.log(`🌍 Ambiente:       ${process.env.NODE_ENV || 'development'}`);
  console.log(`=======================================================`);
});
