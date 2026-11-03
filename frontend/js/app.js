// Estado Global da Aplicação
const state = {
  apiBase: '/api',
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  coords: {
    lat: -16.6799, // Coordenada padrão: SENAI Fatesg (Setor Leste Universitário, Goiânia)
    lng: -49.2550
  },
  radiusKm: 5.0,
  category: 'TODAS',
  searchQuery: '',
  map: null,
  mapMarkers: [],
  userCircle: null,
  userMarker: null,
  activeView: 'feed',
  socket: null
};

// Inicializar Socket.io para notificações em tempo real
function initWebSocket() {
  // Conecta automaticamente ao mesmo host/porta (funciona local e em produção)
  const socketUrl = window.location.origin;
  const socket = io(socketUrl, { transports: ['websocket', 'polling'] });

  socket.on('connect', () => {
    console.log('🔌 WebSocket conectado:', socket.id);
    // Registrar sala do usuário para receber notificações personalizadas
    if (state.user) {
      socket.emit('registrar_usuario', { usuarioId: state.user.id, nome: state.user.nome });
    }
  });

  // Receber notificação push em tempo real (Anti-Spam já aplicado no backend)
  socket.on('notificacao_push', (notif) => {
    console.log('📲 Notificação Push recebida:', notif);
    mostrarNotificacaoPush(notif);
  });

  // Atualizar feed automaticamente quando um novo aviso for aprovado
  socket.on('atualizar_feed', (dados) => {
    console.log('🔄 Feed atualizado pelo servidor:', dados);
    if (state.activeView === 'feed') {
      loadFeed();
      showToast(`Feed atualizado! Novo aviso disponível na sua região.`, 'info');
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 WebSocket desconectado.');
  });

  state.socket = socket;
}

// Exibir notificação push visual na tela (banner flutuante + banner nativo do navegador)
function mostrarNotificacaoPush(notif) {
  // Cores por categoria
  const cores = { SOCIAL: '#10b981', SERVICO: '#2563eb', PROMOCAO: '#f59e0b' };
  const cor = cores[notif.categoria_chave] || '#0056b3';
  const icones = { SOCIAL: '❤️', SERVICO: '🔧', PROMOCAO: '🏷️' };
  const icone = icones[notif.categoria_chave] || '📢';

  // Banner flutuante customizado
  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed; top: 70px; right: 16px; z-index: 9999;
    background: white; border-left: 5px solid ${cor};
    border-radius: 10px; padding: 14px 18px;
    max-width: 340px; box-shadow: 0 8px 25px rgba(0,0,0,0.18);
    animation: slideInRight 0.4s ease; cursor: pointer;
    display: flex; flex-direction: column; gap: 4px;
  `;
  banner.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span style="font-weight:800; color:${cor}; font-size:0.85rem;">${icone} Aviso próximo a você!</span>
      <span style="font-size:0.72rem; color:#94a3b8;">${notif.horario}</span>
    </div>
    <div style="font-size:0.95rem; font-weight:600; color:#0f172a;">${notif.titulo}</div>
    <div style="font-size:0.8rem; color:#64748b;">📍 ${notif.distancia_km} km · Notificação ${notif.notificacoes_hoje}/${notif.limite_diario} de hoje</div>
    <div style="font-size:0.75rem; color:#94a3b8; margin-top:2px;">Clique para abrir os detalhes</div>
  `;
  banner.addEventListener('click', () => {
    openDetailsModal(notif.id);
    banner.remove();
  });
  document.body.appendChild(banner);

  // Auto-remover após 7 segundos
  setTimeout(() => banner.style.opacity = '0', 6500);
  setTimeout(() => banner.remove(), 7000);

  // Notificação nativa do navegador (se permitida)
  if (Notification.permission === 'granted') {
    new Notification(`${icone} Portal de Notificações • SENAI FATESG`, {
      body: `${notif.titulo} — a ${notif.distancia_km} km de você`,
      icon: '/favicon.ico'
    });
  }
}

// Adicionar estilo de animação dinamicamente
const pushStyle = document.createElement('style');
pushStyle.textContent = `
  @keyframes slideInRight {
    from { transform: translateX(120%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
`;
document.head.appendChild(pushStyle);

// Inicialização ao carregar a página
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupEventHandlers();

  // Pedir permissão de notificação nativa do navegador
  if (Notification.permission === 'default') {
    Notification.requestPermission();
  }

  // Se já tiver usuário salvo, carrega ou loga como Morador padrão
  if (!state.token || !state.user) {
    await loginAs('morador@cidadao.com', '123456');
  } else {
    updateUserUI();
    if (state.user.latitude && state.user.longitude) {
      state.coords.lat = state.user.latitude;
      state.coords.lng = state.user.longitude;
    }
    if (state.user.raio_alcance_km) {
      state.radiusKm = state.user.raio_alcance_km;
      document.getElementById('radiusRange').value = state.radiusKm;
      document.getElementById('radiusVal').innerText = `${state.radiusKm} km`;
    }
  }

  // Inicializar WebSocket depois do login
  initWebSocket();
  loadFeed();
});

