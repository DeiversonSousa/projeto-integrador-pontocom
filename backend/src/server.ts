import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
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
  origin: '*', // Em produção, pode ser restrito ao domínio oficial
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
      projeto: 'PontoCom - Notificações por Região',
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

// Resolução robusta do diretório do frontend
const candidateFrontendPaths = [
  path.resolve(__dirname, '../../frontend'),
  path.resolve(__dirname, '../frontend'),
  path.resolve(process.cwd(), 'frontend'),
  path.resolve(process.cwd(), '../frontend')
];
const frontendPath = candidateFrontendPaths.find(p => fs.existsSync(p)) || candidateFrontendPaths[0];

// Servir frontend estático integrado
app.use(express.static(frontendPath));

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next();
  }
  const indexPath = path.join(frontendPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Frontend não encontrado no caminho configurado.');
  }
});

// Middleware global de tratamento de erros
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('⚠️ Erro não tratado na API:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Erro interno no servidor.'
  });
});

// Iniciar servidor via httpServer para suportar WebSockets
httpServer.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🚀 PontoCom - SENAI FATESG rodando!`);
  console.log(`📡 API REST:       http://localhost:${PORT}/api`);
  console.log(`💻 Frontend Web:   http://localhost:${PORT}`);
  console.log(`❤️ Healthcheck:    http://localhost:${PORT}/api/health`);
  console.log(`🔌 WebSocket:      Socket.io ativo`);
  console.log(`🌍 Ambiente:       ${process.env.NODE_ENV || 'development'}`);
  console.log(`📂 Frontend Path:  ${frontendPath}`);
  console.log(`=======================================================`);
});
