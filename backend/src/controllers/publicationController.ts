import { Request, Response } from 'express';
import { query } from '../config/db';
import { AuthRequest } from '../middlewares/authMiddleware';
import { GeoService } from '../services/geoService';

export class PublicationController {
  /**
   * Feed Georreferenciado:
   * Calcula distância real em KM, filtra por raio do cidadão, categorias ativas e vigência
   */
  static async listFeed(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Coordenadas de referência (do usuário logado ou passadas via query)
      let lat = req.query.lat ? parseFloat(req.query.lat as string) : (req.user?.latitude || -16.6799);
      let lon = req.query.lon ? parseFloat(req.query.lon as string) : (req.user?.longitude || -49.2550);
      let raio = req.query.raio ? parseFloat(req.query.raio as string) : (req.user?.raio_alcance_km || 10.0);
      const categoria = req.query.categoria as string;
      const busca = req.query.busca as string;

      // Montar condições
      const conditions: string[] = [
        `p.status = 'APROVADO'`,
        `p.data_fim >= NOW()`
      ];
      const params: any[] = [lat, lon, raio];
      let pIndex = 4;

      if (categoria && categoria !== 'TODAS') {
        conditions.push(`p.categoria_chave = $${pIndex}`);
        params.push(categoria);
        pIndex++;
      }

      if (busca) {
        conditions.push(`(p.titulo ILIKE $${pIndex} OR p.descricao ILIKE $${pIndex} OR p.endereco ILIKE $${pIndex})`);
        params.push(`%${busca}%`);
        pIndex++;
      }

      const sql = `
        SELECT 
          p.id, p.titulo, p.descricao, p.categoria_chave,
          c.nome AS categoria_nome, c.cor_badge, c.icone AS categoria_icone,
          p.endereco, p.bairro, p.cidade, p.estado,
          p.latitude, p.longitude,
          p.data_inicio, p.data_fim,
          p.contato_telefone, p.contato_whatsapp, p.contato_email,
          p.imagem_url, p.status, p.criado_em,
          u.nome AS autor_nome, u.tipo AS autor_tipo,
          calcular_distancia_km(p.latitude, p.longitude, $1, $2) AS distancia_km
        FROM publicacoes p
        JOIN categorias c ON p.categoria_chave = c.chave
        JOIN usuarios u ON p.id_autor = u.id
        WHERE ${conditions.join(' AND ')}
          AND calcular_distancia_km(p.latitude, p.longitude, $1, $2) <= $3
        ORDER BY distancia_km ASC, p.criado_em DESC;
      `;

      const result = await query(sql, params);

      res.json({
        parametros: {
          latitude: lat,
          longitude: lon,
          raioKm: raio,
          categoria: categoria || 'TODAS',
          totalEncontrado: result.rowCount
        },
        publicacoes: result.rows
      });
    } catch (error: any) {
      console.error('Erro ao listar feed:', error);
      res.status(500).json({ error: 'Erro interno ao carregar feed por proximidade.' });
    }
  }

  /**
   * Detalhes de uma publicação específica
   */
  static async getById(req: AuthRequest, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const lat = req.query.lat ? parseFloat(req.query.lat as string) : (req.user?.latitude || -16.6799);
      const lon = req.query.lon ? parseFloat(req.query.lon as string) : (req.user?.longitude || -49.2550);

      const result = await query(`
        SELECT 
          p.*,
          c.nome AS categoria_nome, c.cor_badge, c.icone AS categoria_icone,
          u.nome AS autor_nome, u.email AS autor_email, u.telefone AS autor_telefone,
          calcular_distancia_km(p.latitude, p.longitude, $2, $3) AS distancia_km
        FROM publicacoes p
        JOIN categorias c ON p.categoria_chave = c.chave
        JOIN usuarios u ON p.id_autor = u.id
        WHERE p.id = $1;
      `, [id, lat, lon]);

      if (result.rowCount === 0) {
        res.status(404).json({ error: 'Publicação não encontrada.' });
        return;
      }

      // Checar se o usuário atual favoritou
      let favoritado = false;
      if (req.user) {
        const favRes = await query(
          'SELECT 1 FROM favoritos WHERE id_usuario = $1 AND id_publicacao = $2',
          [req.user.id, id]
        );
        favoritado = favRes.rowCount !== null && favRes.rowCount > 0;
      }

      res.json({
        publicacao: result.rows[0],
        favoritado
      });
    } catch (error: any) {
      console.error('Erro ao buscar publicação:', error);
      res.status(500).json({ error: 'Erro interno ao buscar publicação.' });
    }
  }

  /**
   * Cadastro de nova publicação (Organização ou Administrador)
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const {
        titulo,
        descricao,
        categoria_chave,
        endereco,
        bairro,
        cidade = 'Goiânia',
        estado = 'GO',
        latitude,
        longitude,
        data_inicio,
        data_fim,
        contato_telefone,
        contato_whatsapp,
        contato_email,
        imagem_url
      } = req.body;

      if (!titulo || !descricao || !categoria_chave || !endereco || latitude === undefined || longitude === undefined || !data_inicio || !data_fim) {
        res.status(400).json({ error: 'Preencha todos os campos obrigatórios (título, descrição, categoria, endereço, coordenadas e período de vigência).' });
        return;
      }

      // Administrador publica já APROVADO; organização vai para fila PENDENTE de moderação
      const statusInicial = req.user.tipo === 'ADMIN' ? 'APROVADO' : 'PENDENTE';

      const insertRes = await query(`
        INSERT INTO publicacoes (
          titulo, descricao, categoria_chave, endereco, bairro, cidade, estado,
          latitude, longitude, data_inicio, data_fim, contato_telefone,
          contato_whatsapp, contato_email, imagem_url, status, id_autor
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING *;
      `, [
        titulo,
        descricao,
        categoria_chave,
        endereco,
        bairro || '',
        cidade,
        estado,
        parseFloat(latitude),
        parseFloat(longitude),
        new Date(data_inicio),
        new Date(data_fim),
        contato_telefone || null,
        contato_whatsapp || null,
        contato_email || null,
        imagem_url || null,
        statusInicial,
        req.user.id
      ]);

      const novaPub = insertRes.rows[0];

      // Se for aprovado imediatamente, aciona disparo de notificações geoespaciais com filtro anti-spam
      let resultadoNotificacoes = null;
      if (statusInicial === 'APROVADO') {
        resultadoNotificacoes = await GeoService.dispararNotificacoesPorProximidade(novaPub.id);
      }

      res.status(201).json({
        message: statusInicial === 'PENDENTE'
          ? 'Publicação enviada com sucesso! Ela passará pela moderação prévia antes de ser disponibilizada aos cidadãos.'
          : 'Publicação criada e aprovada imediatamente!',
        publicacao: novaPub,
        notificacoesDisparadas: resultadoNotificacoes
      });
    } catch (error: any) {
      console.error('Erro ao criar publicação:', error);
      res.status(500).json({ error: 'Erro interno ao cadastrar aviso/publicação.' });
    }
  }

  /**
   * Favoritar ou Desfavoritar publicação
   */
  static async toggleFavorite(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const idParam = String(req.params.id);
      const idPub = parseInt(idParam, 10);

      const checkFav = await query(
        'SELECT 1 FROM favoritos WHERE id_usuario = $1 AND id_publicacao = $2',
        [req.user.id, idPub]
      );

      if (checkFav.rowCount && checkFav.rowCount > 0) {
        await query('DELETE FROM favoritos WHERE id_usuario = $1 AND id_publicacao = $2', [req.user.id, idPub]);
        res.json({ message: 'Removido dos favoritos com sucesso.', favoritado: false });
      } else {
        await query('INSERT INTO favoritos (id_usuario, id_publicacao) VALUES ($1, $2)', [req.user.id, idPub]);
        res.json({ message: 'Adicionado aos favoritos com sucesso!', favoritado: true });
      }
    } catch (error: any) {
      console.error('Erro ao favoritar:', error);
      res.status(500).json({ error: 'Erro interno.' });
    }
  }

  /**
   * Listar favoritos do cidadão
   */
  static async listFavorites(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const lat = req.user.latitude || -16.6799;
      const lon = req.user.longitude || -49.2550;

      const result = await query(`
        SELECT 
          p.*,
          c.nome AS categoria_nome, c.cor_badge, c.icone AS categoria_icone,
          u.nome AS autor_nome,
          calcular_distancia_km(p.latitude, p.longitude, $2, $3) AS distancia_km
        FROM favoritos f
        JOIN publicacoes p ON f.id_publicacao = p.id
        JOIN categorias c ON p.categoria_chave = c.chave
        JOIN usuarios u ON p.id_autor = u.id
        WHERE f.id_usuario = $1
        ORDER BY f.criado_em DESC;
      `, [req.user.id, lat, lon]);

      res.json({ favoritos: result.rows });
    } catch (error: any) {
      console.error('Erro ao listar favoritos:', error);
      res.status(500).json({ error: 'Erro interno.' });
    }
  }

  /**
   * Denunciar publicação comunitária
   */
  static async report(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const idParam = String(req.params.id);
      const { motivo } = req.body;

      if (!motivo || motivo.trim().length < 5) {
        res.status(400).json({ error: 'Por favor, informe um motivo detalhado para a denúncia (mínimo de 5 caracteres).' });
        return;
      }

      await query(
        `INSERT INTO denuncias (id_publicacao, id_usuario, motivo) VALUES ($1, $2, $3)`,
        [parseInt(idParam, 10), req.user.id, motivo.trim()]
      );

      res.status(201).json({
        message: 'Denúncia registrada com sucesso. Nossa equipe de moderadores avaliará o conteúdo para zelar pela qualidade da comunidade.'
      });
    } catch (error: any) {
      console.error('Erro ao registrar denúncia:', error);
      res.status(500).json({ error: 'Erro interno ao registrar denúncia.' });
    }
  }

  /**
   * Listar categorias disponíveis
   */
  static async listCategories(_req: Request, res: Response): Promise<void> {
    try {
      const result = await query('SELECT * FROM categorias ORDER BY id ASC');
      res.json({ categorias: result.rows });
    } catch (error: any) {
      res.status(500).json({ error: 'Erro ao listar categorias.' });
    }
  }
}
