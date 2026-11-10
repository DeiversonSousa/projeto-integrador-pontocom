// ==========================================================================
// PORTAL DE NOTIFICAÇÕES POR REGIÃO • SENAI FATESG
// JavaScript Modular, Reativo e Responsivo
// ==========================================================================

// Estado Global da Aplicação
const state = {
  apiBase: '/api',
  token: localStorage.getItem('token') || null,
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  coords: {
    lat: -16.6799, // Coordenada de referência: SENAI Fatesg (Goiânia - GO)
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
  socket: null,
  isGpsActive: false
};

// ==========================================================================
// Inicialização do WebSocket (Socket.io)
// ==========================================================================
function initWebSocket() {
  const wsIndicator = document.getElementById('wsIndicator');
  
  if (typeof io === 'undefined') {
    console.warn('⚠️ Biblioteca Socket.io não carregada. Rodando em modo HTTP polling.');
    if (wsIndicator) wsIndicator.style.display = 'none';
    return;
  }

  const socketUrl = window.location.origin;
  const socket = io(socketUrl, { 
    transports: ['websocket', 'polling'],
    reconnectionAttempts: 5,
    timeout: 10000
  });

  socket.on('connect', () => {
    console.log('🔌 WebSocket conectado:', socket.id);
    if (wsIndicator) {
      wsIndicator.innerHTML = '<span class="ws-dot"></span><span class="ws-label">Ao Vivo</span>';
      wsIndicator.title = 'Conectado em tempo real ao servidor';
    }

    if (state.user) {
      socket.emit('registrar_usuario', { usuarioId: state.user.id, nome: state.user.nome });
    }
  });

  // Receber notificação push em tempo real
  socket.on('notificacao_push', (notif) => {
    console.log('📲 Notificação Push recebida:', notif);
    mostrarNotificacaoPush(notif);
  });

  // Atualizar feed automaticamente quando um novo aviso for aprovado
  socket.on('atualizar_feed', (dados) => {
    console.log('🔄 Feed atualizado pelo servidor:', dados);
    if (state.activeView === 'feed') {
      loadFeed(false);
      showToast(`Feed atualizado com novo aviso regional!`, 'info');
    }
  });

  socket.on('disconnect', () => {
    console.log('🔌 WebSocket desconectado.');
    if (wsIndicator) {
      wsIndicator.innerHTML = '<span class="ws-dot" style="background:#94a3b8; box-shadow:none;"></span><span class="ws-label">Off-line</span>';
      wsIndicator.title = 'Desconectado do servidor em tempo real';
    }
  });

  state.socket = socket;
}

// Banner Flutuante de Notificação Push
function mostrarNotificacaoPush(notif) {
  const cores = { SOCIAL: '#059669', SERVICO: '#2563eb', PROMOCAO: '#d97706' };
  const icones = { SOCIAL: '❤️', SERVICO: '🔧', PROMOCAO: '🏷️' };
  const cor = cores[notif.categoria_chave] || '#004fb0';
  const icone = icones[notif.categoria_chave] || '📢';

  const banner = document.createElement('div');
  banner.style.cssText = `
    position: fixed; top: 76px; right: 16px; z-index: 9999;
    background: white; border-left: 5px solid ${cor};
    border-radius: 12px; padding: 14px 18px;
    max-width: 360px; box-shadow: 0 10px 30px rgba(0,0,0,0.18);
    animation: toastSlideUp 0.35s ease; cursor: pointer;
    display: flex; flex-direction: column; gap: 4px; border: 1px solid #e2e8f0;
  `;
  banner.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
      <span style="font-weight:800; color:${cor}; font-size:0.82rem; text-transform:uppercase;">
        ${icone} Aviso Próximo a Você
      </span>
      <span style="font-size:0.72rem; color:#94a3b8;">${notif.horario || 'Agora'}</span>
    </div>
    <div style="font-size:0.95rem; font-weight:700; color:#0f172a; line-height:1.3;">${notif.titulo}</div>
    <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">
      📍 a ${notif.distancia_km} km · Notificação ${notif.notificacoes_hoje || 1}/${notif.limite_diario || 5} de hoje
    </div>
    <div style="font-size:0.75rem; color:#004fb0; font-weight:600; margin-top:4px;">Toque para ver detalhes completos →</div>
  `;

  banner.addEventListener('click', () => {
    openDetailsModal(notif.id);
    banner.remove();
  });

  document.body.appendChild(banner);

  setTimeout(() => {
    banner.style.transition = 'opacity 0.4s, transform 0.4s';
    banner.style.opacity = '0';
    banner.style.transform = 'translateX(20px)';
    setTimeout(() => banner.remove(), 400);
  }, 7000);

  // Notificação nativa se o usuário permitiu
  if (window.Notification && Notification.permission === 'granted') {
    try {
      new Notification(`${icone} Portal de Notificações • SENAI FATESG`, {
        body: `${notif.titulo} — a ${notif.distancia_km} km de você`,
        icon: 'https://cdn-icons-png.flaticon.com/512/3602/3602145.png'
      });
    } catch {
      // Ignora falha de permissão nativa
    }
  }
}

// ==========================================================================
// Inicialização do DOM
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  setupNavigation();
  setupEventHandlers();
  setDefaultDates();

  // Solicitar permissão de notificação nativa discretamente
  if (window.Notification && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 3000);
  }

  // Se não houver usuário logado, inicia com a conta de Morador padrão
  if (!state.token || !state.user) {
    await loginAs('morador@cidadao.com', '123456');
  } else {
    updateUserUI();
    if (state.user.latitude && state.user.longitude) {
      state.coords.lat = state.user.latitude;
      state.coords.lng = state.user.longitude;
    }
    if (state.user.raio_alcance_km) {
      setRadiusPreset(state.user.raio_alcance_km);
    }
  }

  initWebSocket();
  loadFeed();

  // Redimensionar Leaflet quando a janela for redimensionada
  window.addEventListener('resize', () => {
    if (state.map && state.activeView === 'mapa') {
      state.map.invalidateSize();
    }
  });

  // Fechar modais ao teclar ESC
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDetailsModal();
      closeDialogModal();
    }
  });
});

// ==========================================================================
// Configuração de Navegação (Desktop Tabs + Mobile Bottom Bar)
// ==========================================================================
function setupNavigation() {
  const allNavButtons = document.querySelectorAll('.nav-item');
  allNavButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      const view = btn.dataset.view;
      if (view) switchView(view);
    });
  });
}

function switchView(viewName) {
  state.activeView = viewName;

  // Alternar visibilidade das seções
  document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
  const targetSection = document.getElementById(`view-${viewName}`);
  if (targetSection) targetSection.classList.add('active');

  // Sincronizar classes ativas em ambas as barras de navegação (desktop e mobile)
  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === viewName);
  });

  // Scroll suave para o topo
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // Ações contextuais de cada aba
  if (viewName === 'feed') {
    loadFeed();
  } else if (viewName === 'mapa') {
    setTimeout(initOrUpdateMap, 150);
  } else if (viewName === 'favoritos') {
    loadFavorites();
  } else if (viewName === 'perfil') {
    loadProfileData();
  } else if (viewName === 'moderacao') {
    loadModerationData();
  }
}

// Atualização da UI do Usuário e Controle de Acesso
function updateUserUI() {
  const userPill = document.getElementById('userPill');
  const navModMobile = document.getElementById('navItemModeracao');
  const navModDesk = document.getElementById('navItemModeracaoDesktop');
  const navPubMobile = document.getElementById('navItemNovaPub');
  const navPubDesk = document.getElementById('navItemNovaPubDesktop');
  const roleBadge = document.getElementById('newPubRoleBadge');

  if (state.user) {
    const primeiroNome = state.user.nome.split(' ')[0];
    userPill.innerHTML = `
      <span>👤 <strong>${primeiroNome}</strong></span>
      <span class="badge">${state.user.tipo}</span>
      <button onclick="logout()" class="user-pill-btn-logout" title="Sair do perfil">✕</button>
    `;

    // Controle de abas por perfil
    const isAdmin = state.user.tipo === 'ADMIN';
    const isOrg = state.user.tipo === 'ORGANIZACAO';

    if (navModMobile) navModMobile.style.display = isAdmin ? 'flex' : 'none';
    if (navModDesk) navModDesk.style.display = isAdmin ? 'flex' : 'none';

    if (navPubMobile) navPubMobile.style.display = (isAdmin || isOrg) ? 'flex' : 'none';
    if (navPubDesk) navPubDesk.style.display = (isAdmin || isOrg) ? 'flex' : 'none';

    if (roleBadge) roleBadge.innerText = state.user.tipo;
  } else {
    userPill.innerHTML = `<button onclick="loginAs('morador@cidadao.com', '123456')" class="btn-demo" style="padding:4px 10px;">Conectar</button>`;
    if (navModMobile) navModMobile.style.display = 'none';
    if (navModDesk) navModDesk.style.display = 'none';
    if (navPubMobile) navPubMobile.style.display = 'none';
    if (navPubDesk) navPubDesk.style.display = 'none';
  }
}

// ==========================================================================
// Handlers dos Controles Geoespaciais e Busca
// ==========================================================================
function setupEventHandlers() {
  // Slider de Raio
  const radiusRange = document.getElementById('radiusRange');
  const radiusVal = document.getElementById('radiusVal');

  radiusRange.addEventListener('input', (e) => {
    state.radiusKm = parseFloat(e.target.value);
    radiusVal.innerText = `${state.radiusKm.toFixed(1)} km`;
    updatePresetButtons(state.radiusKm);
  });

  radiusRange.addEventListener('change', () => {
    if (state.activeView === 'feed') loadFeed();
    if (state.activeView === 'mapa') initOrUpdateMap();
  });

  // Busca Textual Debounced
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  let searchTimeout;

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    if (btnClearSearch) btnClearSearch.style.display = val.length > 0 ? 'flex' : 'none';

    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.searchQuery = val.trim();
      loadFeed();
    }, 350);
  });

  // Abas de Categoria
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

function clearSearch() {
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  searchInput.value = '';
  if (btnClearSearch) btnClearSearch.style.display = 'none';
  state.searchQuery = '';
  loadFeed();
}

function setRadiusPreset(km) {
  state.radiusKm = parseFloat(km);
  const rRange = document.getElementById('radiusRange');
  const rVal = document.getElementById('radiusVal');
  if (rRange) rRange.value = state.radiusKm;
  if (rVal) rVal.innerText = `${state.radiusKm.toFixed(1)} km`;

  const mapRadiusSpan = document.getElementById('mapRadiusSpan');
  if (mapRadiusSpan) mapRadiusSpan.innerText = `${state.radiusKm.toFixed(1)} km`;

  updatePresetButtons(state.radiusKm);

  if (state.activeView === 'feed') loadFeed();
  if (state.activeView === 'mapa') initOrUpdateMap();
}

function updatePresetButtons(km) {
  document.querySelectorAll('.btn-preset').forEach(btn => {
    const val = parseFloat(btn.innerText);
    btn.classList.toggle('active', val === km);
  });
}

function setDefaultDates() {
  const dtInicio = document.getElementById('newPubDataInicio');
  const dtFim = document.getElementById('newPubDataFim');
  if (dtInicio && !dtInicio.value) {
    dtInicio.value = new Date().toISOString().split('T')[0];
  }
  if (dtFim && !dtFim.value) {
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);
    dtFim.value = in30Days.toISOString().split('T')[0];
  }
}

// Obter localização real do dispositivo
function getCurrentGpsLocation() {
  if (!('geolocation' in navigator)) {
    showToast('Geolocalização não suportada pelo seu navegador.', 'error');
    return;
  }

  showToast('Obtendo sinal GPS em tempo real...', 'info');

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      state.coords.lat = pos.coords.latitude;
      state.coords.lng = pos.coords.longitude;
      state.isGpsActive = true;

      const gpsText = document.getElementById('gpsText');
      if (gpsText) gpsText.innerText = 'GPS Real Ativo';

      const gpsIcon = document.getElementById('gpsIcon');
      if (gpsIcon) gpsIcon.innerText = '🎯';

      showToast('Sua coordenada GPS foi atualizada com sucesso!', 'success');

      if (state.activeView === 'feed') loadFeed();
      if (state.activeView === 'mapa') initOrUpdateMap();
    },
    (err) => {
      console.warn('GPS Error:', err.message);
      showToast('Permissão de GPS negada. Usando ponto base (SENAI FATESG).', 'info');
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

// ==========================================================================
// Carregar Feed Georreferenciado
// ==========================================================================
async function loadFeed(showSkeleton = true) {
  const container = document.getElementById('feedContainer');
  const statsText = document.getElementById('feedStatsText');

  if (showSkeleton) {
    container.innerHTML = `
      <div class="skeleton-card"><div class="skeleton-shimmer"></div></div>
      <div class="skeleton-card"><div class="skeleton-shimmer"></div></div>
      <div class="skeleton-card"><div class="skeleton-shimmer"></div></div>
    `;
  }

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

    if (!res.ok) throw new Error(data.error || 'Erro ao consultar feed.');

    const pubs = data.publicacoes || [];

    if (statsText) {
      statsText.innerText = `${pubs.length} ${pubs.length === 1 ? 'aviso encontrado' : 'avisos encontrados'} em até ${state.radiusKm} km`;
    }

    if (pubs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📡</div>
          <h4>Nenhum aviso encontrado neste raio (${state.radiusKm} km)</h4>
          <p>Tente expandir o alcance das notificações no slider acima ou trocar a categoria selecionada.</p>
          <button class="btn-primary" onclick="setRadiusPreset(15)" style="max-width:200px; margin:0 auto;">
            Expandir para 15 km
          </button>
        </div>
      `;
      return;
    }

    container.innerHTML = pubs.map(renderPublicationCard).join('');
  } catch (error) {
    container.innerHTML = `
      <div class="empty-state" style="border-color: #ef4444;">
        <div class="empty-state-icon">⚠️</div>
        <h4 style="color: #ef4444;">Erro ao carregar avisos</h4>
        <p>${error.message}</p>
        <button class="btn-outline" onclick="loadFeed()">Tentar Novamente</button>
      </div>
    `;
  }
}