// Atualização da UI do Usuário
function updateUserUI() {
  const userPill = document.getElementById('userPill');
  const modNavItem = document.getElementById('navItemModeracao');
  const newPubNavItem = document.getElementById('navItemNovaPub');

  if (state.user) {
    userPill.innerHTML = `
      <span>👤 <strong>${state.user.nome.split(' ')[0]}</strong></span>
      <span class="badge">${state.user.tipo}</span>
      <button onclick="logout()" style="background:none; border:none; color:white; cursor:pointer; font-size:0.8rem; margin-left:4px;" title="Sair">✕</button>
    `;

    // Exibir abas contextuais por perfil
    if (state.user.tipo === 'ADMIN') {
      modNavItem.style.display = 'flex';
      newPubNavItem.style.display = 'flex';
    } else if (state.user.tipo === 'ORGANIZACAO') {
      modNavItem.style.display = 'none';
      newPubNavItem.style.display = 'flex';
    } else {
      modNavItem.style.display = 'none';
      newPubNavItem.style.display = 'none';
    }
  } else {
    userPill.innerHTML = `<button onclick="openLoginModal()" class="btn-demo">Fazer Login</button>`;
    modNavItem.style.display = 'none';
    newPubNavItem.style.display = 'none';
  }
}

// Navegação entre Abas
function setupNavigation() {
  const navButtons = document.querySelectorAll('.nav-item');
  navButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      switchView(view);
    });
  });
}

function switchView(viewName) {
  state.activeView = viewName;
  document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));

  const targetSection = document.getElementById(`view-${viewName}`);
  if (targetSection) targetSection.classList.add('active');

  const activeBtn = document.querySelector(`.nav-item[data-view="${viewName}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  if (viewName === 'feed') {
    loadFeed();
  } else if (viewName === 'mapa') {
    initOrUpdateMap();
  } else if (viewName === 'favoritos') {
    loadFavorites();
  } else if (viewName === 'perfil') {
    loadProfileData();
  } else if (viewName === 'moderacao') {
    loadModerationData();
  }
}

// Configuração dos Listeners de Controle (Filtros, Sliders, Busca)
function setupEventHandlers() {
  // Slider de Raio
  const radiusRange = document.getElementById('radiusRange');
  const radiusVal = document.getElementById('radiusVal');
  radiusRange.addEventListener('input', (e) => {
    state.radiusKm = parseFloat(e.target.value);
    radiusVal.innerText = `${state.radiusKm} km`;
  });
  radiusRange.addEventListener('change', () => {
    if (state.activeView === 'feed') loadFeed();
    if (state.activeView === 'mapa') initOrUpdateMap();
  });

  // Busca textual
  const searchInput = document.getElementById('searchInput');
  let searchTimeout;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = e.target.value.trim();
      loadFeed();
    }, 400);
  });

  // Botões de Categoria
  const catButtons = document.querySelectorAll('.tab-btn');
  catButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      catButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.category = btn.dataset.cat;
      loadFeed();
      if (state.activeView === 'mapa') initOrUpdateMap();
    });
  });

  // Botão Usar GPS
  document.getElementById('btnGps').addEventListener('click', getCurrentGpsLocation);
}

// Obter localização real do navegador (HTML5 Geolocation)
function getCurrentGpsLocation() {
  if ('geolocation' in navigator) {
    showToast('Obtendo sinal GPS do seu dispositivo...', 'info');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        state.coords.lat = pos.coords.latitude;
        state.coords.lng = pos.coords.longitude;
        showToast('Localização atualizada com sucesso!', 'success');
        document.getElementById('gpsText').innerText = 'GPS Local Ativo';
        if (state.activeView === 'feed') loadFeed();
        if (state.activeView === 'mapa') initOrUpdateMap();
      },
      (err) => {
        showToast('Não foi possível obter GPS. Mantendo localização padrão (SENAI Fatesg).', 'info');
        console.warn('GPS Error:', err);
      }
    );
  }
}

// Carregar Feed Georreferenciado da API
async function loadFeed() {
  const container = document.getElementById('feedContainer');
  container.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 30px;"><div style="font-weight: 600;">Carregando avisos próximos a você...</div></div>`;

  try {
    const params = new URLSearchParams({
      lat: state.coords.lat,
      lon: state.coords.lng,
      raio: state.radiusKm,
      categoria: state.category,
      busca: state.searchQuery
    });

    const headers = {};
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

    const res = await fetch(`${state.apiBase}/publicacoes/feed?${params.toString()}`, { headers });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || 'Erro ao consultar o feed.');

    const pubs = data.publicacoes || [];
    if (pubs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h4>Nenhum aviso encontrado neste raio (${state.radiusKm} km)</h4>
          <p>Tente aumentar o raio no slider acima ou mudar a categoria selecionada.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = pubs.map(renderPublicationCard).join('');
  } catch (error) {
    container.innerHTML = `
      <div class="empty-state" style="border-color: #ef4444;">
        <h4 style="color: #ef4444;">Erro ao carregar avisos</h4>
        <p>${error.message}</p>
      </div>
    `;
  }
}

