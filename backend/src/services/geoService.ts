import { query } from '../config/db';
import { SocketService } from './socketService';

export class GeoService {
  /**
   * Cálculo matemático da distância Haversine em Km (para validação em memória)
   */
  static calcularDistanciaEmKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const r = 6371; // Raio da Terra em km
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return parseFloat((r * c).toFixed(2));
  }

  /**
   * Algoritmo de envio de notificações segmentadas por proximidade + anti-spam:
   * 1. Busca cidadãos que assinam a categoria da publicação
   * 2. Calcula a distância entre o cidadão e a publicação
   * 3. Verifica se a distância <= raio de alcance do cidadão
   * 4. Valida se o cidadão ainda não estourou sua cota diária de notificações
   * 5. Registra o disparo
   */
  static async dispararNotificacoesPorProximidade(idPublicacao: number): Promise<{ totalEnviadas: number; detalhes: any[] }> {
    // Buscar detalhes da publicação
    const pubRes = await query(
      `SELECT id, titulo, categoria_chave, latitude, longitude FROM publicacoes WHERE id = $1`,
      [idPublicacao]
    );

    if (pubRes.rowCount === 0) {
      return { totalEnviadas: 0, detalhes: [] };
    }

    const pub = pubRes.rows[0];

    // Buscar cidadãos ativos que assinam esta categoria
    const usersRes = await query(`
      SELECT 
        u.id, u.nome, u.email, u.latitude, u.longitude, u.raio_alcance_km, u.limite_diario_notificacoes,
        calcular_distancia_km(u.latitude, u.longitude, $1, $2) AS distancia_km,
        (
          SELECT COUNT(*) 
          FROM notificacoes_enviadas ne 
          WHERE ne.id_usuario = u.id 
            AND ne.enviado_em >= NOW() - INTERVAL '24 hours'
        ) AS notificacoes_hoje
      FROM usuarios u
      WHERE u.ativo = TRUE 
        AND u.tipo = 'CIDADAO'
        AND $3 = ANY(u.categorias_interesse);
    `, [pub.latitude, pub.longitude, pub.categoria_chave]);

    let totalEnviadas = 0;
    const detalhes: any[] = [];

    for (const user of usersRes.rows) {
      const distancia = parseFloat(user.distancia_km);
      const raioMax = parseFloat(user.raio_alcance_km || '5.0');
      const notificacoesHoje = parseInt(user.notificacoes_hoje, 10);
      const limiteDiario = parseInt(user.limite_diario_notificacoes || '5', 10);

      // Regra 1: Dentro do raio de alcance?
      const dentroDoRaio = distancia <= raioMax;

      // Regra 2: Anti-spam (Cota diária respeitada)?
      const cotaDisponivel = notificacoesHoje < limiteDiario;

      if (dentroDoRaio && cotaDisponivel) {
        // Registrar envio no banco (para controle de cota)
        await query(
          `INSERT INTO notificacoes_enviadas (id_usuario, id_publicacao, tipo) VALUES ($1, $2, 'PUSH')`,
          [user.id, pub.id]
        );

        // Disparar WebSocket em tempo real para a tela do morador
        SocketService.enviarNotificacaoParaUsuario(user.id, {
          id: pub.id,
          titulo: pub.titulo,
          categoria_chave: pub.categoria_chave,
          distancia_km: distancia,
          raio_max: raioMax,
          notificacoes_hoje: notificacoesHoje + 1,
          limite_diario: limiteDiario,
          mensagem: `Novo aviso relevante a ${distancia} km do seu local!`,
          horario: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
        });

        totalEnviadas++;
        detalhes.push({
          usuarioId: user.id,
          nome: user.nome,
          distanciaKm: distancia,
          raioConfiguradoKm: raioMax,
          notificacoesHoje: notificacoesHoje + 1,
          limiteDiario,
          status: 'ENVIADO'
        });
      } else {
        detalhes.push({
          usuarioId: user.id,
          nome: user.nome,
          distanciaKm: distancia,
          raioConfiguradoKm: raioMax,
          motivoNaoEnvio: !dentroDoRaio ? 'Fora do raio de interesse' : 'Cota diária de notificações atingida (Anti-Spam)'
        });
      }
    }

    // Notifica todos os navegadores abertos para atualizarem o feed/mapa automaticamente
    SocketService.transmitirGlobal('atualizar_feed', { id: pub.id, titulo: pub.titulo });

    return { totalEnviadas, detalhes };
  }
}