// Renderização do Card de Publicação
function renderPublicationCard(pub) {
  const badgeColor = pub.cor_badge || '#2563eb';
  const imgUrl = pub.imagem_url || 'https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=800&q=80';
  
  // Cálculo de dias restantes
  const hoje = new Date();
  const dtFim = new Date(pub.data_fim);
  const diffDias = Math.ceil((dtFim - hoje) / (1000 * 60 * 60 * 24));
  const expiraText = diffDias <= 0 ? 'Expira hoje' : `Expira em ${diffDias} ${diffDias === 1 ? 'dia' : 'dias'}`;

  return `
    <article class="pub-card" data-id="${pub.id}">
      <div class="pub-card-image" style="background-image: url('${imgUrl}')">
        <span class="badge-category" style="background-color: ${badgeColor};">
          ${pub.categoria_icone || '📢'} ${pub.categoria_nome}
        </span>
        <span class="badge-distance">
          📍 ${parseFloat(pub.distancia_km).toFixed(1)} km
        </span>
      </div>
      <div class="pub-card-body">
        <h3 class="pub-card-title">${pub.titulo}</h3>
        <p class="pub-card-desc">${pub.descricao}</p>
        
        <div class="pub-card-meta">
          <div class="pub-card-meta-item">
            <span>🏢</span> <strong>${pub.autor_nome}</strong>
          </div>
          <div class="pub-card-meta-item">
            <span>📍</span> <span>${pub.endereco || 'Setor Universitário'}</span>
          </div>
          <div class="pub-card-meta-item" style="color: ${diffDias <= 3 ? '#dc2626' : 'inherit'}; font-weight:${diffDias <= 3 ? '600' : 'normal'};">
            <span>📅</span> <span>${expiraText} (${dtFim.toLocaleDateString('pt-BR')})</span>
          </div>
        </div>

        <div class="pub-card-actions">
          <button class="btn-primary" onclick="openDetailsModal(${pub.id})">
            Ver Detalhes
          </button>
          <button class="btn-outline" onclick="sharePublication(${pub.id}, '${encodeURIComponent(pub.titulo)}')" title="Compartilhar">
            🔗
          </button>
          <button class="btn-fav" onclick="toggleFavorite(${pub.id}, this)" title="Favoritar">
            ❤️
          </button>
        </div>
      </div>
    </article>
  `;
}

