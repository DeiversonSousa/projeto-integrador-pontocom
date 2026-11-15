import { Response } from 'express';
import { query } from '../config/db';
import { AuthRequest } from '../middlewares/authMiddleware';
import { SocketService } from '../services/socketService';

export class ChatController {
  /**
   * Listar todas as conversas do usuário logado
   */
  static async listConversations(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const userId = req.user.id;

      const sql = `
        SELECT 
          c.id,
          c.id_publicacao,
          p.titulo AS publicacao_titulo,
          p.imagem_url AS publicacao_imagem,
          c.criado_em,
          c.atualizado_em,
          u_outro.id AS contato_id,
          u_outro.nome AS contato_nome,
          u_outro.email AS contato_email,
          u_outro.tipo AS contato_tipo,
          (
            SELECT m.conteudo 
            FROM mensagens_chat m 
            WHERE m.id_conversa = c.id 
            ORDER BY m.criado_em DESC 
            LIMIT 1
          ) AS ultima_mensagem,
          (
            SELECT m.criado_em 
            FROM mensagens_chat m 
            WHERE m.id_conversa = c.id 
            ORDER BY m.criado_em DESC 
            LIMIT 1
          ) AS ultima_mensagem_data,
          (
            SELECT m.id_remetente 
            FROM mensagens_chat m 
            WHERE m.id_conversa = c.id 
            ORDER BY m.criado_em DESC 
            LIMIT 1
          ) AS ultima_mensagem_remetente,
          (
            SELECT COUNT(*)::int 
            FROM mensagens_chat m 
            WHERE m.id_conversa = c.id 
              AND m.id_remetente != $1 
              AND m.lida = FALSE
          ) AS nao_lidas
        FROM conversas c
        LEFT JOIN publicacoes p ON c.id_publicacao = p.id
        JOIN usuarios u_outro ON u_outro.id = (
          CASE WHEN c.id_cidadao = $1 THEN c.id_anunciante ELSE c.id_cidadao END
        )
        WHERE c.id_cidadao = $1 OR c.id_anunciante = $1
        ORDER BY COALESCE(
          (SELECT m.criado_em FROM mensagens_chat m WHERE m.id_conversa = c.id ORDER BY m.criado_em DESC LIMIT 1),
          c.atualizado_em
        ) DESC;
      `;

      const result = await query(sql, [userId]);

      res.json({ conversas: result.rows });
    } catch (error: any) {
      console.error('Erro ao listar conversas:', error);
      res.status(500).json({ error: 'Erro interno ao carregar conversas do chat.' });
    }
  }

  /**
   * Iniciar ou recuperar uma conversa com outro usuário (e opcionalmente vinculada a uma publicação)
   */
  static async startOrGetConversation(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const { destinatario_id, id_publicacao } = req.body;
      const targetUserId = parseInt(destinatario_id, 10);
      const pubId = id_publicacao ? parseInt(id_publicacao, 10) : null;

      if (isNaN(targetUserId)) {
        res.status(400).json({ error: 'ID do destinatário é obrigatório e inválido.' });
        return;
      }

      if (targetUserId === req.user.id) {
        res.status(400).json({ error: 'Não é possível iniciar uma conversa consigo mesmo.' });
        return;
      }

      // Validar se o destinatário existe
      const targetRes = await query('SELECT id, nome, email, tipo FROM usuarios WHERE id = $1', [targetUserId]);
      if (targetRes.rowCount === 0) {
        res.status(404).json({ error: 'Destinatário não encontrado na plataforma.' });
        return;
      }

      const myId = req.user.id;

      // Verificar se já existe conversa entre os dois (com ou sem a publicação)
      let existingRes;
      if (pubId) {
        existingRes = await query(`
          SELECT c.*, p.titulo AS publicacao_titulo
          FROM conversas c
          LEFT JOIN publicacoes p ON c.id_publicacao = p.id
          WHERE ((c.id_cidadao = $1 AND c.id_anunciante = $2) OR (c.id_cidadao = $2 AND c.id_anunciante = $1))
            AND c.id_publicacao = $3
          LIMIT 1;
        `, [myId, targetUserId, pubId]);
      } else {
        existingRes = await query(`
          SELECT c.*, p.titulo AS publicacao_titulo
          FROM conversas c
          LEFT JOIN publicacoes p ON c.id_publicacao = p.id
          WHERE ((c.id_cidadao = $1 AND c.id_anunciante = $2) OR (c.id_cidadao = $2 AND c.id_anunciante = $1))
          ORDER BY c.atualizado_em DESC
          LIMIT 1;
        `, [myId, targetUserId]);
      }

      if (existingRes && existingRes.rowCount && existingRes.rowCount > 0) {
        res.json({
          conversa: existingRes.rows[0],
          novo: false
        });
        return;
      }

      // Criar nova conversa
      const insertRes = await query(`
        INSERT INTO conversas (id_publicacao, id_cidadao, id_anunciante)
        VALUES ($1, $2, $3)
        RETURNING *;
      `, [pubId, myId, targetUserId]);

      const novaConversa = insertRes.rows[0];

      res.status(201).json({
        conversa: novaConversa,
        novo: true
      });
    } catch (error: any) {
      console.error('Erro ao iniciar conversa:', error);
      res.status(500).json({ error: 'Erro interno ao iniciar conversa.' });
    }
  }

  /**
   * Buscar histórico de mensagens de uma conversa e marcar como lidas
   */
  static async getMessages(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const conversaId = parseInt(String(req.params.id), 10);
      if (isNaN(conversaId)) {
        res.status(400).json({ error: 'ID de conversa inválido.' });
        return;
      }

      // Verificar acesso à conversa
      const checkRes = await query(`
        SELECT 
          c.*,
          p.titulo AS publicacao_titulo,
          p.imagem_url AS publicacao_imagem,
          u_cidadao.nome AS cidadao_nome,
          u_cidadao.tipo AS cidadao_tipo,
          u_anunciante.nome AS anunciante_nome,
          u_anunciante.tipo AS anunciante_tipo
        FROM conversas c
        LEFT JOIN publicacoes p ON c.id_publicacao = p.id
        JOIN usuarios u_cidadao ON c.id_cidadao = u_cidadao.id
        JOIN usuarios u_anunciante ON c.id_anunciante = u_anunciante.id
        WHERE c.id = $1;
      `, [conversaId]);

      if (checkRes.rowCount === 0) {
        res.status(404).json({ error: 'Conversa não encontrada.' });
        return;
      }

      const conversa = checkRes.rows[0];
      const isParticipant = conversa.id_cidadao === req.user.id || conversa.id_anunciante === req.user.id;
      const isAdmin = req.user.tipo === 'ADMIN';

      if (!isParticipant && !isAdmin) {
        res.status(403).json({ error: 'Você não tem permissão para visualizar esta conversa.' });
        return;
      }

      // Marcar mensagens não lidas enviadas pelo outro como lidas
      await query(`
        UPDATE mensagens_chat
        SET lida = TRUE
        WHERE id_conversa = $1 AND id_remetente != $2 AND lida = FALSE;
      `, [conversaId, req.user.id]);

      // Buscar mensagens
      const msgRes = await query(`
        SELECT 
          m.id,
          m.id_conversa,
          m.id_remetente,
          m.conteudo,
          m.lida,
          m.criado_em,
          u.nome AS remetente_nome,
          u.tipo AS remetente_tipo
        FROM mensagens_chat m
        JOIN usuarios u ON m.id_remetente = u.id
        WHERE m.id_conversa = $1
        ORDER BY m.criado_em ASC;
      `, [conversaId]);

      const outroUsuario = conversa.id_cidadao === req.user.id
        ? { id: conversa.id_anunciante, nome: conversa.anunciante_nome, tipo: conversa.anunciante_tipo }
        : { id: conversa.id_cidadao, nome: conversa.cidadao_nome, tipo: conversa.cidadao_tipo };

      res.json({
        conversa: {
          id: conversa.id,
          id_publicacao: conversa.id_publicacao,
          publicacao_titulo: conversa.publicacao_titulo,
          publicacao_imagem: conversa.publicacao_imagem,
          outroUsuario
        },
        mensagens: msgRes.rows
      });
    } catch (error: any) {
      console.error('Erro ao buscar mensagens do chat:', error);
      res.status(500).json({ error: 'Erro interno ao consultar mensagens.' });
    }
  }

  /**
   * Enviar nova mensagem em uma conversa
   */
  static async sendMessage(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const conversaId = parseInt(String(req.params.id), 10);
      const { conteudo } = req.body;

      if (isNaN(conversaId)) {
        res.status(400).json({ error: 'ID de conversa inválido.' });
        return;
      }

      if (!conteudo || conteudo.trim().length === 0) {
        res.status(400).json({ error: 'A mensagem não pode estar vazia.' });
        return;
      }

      // Validar acesso à conversa
      const convRes = await query('SELECT * FROM conversas WHERE id = $1', [conversaId]);
      if (convRes.rowCount === 0) {
        res.status(404).json({ error: 'Conversa não encontrada.' });
        return;
      }

      const conversa = convRes.rows[0];
      const isParticipant = conversa.id_cidadao === req.user.id || conversa.id_anunciante === req.user.id;
      const isAdmin = req.user.tipo === 'ADMIN';

      if (!isParticipant && !isAdmin) {
        res.status(403).json({ error: 'Você não tem permissão para enviar mensagens nesta conversa.' });
        return;
      }

      // Inserir mensagem
      const insertRes = await query(`
        INSERT INTO mensagens_chat (id_conversa, id_remetente, conteudo)
        VALUES ($1, $2, $3)
        RETURNING *;
      `, [conversaId, req.user.id, conteudo.trim()]);

      // Atualizar timestamp da conversa
      await query('UPDATE conversas SET atualizado_em = NOW() WHERE id = $1', [conversaId]);

      const novaMensagem = insertRes.rows[0];
      const fullMessage = {
        ...novaMensagem,
        remetente_nome: req.user.nome,
        remetente_tipo: req.user.tipo
      };

      // Identificar o destinatário
      const destinatarioId = conversa.id_cidadao === req.user.id ? conversa.id_anunciante : conversa.id_cidadao;

      // Disparar WebSocket em tempo real para o destinatário e para a sala da conversa
      SocketService.enviarMensagemChat(destinatarioId, conversaId, fullMessage);

      res.status(201).json({
        message: 'Mensagem enviada com sucesso!',
        mensagem: fullMessage
      });
    } catch (error: any) {
      console.error('Erro ao enviar mensagem no chat:', error);
      res.status(500).json({ error: 'Erro interno ao enviar mensagem.' });
    }
  }
}