// Renderização do Card de Publicação
function renderPublicationCard(pub) {
  const badgeClass = pub.categoria_chave.toLowerCase();
  const badgeColor = pub.cor_badge || '#2563eb';
  const imgUrl = pub.imagem_url || 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=800&q=80';

  return `
    <div class="pub-card" data-id="${pub.id}">
      <div class="pub-card-image" style="background-image: url('${imgUrl}')">
        <span class="badge-category" style="background-color: ${badgeColor};">${pub.categoria_nome}</span>
        <span class="badge-distance">📍 ${pub.distancia_km} km de você</span>
      </div>
      <div class="pub-card-body">
        <h3 class="pub-card-title">${pub.titulo}</h3>
        <p class="pub-card-desc">${pub.descricao}</p>
        
        <div class="pub-card-meta">
          <div class="pub-card-meta-item">
            <span>🏢</span> <strong>${pub.autor_nome}</strong>
          </div>
          <div class="pub-card-meta-item">
            <span>📍</span> <span>${pub.endereco}</span>
          </div>
          <div class="pub-card-meta-item">
            <span>📅</span> <span>Válido até ${new Date(pub.data_fim).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>

        <div class="pub-card-actions">
          <button class="btn-primary" onclick="openDetailsModal(${pub.id})">Ver Detalhes</button>
          <button class="btn-outline btn-fav" onclick="toggleFavorite(${pub.id}, this)" title="Favoritar">❤️</button>
        </div>
      </div>
    </div>
  `;
}