// Compartilhar Publicação (Web Share API ou Clipboard)
function sharePublication(id, encodedTitulo) {
  const titulo = decodeURIComponent(encodedTitulo);
  const shareData = {
    title: `${titulo} • Portal de Notificações`,
    text: `Confira este aviso na nossa região: ${titulo}`,
    url: `${window.location.origin}/#pub-${id}`
  };

  if (navigator.share) {
    navigator.share(shareData).catch(() => {});
  } else {
    navigator.clipboard.writeText(shareData.url).then(() => {
      showToast('Link do aviso copiado para a área de transferência!', 'success');
    }).catch(() => {
      showToast('Aviso pronto para compartilhamento!', 'info');
    });
  }
}

// ==========================================================================
// Mapa Interativo Geoespacial (Leaflet)
// ==========================================================================
async function initOrUpdateMap() {
  const mapElement = document.getElementById('mapContainer');
  if (!mapElement) return;

  const mapRadiusSpan = document.getElementById('mapRadiusSpan');
  if (mapRadiusSpan) mapRadiusSpan.innerText = `${state.radiusKm.toFixed(1)} km`;

  if (!state.map) {
    state.map = L.map('mapContainer').setView([state.coords.lat, state.coords.lng], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(state.map);
  } else {
    state.map.setView([state.coords.lat, state.coords.lng], 13);
  }

  // Limpar marcadores anteriores
  state.mapMarkers.forEach(m => state.map.removeLayer(m));
  state.mapMarkers = [];

  if (state.userCircle) state.map.removeLayer(state.userCircle);
  if (state.userMarker) state.map.removeLayer(state.userMarker);

  // Marcador customizado do Cidadão (Você)
  const userIcon = L.divIcon({
    className: 'custom-user-marker',
    html: `
      <div class="pulse-circle"></div>
      <div style="background:#00377a; color:white; border:3px solid white; border-radius:50%; width:34px; height:34px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 10px rgba(0,0,0,0.35); font-size:16px;">
        👤
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });

  state.userMarker = L.marker([state.coords.lat, state.coords.lng], { icon: userIcon })
    .addTo(state.map)
    .bindPopup(`
      <div style="font-family: inherit; font-size:12px; line-height:1.4;">
        <strong style="color:#004fb0; font-size:13px;">📍 Sua Localização de Referência</strong><br>
        ${state.user ? state.user.nome : 'Morador'}<br>
        Raio Ativo: <strong>${state.radiusKm.toFixed(1)} km</strong>
      </div>
    `);

  // Círculo de cobertura do raio de alcance
  state.userCircle = L.circle([state.coords.lat, state.coords.lng], {
    color: '#004fb0',
    weight: 2,
    fillColor: '#3b82f6',
    fillOpacity: 0.12,
    radius: state.radiusKm * 1000 // Metros
  }).addTo(state.map);

  // Buscar publicações para plotar marcadores no mapa
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
        html: `
          <div style="background:${pinColor}; color:white; border:2.5px solid white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 8px rgba(0,0,0,0.3); font-size:13px; font-weight:bold;">
            ${pub.categoria_icone || '📍'}
          </div>
        `,
        iconSize: [32, 32],
        iconAnchor: [16, 16]
      });

      const marker = L.marker([pub.latitude, pub.longitude], { icon: pinIcon }).addTo(state.map);
      marker.bindPopup(`
        <div style="font-family: inherit; max-width: 230px;">
          <span style="background:${pub.cor_badge}; color:white; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:bold; text-transform:uppercase;">
            ${pub.categoria_nome}
          </span>
          <h4 style="margin:8px 0 4px; font-size:13px; color:#0f172a; line-height:1.3;">${pub.titulo}</h4>
          <p style="font-size:11px; color:#64748b; margin-bottom:6px;">${pub.endereco}</p>
          <div style="font-size:11px; font-weight:700; color:#004fb0; margin-bottom:8px;">
            📍 a ${parseFloat(pub.distancia_km).toFixed(1)} km de você
          </div>
          <button onclick="openDetailsModal(${pub.id})" style="width:100%; padding:6px; background:#004fb0; color:white; border:none; border-radius:6px; cursor:pointer; font-size:11px; font-weight:700;">
            Ver Detalhes do Aviso
          </button>
        </div>
      `);
      state.mapMarkers.push(marker);
    });

    setTimeout(() => {
      state.map.invalidateSize();
    }, 200);
  } catch (err) {
    console.error('Erro ao plotar pins no mapa:', err);
  }
}

function centerMapOnUser() {
  if (state.map) {
    state.map.setView([state.coords.lat, state.coords.lng], 14, { animate: true });
    if (state.userMarker) state.userMarker.openPopup();
  }
}

// ==========================================================================
// Modal de Detalhes da Publicação (Tela 3 do Slide)
// ==========================================================================
async function openDetailsModal(pubId) {
  const modal = document.getElementById('detailsModal');
  const body = document.getElementById('detailsModalBody');
  document.body.classList.add('modal-open');
  modal.classList.add('active');
  
  body.innerHTML = `
    <div style="text-align:center; padding:40px 20px;">
      <div style="font-weight:600; color:#475569;">Carregando detalhes do aviso...</div>
    </div>
  `;

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
    const cleanWpp = pub.contato_whatsapp ? pub.contato_whatsapp.replace(/\D/g, '') : null;
    const wppLink = cleanWpp ? `https://wa.me/55${cleanWpp}` : null;

    body.innerHTML = `
      <div style="margin-bottom: 16px;">
        <span class="badge-category" style="position:static; background:${pub.cor_badge}; display:inline-block; margin-bottom:8px;">
          ${pub.categoria_icone || '📢'} ${pub.categoria_nome}
        </span>
        <h2 style="font-size: 1.35rem; color: #0f172a; margin-bottom: 8px; line-height:1.3;">${pub.titulo}</h2>
        <div style="display:flex; align-items:center; gap:8px; font-size: 0.9rem; color: #004fb0; font-weight: 700;">
          <span>📍 Distância de você: <strong>${parseFloat(pub.distancia_km).toFixed(1)} km</strong></span>
        </div>
      </div>

      ${pub.imagem_url ? `
        <div style="border-radius:10px; overflow:hidden; max-height:260px; margin-bottom:18px; border:1px solid #e2e8f0;">
          <img src="${pub.imagem_url}" style="width:100%; height:100%; object-fit:cover; display:block;">
        </div>
      ` : ''}

      <div style="font-size: 0.95rem; line-height: 1.6; color: #334155; margin-bottom: 20px;">
        ${pub.descricao}
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:10px; padding:16px; margin-bottom:20px; font-size:0.86rem;">
        <div style="margin-bottom:8px;"><strong>🏢 Responsável:</strong> ${pub.autor_nome} (${pub.autor_email})</div>
        <div style="margin-bottom:8px;"><strong>📍 Endereço:</strong> ${pub.endereco} - ${pub.bairro || 'Goiânia'}, ${pub.cidade || 'Goiânia'}/${pub.estado || 'GO'}</div>
        <div style="margin-bottom:8px;"><strong>📅 Vigência:</strong> Até ${new Date(pub.data_fim).toLocaleDateString('pt-BR')}</div>
        ${pub.contato_telefone ? `<div><strong>📞 Telefone:</strong> ${pub.contato_telefone}</div>` : ''}
      </div>

      <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px;">
        <a href="${gmapsUrl}" target="_blank" class="btn-primary" style="text-decoration:none; text-align:center;">
          🗺️ Como Chegar (Google Maps)
        </a>
        ${wppLink ? `
          <a href="${wppLink}" target="_blank" class="btn-outline" style="text-decoration:none; background:#22c55e; color:white; border-color:#22c55e;">
            💬 Conversar no WhatsApp
          </a>
        ` : ''}
      </div>

      <div style="border-top:1px solid #e2e8f0; padding-top:14px; display:flex; justify-content:space-between; align-items:center;">
        <button onclick="reportPublication(${pub.id})" style="background:none; border:none; color:#dc2626; font-size:0.82rem; cursor:pointer; font-weight:700;">
          🚩 Denunciar publicação imprópria à moderação
        </button>
      </div>
    `;
  } catch (error) {
    body.innerHTML = `
      <div style="color:#ef4444; padding:20px; text-align:center;">
        <h4>Erro ao carregar detalhes</h4>
        <p>${error.message}</p>
      </div>
    `;
  }
}

function closeDetailsModal() {
  const modal = document.getElementById('detailsModal');
  if (modal) modal.classList.remove('active');
  document.body.classList.remove('modal-open');
}

function handleModalOverlayClick(event, modalId) {
  if (event.target.id === modalId) {
    if (modalId === 'detailsModal') closeDetailsModal();
    if (modalId === 'dialogModal') closeDialogModal();
  }
}

// ==========================================================================
// Modal Genérico para Substituição de Prompts e Alerts Nativos
// ==========================================================================
let dialogResolve = null;

function showCustomDialog({ title, message, isPrompt = false, inputPlaceholder = '', confirmText = 'Confirmar', cancelText = 'Cancelar', isDanger = false }) {
  return new Promise((resolve) => {
    dialogResolve = resolve;

    const modal = document.getElementById('dialogModal');
    const titleEl = document.getElementById('dialogTitle');
    const msgEl = document.getElementById('dialogMessage');
    const inputGroup = document.getElementById('dialogInputGroup');
    const inputEl = document.getElementById('dialogInput');
    const btnConfirm = document.getElementById('dialogBtnConfirm');
    const btnCancel = document.getElementById('dialogBtnCancel');

    titleEl.innerText = title;
    msgEl.innerText = message;
    btnCancel.innerText = cancelText;
    btnConfirm.innerText = confirmText;

    if (isDanger) {
      btnConfirm.className = 'btn-reject';
    } else {
      btnConfirm.className = 'btn-primary';
    }

    if (isPrompt) {
      inputGroup.style.display = 'block';
      inputEl.value = '';
      inputEl.placeholder = inputPlaceholder;
      setTimeout(() => inputEl.focus(), 100);
    } else {
      inputGroup.style.display = 'none';
    }

    btnConfirm.onclick = () => {
      const result = isPrompt ? inputEl.value : true;
      closeDialogModal();
      resolve(result);
    };

    btnCancel.onclick = () => {
      closeDialogModal();
      resolve(null);
    };

    document.body.classList.add('modal-open');
    modal.classList.add('active');
  });
}

function closeDialogModal() {
  const modal = document.getElementById('dialogModal');
  if (modal) modal.classList.remove('active');
  document.body.classList.remove('modal-open');
  if (dialogResolve) {
    dialogResolve(null);
    dialogResolve = null;
  }
}

// ==========================================================================
// Favoritar e Desfavoritar Publicações
// ==========================================================================
async function toggleFavorite(pubId, btn) {
  if (!state.token) {
    showToast('Conecte-se para salvar publicações favoritas.', 'info');
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
      if (state.activeView === 'favoritos') loadFavorites();
    }
  } catch {
    showToast('Erro ao atualizar favoritos.', 'error');
  }
}

async function loadFavorites() {
  const container = document.getElementById('favContainer');
  container.innerHTML = `
    <div class="skeleton-card"><div class="skeleton-shimmer"></div></div>
    <div class="skeleton-card"><div class="skeleton-shimmer"></div></div>
  `;

  if (!state.token) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔒</div>
        <h4>Faça login para salvar seus avisos</h4>
        <p>Ao se conectar, você pode guardar avisos de saúde e serviços no seu perfil.</p>
      </div>
    `;
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
          <div class="empty-state-icon">🤍</div>
          <h4>Nenhum aviso favoritado ainda</h4>
          <p>Clique no ícone de coração nos avisos do feed para mantê-los arquivados aqui.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = favs.map(renderPublicationCard).join('');
  } catch (error) {
    container.innerHTML = `<div class="empty-state" style="color:red;">Erro ao buscar favoritos.</div>`;
  }
}

// ==========================================================================
// Denúncia de Publicação (Moderação Comunitária)
// ==========================================================================
async function reportPublication(pubId) {
  const motivo = await showCustomDialog({
    title: 'Denunciar Publicação',
    message: 'Descreva a irregularidade encontrada nesta publicação para análise da moderação:',
    isPrompt: true,
    inputPlaceholder: 'Ex: Conteúdo ofensivo, propaganda enganosa ou serviço fora do local...',
    confirmText: 'Enviar Denúncia',
    isDanger: true
  });

  if (!motivo || motivo.trim().length < 5) {
    if (motivo !== null) showToast('A denúncia precisa ter no mínimo 5 caracteres.', 'info');
    return;
  }

  try {
    const res = await fetch(`${state.apiBase}/publicacoes/${pubId}/denunciar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ motivo })
    });
    const data = await res.json();
    showToast(data.message || 'Denúncia registrada para análise da moderação!', 'success');
    closeDetailsModal();
  } catch {
    showToast('Erro ao registrar denúncia.', 'error');
  }
}

