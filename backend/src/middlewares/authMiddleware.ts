import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedUser {
  id: number;
  email: string;
  tipo: 'CIDADAO' | 'ORGANIZACAO' | 'ADMIN';
  nome: string;
  latitude?: number;
  longitude?: number;
  raio_alcance_km?: number;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

const JWT_SECRET = process.env.JWT_SECRET || 'senai_fatesg_portal_notificacoes_super_secret_jwt_key_2026';

export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Token de autenticação não fornecido ou inválido.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Token expirado ou inválido.' });
  }
}

export function optionalAuthenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as AuthenticatedUser;
    req.user = decoded;
  } catch {
    // Ignora erro em autenticação opcional
  }
  next();
}

export function authorizeRoles(...roles: Array<'CIDADAO' | 'ORGANIZACAO' | 'ADMIN'>) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Usuário não autenticado.' });
      return;
    }

    if (!roles.includes(req.user.tipo)) {
      res.status(403).json({ error: 'Acesso negado: seu perfil não tem permissão para esta ação.' });
      return;
    }

    next();
  };
}

