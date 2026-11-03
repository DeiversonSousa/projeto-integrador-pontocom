import { query, pool } from '../config/db';

async function runMigrations() {
  console.log('🔄 Iniciando migração do banco de dados (PostgreSQL)...');

  try {
    // 1. Tentar habilitar extensões (PostGIS e Cube/Earthdistance)
    try {
      await query('CREATE EXTENSION IF NOT EXISTS postgis;');
      console.log('✅ Extensão PostGIS ativada com sucesso.');
    } catch {
      console.log('ℹ️ Extensão PostGIS não disponível no host local, usando função espacial nativa Haversine.');
    }

    try {
      await query('CREATE EXTENSION IF NOT EXISTS cube; CREATE EXTENSION IF NOT EXISTS earthdistance;');
      console.log('✅ Extensões Cube e Earthdistance ativadas.');
    } catch {
      // continua
    }

    // 2. Criar função de cálculo de distância geoespacial em KM
    await query(`
      CREATE OR REPLACE FUNCTION calcular_distancia_km(
        lat1 DOUBLE PRECISION, 
        lon1 DOUBLE PRECISION, 
        lat2 DOUBLE PRECISION, 
        lon2 DOUBLE PRECISION
      )
      RETURNS DOUBLE PRECISION AS $$
      DECLARE
        r CONSTANT DOUBLE PRECISION := 6371.0; -- Raio médio da Terra em km
        dlat DOUBLE PRECISION;
        dlon DOUBLE PRECISION;
        a DOUBLE PRECISION;
        c DOUBLE PRECISION;
      BEGIN
        IF lat1 IS NULL OR lon1 IS NULL OR lat2 IS NULL OR lon2 IS NULL THEN
          RETURN 0.0;
        END IF;
        dlat := radians(lat2 - lat1);
        dlon := radians(lon2 - lon1);
        a := sin(dlat/2)^2 + cos(radians(lat1)) * cos(radians(lat2)) * sin(dlon/2)^2;
        c := 2 * asin(sqrt(a));
        RETURN ROUND((r * c)::numeric, 2);
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
    `);
    console.log('✅ Função calcular_distancia_km criada/atualizada.');

    // 3. Tabela de Categorias
    await query(`
      CREATE TABLE IF NOT EXISTS categorias (
        id SERIAL PRIMARY KEY,
        chave VARCHAR(50) UNIQUE NOT NULL,
        nome VARCHAR(100) NOT NULL,
        descricao TEXT,
        cor_badge VARCHAR(30) DEFAULT '#007BFF',
        icone VARCHAR(50) DEFAULT 'tag',
        criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 4. Tabela de Usuários (Cidadão, Organização, Administrador)
    await query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id SERIAL PRIMARY KEY,
        nome VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        senha_hash VARCHAR(255) NOT NULL,
        tipo VARCHAR(50) NOT NULL DEFAULT 'CIDADAO', -- CIDADAO, ORGANIZACAO, ADMIN
        telefone VARCHAR(50),
        documento VARCHAR(50), -- CPF ou CNPJ
        endereco_texto VARCHAR(255),
        latitude DOUBLE PRECISION DEFAULT -16.6799,  -- Padrão Goiânia (Setor Leste Universitário / SENAI)
        longitude DOUBLE PRECISION DEFAULT -49.2550,
        raio_alcance_km DOUBLE PRECISION DEFAULT 5.0, -- Slider de raio ajustável
        limite_diario_notificacoes INT DEFAULT 5,    -- Cota anti-fadiga de notificações
        categorias_interesse TEXT[] DEFAULT ARRAY['SERVICO', 'PROMOCAO', 'SOCIAL'],
        ativo BOOLEAN DEFAULT TRUE,
        criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 5. Tabela de Publicações (Avisos, Ofertas, Projetos Sociais)
    await query(`
      CREATE TABLE IF NOT EXISTS publicacoes (
        id SERIAL PRIMARY KEY,
        titulo VARCHAR(255) NOT NULL,
        descricao TEXT NOT NULL,
        categoria_chave VARCHAR(50) NOT NULL REFERENCES categorias(chave) ON UPDATE CASCADE,
        endereco VARCHAR(255) NOT NULL,
        bairro VARCHAR(100),
        cidade VARCHAR(100) DEFAULT 'Goiânia',
        estado VARCHAR(10) DEFAULT 'GO',
        latitude DOUBLE PRECISION NOT NULL,
        longitude DOUBLE PRECISION NOT NULL,
        data_inicio TIMESTAMP WITH TIME ZONE NOT NULL,
        data_fim TIMESTAMP WITH TIME ZONE NOT NULL,
        contato_telefone VARCHAR(50),
        contato_whatsapp VARCHAR(50),
        contato_email VARCHAR(255),
        imagem_url TEXT,
        status VARCHAR(50) DEFAULT 'PENDENTE', -- PENDENTE, APROVADO, REPROVADO
        motivo_reprovacao TEXT,
        id_autor INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        atualizado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 6. Índices para performance espacial e temporal
    await query(`
      CREATE INDEX IF NOT EXISTS idx_publicacoes_coords ON publicacoes(latitude, longitude);
      CREATE INDEX IF NOT EXISTS idx_publicacoes_status ON publicacoes(status);
      CREATE INDEX IF NOT EXISTS idx_publicacoes_vigencia ON publicacoes(data_inicio, data_fim);
      CREATE INDEX IF NOT EXISTS idx_publicacoes_categoria ON publicacoes(categoria_chave);
    `);

    // 7. Tabela de Histórico de Notificações Disparadas (Anti-Spam / Cota Diária)
    await query(`
      CREATE TABLE IF NOT EXISTS notificacoes_enviadas (
        id SERIAL PRIMARY KEY,
        id_usuario INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        id_publicacao INT NOT NULL REFERENCES publicacoes(id) ON DELETE CASCADE,
        tipo VARCHAR(50) DEFAULT 'PUSH',
        enviado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        lida BOOLEAN DEFAULT FALSE
      );
      CREATE INDEX IF NOT EXISTS idx_notif_usuario_data ON notificacoes_enviadas(id_usuario, enviado_em);
    `);

    // 8. Tabela de Denúncias Comunitárias
    await query(`
      CREATE TABLE IF NOT EXISTS denuncias (
        id SERIAL PRIMARY KEY,
        id_publicacao INT NOT NULL REFERENCES publicacoes(id) ON DELETE CASCADE,
        id_usuario INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        motivo TEXT NOT NULL,
        status VARCHAR(50) DEFAULT 'PENDENTE', -- PENDENTE, ANALISADA, DESCARTADA
        criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `);

    // 9. Tabela de Favoritos
    await query(`
      CREATE TABLE IF NOT EXISTS favoritos (
        id_usuario INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        id_publicacao INT NOT NULL REFERENCES publicacoes(id) ON DELETE CASCADE,
        criado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        PRIMARY KEY (id_usuario, id_publicacao)
      );
    `);

    console.log('🎉 Todas as tabelas e índices foram criados com sucesso!');
  } catch (error) {
    console.error('❌ Erro executando migrações:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigrations();

