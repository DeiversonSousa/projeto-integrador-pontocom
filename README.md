# 📢 Portal de Notificações por Região
> **Projeto Integrador • SENAI FATESG**  
> *Comunicação comunitária, serviços locais e ações de utilidade pública com geolocalização dinâmica e controle do cidadão.*

---

## 📖 Sobre o Projeto

O **Portal de Notificações por Região** foi concebido e implementado no âmbito do **Projeto Integrador do SENAI FATESG** para resolver o problema do ruído digital nas grandes redes sociais, conectando cidadãos a ações de utilidade pública (como doações de sangue e vacinação), comércios de bairro e serviços autônomos de proximidade.

### 🌟 Pilares e Diferenciais da Solução
1. **📍 Geolocalização Dinâmica**:
   * O morador define o raio de alcance (ex.: 5 km) através de um slider contínuo.
   * Cálculo de distância em tempo real (fórmula Haversine integrada no banco de dados espacial).
   * Visualização integrada tanto em formato de **Feed de Avisos** quanto em **Mapa Interativo (Pins e raio)**.
2. **🛡️ Proteção Anti-Spam (Controle de Fadiga)**:
   * Filtro estrito de categorias (*Serviços Locais, Promoções de Bairro e Ações Sociais*).
   * Definição de **cota diária de notificações** (o morador escolhe receber até 3, 5 ou 10 notificações por dia, impedindo sobrecarga).
3. **⚖️ Conformidade Rigorosa com a LGPD**:
   * Transparência no uso de dados e permissão explícita de localização.
   * Botão nativo e funcional de **"Excluir Minha Conta e Meus Dados"** (Artigo 18 da Lei Geral de Proteção de Dados - Direito à Eliminação).
4. **🏛️ Moderação Prévia e Denúncias**:
   * Organizações submetem publicações que entram em uma fila `PENDENTE`.
   * Administradores avaliam e aprovam/reprovam com justificativa.
   * Moradores podem denunciar postagens impróprias para análise do moderador.

---

## 🛠️ Arquitetura e Tecnologias

* **Frontend**: HTML5, CSS3 moderno com design responsivo *mobile-first*, JavaScript ES6+ e **Leaflet.js** para renderização de mapas interativos.
* **Backend**: **Node.js** com **TypeScript**, **Express** e autenticação segura com tokens **JWT** e criptografia de senhas com **Bcrypt**.
* **Banco de Dados**: **PostgreSQL** com suporte a extensões espaciais e função nativa em PL/pgSQL `calcular_distancia_km()` para consultas georreferenciadas de alto desempenho.
* **Infraestrutura**: Configuração pronta para execução nativa ou via **Docker / Docker Compose**.

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
ou pelo executável na raiz:
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
| **Cidadão / Morador** | `morador@cidadao.com` | `123456` | Navegar no feed georreferenciado, alterar o raio no slider, visualizar o mapa, favoritar ações, salvar preferências e testar exclusão LGPD. |
| **Organização (Hemocentro)** | `hemocentro@goias.gov.br` | `123456` | Cadastrar campanhas de doação de sangue e ações sociais com período de vigência. |
| **Profissional Autônomo** | `marcos.eletricista@gmail.com` | `123456` | Publicar serviços de elétrica residencial para moradores no raio de atendimento. |
| **Administrador (Moderação)** | `admin@fatesg.senai.br` | `admin123` | Acessar a aba **Moderação**, aprovar publicações pendentes (disparando notificações aos moradores) ou reprovar com justificativa. |

---

## 📱 Telas Implementadas (Mapeamento dos Slides)

* **Telas 1 e 2 (Acesso e Feed Principal)**: Filtros por categoria, cards georreferenciados com badges coloridas (*Social, Serviço, Promoção*), cálculo de distância dinâmica e busca textual.
* **Tela 3 (Detalhes da Ação)**: Exibição da campanha de doação de sangue (Hemocentro & SENAI FATESG), rota GPS ("Como Chegar" via Google Maps), link direto para WhatsApp e botão de denúncia.
* **Tela 4 (Cadastro de Publicação)**: Formulário para organizações definirem vigência, fotos, categoria e contato.
* **Tela 5 (Perfil, Autonomia e LGPD)**: Configuração de interesses, teto diário de notificações, indicador de cota diária anti-spam e exclusão irrevogável de dados.
* **Painel Administrativo**: Gestão de publicações pendentes e denúncias comunitárias.

