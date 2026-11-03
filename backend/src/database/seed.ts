import { query, pool } from '../config/db';
import bcrypt from 'bcryptjs';

async function runSeed() {
  console.log('🌱 Populando banco de dados com dados iniciais...');

  try {
    // 1. Categorias
    await query(`
      INSERT INTO categorias (chave, nome, descricao, cor_badge, icone)
      VALUES 
        ('PROMOCAO', 'Promoções', 'Descontos, ofertas e oportunidades do comércio de bairro', '#F59E0B', 'tag'),
        ('SERVICO', 'Serviços Locais', 'Profissionais autônomos, eletricistas, encanadores e reparos', '#2563EB', 'wrench'),
        ('SOCIAL', 'Projetos Sociais & Saúde', 'Campanhas públicas, doações de sangue, vacinação e cidadania', '#10B981', 'heart')
      ON CONFLICT (chave) DO UPDATE SET
        nome = EXCLUDED.nome,
        descricao = EXCLUDED.descricao,
        cor_badge = EXCLUDED.cor_badge,
        icone = EXCLUDED.icone;
    `);

    // 2. Senhas com hash bcrypt
    const senhaPadrao = await bcrypt.hash('123456', 10);
    const senhaAdmin = await bcrypt.hash('admin123', 10);

    // 3. Usuários (Admin, Organizações, Cidadão)
    const resUsuarios = await query(`
      INSERT INTO usuarios (nome, email, senha_hash, tipo, telefone, documento, endereco_texto, latitude, longitude, raio_alcance_km, limite_diario_notificacoes, categorias_interesse)
      VALUES
        ('Administrador do Portal', 'admin@fatesg.senai.br', $1, 'ADMIN', '(62) 3219-1000', '00000000000', 'SENAI FATESG - Setor Leste Universitário', -16.6799, -49.2550, 20.0, 50, ARRAY['SERVICO', 'PROMOCAO', 'SOCIAL']),
        ('Hemocentro de Goiás', 'hemocentro@goias.gov.br', $2, 'ORGANIZACAO', '(62) 3201-4570', '01234567000189', 'Av. Anhanguera, 5195 - Setor Coimbra, Goiânia - GO', -16.6789, -49.2435, 15.0, 10, ARRAY['SOCIAL']),
        ('Marcos Eletricista 24h', 'marcos.eletricista@gmail.com', $2, 'ORGANIZACAO', '(62) 98888-1122', '12345678901', 'Rua 20, Setor Central, Goiânia - GO', -16.6850, -49.2590, 10.0, 10, ARRAY['SERVICO']),
        ('Barbearia Estilo Nobre', 'barbearia.estilo@gmail.com', $2, 'ORGANIZACAO', '(62) 99999-3344', '98765432000145', 'Rua 227, Setor Leste Universitário, Goiânia - GO', -16.6740, -49.2480, 10.0, 10, ARRAY['PROMOCAO']),
        ('Lucas Silva (Morador)', 'morador@cidadao.com', $2, 'CIDADAO', '(62) 98111-2233', '77788899900', 'Praça Universitária, Setor Leste Universitário', -16.6770, -49.2450, 5.0, 5, ARRAY['SERVICO', 'PROMOCAO', 'SOCIAL'])
      ON CONFLICT (email) DO UPDATE SET
        nome = EXCLUDED.nome
      RETURNING id, email, tipo;
    `, [senhaAdmin, senhaPadrao]);

    // Mapear IDs
    const usersByEmail: Record<string, number> = {};
    for (const u of resUsuarios.rows) {
      usersByEmail[u.email] = u.id;
    }

    // Se já existiam antes:
    const allUsers = await query(`SELECT id, email FROM usuarios;`);
    for (const u of allUsers.rows) {
      usersByEmail[u.email] = u.id;
    }

    const idHemocentro = usersByEmail['hemocentro@goias.gov.br'];
    const idEletricista = usersByEmail['marcos.eletricista@gmail.com'];
    const idBarbearia = usersByEmail['barbearia.estilo@gmail.com'];

    // 4. Limpar publicações de demonstração antigas para evitar duplicatas em re-seeds
    await query(`DELETE FROM publicacoes WHERE id_autor IN ($1, $2, $3);`, [idHemocentro, idEletricista, idBarbearia]);

    // 5. Inserir Publicações Reais baseadas nos slides do projeto
    const agora = new Date();
    const trintaDiasDepois = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const cincoDiasDepois = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    await query(`
      INSERT INTO publicacoes (
        titulo, descricao, categoria_chave, endereco, bairro, cidade, estado,
        latitude, longitude, data_inicio, data_fim, contato_telefone, contato_whatsapp,
        contato_email, imagem_url, status, id_autor
      )
      VALUES
        (
          'Doação de Sangue e Cadastro de Medula Óssea',
          'Campanha solidária em parceria com o SENAI FATESG e o Hemocentro de Goiás. Venha salvar vidas! Doe sangue e faça a diferença para centenas de pacientes que aguardam transfusões.',
          'SOCIAL',
          'Rua 227-A, nº 95 - Setor Leste Universitário (Estacionamento SENAI FATESG)',
          'Setor Leste Universitário',
          'Goiânia',
          'GO',
          -16.6792,
          -49.2440,
          $1,
          $2,
          '(62) 3201-4570',
          '(62) 99123-4567',
          'contato@hemocentro.org.br',
          'https://images.unsplash.com/photo-1615461066841-6116e61058f4?auto=format&fit=crop&w=800&q=80',
          'APROVADO',
          $3
        ),
        (
          'Eletricista Residencial e Comercial 24 Horas',
          'Instalações elétricas seguras, troca de disjuntores, chuveiros, iluminação LED, reparo em curtos-circuitos e emissão de laudo técnico. Atendimento de emergência no raio universitário e centro.',
          'SERVICO',
          'Rua 20, nº 412 - Setor Central',
          'Setor Central',
          'Goiânia',
          'GO',
          -16.6850,
          -49.2590,
          $1,
          $2,
          '(62) 98888-1122',
          '(62) 98888-1122',
          'marcos.eletricista@gmail.com',
          'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=800&q=80',
          'APROVADO',
          $4
        ),
        (
          'Corte Masculino + Barba com 30% OFF',
          'Promoção exclusiva para moradores da região universitária e estudantes! Corte degrade moderno, toalha quente e finalização com pomada especial. Apresente este aviso no app!',
          'PROMOCAO',
          'Rua 227, nº 180 - Setor Leste Universitário',
          'Setor Leste Universitário',
          'Goiânia',
          'GO',
          -16.6740,
          -49.2480,
          $1,
          $5,
          '(62) 99999-3344',
          '(62) 99999-3344',
          'barbearia.estilo@gmail.com',
          'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=800&q=80',
          'APROVADO',
          $6
        ),
        (
          'Mutirão Comunitário de Coleta e Reciclagem Eletrônica',
          'Traga seus aparelhos eletrônicos estragados (baterias, celulares velhos, computadores, cabos) para descarte ecológico correto com certificado ambiental.',
          'SOCIAL',
          'Praça Universitária, s/n - Setor Leste Universitário',
          'Setor Leste Universitário',
          'Goiânia',
          'GO',
          -16.6775,
          -49.2430,
          $1,
          $5,
          '(62) 3219-1000',
          '(62) 99344-5566',
          'sustentabilidade@comunidade.org',
          'https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?auto=format&fit=crop&w=800&q=80',
          'APROVADO',
          $3
        ),
        (
          'Aulas Comunitárias Gratuitas de Informática Básica',
          'Projeto voluntário para capacitar jovens e idosos do bairro no uso de computadores e internet. Aguardando aprovação para início imediato das inscrições!',
          'SOCIAL',
          'Rua 230, Setor Leste Universitário',
          'Setor Leste Universitário',
          'Goiânia',
          'GO',
          -16.6760,
          -49.2460,
          $1,
          $2,
          '(62) 98777-6655',
          '(62) 98777-6655',
          'inclusao.digital@bairro.org',
          'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=800&q=80',
          'PENDENTE',
          $3
        )
    `, [agora, trintaDiasDepois, idHemocentro, idEletricista, cincoDiasDepois, idBarbearia]);

    console.log('✅ Seed executado com sucesso! Usuários e publicações criados.');
  } catch (error) {
    console.error('❌ Erro no seed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runSeed();

