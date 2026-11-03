import { Response } from 'express';
import { query } from '../config/db';
import { AuthRequest } from '../middlewares/authMiddleware';
import { GeoService } from '../services/geoService';

export class ModerationController {
  /**
   * Listar publicações pendentes de aprovação
   */
  static async listPending(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await query(`
        SELECT 
          p.*,
          c.nome AS categoria_nome, c.cor_badge,
          u.nome AS autor_nome, u.email AS autor_email, u.documento AS autor_documento, u.telefone AS autor_telefone
        FROM publicacoes p
        JOIN categorias c ON p.categoria_chave = c.chave
        JOIN usuarios u ON p.id_autor = u.id
        WHERE p.status = 'PENDENTE'
        ORDER BY p.criado_em ASC;
      `);

      res.json({
        totalPendentes: result.rowCount,
        pendentes: result.rows
      });
    } catch (error: any) {
      console.error('Erro ao listar publicações pendentes:', error);
      res.status(500).json({ error: 'Erro interno ao consultar fila de moderação.' });
    }
  }

  /**
   * Aprovar publicação
   */
  static async approve(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const updateRes = await query(`
        UPDATE publicacoes
        SET status = 'APROVADO', motivo_reprovacao = NULL, atualizado_em = NOW()
        WHERE id = $1
        RETURNING *;
      `, [id]);

      if (updateRes.rowCount === 0) {
        res.status(404).json({ error: 'Publicação não encontrada.' });
        return;
      }

      const pub = updateRes.rows[0];

      // Disparar notificações segmentadas por proximidade e cota diária
      const envioResultado = await GeoService.dispararNotificacoesPorProximidade(pub.id);

      res.json({
        message: 'Publicação aprovada com sucesso! Ela agora está visível no feed e mapa dos cidadãos da região.',
        publicacao: pub,
        disparos: envioResultado
      });
    } catch (error: any) {
      console.error('Erro ao aprovar publicação:', error);
      res.status(500).json({ error: 'Erro interno ao aprovar publicação.' });
    }
  }

  /**
   * Reprovar publicação com motivo explicativo
   */
  static async reject(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const { motivo_reprovacao } = req.body;

      if (!motivo_reprovacao || motivo_reprovacao.trim().length < 5) {
        res.status(400).json({ error: 'Por favor, informe um motivo justificando a reprovação para orientar o autor.' });
        return;
      }

      const updateRes = await query(`
        UPDATE publicacoes
        SET status = 'REPROVADO', motivo_reprovacao = $1, atualizado_em = NOW()
        WHERE id = $2
        RETURNING *;
      `, [motivo_reprovacao.trim(), id]);

      if (updateRes.rowCount === 0) {
        res.status(404).json({ error: 'Publicação não encontrada.' });
        return;
      }

      res.json({
        message: 'Publicação reprovada.',
        publicacao: updateRes.rows[0]
      });
    } catch (error: any) {
      console.error('Erro ao reprovar publicação:', error);
      res.status(500).json({ error: 'Erro interno ao reprovar publicação.' });
    }
  }

  /**
   * Listar denúncias registradas por cidadãos
   */
  static async listReports(req: AuthRequest, res: Response): Promise<void> {
    try {
      const result = await query(`
        SELECT 
          d.id AS denuncia_id, d.motivo, d.status AS status_denuncia, d.criado_em AS data_denuncia,
          u_denunciante.nome AS denunciante_nome, u_denunciante.email AS denunciante_email,
          p.id AS publicacao_id, p.titulo AS publicacao_titulo, p.status AS publicacao_status,
          u_autor.nome AS autor_nome
        FROM denuncias d
        JOIN usuarios u_denunciante ON d.id_usuario = u_denunciante.id
        JOIN publicacoes p ON d.id_publicacao = p.id
        JOIN usuarios u_autor ON p.id_autor = u_autor.id
        ORDER BY d.criado_em DESC;
      `);

      res.json({ denuncias: result.rows });
    } catch (error: any) {
      console.error('Erro ao listar denúncias:', error);
      res.status(500).json({ error: 'Erro interno ao listar denúncias.' });
    }
  }

  /**
   * Suspender publicação denunciada
   */
  static async suspendPublication(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      await query(`
        UPDATE publicacoes
        SET status = 'REPROVADO', motivo_reprovacao = 'Publicação suspensa preventivamente pela moderação após denúncias comunitárias.'
        WHERE id = $1;
      `, [id]);

      await query(`
        UPDATE denuncias
        SET status = 'RESOLVIDA'
        WHERE id_publicacao = $1;
      `, [id]);

      res.json({ message: 'Publicação suspensa e denúncias marcadas como resolvidas.' });
    } catch (error: any) {
      console.error('Erro ao suspender publicação:', error);
      res.status(500).json({ error: 'Erro interno ao suspender publicação.' });
    }
  }
}