// ==========================================================================
// Nova Publicação (Organização / Admin)
// ==========================================================================
function previewImage(url) {
  const container = document.getElementById('imagePreviewContainer');
  const img = document.getElementById('imagePreview');
  if (url && url.startsWith('http')) {
    img.src = url;
    container.style.display = 'block';
  } else {
    container.style.display = 'none';
  }
}

async function submitNewPublication(e) {
  e.preventDefault();
  if (!state.token) {
    showToast('Conecte-se com um perfil de Organização ou Admin.', 'error');
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

  if (new Date(data_fim) < new Date(data_inicio)) {
    showToast('A data de término não pode ser anterior à data de início.', 'error');
    return;
  }

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
        latitude: state.coords.lat,
        longitude: state.coords.lng
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(data.message, 'success');
    document.getElementById('formNewPub').reset();
    document.getElementById('imagePreviewContainer').style.display = 'none';
    setDefaultDates();
    switchView('feed');
  } catch (error) {
    showToast(`Erro ao publicar: ${error.message}`, 'error');
  }
}

// ==========================================================================
// Perfil do Cidadão & Governança LGPD
// ==========================================================================
async function loadProfileData() {
  if (!state.token || !state.user) {
    showToast('Conecte-se para gerenciar suas preferências.', 'info');
    return;
  }

  document.getElementById('profNome').innerText = state.user.nome;
  document.getElementById('profEmail').innerText = state.user.email;
  document.getElementById('profTipo').innerText = state.user.tipo;
  document.getElementById('profRaioRange').value = state.user.raio_alcance_km || 5;
  document.getElementById('profRaioVal').innerText = `${state.user.raio_alcance_km || 5} km`;
  document.getElementById('profCotaDiaria').value = state.user.limite_diario_notificacoes || 5;

  const cats = state.user.categorias_interesse || ['SERVICO', 'PROMOCAO', 'SOCIAL'];
  document.getElementById('chkServico').checked = cats.includes('SERVICO');
  document.getElementById('chkPromocao').checked = cats.includes('PROMOCAO');
  document.getElementById('chkSocial').checked = cats.includes('SOCIAL');

  // Carregar status da cota anti-spam
  try {
    const res = await fetch(`${state.apiBase}/usuarios/quota`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const quota = await res.json();
    const percent = Math.min(100, Math.round((quota.recebidasHoje / quota.limiteDiario) * 100));

    document.getElementById('quotaStats').innerHTML = `
      <div style="background:#f8fafc; padding:14px; border-radius:10px; border:1px solid #e2e8f0; margin-top:10px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <strong style="font-size:0.85rem; color:#0f172a;">Consumo da Cota Diária Anti-Spam:</strong>
          <span style="font-size:0.8rem; font-weight:700; color:#004fb0;">${quota.recebidasHoje} de ${quota.limiteDiario}</span>
        </div>
        <div style="width:100%; height:8px; background:#e2e8f0; border-radius:4px; overflow:hidden;">
          <div style="width:${percent}%; height:100%; background:${percent >= 100 ? '#ef4444' : '#10b981'}; transition:width 0.4s;"></div>
        </div>
        <div style="font-size:0.75rem; color:#64748b; margin-top:6px;">
          ${quota.restantesHoje > 0 
            ? `Você ainda pode receber <strong>${quota.restantesHoje}</strong> notificações hoje sem sobrecarga.` 
            : '<span style="color:#ef4444; font-weight:700;">Limite diário atingido. O filtro anti-spam pausou novos envios push até amanhã.</span>'}
        </div>
      </div>
    `;
  } catch {
    // Ignora se rota de cota falhar
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
    setRadiusPreset(raio_alcance_km);

    showToast('Preferências salvas com sucesso!', 'success');
  } catch (err) {
    showToast(`Erro ao salvar: ${err.message}`, 'error');
  }
}

// Exclusão LGPD (Direito ao Esquecimento)
async function confirmLgpdDelete() {
  const confirmou = await showCustomDialog({
    title: 'Eliminação de Dados Pessoais (LGPD)',
    message: 'ATENÇÃO: Em conformidade com o Artigo 18 da LGPD, esta ação excluirá de forma irrevogável sua conta, dados cadastrais e histórico de notificações da plataforma. Deseja prosseguir?',
    confirmText: 'Sim, Excluir Definitivamente',
    cancelText: 'Cancelar',
    isDanger: true
  });

  if (!confirmou) return;

  try {
    const res = await fetch(`${state.apiBase}/usuarios/lgpd-delete`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });

    const data = await res.json();
    showToast(data.message || 'Seus dados foram excluídos com sucesso.', 'info');
    logout();
  } catch {
    showToast('Erro ao processar eliminação LGPD.', 'error');
  }
}