// Mapa Interativo com Leaflet
async function initOrUpdateMap() {
  const mapElement = document.getElementById('mapContainer');
  if (!mapElement) return;

  if (!state.map) {
    state.map = L.map('mapContainer').setView([state.coords.lat, state.coords.lng], 14);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);
  } else {
    state.map.setView([state.coords.lat, state.coords.lng], 14);
  }

  // Limpar marcadores anteriores
  state.mapMarkers.forEach(m => state.map.removeLayer(m));
  state.mapMarkers = [];

  if (state.userCircle) state.map.removeLayer(state.userCircle);
  if (state.userMarker) state.map.removeLayer(state.userMarker);

  // Marcador do Cidadão (Você)
  const userIcon = L.divIcon({
    className: 'custom-user-icon',
    html: `<div style="background:#004085; color:white; border:3px solid white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 6px rgba(0,0,0,0.3); font-size:16px;">👤</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  state.userMarker = L.marker([state.coords.lat, state.coords.lng], { icon: userIcon })
    .addTo(state.map)
    .bindPopup(`<strong>Você está aqui</strong><br>${state.user ? state.user.nome : 'Morador'}<br>Raio: ${state.radiusKm} km`);

  // Círculo de cobertura do raio de alcance
  state.userCircle = L.circle([state.coords.lat, state.coords.lng], {
    color: '#0056b3',
    fillColor: '#3b82f6',
    fillOpacity: 0.12,
    radius: state.radiusKm * 1000 // metros
  }).addTo(state.map);

  // Buscar publicações para plotar os pins
  try {
    const params = new URLSearchParams({
      lat: state.coords.lat,
      lon: state.coords.lng,
      raio: state.radiusKm,
      categoria: state.category
    });

    const res = await fetch(`${state.apiBase}/publicacoes/feed?${params.toString()}`);
    const data = await res.json();
    const pubs = data.publicacoes || [];

    pubs.forEach(pub => {
      const pinColor = pub.cor_badge || '#2563eb';
      const pinIcon = L.divIcon({
        className: 'custom-pin-icon',
        html: `<div style="background:${pinColor}; color:white; border:2px solid white; border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 5px rgba(0,0,0,0.3); font-size:12px; font-weight:bold;">📍</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14]
      });

      const marker = L.marker([pub.latitude, pub.longitude], { icon: pinIcon }).addTo(state.map);
      marker.bindPopup(`
        <div style="font-family: sans-serif; max-width: 200px;">
          <span style="background:${pub.cor_badge}; color:white; padding:2px 6px; border-radius:4px; font-size:10px; font-weight:bold;">${pub.categoria_nome}</span>
          <h4 style="margin:6px 0 4px; font-size:13px;">${pub.titulo}</h4>
          <p style="font-size:11px; color:#555; margin-bottom:6px;">${pub.endereco}</p>
          <div style="font-size:11px; font-weight:bold; color:#0056b3; margin-bottom:8px;">📍 ${pub.distancia_km} km de você</div>
          <button onclick="openDetailsModal(${pub.id})" style="width:100%; padding:5px; background:#0056b3; color:white; border:none; border-radius:4px; cursor:pointer; font-size:11px; font-weight:bold;">Ver Detalhes</button>
        </div>
      `);
      state.mapMarkers.push(marker);
    });

    setTimeout(() => {
      state.map.invalidateSize();
    }, 200);
  } catch (err) {
    console.error('Erro ao plotar mapa:', err);
  }
}

// Modal de Detalhes da Publicação (Tela 3 do Slide)
async function openDetailsModal(pubId) {
  const modal = document.getElementById('detailsModal');
  const body = document.getElementById('detailsModalBody');
  modal.classList.add('active');
  body.innerHTML = '<div style="text-align:center; padding:30px;">Carregando informações...</div>';

  try {
    const params = new URLSearchParams({
      lat: state.coords.lat,
      lon: state.coords.lng
    });

    const headers = {};
    if (state.token) headers['Authorization'] = `Bearer ${state.token}`;

    const res = await fetch(`${state.apiBase}/publicacoes/${pubId}?${params.toString()}`, { headers });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const pub = data.publicacao;
    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${pub.latitude},${pub.longitude}`;
    const wppLink = pub.contato_whatsapp ? `https://wa.me/55${pub.contato_whatsapp.replace(/\D/g, '')}` : null;

    body.innerHTML = `
      <div style="margin-bottom: 16px;">
        <span class="badge-category" style="position:static; background:${pub.cor_badge}; display:inline-block; margin-bottom:8px;">${pub.categoria_nome}</span>
        <h2 style="font-size: 1.4rem; color: #0f172a; margin-bottom: 6px;">${pub.titulo}</h2>
        <div style="display:flex; align-items:center; gap:8px; font-size: 0.9rem; color: #0056b3; font-weight: 600;">
          <span>📍 Distância: <strong>${pub.distancia_km} km</strong> do seu ponto</span>
        </div>
      </div>

      ${pub.imagem_url ? `<img src="${pub.imagem_url}" style="width:100%; max-height:240px; object-fit:cover; border-radius:8px; margin-bottom:16px;">` : ''}

      <div style="font-size: 0.95rem; line-height: 1.6; color: #334155; margin-bottom: 20px;">
        ${pub.descricao}
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:14px; margin-bottom:20px; font-size:0.88rem;">
        <div style="margin-bottom:8px;"><strong>🏢 Responsável:</strong> ${pub.autor_nome} (${pub.autor_email})</div>
        <div style="margin-bottom:8px;"><strong>📍 Endereço:</strong> ${pub.endereco} - ${pub.bairro}, ${pub.cidade}/${pub.estado}</div>
        <div style="margin-bottom:8px;"><strong>📅 Vigência:</strong> Até ${new Date(pub.data_fim).toLocaleDateString('pt-BR')}</div>
        ${pub.contato_telefone ? `<div><strong>📞 Telefone:</strong> ${pub.contato_telefone}</div>` : ''}
      </div>

      <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px;">
        <a href="${gmapsUrl}" target="_blank" class="btn-primary" style="text-decoration:none; text-align:center;">
          🗺️ Como Chegar (Google Maps)
        </a>
        ${wppLink ? `<a href="${wppLink}" target="_blank" class="btn-outline" style="text-decoration:none; background:#22c55e; color:white; border-color:#22c55e;">💬 Chamar no WhatsApp</a>` : ''}
      </div>

      <div style="border-top:1px solid #e2e8f0; padding-top:14px; display:flex; justify-content:space-between; align-items:center;">
        <button onclick="reportModal(${pub.id})" style="background:none; border:none; color:#ef4444; font-size:0.82rem; cursor:pointer; font-weight:600;">
          🚩 Denunciar publicação irregular
        </button>
      </div>
    `;
  } catch (error) {
    body.innerHTML = `<div style="color:#ef4444;">Erro ao carregar detalhes: ${error.message}</div>`;
  }
}

