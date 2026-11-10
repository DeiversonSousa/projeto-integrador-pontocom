# 📍 PontoCom • Notificações Comunitárias por Região
> **Projeto Integrador • SENAI FATESG**  
> *Comunicação comunitária, serviços locais e ações de utilidade pública com geolocalização dinâmica e controle do cidadão.*

<p align="center">
  <img src="frontend/img/logo.svg" alt="PontoCom Logo" width="340">
</p>

-----

## 📖 Sobre o Projeto

O **PontoCom** foi concebido e implementado no âmbito do **Projeto Integrador do SENAI FATESG** para resolver o problema do ruído digital nas redes sociais convencionais, conectando cidadãos a ações de utilidade pública (como doações de sangue e vacinação), comércios de proximidade e prestadores de serviços locais.

### 🌟 Pilares e Diferenciais da Solução
1. **📍 Geolocalização Dinâmica**:
   * O morador define o raio de alcance (ex.: 5 km) através de um slider contínuo ou atalhos rápidos (1 km a 20 km).
   * Cálculo de distância em tempo real (fórmula Haversine integrada no banco de dados espacial PostgreSQL).
   * Visualização integrada tanto em formato de **Feed de Avisos** quanto em **Mapa Interativo (Leaflet.js)** com pinos coloridos por categoria e radar do cidadão.
2. **🛡️ Proteção Anti-Spam (Controle de Fadiga)**:
   * Filtro estrito de categorias (*Serviços Locais, Promoções de Bairro e Ações Sociais*).
   * Definição de **cota diária de notificações** com indicador visual de consumo em tempo real, impedindo sobrecarga de mensagens.
3. **⚖️ Conformidade Rigorosa com a LGPD**:
   * Transparência no uso de dados e permissão explícita de geolocalização.
   * Funcionalidade nativa de **"Excluir Minha Conta e Meus Dados"** (Artigo 18 da Lei Federal nº 13.709/2018 - Direito à Eliminação).
4. **🏛️ Moderação Prévia e Denúncias Comunitárias**:
   * Publicações de organizações passam por uma fila `PENDENTE` antes da veiculação.
   * Administradores aprovam (disparando notificações aos moradores da região) ou reprovam com justificativa orientadora.
   * Cidadãos podem denunciar postagens impróprias, permitindo à moderação suspender imediatamente o aviso e arquivar a ocorrência.
5. **📲 Tempo Real & Multiplataforma**:
   * Comunicação bidirecional via **WebSockets (Socket.io)** com notificações push visuais e sonoras (*Web Audio API*).
   * **Design Responsivo Híbrido**: navegação integrada no cabeçalho em telas desktop e barra inferior (*bottom navigation*) adaptativa para smartphones.

---

## 🛠️ Arquitetura e Tecnologias

* **Frontend**: HTML5 semântico, CSS3 moderno (*mobile-first*, *custom properties*, sombras e animações), JavaScript ES6+ modular e **Leaflet.js** para mapas geoespaciais.
* **Backend**: **Node.js** com **TypeScript**, **Express**, autenticação segura via **JWT** e criptografia de senhas com **Bcrypt**.
* **Tempo Real**: **Socket.io** com salas segmentadas por usuário e transmissões de atualização global.
* **Banco de Dados**: **PostgreSQL** com suporte a extensões espaciais e função nativa em PL/pgSQL `calcular_distancia_km()` para alta performance em buscas de proximidade.
* **Infraestrutura**: Configuração pronta para execução nativa, containers via **Docker Compose** e deploy em nuvem no **Railway**.

---

## 🚀 Como Executar o Projeto

### Pré-requisitos
* Node.js v18+ (instalado)
* PostgreSQL rodando localmente (porta 5432) ou via Docker

### 1. Iniciar o Banco de Dados e Migrações

No diretório do backend:
```bash
cd backend
npm install
npm run migrate
npm run seed
```

### 2. Iniciar o Servidor (API + Frontend Integrado)

```bash
npm run dev
```
ou utilizando o executável na raiz do projeto:
```bash
iniciar.bat
```

Acesse no navegador:  
👉 **[http://localhost:3001](http://localhost:3001)**

---

## 👥 Contas de Demonstração Pré-Configuradas

Para facilitar a apresentação perante a banca avaliadora, a aplicação possui um seletor rápido no topo com 4 perfis reais modelados nos slides do projeto:

| Perfil | E-mail | Senha | Função / O que testar |
| :--- | :--- | :--- | :--- |
| **Cidadão / Morador** | `morador@cidadao.com` | `123456` | Navegar no feed georreferenciado, alterar raio no slider, visualizar mapa interativo, favoritar avisos, salvar preferências e testar exclusão LGPD. |
| **Organização (Hemocentro)** | `hemocentro@goias.gov.br` | `123456` | Cadastrar campanhas de doação de sangue e ações sociais com período de vigência e fotos. |
| **Profissional Autônomo** | `marcos.eletricista@gmail.com` | `123456` | Publicar serviços de elétrica residencial para moradores no raio de proximidade. |
| **Administrador (Moderação)** | `admin@fatesg.senai.br` | `admin123` | Acessar o painel **Moderação**, aprovar/reprovar publicações pendentes e analisar denúncias comunitárias suspendendo avisos irregulares. |

---

## 📱 Telas e Módulos Implementados

* **Feed Principal Georreferenciado**: Filtros por categoria, cards dinâmicos com badges coloridas (*Social, Serviço, Promoção*), cálculo dinâmico de distância em KM e busca textual em tempo real.
* **Mapa Geoespacial Interativo**: Pins coloridos por categoria, indicador radar do cidadão, círculo de cobertura e atalho para centralização.
* **Detalhes da Ação Comunitária**: Exibição da campanha, rota GPS ("Como Chegar" via Google Maps), link direto para WhatsApp, compartilhamento rápido e botão de denúncia.
* **Cadastro de Avisos & Serviços**: Formulário com validações de período de vigência, categoria, contato e prévia instantânea de imagem.
* **Perfil, Autonomia e LGPD**: Configuração de interesses, teto diário de notificações, barra de consumo da cota anti-spam e eliminação definitiva de dados pessoais.
* **Painel de Moderação Comunitária**: Gestão com sub-abas para aprovações prévias e denúncias comunitárias com suspensão imediata.