// ==========================================================================
// Painel de Moderação (Administrador)
// ==========================================================================
async function loadModerationData() {
  const modContainer = document.getElementById('modContainer');
  modContainer.innerHTML = '<div style="text-align:center; padding:30px;">Carregando fila de moderação...</div>';

  try {
    const res = await fetch(`${state.apiBase}/moderacao/pendentes`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    const pendentes = data.pendentes || [];

    if (pendentes.length === 0) {
      modContainer.innerHTML = `
        <div class="empty-state" style="border-color:#10b981;">
          <div class="empty-state-icon">✅</div>
          <h4 style="color:#059669;">Fila de Moderação em Dia</h4>
          <p>Não há publicações pendentes de aprovação no momento.</p>
        </div>
      `;
      return;
    }

    // Renderiza em formato duplo: Cards para mobile e Tabela para desktop
    modContainer.innerHTML = `
      <!-- Desktop Table -->
      <div class="mod-table-wrap">
        <table class="mod-table">
          <thead>
            <tr>
              <th>Publicação</th>
              <th>Entidade / Autor</th>
              <th>Data de Envio</th>
              <th>Status</th>
              <th>Ações de Moderação</th>
            </tr>
          </thead>
          <tbody>
            ${pendentes.map(p => `
              <tr>
                <td>
                  <strong>${p.titulo}</strong><br>
                  <span style="font-size:0.75rem; color:#64748b;">${p.categoria_nome} • ${p.bairro || 'Goiânia'}</span>
                </td>
                <td>
                  ${p.autor_nome}<br>
                  <span style="font-size:0.75rem; color:#64748b;">${p.autor_email}</span>
                </td>
                <td>${new Date(p.criado_em).toLocaleDateString('pt-BR')}</td>
                <td>
                  <span style="background:#fef3c7; color:#92400e; padding:3px 8px; border-radius:4px; font-size:0.72rem; font-weight:700;">
                    PENDENTE
                  </span>
                </td>
                <td>
                  <div style="display:flex; gap:6px;">
                    <button class="btn-approve" onclick="approvePublication(${p.id})">✓ Aprovar</button>
                    <button class="btn-reject" onclick="rejectPublication(${p.id})">✕ Reprovar</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <!-- Mobile Cards -->
      <div class="mod-cards-wrap">
        ${pendentes.map(p => `
          <div class="mod-item-card">
            <div class="mod-item-header">
              <span class="mod-item-title">${p.titulo}</span>
              <span style="background:#fef3c7; color:#92400e; padding:2px 8px; border-radius:4px; font-size:0.72rem; font-weight:700;">PENDENTE</span>
            </div>
            <div class="mod-item-meta">
              <strong>Categoria:</strong> ${p.categoria_nome}<br>
              <strong>Autor:</strong> ${p.autor_nome} (${p.autor_email})<br>
              <strong>Data:</strong> ${new Date(p.criado_em).toLocaleDateString('pt-BR')}
            </div>
            <div class="mod-item-actions">
              <button class="btn-approve" onclick="approvePublication(${p.id})">✓ Aprovar</button>
              <button class="btn-reject" onclick="rejectPublication(${p.id})">✕ Reprovar</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    modContainer.innerHTML = `<div style="color:red; padding:20px;">Erro ao carregar moderação: ${err.message}</div>`;
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
  const motivo = await showCustomDialog({
    title: 'Reprovar Publicação',
    message: 'Informe a justificativa de reprovação para orientar a entidade autora:',
    isPrompt: true,
    inputPlaceholder: 'Ex: Faltam informações sobre horário de atendimento...',
    confirmText: 'Confirmar Reprovação',
    isDanger: true
  });

  if (!motivo || motivo.trim().length < 5) {
    if (motivo !== null) showToast('A justificativa deve conter ao menos 5 caracteres.', 'info');
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
    showToast(data.message || 'Publicação reprovada.', 'info');
    loadModerationData();
  } catch {
    showToast('Erro ao reprovar publicação.', 'error');
  }
}

// ==========================================================================
// Alternador Rápido de Contas (Demonstração da Banca)
// ==========================================================================
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
      setRadiusPreset(state.user.raio_alcance_km);
    }

    // Marca o botão da demonstração ativo
    document.querySelectorAll('.btn-demo').forEach(b => {
      b.classList.toggle('active', b.dataset.email === email);
    });

    updateUserUI();
    showToast(`Conectado como: ${state.user.nome} (${state.user.tipo})`, 'success');

    // Registrar no socket
    if (state.socket && state.user) {
      state.socket.emit('registrar_usuario', { usuarioId: state.user.id, nome: state.user.nome });
    }

    if (state.activeView === 'feed') loadFeed();
    if (state.activeView === 'mapa') initOrUpdateMap();
    if (state.activeView === 'moderacao') loadModerationData();
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

// ==========================================================================
// Toast Notifier
// ==========================================================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.transition = 'opacity 0.3s, transform 0.3s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4200);
}