function closeDetailsModal() {
  document.getElementById('detailsModal').classList.remove('active');
}

// Favoritar Publicação
async function toggleFavorite(pubId, btn) {
  if (!state.token) {
    showToast('Faça login para favoritar publicações.', 'info');
    return;
  }

  try {
    const res = await fetch(`${state.apiBase}/publicacoes/${pubId}/favoritar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (data.favoritado) {
      btn.classList.add('active');
      showToast('Aviso adicionado aos seus favoritos!', 'success');
    } else {
      btn.classList.remove('active');
      showToast('Aviso removido dos seus favoritos.', 'info');
    }
  } catch {
    showToast('Erro ao atualizar favorito.', 'error');
  }
}

// Carregar Favoritos
async function loadFavorites() {
  const container = document.getElementById('favContainer');
  container.innerHTML = '<div style="padding:20px; text-align:center;">Carregando favoritos...</div>';

  if (!state.token) {
    container.innerHTML = `<div class="empty-state"><h4>Faça login para visualizar seus avisos favoritos.</h4></div>`;
    return;
  }

  try {
    const res = await fetch(`${state.apiBase}/publicacoes/favoritos`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    const favs = data.favoritos || [];

    if (favs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <h4>Nenhum aviso favoritado ainda</h4>
          <p>Clique no ícone de coração nos avisos do feed para salvar aqui.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = favs.map(renderPublicationCard).join('');
  } catch (error) {
    container.innerHTML = `<div class="empty-state" style="color:red;">Erro ao buscar favoritos.</div>`;
  }
}

// Denunciar Publicação
function reportModal(pubId) {
  const motivo = prompt('Por qual motivo você deseja denunciar esta publicação? (Mínimo de 5 caracteres)');
  if (!motivo || motivo.trim().length < 5) {
    showToast('Motivo muito curto ou denúncia cancelada.', 'info');
    return;
  }

  fetch(`${state.apiBase}/publicacoes/${pubId}/denunciar`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${state.token}`
    },
    body: JSON.stringify({ motivo })
  })
  .then(res => res.json())
  .then(data => {
    showToast(data.message || 'Denúncia encaminhada para moderação.', 'success');
    closeDetailsModal();
  })
  .catch(() => showToast('Erro ao enviar denúncia.', 'error'));
}

