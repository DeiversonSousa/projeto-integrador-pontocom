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

      // Validação defensiva contra NaN
      if (isNaN(lat)) lat = -16.6799;
      if (isNaN(lon)) lon = -49.2550;
      if (isNaN(raio) || raio <= 0) raio = 10.0;

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
          p.imagem_url, p.status, p.destaque, p.destaque_ate, p.editado_em, p.criado_em,
          p.id_autor,
          u.nome AS autor_nome, u.tipo AS autor_tipo,
          calcular_distancia_km(p.latitude, p.longitude, $1, $2) AS distancia_km
        FROM publicacoes p
        JOIN categorias c ON p.categoria_chave = c.chave
        JOIN usuarios u ON p.id_autor = u.id
        WHERE ${conditions.join(' AND ')}
          AND calcular_distancia_km(p.latitude, p.longitude, $1, $2) <= $3
        ORDER BY 
          (CASE WHEN p.destaque = TRUE AND (p.destaque_ate IS NULL OR p.destaque_ate >= NOW()) THEN 1 ELSE 0 END) DESC,
          distancia_km ASC, 
          p.criado_em DESC;
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
      let lat = req.query.lat ? parseFloat(req.query.lat as string) : (req.user?.latitude || -16.6799);
      let lon = req.query.lon ? parseFloat(req.query.lon as string) : (req.user?.longitude || -49.2550);
      if (isNaN(lat)) lat = -16.6799;
      if (isNaN(lon)) lon = -49.2550;

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

      const latNum = parseFloat(latitude);
      const lonNum = parseFloat(longitude);
      if (isNaN(latNum) || isNaN(lonNum)) {
        res.status(400).json({ error: 'Coordenadas geográficas informadas são inválidas.' });
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

  /**
   * Atualizar publicação existente
   * - Administrador pode editar qualquer publicação diretamente.
   * - Cidadão ou Organização podem editar suas próprias publicações,
   *   mas a edição redefine automaticamente o status para 'PENDENTE' e registra editado_em = NOW(),
   *   exigindo reaprovação de um Administrador antes de reaparecer no feed público.
   */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID de publicação inválido.' });
        return;
      }

      const checkRes = await query('SELECT * FROM publicacoes WHERE id = $1', [id]);
      if (checkRes.rowCount === 0) {
        res.status(404).json({ error: 'Publicação não encontrada.' });
        return;
      }

      const pub = checkRes.rows[0];
      const isAdmin = req.user.tipo === 'ADMIN';
      const isAuthor = pub.id_autor === req.user.id;

      if (!isAdmin && !isAuthor) {
        res.status(403).json({ error: 'Você não tem permissão para editar esta publicação.' });
        return;
      }

      const {
        titulo,
        descricao,
        categoria_chave,
        endereco,
        bairro,
        cidade,
        estado,
        latitude,
        longitude,
        data_inicio,
        data_fim,
        contato_telefone,
        contato_whatsapp,
        contato_email,
        imagem_url,
        status: statusDesejado
      } = req.body;

      // Se for não-admin, volta obrigatoriamente para PENDENTE para moderação reaprovar
      const novoStatus = isAdmin ? (statusDesejado || pub.status) : 'PENDENTE';
      const novoMotivoReprovacao = isAdmin ? pub.motivo_reprovacao : null;

      const updateRes = await query(`
        UPDATE publicacoes
        SET
          titulo = COALESCE($1, titulo),
          descricao = COALESCE($2, descricao),
          categoria_chave = COALESCE($3, categoria_chave),
          endereco = COALESCE($4, endereco),
          bairro = COALESCE($5, bairro),
          cidade = COALESCE($6, cidade),
          estado = COALESCE($7, estado),
          latitude = COALESCE($8, latitude),
          longitude = COALESCE($9, longitude),
          data_inicio = COALESCE($10, data_inicio),
          data_fim = COALESCE($11, data_fim),
          contato_telefone = COALESCE($12, contato_telefone),
          contato_whatsapp = COALESCE($13, contato_whatsapp),
          contato_email = COALESCE($14, contato_email),
          imagem_url = COALESCE($15, imagem_url),
          status = $16,
          motivo_reprovacao = $17,
          editado_em = NOW(),
          atualizado_em = NOW()
        WHERE id = $18
        RETURNING *;
      `, [
        titulo || null,
        descricao || null,
        categoria_chave || null,
        endereco || null,
        bairro !== undefined ? bairro : null,
        cidade || null,
        estado || null,
        latitude !== undefined ? parseFloat(latitude) : null,
        longitude !== undefined ? parseFloat(longitude) : null,
        data_inicio ? new Date(data_inicio) : null,
        data_fim ? new Date(data_fim) : null,
        contato_telefone !== undefined ? contato_telefone : null,
        contato_whatsapp !== undefined ? contato_whatsapp : null,
        contato_email !== undefined ? contato_email : null,
        imagem_url !== undefined ? imagem_url : null,
        novoStatus,
        novoMotivoReprovacao,
        id
      ]);

      const updated = updateRes.rows[0];

      res.json({
        message: isAdmin
          ? 'Publicação atualizada com sucesso pelo Administrador!'
          : 'Publicação editada com sucesso! Como você realizou alterações, ela foi reenviada para a moderação e aguarda reaprovação do administrador antes de reaparecer no feed.',
        publicacao: updated,
        reanaliseNecessaria: !isAdmin
      });
    } catch (error: any) {
      console.error('Erro ao atualizar publicação:', error);
      res.status(500).json({ error: 'Erro interno ao atualizar publicação.' });
    }
  }

  /**
   * Excluir publicação
   * - Administrador pode excluir qualquer publicação.
   * - Autor pode excluir sua própria publicação.
   */
  static async delete(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID de publicação inválido.' });
        return;
      }

      const checkRes = await query('SELECT * FROM publicacoes WHERE id = $1', [id]);
      if (checkRes.rowCount === 0) {
        res.status(404).json({ error: 'Publicação não encontrada.' });
        return;
      }

      const pub = checkRes.rows[0];
      const isAdmin = req.user.tipo === 'ADMIN';
      const isAuthor = pub.id_autor === req.user.id;

      if (!isAdmin && !isAuthor) {
        res.status(403).json({ error: 'Você não tem permissão para excluir esta publicação.' });
        return;
      }

      await query('DELETE FROM publicacoes WHERE id = $1', [id]);

      res.json({
        message: isAdmin
          ? 'Publicação excluída em definitivo pelo Administrador.'
          : 'Sua publicação foi removida com sucesso da plataforma.'
      });
    } catch (error: any) {
      console.error('Erro ao excluir publicação:', error);
      res.status(500).json({ error: 'Erro interno ao excluir publicação.' });
    }
  }

  /**
   * Destacar publicação usando PontoCash (Impulsionamento no topo do feed)
   * Custa 15 PontoCash por 7 dias de destaque.
   */
  static async destacar(req: AuthRequest, res: Response): Promise<void> {
    try {
      if (!req.user) {
        res.status(401).json({ error: 'Não autenticado.' });
        return;
      }

      const id = parseInt(String(req.params.id), 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'ID de publicação inválido.' });
        return;
      }

      const checkRes = await query('SELECT * FROM publicacoes WHERE id = $1', [id]);
      if (checkRes.rowCount === 0) {
        res.status(404).json({ error: 'Publicação não encontrada.' });
        return;
      }

      const pub = checkRes.rows[0];
      const isAdmin = req.user.tipo === 'ADMIN';
      const isAuthor = pub.id_autor === req.user.id;

      if (!isAdmin && !isAuthor) {
        res.status(403).json({ error: 'Apenas o autor da publicação ou administradores podem destacá-la.' });
        return;
      }

      const custoCash = 15.00;

      // Buscar saldo do usuário
      const userRes = await query('SELECT saldo_cash FROM usuarios WHERE id = $1', [req.user.id]);
      const saldoAtual = parseFloat(userRes.rows[0]?.saldo_cash || '0');

      if (saldoAtual < custoCash) {
        res.status(400).json({
          error: `Saldo insuficiente de PontoCash. Você possui ${saldoAtual.toFixed(2)} Cash e são necessários ${custoCash.toFixed(2)} Cash para destacar esta publicação por 7 dias. Faça uma recarga!`,
          saldoAtual,
          custoCash
        });
        return;
      }

      // Debitar cash
      const novoSaldo = saldoAtual - custoCash;
      await query('UPDATE usuarios SET saldo_cash = $1, atualizado_em = NOW() WHERE id = $2', [novoSaldo, req.user.id]);

      // Registrar transação
      await query(`
        INSERT INTO transacoes_cash (id_usuario, tipo, valor, descricao)
        VALUES ($1, 'DESTAQUE_POST', $2, $3)
      `, [
        req.user.id,
        -custoCash,
        `Destaque da publicação #${pub.id} ("${pub.titulo.substring(0, 30)}...") no topo do feed por 7 dias`
      ]);

      // Atualizar publicação para destaque
      const pubUpdate = await query(`
        UPDATE publicacoes
        SET 
          destaque = TRUE,
          destaque_ate = NOW() + INTERVAL '7 days',
          atualizado_em = NOW()
        WHERE id = $1
        RETURNING *;
      `, [id]);

      res.json({
        message: '🎉 Publicação impulsionada com sucesso! Ela agora aparecerá com o selo dourado de DESTAQUE no topo do feed da sua região pelos próximos 7 dias.',
        publicacao: pubUpdate.rows[0],
        novoSaldo
      });
    } catch (error: any) {
      console.error('Erro ao destacar publicação:', error);
      res.status(500).json({ error: 'Erro interno ao impulsionar publicação com cash.' });
    }
  }
}
