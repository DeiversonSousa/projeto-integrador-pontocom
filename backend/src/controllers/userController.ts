import { Response } from 'express';
import { query } from '../config/db';
import { AuthRequest } from '../middlewares/authMiddleware';

export class UserController {
  /**
   * Atualiza raio de alcance (km), categorias de interesse e limite de notificações diárias
   */
  static async updatePreferences(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const {
        raio_alcance_km,
        limite_diario_notificacoes,
        categorias_interesse,
        latitude,
        longitude,
        endereco_texto
      } = req.body;

      const updateRes = await query(`
        UPDATE usuarios
        SET 
          raio_alcance_km = COALESCE($1, raio_alcance_km),
          limite_diario_notificacoes = COALESCE($2, limite_diario_notificacoes),
          categorias_interesse = COALESCE($3, categorias_interesse),
          latitude = COALESCE($4, latitude),
          longitude = COALESCE($5, longitude),
          endereco_texto = COALESCE($6, endereco_texto),
          atualizado_em = NOW()
        WHERE id = $7
        RETURNING id, nome, email, tipo, latitude, longitude, raio_alcance_km, limite_diario_notificacoes, categorias_interesse, atualizado_em;
      `, [
        raio_alcance_km !== undefined ? parseFloat(raio_alcance_km) : null,
        limite_diario_notificacoes !== undefined ? parseInt(limite_diario_notificacoes, 10) : null,
        categorias_interesse || null,
        latitude !== undefined ? parseFloat(latitude) : null,
        longitude !== undefined ? parseFloat(longitude) : null,
        endereco_texto || null,
        req.user.id
      ]);

      if (updateRes.rowCount === 0) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }

      res.json({
        message: 'Preferências atualizadas com sucesso!',
        usuario: updateRes.rows[0]
      });
    } catch (error: any) {
      console.error('Erro ao atualizar preferências:', error);
      res.status(500).json({ error: 'Erro interno ao salvar preferências.' });
    }
  }

  /**
   * Conformidade com a LGPD: Exclusão total e definitiva da conta e dados do usuário
   */
  static async deleteAccountLGPD(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const userId = req.user.id;

      // Remoção em cascata (favoritos, denúncias, notificações e o usuário)
      await query('DELETE FROM favoritos WHERE id_usuario = $1', [userId]);
      await query('DELETE FROM notificacoes_enviadas WHERE id_usuario = $1', [userId]);
      await query('DELETE FROM denuncias WHERE id_usuario = $1', [userId]);
      
      // Se for criador de publicações, remove-as ou anonimiza
      await query('DELETE FROM publicacoes WHERE id_autor = $1', [userId]);

      const deleteRes = await query('DELETE FROM usuarios WHERE id = $1 RETURNING email', [userId]);

      if (deleteRes.rowCount === 0) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }

      res.json({
        message: 'Em conformidade com a LGPD (Lei Geral de Proteção de Dados), sua conta e todos os seus registros foram excluídos permanentemente de nossa base de dados.'
      });
    } catch (error: any) {
      console.error('Erro ao excluir conta (LGPD):', error);
      res.status(500).json({ error: 'Erro interno ao processar exclusão de dados.' });
    }
  }

  /**
   * Estatísticas de notificações recebidas pelo usuário hoje vs limite
   */
  static async getNotificationQuota(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const resQuota = await query(`
        SELECT 
          u.limite_diario_notificacoes,
          (
            SELECT COUNT(*) 
            FROM notificacoes_enviadas ne 
            WHERE ne.id_usuario = u.id 
              AND ne.enviado_em >= NOW() - INTERVAL '24 hours'
          ) AS notificacoes_recebidas_hoje
        FROM usuarios u
        WHERE u.id = $1
      `, [req.user.id]);

      if (resQuota.rowCount === 0) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }

      const data = resQuota.rows[0];
      const limite = parseInt(data.limite_diario_notificacoes, 10);
      const recebidas = parseInt(data.notificacoes_recebidas_hoje, 10);
      const restantes = Math.max(0, limite - recebidas);

      res.json({
        limiteDiario: limite,
        recebidasHoje: recebidas,
        restantesHoje: restantes,
        antiSpamAtivo: true
      });
    } catch (error: any) {
      console.error('Erro ao obter cota de notificações:', error);
      res.status(500).json({ error: 'Erro interno.' });
    }
  }

  /**
   * Consultar carteira de Tokens do usuário (saldo e histórico de transações)
   */
  static async getWallet(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const userRes = await query(
        'SELECT id, nome, email, saldo_cash FROM usuarios WHERE id = $1',
        [req.user.id]
      );

      if (userRes.rowCount === 0) {
        res.status(404).json({ error: 'Usuário não encontrado.' });
        return;
      }

      const saldo = parseFloat(userRes.rows[0].saldo_cash || '0');

      const transacoesRes = await query(`
        SELECT id, tipo, valor, descricao, criado_em
        FROM transacoes_cash
        WHERE id_usuario = $1
        ORDER BY criado_em DESC
        LIMIT 30;
      `, [req.user.id]);

      res.json({
        saldoTokens: saldo,
        saldoCash: saldo,
        transacoes: transacoesRes.rows
      });
    } catch (error: any) {
      console.error('Erro ao consultar carteira de tokens:', error);
      res.status(500).json({ error: 'Erro interno ao consultar carteira de tokens.' });
    }
  }

  /**
   * Recarregar saldo de Tokens
   */
  static async buyCash(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const { valor, metodo } = req.body;
      const quantia = parseFloat(valor);

      if (isNaN(quantia) || quantia <= 0) {
        res.status(400).json({ error: 'Informe um valor válido de recarga maior que zero.' });
        return;
      }

      // Atualizar saldo do usuário
      const updateRes = await query(`
        UPDATE usuarios
        SET saldo_cash = saldo_cash + $1, atualizado_em = NOW()
        WHERE id = $2
        RETURNING saldo_cash;
      `, [quantia, req.user.id]);

      const novoSaldo = parseFloat(updateRes.rows[0].saldo_cash);

      // Registrar transação de recarga
      await query(`
        INSERT INTO transacoes_cash (id_usuario, tipo, valor, descricao)
        VALUES ($1, 'RECARGA', $2, $3)
      `, [
        req.user.id,
        quantia,
        `Recarga de saldo via ${metodo || 'PIX Simulado'} (+${quantia.toFixed(2)} Tokens)`
      ]);

      res.json({
        message: `🎉 Recarga de ${quantia.toFixed(2)} Tokens realizada com sucesso!`,
        saldoTokens: novoSaldo,
        saldoCash: novoSaldo
      });
    } catch (error: any) {
      console.error('Erro ao recarregar tokens:', error);
      res.status(500).json({ error: 'Erro interno ao processar recarga de tokens.' });
    }
  }
}