// Nova Publicação (Tela 4 do Slide)
async function submitNewPublication(e) {
  e.preventDefault();
  if (!state.token) {
    showToast('Faça login com perfil de Organização ou Admin.', 'error');
    return;
  }

  const titulo = document.getElementById('newPubTitulo').value;
  const categoria_chave = document.getElementById('newPubCategoria').value;
  const descricao = document.getElementById('newPubDescricao').value;
  const endereco = document.getElementById('newPubEndereco').value;
  const data_inicio = document.getElementById('newPubDataInicio').value;
  const data_fim = document.getElementById('newPubDataFim').value;
  const contato_whatsapp = document.getElementById('newPubWhatsapp').value;
  const imagem_url = document.getElementById('newPubImagem').value;

  // Usa coordenadas próximas ao endereço ou padrão do autor
  const latitude = state.coords.lat;
  const longitude = state.coords.lng;

  try {
    const res = await fetch(`${state.apiBase}/publicacoes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({
        titulo,
        categoria_chave,
        descricao,
        endereco,
        data_inicio,
        data_fim,
        contato_whatsapp,
        imagem_url,
        latitude,
        longitude
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(data.message, 'success');
    document.getElementById('formNewPub').reset();
    switchView('feed');
  } catch (error) {
    showToast(`Erro ao publicar: ${error.message}`, 'error');
  }
}

// Perfil e Autonomia do Cidadão + LGPD (Tela 5 do Slide)
async function loadProfileData() {
  if (!state.token || !state.user) {
    showToast('Faça login para gerenciar seu perfil.', 'info');
    return;
  }

  // Preencher campos
  document.getElementById('profNome').innerText = state.user.nome;
  document.getElementById('profEmail').innerText = state.user.email;
  document.getElementById('profTipo').innerText = state.user.tipo;
  document.getElementById('profRaioRange').value = state.user.raio_alcance_km || 5;
  document.getElementById('profRaioVal').innerText = `${state.user.raio_alcance_km || 5} km`;
  document.getElementById('profCotaDiaria').value = state.user.limite_diario_notificacoes || 5;

  // Checkboxes de categorias
  const cats = state.user.categorias_interesse || ['SERVICO', 'PROMOCAO', 'SOCIAL'];
  document.getElementById('chkServico').checked = cats.includes('SERVICO');
  document.getElementById('chkPromocao').checked = cats.includes('PROMOCAO');
  document.getElementById('chkSocial').checked = cats.includes('SOCIAL');

  // Carregar dados de cota anti-spam
  try {
    const res = await fetch(`${state.apiBase}/usuarios/quota`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const quota = await res.json();
    document.getElementById('quotaStats').innerHTML = `
      <div style="background:#f1f5f9; padding:12px; border-radius:8px; border:1px solid #cbd5e1; margin-top:10px;">
        <div style="font-weight:600; margin-bottom:4px;">🛡️ Proteção Anti-Spam Ativa</div>
        <div style="font-size:0.85rem; color:#475569;">
          Recebidas hoje: <strong>${quota.recebidasHoje}</strong> / ${quota.limiteDiario} notificações diárias permitidas.
          ${quota.restantesHoje === 0 ? '<span style="color:#ef4444; font-weight:bold;"> (Cota diária esgotada)</span>' : ''}
        </div>
      </div>
    `;
  } catch {
    // ignora
  }
}

async function saveProfilePreferences() {
  const raio_alcance_km = parseFloat(document.getElementById('profRaioRange').value);
  const limite_diario_notificacoes = parseInt(document.getElementById('profCotaDiaria').value, 10);
  
  const categorias_interesse = [];
  if (document.getElementById('chkServico').checked) categorias_interesse.push('SERVICO');
  if (document.getElementById('chkPromocao').checked) categorias_interesse.push('PROMOCAO');
  if (document.getElementById('chkSocial').checked) categorias_interesse.push('SOCIAL');

  try {
    const res = await fetch(`${state.apiBase}/usuarios/preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({
        raio_alcance_km,
        limite_diario_notificacoes,
        categorias_interesse
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.user = data.usuario;
    localStorage.setItem('user', JSON.stringify(state.user));
    state.radiusKm = raio_alcance_km;
    document.getElementById('radiusRange').value = raio_alcance_km;
    document.getElementById('radiusVal').innerText = `${raio_alcance_km} km`;

    showToast('Preferências salvas com sucesso!', 'success');
  } catch (err) {
    showToast(`Erro ao salvar: ${err.message}`, 'error');
  }
}

// Exclusão LGPD (Direito ao Esquecimento)
async function deleteAccountLGPD() {
  const confirmDelete = confirm('ATENÇÃO (LGPD):\nVocê tem certeza de que deseja excluir permanentemente sua conta e todos os dados associados?\nEsta ação não poderá ser desfeita.');
  if (!confirmDelete) return;

  try {
    const res = await fetch(`${state.apiBase}/usuarios/lgpd-delete`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    const data = await res.json();
    alert(data.message);
    logout();
  } catch {
    showToast('Erro ao processar exclusão de dados.', 'error');
  }
}

// Moderação (Administrador)
async function loadModerationData() {
  const tableBody = document.getElementById('modPendingTable');
  tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Carregando pendências...</td></tr>';

  try {
    const res = await fetch(`${state.apiBase}/moderacao/pendentes`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    const pendentes = data.pendentes || [];

    if (pendentes.length === 0) {
      tableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#10b981;">✅ Nenhuma publicação pendente de moderação no momento.</td></tr>';
      return;
    }

    tableBody.innerHTML = pendentes.map(p => `
      <tr>
        <td><strong>${p.titulo}</strong><br><span style="font-size:0.75rem; color:#64748b;">${p.categoria_nome} • ${p.bairro}</span></td>
        <td>${p.autor_nome}<br><span style="font-size:0.75rem; color:#64748b;">${p.autor_email}</span></td>
        <td>${new Date(p.criado_em).toLocaleDateString('pt-BR')}</td>
        <td><span style="background:#fef3c7; color:#92400e; padding:3px 8px; border-radius:4px; font-size:0.75rem; font-weight:bold;">PENDENTE</span></td>
        <td>
          <div style="display:flex; gap:6px;">
            <button class="btn-approve" onclick="approvePublication(${p.id})">✓ Aprovar</button>
            <button class="btn-reject" onclick="rejectPublication(${p.id})">✕ Reprovar</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (err) {
    tableBody.innerHTML = `<tr><td colspan="5" style="color:red;">Erro ao carregar moderação: ${err.message}</td></tr>`;
  }
}

async function approvePublication(id) {
  try {
    const res = await fetch(`${state.apiBase}/moderacao/${id}/aprovar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    showToast(data.message, 'success');
    loadModerationData();
  } catch {
    showToast('Erro ao aprovar publicação.', 'error');
  }
}

async function rejectPublication(id) {
  const motivo = prompt('Informe a justificativa de reprovação para o autor:');
  if (!motivo || motivo.trim().length < 5) {
    showToast('Justificativa obrigatória (mínimo de 5 caracteres).', 'info');
    return;
  }

  try {
    const res = await fetch(`${state.apiBase}/moderacao/${id}/reprovar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ motivo_reprovacao: motivo })
    });
    const data = await res.json();
    showToast(data.message, 'info');
    loadModerationData();
  } catch {
    showToast('Erro ao reprovar publicação.', 'error');
  }
}

// Seletor Rápido de Contas de Demonstração (Lucas Morador, Hemocentro, Marcos Eletricista, Admin)
async function loginAs(email, senha) {
  try {
    const res = await fetch(`${state.apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.token = data.token;
    state.user = data.usuario;
    localStorage.setItem('token', state.token);
    localStorage.setItem('user', JSON.stringify(state.user));

    if (state.user.latitude && state.user.longitude) {
      state.coords.lat = state.user.latitude;
      state.coords.lng = state.user.longitude;
    }
    if (state.user.raio_alcance_km) {
      state.radiusKm = state.user.raio_alcance_km;
      const rRange = document.getElementById('radiusRange');
      if (rRange) rRange.value = state.radiusKm;
      const rVal = document.getElementById('radiusVal');
      if (rVal) rVal.innerText = `${state.radiusKm} km`;
    }

    // Marca o botão demo ativo
    document.querySelectorAll('.btn-demo').forEach(b => {
      b.classList.toggle('active', b.dataset.email === email);
    });

    updateUserUI();
    showToast(`Conectado como: ${state.user.nome} (${state.user.tipo})`, 'success');

    // Registrar sala WebSocket do usuário para notificações personalizadas
    if (state.socket && state.user) {
      state.socket.emit('registrar_usuario', { usuarioId: state.user.id, nome: state.user.nome });
    }

    if (state.activeView === 'feed') loadFeed();
    if (state.activeView === 'mapa') initOrUpdateMap();
  } catch (err) {
    showToast(`Erro de login: ${err.message}`, 'error');
  }
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
  updateUserUI();
  showToast('Desconectado com sucesso.', 'info');
  loginAs('morador@cidadao.com', '123456');
}

// Toast Notifier
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span> <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

