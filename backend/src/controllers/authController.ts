import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from '../config/db';
import { AuthRequest } from '../middlewares/authMiddleware';

const JWT_SECRET = process.env.JWT_SECRET || 'senai_fatesg_portal_notificacoes_super_secret_jwt_key_2026';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const {
        nome,
        email,
        senha,
        tipo = 'CIDADAO',
        telefone,
        documento,
        endereco_texto,
        latitude = -16.6799,
        longitude = -49.2550,
        raio_alcance_km = 5.0,
        limite_diario_notificacoes = 5,
        categorias_interesse = ['SERVICO', 'PROMOCAO', 'SOCIAL']
      } = req.body;

      if (!nome || !email || !senha) {
        res.status(400).json({ error: 'Nome, email e senha são obrigatórios.' });
        return;
      }

      // Checar se email já existe
      const existing = await query('SELECT id FROM usuarios WHERE email = $1', [email.toLowerCase().trim()]);
      if (existing.rowCount && existing.rowCount > 0) {
        res.status(409).json({ error: 'Este e-mail já está cadastrado no sistema.' });
        return;
      }

      const senha_hash = await bcrypt.hash(senha, 10);

      const insertRes = await query(`
        INSERT INTO usuarios (
          nome, email, senha_hash, tipo, telefone, documento, endereco_texto,
          latitude, longitude, raio_alcance_km, limite_diario_notificacoes, categorias_interesse
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, nome, email, tipo, telefone, documento, endereco_texto, latitude, longitude, raio_alcance_km, limite_diario_notificacoes, categorias_interesse, criado_em;
      `, [
        nome.trim(),
        email.toLowerCase().trim(),
        senha_hash,
        tipo,
        telefone,
        documento,
        endereco_texto,
        latitude,
        longitude,
        raio_alcance_km,
        limite_diario_notificacoes,
        categorias_interesse
      ]);

      const user = insertRes.rows[0];

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          tipo: user.tipo,
          nome: user.nome,
          latitude: user.latitude,
          longitude: user.longitude,
          raio_alcance_km: user.raio_alcance_km
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        message: 'Usuário cadastrado com sucesso!',
        usuario: user,
        token
      });
    } catch (error: any) {
      console.error('Erro no registro:', error);
      res.status(500).json({ error: 'Erro interno ao realizar cadastro.' });
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { email, senha } = req.body;

      if (!email || !senha) {
        res.status(400).json({ error: 'Email e senha são obrigatórios.' });
        return;
      }

      const userRes = await query('SELECT * FROM usuarios WHERE email = $1 AND ativo = TRUE', [email.toLowerCase().trim()]);
      if (userRes.rowCount === 0) {
        res.status(401).json({ error: 'Credenciais inválidas ou conta inativa.' });
        return;
      }

      const user = userRes.rows[0];
      const match = await bcrypt.compare(senha, user.senha_hash);
      if (!match) {
        res.status(401).json({ error: 'Credenciais inválidas.' });
        return;
      }

      const token = jwt.sign(
        {
          id: user.id,
          email: user.email,
          tipo: user.tipo,
          nome: user.nome,
          latitude: user.latitude,
          longitude: user.longitude,
          raio_alcance_km: user.raio_alcance_km
        },
        JWT_SECRET,
        { expiresIn: '7d' }
      );

      delete user.senha_hash;

      res.json({
        message: 'Login realizado com sucesso!',
        usuario: user,
        token
      });
    } catch (error: any) {
      console.error('Erro no login:', error);
      res.status(500).json({ error: 'Erro interno ao realizar login.' });
    }
  }

  static async me(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const userRes = await query(
        `SELECT id, nome, email, tipo, telefone, documento, endereco_texto, latitude, longitude,
                raio_alcance_km, limite_diario_notificacoes, categorias_interesse, criado_em
         FROM usuarios WHERE id = $1 AND ativo = TRUE`,
        [req.user.id]
      );

      if (userRes.rowCount === 0) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }

      res.json({ usuario: userRes.rows[0] });
    } catch (error: any) {
      console.error('Erro ao buscar dados do usuário:', error);
      res.status(500).json({ error: 'Erro interno no servidor.' });
    }
  }
}

