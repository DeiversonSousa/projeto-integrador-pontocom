// ==========================================================================
// PONTOCOM • COMUNICAÇÃO COMUNITÁRIA POR REGIÃO • SENAI FATESG
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
  activeModTab: 'pendentes',
  activeConversationId: null,
  activeConversationData: null,
  socket: null,
  isGpsActive: false
};

// ==========================================================================
// Utilitários de Segurança e Escaping
// ==========================================================================
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  const div = document.createElement('div');
  div.innerText = String(str);
  return div.innerHTML;
}

function escapeAttr(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ==========================================================================
// Modo Escuro (Dark Mode)
// ==========================================================================
function initTheme() {
  const savedTheme = localStorage.getItem('ponto_theme') || 'light';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
  updateProfileThemeUI(savedTheme);
}

function setAppTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('ponto_theme', theme);
  updateThemeIcon(theme);
  updateProfileThemeUI(theme);
  showToast(`Modo ${theme === 'dark' ? 'Escuro 🌙' : 'Claro ☀️'} ativado!`, 'info');
}

function toggleDarkMode() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  const nextTheme = currentTheme === 'dark' ? 'light' : 'dark';
  setAppTheme(nextTheme);
}

function updateThemeIcon(theme) {
  const iconEl = document.getElementById('themeToggleIcon');
  if (iconEl) {
    iconEl.innerText = theme === 'dark' ? '☀️' : '🌙';
  }
}

function updateProfileThemeUI(theme) {
  const btnLight = document.getElementById('btnThemeLight');
  const btnDark = document.getElementById('btnThemeDark');
  if (btnLight && btnDark) {
    btnLight.classList.toggle('active', theme === 'light');
    btnDark.classList.toggle('active', theme === 'dark');
  }
}

// ==========================================================================
// Chime de Áudio para Notificações (Sintetizador Web Audio API)
// ==========================================================================
function playNotificationChime() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime); // Nota Lá (A5)
    osc.frequency.exponentialRampToValueAtTime(1320, ctx.currentTime + 0.14); // Mi (E6)

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.38);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.38);
  } catch {
    // Silencia se o navegador bloquear autoplay
  }
}

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
    playNotificationChime();
    mostrarNotificacaoPush(notif);
  });

  // Receber mensagem de chat em tempo real
  socket.on('nova_mensagem_chat', (dados) => {
    console.log('💬 Mensagem de chat recebida via WebSocket:', dados);
    handleIncomingChatMessage(dados);
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
    position: fixed; top: 68px; right: 12px; z-index: 9999;
    background: white; border-left: 5px solid ${cor};
    border-radius: 10px; padding: 12px 16px;
    max-width: 340px; box-shadow: 0 8px 25px rgba(0,0,0,0.18);
    animation: toastSlideUp 0.3s ease; cursor: pointer;
    display: flex; flex-direction: column; gap: 4px; border: 1px solid #e2e8f0;
  `;
  banner.innerHTML = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
      <span style="font-weight:800; color:${cor}; font-size:0.78rem; text-transform:uppercase;">
        ${icone} Aviso Próximo a Você
      </span>
      <span style="font-size:0.7rem; color:#94a3b8;">${notif.horario || 'Agora'}</span>
    </div>
    <div style="font-size:0.9rem; font-weight:700; color:#0f172a; line-height:1.25;">${notif.titulo}</div>
    <div style="font-size:0.76rem; color:#64748b; margin-top:2px;">
      📍 a ${notif.distancia_km} km · Notificação ${notif.notificacoes_hoje || 1}/${notif.limite_diario || 5} de hoje
    </div>
    <div style="font-size:0.72rem; color:#004fb0; font-weight:600; margin-top:2px;">Toque para ver detalhes completos →</div>
  `;

  banner.addEventListener('click', () => {
    openDetailsModal(notif.id);
    banner.remove();
  });

  document.body.appendChild(banner);

  setTimeout(() => {
    banner.style.transition = 'opacity 0.3s, transform 0.3s';
    banner.style.opacity = '0';
    banner.style.transform = 'translateX(20px)';
    setTimeout(() => banner.remove(), 300);
  }, 7000);

  if (window.Notification && Notification.permission === 'granted') {
    try {
      new Notification(`${icone} PontoCom • SENAI FATESG`, {
        body: `${notif.titulo} — a ${notif.distancia_km} km de você`,
        icon: '/img/icon.svg'
      });
    } catch {
      // Ignora erro nativo
    }
  }
}

// ==========================================================================
// Inicialização do DOM
// ==========================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initTheme();
  setupNavigation();
  setupEventHandlers();
  setDefaultDates();

  if (window.Notification && Notification.permission === 'default') {
    setTimeout(() => Notification.requestPermission(), 3000);
  }

  // Se não houver usuário logado, conecta como Morador padrão
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
    updateCashUI();
    loadConversations();
  }

  initWebSocket();
  loadFeed();

  window.addEventListener('resize', () => {
    if (state.map && state.activeView === 'mapa') {
      state.map.invalidateSize();
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeDetailsModal();
      closeDialogModal();
      closeAuthModal();
      closeEditModal();
      closeWalletModal();
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

  // O raio de alcance e controles geoespaciais devem aparecer somente quando o usuário estiver em feed e mapa
  const controlsCard = document.getElementById('controlsCard');
  if (controlsCard) {
    controlsCard.style.display = (viewName === 'feed' || viewName === 'mapa') ? 'block' : 'none';
  }

  document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));
  const targetSection = document.getElementById(`view-${viewName}`);
  if (targetSection) targetSection.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(b => {
    b.classList.toggle('active', b.dataset.view === viewName);
  });

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (viewName === 'feed') {
    loadFeed();
  } else if (viewName === 'mapa') {
    setTimeout(initOrUpdateMap, 150);
  } else if (viewName === 'favoritos') {
    loadFavorites();
  } else if (viewName === 'chat') {
    loadConversations();
  } else if (viewName === 'perfil') {
    loadProfileData();
  } else if (viewName === 'moderacao') {
    loadModerationData();
  } else if (viewName === 'novapub') {
    initNovaPubView();
  }
}

// Atualização da UI do Usuário
function updateUserUI() {
  const userPill = document.getElementById('userPill');
  const navModMobile = document.getElementById('navItemModeracao');
  const navModDesk = document.getElementById('navItemModeracaoDesktop');
  const navPubMobile = document.getElementById('navItemNovaPub');
  const navPubDesk = document.getElementById('navItemNovaPubDesktop');
  const roleBadge = document.getElementById('newPubRoleBadge');
  const cashValEl = document.getElementById('headerCashVal');

  if (state.user) {
    const primeiroNome = state.user.nome.split(' ')[0];
    userPill.innerHTML = `
      <span onclick="openAuthModal()" style="cursor:pointer;" title="Clique para trocar de conta">👤 <strong>${primeiroNome}</strong></span>
      <span class="badge">${state.user.tipo}</span>
      <button onclick="logout()" class="user-pill-btn-logout" title="Sair do perfil">✕</button>
    `;

    const isAdmin = state.user.tipo === 'ADMIN';

    if (navModMobile) navModMobile.style.display = isAdmin ? 'flex' : 'none';
    if (navModDesk) navModDesk.style.display = isAdmin ? 'flex' : 'none';

    // Cidadãos, organizações e admin podem publicar ações regionais
    if (navPubMobile) navPubMobile.style.display = 'flex';
    if (navPubDesk) navPubDesk.style.display = 'flex';

    if (roleBadge) roleBadge.innerText = state.user.tipo;

    if (cashValEl) {
      cashValEl.innerText = parseFloat(state.user.saldo_cash || '0').toFixed(2);
    }
  } else {
    userPill.innerHTML = `<button onclick="openAuthModal()" class="btn-primary" style="padding:4px 10px; font-size:0.75rem;">Entrar</button>`;
    if (navModMobile) navModMobile.style.display = 'none';
    if (navModDesk) navModDesk.style.display = 'none';
    if (navPubMobile) navPubMobile.style.display = 'none';
    if (navPubDesk) navPubDesk.style.display = 'none';
    if (cashValEl) cashValEl.innerText = '0.00';
  }
}

// ==========================================================================
// Handlers dos Controles Geoespaciais e Busca
// ==========================================================================
function setupEventHandlers() {
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
      statsText.innerText = `${pubs.length} ${pubs.length === 1 ? 'aviso encontrado' : 'avisos encontrados'} em até ${state.radiusKm.toFixed(1)} km`;
    }

    if (pubs.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📡</div>
          <h4>Nenhum aviso encontrado neste raio (${state.radiusKm.toFixed(1)} km)</h4>
          <p>Tente expandir o alcance das notificações no slider acima ou trocar a categoria selecionada.</p>
          <button class="btn-primary" onclick="setRadiusPreset(15)" style="max-width:180px; margin:0 auto;">
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
  
  const hoje = new Date();
  const dtFim = new Date(pub.data_fim);
  const diffDias = Math.ceil((dtFim - hoje) / (1000 * 60 * 60 * 24));
  const expiraText = diffDias <= 0 ? 'Expira hoje' : `Expira em ${diffDias} ${diffDias === 1 ? 'dia' : 'dias'}`;

  const isDestaque = pub.destaque === true && (!pub.destaque_ate || new Date(pub.destaque_ate) >= hoje);
  const isOwner = state.user && state.user.id === pub.id_autor;
  const isAdmin = state.user && state.user.tipo === 'ADMIN';

  return `
    <article class="pub-card ${isDestaque ? 'destaque' : ''}" data-id="${pub.id}">
      <div class="pub-card-image" style="background-image: url('${imgUrl}')">
        ${isDestaque ? `
          <span class="badge-destaque">
            ⭐ DESTAQUE
          </span>
        ` : ''}
        <span class="badge-category" style="background-color: ${badgeColor};">
          ${pub.categoria_icone || '📢'} ${pub.categoria_nome}
        </span>
        <span class="badge-distance">
          📍 ${parseFloat(pub.distancia_km).toFixed(1)} km
        </span>
      </div>
      <div class="pub-card-body">
        <h3 class="pub-card-title">${escapeHtml(pub.titulo)}</h3>
        <p class="pub-card-desc">${escapeHtml(pub.descricao)}</p>
        
        <div class="pub-card-meta">
          <div class="pub-card-meta-item">
            <span>🏢</span> <strong>${escapeHtml(pub.autor_nome)}</strong>
          </div>
          <div class="pub-card-meta-item">
            <span>📍</span> <span>${escapeHtml(pub.endereco || 'Setor Universitário')}</span>
          </div>
          <div class="pub-card-meta-item" style="color: ${diffDias <= 3 ? '#dc2626' : 'inherit'}; font-weight:${diffDias <= 3 ? '600' : 'normal'};">
            <span>📅</span> <span>${expiraText} (${dtFim.toLocaleDateString('pt-BR')})</span>
          </div>
        </div>

        <div class="pub-card-actions">
          <button class="btn-primary" onclick="openDetailsModal(${pub.id})">
            Ver Detalhes
          </button>
          ${(!isOwner && state.user) ? `
            <button class="btn-card-action btn-chat" onclick="startChatWithUser(${pub.id_autor}, ${pub.id}, '${escapeAttr(pub.autor_nome)}', '${escapeAttr(pub.titulo)}')" title="Conversar com autor">
              💬 Chat
            </button>
          ` : ''}
          ${(isOwner || isAdmin) ? `
            <button class="btn-card-action btn-edit" onclick="openEditModal(${pub.id})" title="Editar aviso">
              ✏️ Editar
            </button>
            <button class="btn-card-action btn-delete" onclick="confirmDeletePublication(${pub.id})" title="Excluir aviso">
              🗑️ Excluir
            </button>
          ` : ''}
          ${((isOwner || isAdmin) && !isDestaque) ? `
            <button class="btn-card-action btn-destacar" onclick="confirmDestacarPublication(${pub.id})" title="Destacar este aviso no topo do feed com Tokens">
              ⭐ Destacar
            </button>
          ` : ''}
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

function sharePublication(id, encodedTitulo) {
  const titulo = decodeURIComponent(encodedTitulo);
  const shareData = {
    title: `${titulo} • PontoCom`,
    text: `Confira este aviso no PontoCom da nossa região: ${titulo}`,
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

  state.mapMarkers.forEach(m => state.map.removeLayer(m));
  state.mapMarkers = [];

  if (state.userCircle) state.map.removeLayer(state.userCircle);
  if (state.userMarker) state.map.removeLayer(state.userMarker);

  const userIcon = L.divIcon({
    className: 'custom-user-marker',
    html: `
      <div class="pulse-circle"></div>
      <div style="background:#00377a; color:white; border:3px solid white; border-radius:50%; width:32px; height:32px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 8px rgba(0,0,0,0.35); font-size:15px;">
        👤
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
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

  state.userCircle = L.circle([state.coords.lat, state.coords.lng], {
    color: '#004fb0',
    weight: 2,
    fillColor: '#3b82f6',
    fillOpacity: 0.12,
    radius: state.radiusKm * 1000
  }).addTo(state.map);

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
          <div style="background:${pinColor}; color:white; border:2.5px solid white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; box-shadow:0 3px 8px rgba(0,0,0,0.3); font-size:12px; font-weight:bold;">
            ${pub.categoria_icone || '📍'}
          </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });

      const marker = L.marker([pub.latitude, pub.longitude], { icon: pinIcon }).addTo(state.map);
      marker.bindPopup(`
        <div style="font-family: inherit; max-width: 220px;">
          <span style="background:${pub.cor_badge}; color:white; padding:2px 6px; border-radius:4px; font-size:9px; font-weight:bold; text-transform:uppercase;">
            ${pub.categoria_nome}
          </span>
          <h4 style="margin:6px 0 3px; font-size:12px; color:#0f172a; line-height:1.25;">${pub.titulo}</h4>
          <p style="font-size:10px; color:#64748b; margin-bottom:5px;">${pub.endereco}</p>
          <div style="font-size:10px; font-weight:700; color:#004fb0; margin-bottom:6px;">
            📍 a ${parseFloat(pub.distancia_km).toFixed(1)} km de você
          </div>
          <button onclick="openDetailsModal(${pub.id})" style="width:100%; padding:5px; background:#004fb0; color:white; border:none; border-radius:5px; cursor:pointer; font-size:10px; font-weight:700;">
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
// Modal de Detalhes da Publicação
// ==========================================================================
async function openDetailsModal(pubId) {
  const modal = document.getElementById('detailsModal');
  const body = document.getElementById('detailsModalBody');
  document.body.classList.add('modal-open');
  modal.classList.add('active');
  
  body.innerHTML = `
    <div style="text-align:center; padding:30px 16px;">
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

    const isOwner = state.user && state.user.id === pub.id_autor;
    const isAdmin = state.user && state.user.tipo === 'ADMIN';
    const isDestaque = pub.destaque === true && (!pub.destaque_ate || new Date(pub.destaque_ate) >= new Date());

    body.innerHTML = `
      <div style="margin-bottom: 14px;">
        ${isDestaque ? `
          <div><span class="badge-destaque" style="position:static; display:inline-flex; margin-bottom:8px;">⭐ DESTAQUE REGIONAL ATIVO</span></div>
        ` : ''}
        <span class="badge-category" style="position:static; background:${pub.cor_badge}; display:inline-block; margin-bottom:6px;">
          ${pub.categoria_icone || '📢'} ${pub.categoria_nome}
        </span>
        <h2 style="font-size: 1.25rem; color: #0f172a; margin-bottom: 6px; line-height:1.3;">${escapeHtml(pub.titulo)}</h2>
        <div style="display:flex; align-items:center; gap:6px; font-size: 0.85rem; color: #004fb0; font-weight: 700;">
          <span>📍 Distância de você: <strong>${parseFloat(pub.distancia_km).toFixed(1)} km</strong></span>
        </div>
      </div>

      ${pub.imagem_url ? `
        <div style="border-radius:8px; overflow:hidden; max-height:220px; margin-bottom:14px; border:1px solid #e2e8f0;">
          <img src="${pub.imagem_url}" style="width:100%; height:100%; object-fit:cover; display:block;">
        </div>
      ` : ''}

      <div style="font-size: 0.9rem; line-height: 1.55; color: #334155; margin-bottom: 16px;">
        ${escapeHtml(pub.descricao)}
      </div>

      <div style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px; margin-bottom:16px; font-size:0.82rem; line-height:1.45;">
        <div style="margin-bottom:6px;"><strong>🏢 Responsável:</strong> ${escapeHtml(pub.autor_nome)} (${pub.autor_email})</div>
        <div style="margin-bottom:6px;"><strong>📍 Endereço:</strong> ${escapeHtml(pub.endereco)} - ${escapeHtml(pub.bairro || 'Goiânia')}, ${pub.cidade || 'Goiânia'}/${pub.estado || 'GO'}</div>
        <div style="margin-bottom:6px;"><strong>📅 Vigência:</strong> Até ${new Date(pub.data_fim).toLocaleDateString('pt-BR')}</div>
        ${pub.contato_telefone ? `<div><strong>📞 Telefone:</strong> ${escapeHtml(pub.contato_telefone)}</div>` : ''}
        ${pub.editado_em ? `<div style="color:#d97706; margin-top:4px;"><strong>✏️ Editado em:</strong> ${new Date(pub.editado_em).toLocaleDateString('pt-BR')} ${new Date(pub.editado_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}</div>` : ''}
      </div>

      <div style="display: flex; gap: 8px; flex-direction: column; margin-bottom: 16px;">
        ${(!isOwner && state.user) ? `
          <button onclick="closeDetailsModal(); startChatWithUser(${pub.id_autor}, ${pub.id}, '${escapeAttr(pub.autor_nome)}', '${escapeAttr(pub.titulo)}')" class="btn-primary" style="background:#0284c7; border-color:#0284c7; justify-content:center;">
            💬 Conversar com ${escapeHtml(pub.autor_nome)} no Chat
          </button>
        ` : ''}
        <a href="${gmapsUrl}" target="_blank" class="btn-primary" style="text-decoration:none; text-align:center;">
          🗺️ Como Chegar (Google Maps)
        </a>
        ${wppLink ? `
          <a href="${wppLink}" target="_blank" class="btn-outline" style="text-decoration:none; background:#22c55e; color:white; border-color:#22c55e; justify-content:center;">
            💬 Conversar no WhatsApp
          </a>
        ` : ''}
        ${(isOwner || isAdmin) ? `
          <div style="display:flex; gap:8px;">
            <button onclick="closeDetailsModal(); openEditModal(${pub.id})" class="btn-outline" style="flex:1; justify-content:center; color:#92400e; border-color:#f59e0b; background:#fef3c7;">
              ✏️ Editar
            </button>
            <button onclick="closeDetailsModal(); confirmDeletePublication(${pub.id})" class="btn-outline" style="flex:1; justify-content:center; color:#b91c1c; border-color:#fca5a5; background:#fee2e2;">
              🗑️ Excluir
            </button>
          </div>
        ` : ''}
        ${((isOwner || isAdmin) && !isDestaque) ? `
          <button onclick="closeDetailsModal(); confirmDestacarPublication(${pub.id})" class="btn-primary" style="background:linear-gradient(135deg, #f59e0b, #d97706); border:none; justify-content:center;">
            ⭐ Impulsionar / Destacar Post (15 Tokens)
          </button>
        ` : ''}
      </div>

      <div style="border-top:1px solid #e2e8f0; padding-top:10px; display:flex; justify-content:space-between; align-items:center;">
        <button onclick="reportPublication(${pub.id})" style="background:none; border:none; color:#dc2626; font-size:0.78rem; cursor:pointer; font-weight:700;">
          🚩 Denunciar publicação imprópria à moderação
        </button>
      </div>
    `;
  } catch (error) {
    body.innerHTML = `
      <div style="color:#ef4444; padding:16px; text-align:center;">
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
    if (modalId === 'authModal') closeAuthModal();
    if (modalId === 'editPubModal') closeEditModal();
    if (modalId === 'walletModal') closeWalletModal();
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
// Modal de Login / Cadastro de Novo Usuário
// ==========================================================================
function openAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    document.body.classList.add('modal-open');
    modal.classList.add('active');
    switchAuthTab('login');
  }
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('active');
    document.body.classList.remove('modal-open');
  }
}

function switchAuthTab(tab) {
  const tabLogin = document.getElementById('tabAuthLogin');
  const tabReg = document.getElementById('tabAuthRegister');
  const formLogin = document.getElementById('formLogin');
  const formReg = document.getElementById('formRegister');
  const modalTitle = document.getElementById('authModalTitle');

  if (tab === 'login') {
    tabLogin.classList.add('active');
    tabReg.classList.remove('active');
    formLogin.style.display = 'block';
    formReg.style.display = 'none';
    modalTitle.innerText = 'Entrar na Plataforma';
  } else {
    tabLogin.classList.remove('active');
    tabReg.classList.add('active');
    formLogin.style.display = 'none';
    formReg.style.display = 'block';
    modalTitle.innerText = 'Criar Nova Conta';
  }
}

async function submitCustomLogin(e) {
  e.preventDefault();
  const email = document.getElementById('loginEmail').value.trim();
  const senha = document.getElementById('loginSenha').value;

  await loginAs(email, senha);
  closeAuthModal();
}

async function submitCustomRegister(e) {
  e.preventDefault();
  const nome = document.getElementById('regNome').value.trim();
  const email = document.getElementById('regEmail').value.trim();
  const senha = document.getElementById('regSenha').value;
  const tipo = document.getElementById('regTipo').value;

  try {
    const res = await fetch(`${state.apiBase}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome, email, senha, tipo })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast('Conta criada com sucesso! Conectando...', 'success');
    closeAuthModal();
    await loginAs(email, senha);
  } catch (err) {
    showToast(`Erro no cadastro: ${err.message}`, 'error');
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

function toggleBoostSelection(isBoost) {
  const normalCard = document.getElementById('optionPubNormalCard');
  const boostCard = document.getElementById('optionPubBoostCard');
  const normalRadio = document.getElementById('modoPubNormal');
  const boostRadio = document.getElementById('modoPubBoost');
  const submitText = document.getElementById('btnSubmitPubText');
  const submitIcon = document.getElementById('btnSubmitPubIcon');
  const warningBox = document.getElementById('boostBalanceWarning');
  const balanceNotice = document.getElementById('boostBalanceNotice');
  const balanceValEl = document.getElementById('newPubTokenBalance');

  const saldo = parseFloat(state.user?.saldo_cash || '0');
  if (balanceValEl) balanceValEl.innerText = saldo.toFixed(2);

  if (isBoost) {
    if (normalRadio) normalRadio.checked = false;
    if (boostRadio) boostRadio.checked = true;
    if (normalCard) normalCard.classList.remove('active');
    if (boostCard) {
      boostCard.classList.add('active');
      boostCard.classList.add('boost-active');
    }
    if (submitText) submitText.innerText = 'Publicar com Impulso (15 Tokens)';
    if (submitIcon) submitIcon.innerText = '⭐';
    if (warningBox) warningBox.style.display = 'flex';

    if (saldo < 15) {
      if (warningBox) warningBox.classList.add('insufficient');
      if (balanceNotice) {
        balanceNotice.innerHTML = `⚠️ Saldo insuficiente para impulsionar. <a href="javascript:void(0)" onclick="openWalletModal()" style="color:#2563eb; font-weight:700; text-decoration:underline;">Recarregar Tokens</a>`;
      }
    } else {
      if (warningBox) warningBox.classList.remove('insufficient');
      if (balanceNotice) {
        balanceNotice.innerHTML = `<span style="color:#059669; font-weight:700;">✓ Saldo suficiente para impulsionamento (15 Tokens).</span>`;
      }
    }
  } else {
    if (normalRadio) normalRadio.checked = true;
    if (boostRadio) boostRadio.checked = false;
    if (normalCard) normalCard.classList.add('active');
    if (boostCard) {
      boostCard.classList.remove('active');
      boostCard.classList.remove('boost-active');
    }
    if (submitText) submitText.innerText = 'Publicar Normalmente';
    if (submitIcon) submitIcon.innerText = '🚀';
    if (warningBox) warningBox.style.display = 'none';
  }
}

function initNovaPubView() {
  toggleBoostSelection(false);
  const balanceValEl = document.getElementById('newPubTokenBalance');
  if (balanceValEl) {
    balanceValEl.innerText = parseFloat(state.user?.saldo_cash || '0').toFixed(2);
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

  const isBoost = document.getElementById('modoPubBoost')?.checked || false;
  if (isBoost) {
    const saldo = parseFloat(state.user?.saldo_cash || '0');
    if (saldo < 15) {
      const recarregar = await showCustomDialog({
        title: 'Saldo Insuficiente de Tokens',
        message: `Você possui ${saldo.toFixed(2)} Tokens e são necessários 15.00 Tokens para impulsionar esta publicação no topo do feed. Deseja recarregar agora?`,
        confirmText: 'Recarregar Tokens',
        cancelText: 'Cancelar'
      });
      if (recarregar) openWalletModal();
      return;
    }
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
        longitude: state.coords.lng,
        impulsionar: isBoost
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(data.message, 'success');
    if (isBoost) playNotificationChime();

    if (data.novoSaldo !== undefined && data.novoSaldo !== null) {
      state.user.saldo_cash = data.novoSaldo;
      localStorage.setItem('user', JSON.stringify(state.user));
      updateCashUI();
    }

    document.getElementById('formNewPub').reset();
    document.getElementById('imagePreviewContainer').style.display = 'none';
    setDefaultDates();
    toggleBoostSelection(false);
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

  const currentTheme = localStorage.getItem('ponto_theme') || 'light';
  updateProfileThemeUI(currentTheme);

  try {
    const res = await fetch(`${state.apiBase}/usuarios/quota`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const quota = await res.json();
    const percent = Math.min(100, Math.round((quota.recebidasHoje / quota.limiteDiario) * 100));

    document.getElementById('quotaStats').innerHTML = `
      <div class="quota-stats-card">
        <div class="quota-stats-header">
          <strong>Consumo da Cota Diária Anti-Spam:</strong>
          <span>${quota.recebidasHoje} de ${quota.limiteDiario}</span>
        </div>
        <div class="quota-bar-wrap">
          <div class="quota-bar-fill" style="width:${percent}%; background:${percent >= 100 ? '#ef4444' : '#10b981'};"></div>
        </div>
        <div class="quota-stats-footer">
          ${quota.restantesHoje > 0 
            ? `Você ainda pode receber <strong>${quota.restantesHoje}</strong> notificações hoje sem sobrecarga.` 
            : '<span style="color:#ef4444; font-weight:700;">Limite diário atingido. O filtro anti-spam pausou novos envios push até amanhã.</span>'}
        </div>
      </div>
    `;
  } catch {
    // Ignora falha de cota
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
// Painel de Moderação (Administrador - Com Sub-abas)
// ==========================================================================
function switchModTab(tabName) {
  state.activeModTab = tabName;
  const tabPend = document.getElementById('tabModPendentes');
  const tabDen = document.getElementById('tabModDenuncias');

  if (tabPend && tabDen) {
    tabPend.classList.toggle('active', tabName === 'pendentes');
    tabDen.classList.toggle('active', tabName === 'denuncias');
  }

  loadModerationData();
}

async function loadModerationData() {
  if (state.activeModTab === 'denuncias') {
    await loadModerationDenuncias();
  } else {
    await loadModerationPendentes();
  }
}

async function loadModerationPendentes() {
  const modContainer = document.getElementById('modContainer');
  modContainer.innerHTML = '<div style="text-align:center; padding:24px; font-size:0.86rem; color:#64748b;">Carregando avisos pendentes...</div>';

  try {
    const res = await fetch(`${state.apiBase}/moderacao/pendentes`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    const pendentes = data.pendentes || [];

    const badgePend = document.getElementById('badgeModPendentes');
    if (badgePend) badgePend.innerText = pendentes.length;

    if (pendentes.length === 0) {
      modContainer.innerHTML = `
        <div class="empty-state" style="border-color:#10b981;">
          <div class="empty-state-icon">✅</div>
          <h4 style="color:#059669;">Nenhum aviso pendente</h4>
          <p>Todas as publicações submetidas já foram analisadas.</p>
        </div>
      `;
      return;
    }

    modContainer.innerHTML = `
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
                  <strong>${escapeHtml(p.titulo)}</strong><br>
                  <span style="font-size:0.75rem; color:#64748b;">${escapeHtml(p.categoria_nome)} • ${escapeHtml(p.bairro || 'Goiânia')}</span>
                  ${p.editado_em ? `<br><small style="color:#c2410c; font-weight:600;">✏️ Editado em ${new Date(p.editado_em).toLocaleDateString('pt-BR')} ${new Date(p.editado_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}</small>` : ''}
                </td>
                <td>
                  ${escapeHtml(p.autor_nome)}<br>
                  <span style="font-size:0.75rem; color:#64748b;">${escapeHtml(p.autor_email)}</span>
                </td>
                <td>${new Date(p.criado_em).toLocaleDateString('pt-BR')}</td>
                <td>
                  <span style="background:${p.editado_em ? '#ffedd5' : '#fef3c7'}; color:${p.editado_em ? '#c2410c' : '#92400e'}; padding:3px 8px; border-radius:4px; font-size:0.7rem; font-weight:700;">
                    ${p.editado_em ? 'REEDIÇÃO PENDENTE' : 'PENDENTE'}
                  </span>
                </td>
                <td>
                  <div style="display:flex; gap:6px; flex-wrap:wrap;">
                    <button class="btn-approve" onclick="approvePublication(${p.id})">✓ Aprovar</button>
                    <button class="btn-reject" onclick="rejectPublication(${p.id})">✕ Reprovar</button>
                    <button class="btn-outline btn-sm" onclick="openEditModal(${p.id})" title="Editar aviso como Administrador" style="padding:4px 8px;">✏️</button>
                    <button class="btn-outline btn-sm" onclick="confirmDeletePublication(${p.id})" title="Excluir aviso como Administrador" style="padding:4px 8px; color:#b91c1c;">🗑️</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="mod-cards-wrap">
        ${pendentes.map(p => `
          <div class="mod-item-card">
            <div class="mod-item-header">
              <span class="mod-item-title">${p.titulo}</span>
              <span style="background:#fef3c7; color:#92400e; padding:2px 6px; border-radius:4px; font-size:0.68rem; font-weight:700;">PENDENTE</span>
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
    modContainer.innerHTML = `<div style="color:red; padding:16px;">Erro ao carregar moderação: ${err.message}</div>`;
  }
}

async function loadModerationDenuncias() {
  const modContainer = document.getElementById('modContainer');
  modContainer.innerHTML = '<div style="text-align:center; padding:24px; font-size:0.86rem; color:#64748b;">Carregando denúncias comunitárias...</div>';

  try {
    const res = await fetch(`${state.apiBase}/moderacao/denuncias`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    const denuncias = data.denuncias || [];

    const badgeDen = document.getElementById('badgeModDenuncias');
    if (badgeDen) badgeDen.innerText = denuncias.length;

    if (denuncias.length === 0) {
      modContainer.innerHTML = `
        <div class="empty-state" style="border-color:#10b981;">
          <div class="empty-state-icon">🛡️</div>
          <h4 style="color:#059669;">Nenhuma denúncia registrada</h4>
          <p>A comunidade não apontou irregularidades nas publicações ativas.</p>
        </div>
      `;
      return;
    }

    modContainer.innerHTML = `
      <div class="mod-table-wrap">
        <table class="mod-table">
          <thead>
            <tr>
              <th>Publicação Alvo</th>
              <th>Denunciante</th>
              <th>Motivo Apontado</th>
              <th>Data</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${denuncias.map(d => `
              <tr>
                <td>
                  <strong>${d.publicacao_titulo}</strong><br>
                  <span style="font-size:0.75rem; color:#64748b;">Autor: ${d.autor_nome}</span>
                </td>
                <td>
                  ${d.denunciante_nome}<br>
                  <span style="font-size:0.75rem; color:#64748b;">${d.denunciante_email}</span>
                </td>
                <td>
                  <em style="color:#b91c1c;">"${d.motivo}"</em>
                </td>
                <td>${new Date(d.data_denuncia).toLocaleDateString('pt-BR')}</td>
                <td>
                  <button class="btn-reject" onclick="suspendReportedPublication(${d.publicacao_id})">
                    🛑 Suspender Aviso
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <div class="mod-cards-wrap">
        ${denuncias.map(d => `
          <div class="mod-item-card" style="border-left: 4px solid #ef4444;">
            <div class="mod-item-header">
              <span class="mod-item-title">${d.publicacao_titulo}</span>
              <span style="background:#fee2e2; color:#b91c1c; padding:2px 6px; border-radius:4px; font-size:0.68rem; font-weight:700;">DENÚNCIA</span>
            </div>
            <div class="mod-item-meta">
              <strong>Motivo:</strong> <span style="color:#b91c1c;">"${d.motivo}"</span><br>
              <strong>Denunciante:</strong> ${d.denunciante_nome}<br>
              <strong>Data:</strong> ${new Date(d.data_denuncia).toLocaleDateString('pt-BR')}
            </div>
            <div class="mod-item-actions">
              <button class="btn-reject" onclick="suspendReportedPublication(${d.publicacao_id})">
                🛑 Suspender Publicação Denunciada
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (err) {
    modContainer.innerHTML = `<div style="color:red; padding:16px;">Erro ao carregar denúncias: ${err.message}</div>`;
  }
}

async function suspendReportedPublication(pubId) {
  const confirmou = await showCustomDialog({
    title: 'Suspender Publicação Denunciada',
    message: 'Deseja suspender imediatamente esta publicação do feed e mapa da comunidade?',
    confirmText: 'Sim, Suspender',
    cancelText: 'Cancelar',
    isDanger: true
  });

  if (!confirmou) return;

  try {
    const res = await fetch(`${state.apiBase}/moderacao/${pubId}/suspender`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    showToast(data.message || 'Publicação suspensa com sucesso.', 'info');
    loadModerationData();
  } catch {
    showToast('Erro ao suspender publicação.', 'error');
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

    document.querySelectorAll('.btn-demo').forEach(b => {
      b.classList.toggle('active', b.dataset.email === email);
    });

    updateUserUI();
    updateCashUI();
    loadConversations();
    showToast(`Conectado: ${state.user.nome.split(' ')[0]} (${state.user.tipo})`, 'success');

    if (state.socket && state.user) {
      socket.emit('registrar_usuario', { usuarioId: state.user.id, nome: state.user.nome });
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
    toast.style.transition = 'opacity 0.25s, transform 0.25s';
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, 3800);
}

// ==========================================================================
// SISTEMA DE TOKENS & CARTEIRA DE TOKENS
// ==========================================================================
async function updateCashUI() {
  if (!state.token || !state.user) return;
  try {
    const res = await fetch(`${state.apiBase}/usuarios/carteira`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    if (res.ok) {
      const data = await res.json();
      const saldo = data.saldoTokens !== undefined ? data.saldoTokens : data.saldoCash;
      state.user.saldo_cash = saldo;
      localStorage.setItem('user', JSON.stringify(state.user));
      const cashValEl = document.getElementById('headerCashVal');
      if (cashValEl) cashValEl.innerText = parseFloat(saldo).toFixed(2);
      const newPubTokenEl = document.getElementById('newPubTokenBalance');
      if (newPubTokenEl) newPubTokenEl.innerText = parseFloat(saldo).toFixed(2);
    }
  } catch (e) {
    console.warn('Erro ao atualizar saldo de tokens:', e);
  }
}

async function openWalletModal() {
  if (!state.token) {
    showToast('Conecte-se para acessar sua carteira de Tokens.', 'info');
    openAuthModal();
    return;
  }

  const modal = document.getElementById('walletModal');
  const balanceEl = document.getElementById('walletModalBalance');
  const historyList = document.getElementById('walletHistoryList');

  document.body.classList.add('modal-open');
  modal.classList.add('active');

  balanceEl.innerText = parseFloat(state.user?.saldo_cash || '0').toFixed(2);
  historyList.innerHTML = '<div style="padding:16px; text-align:center; color:#64748b; font-size:0.85rem;">Carregando extrato...</div>';

  try {
    const res = await fetch(`${state.apiBase}/usuarios/carteira`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const saldo = data.saldoTokens !== undefined ? data.saldoTokens : (data.saldoCash || 0);
    balanceEl.innerText = parseFloat(saldo).toFixed(2);
    state.user.saldo_cash = saldo;
    localStorage.setItem('user', JSON.stringify(state.user));

    const cashValEl = document.getElementById('headerCashVal');
    if (cashValEl) cashValEl.innerText = parseFloat(saldo).toFixed(2);

    const transacoes = data.transacoes || [];
    if (transacoes.length === 0) {
      historyList.innerHTML = '<div style="padding:16px; text-align:center; color:#64748b; font-size:0.8rem;">Nenhuma movimentação realizada ainda.</div>';
      return;
    }

    historyList.innerHTML = transacoes.map(t => {
      const valNum = parseFloat(t.valor);
      const isPos = valNum >= 0;
      return `
        <div class="wallet-history-item">
          <div>
            <div class="wallet-history-desc">${escapeHtml(t.descricao || t.tipo)}</div>
            <small style="color:var(--text-subtle); font-size:0.7rem;">${new Date(t.criado_em).toLocaleDateString('pt-BR')} ${new Date(t.criado_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}</small>
          </div>
          <div class="wallet-history-val ${isPos ? 'positive' : 'negative'}">
            ${isPos ? '+' : ''}${valNum.toFixed(2)} Tokens
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    historyList.innerHTML = `<div style="padding:12px; color:red; font-size:0.8rem;">Erro ao carregar histórico: ${err.message}</div>`;
  }
}

function closeWalletModal() {
  const modal = document.getElementById('walletModal');
  if (modal) modal.classList.remove('active');
  document.body.classList.remove('modal-open');
}

async function executeBuyCash(quantia) {
  if (!state.token) return;
  try {
    const res = await fetch(`${state.apiBase}/usuarios/comprar-cash`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ valor: quantia, metodo: 'PIX Instantâneo Simulado' })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(data.message, 'success');
    playNotificationChime();
    const saldo = data.saldoTokens !== undefined ? data.saldoTokens : data.saldoCash;
    state.user.saldo_cash = saldo;
    localStorage.setItem('user', JSON.stringify(state.user));

    const headerVal = document.getElementById('headerCashVal');
    if (headerVal) headerVal.innerText = parseFloat(saldo).toFixed(2);
    const newPubTokenEl = document.getElementById('newPubTokenBalance');
    if (newPubTokenEl) newPubTokenEl.innerText = parseFloat(saldo).toFixed(2);

    openWalletModal();
  } catch (err) {
    showToast(`Erro na recarga: ${err.message}`, 'error');
  }
}

async function confirmDestacarPublication(pubId) {
  if (!state.token) {
    showToast('Conecte-se para impulsionar sua publicação.', 'info');
    openAuthModal();
    return;
  }

  const confirmou = await showCustomDialog({
    title: '⭐ Impulsionar Publicação com Tokens',
    message: 'Deseja destacar esta publicação com o selo dourado no topo do feed por 7 dias? Custo: 15.00 Tokens.',
    confirmText: 'Confirmar Destaque (15 Tokens)',
    cancelText: 'Cancelar'
  });

  if (!confirmou) return;

  try {
    const res = await fetch(`${state.apiBase}/publicacoes/${pubId}/destacar`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();

    if (!res.ok) {
      if (data.saldoAtual !== undefined) {
        const querRecarregar = await showCustomDialog({
          title: 'Saldo Insuficiente de Tokens',
          message: data.error,
          confirmText: 'Recarregar Agora',
          cancelText: 'Cancelar'
        });
        if (querRecarregar) openWalletModal();
        return;
      }
      throw new Error(data.error);
    }

    showToast(data.message, 'success');
    playNotificationChime();
    state.user.saldo_cash = data.novoSaldo;
    localStorage.setItem('user', JSON.stringify(state.user));
    const headerVal = document.getElementById('headerCashVal');
    if (headerVal) headerVal.innerText = parseFloat(data.novoSaldo).toFixed(2);

    loadFeed();
  } catch (err) {
    showToast(`Erro ao destacar: ${err.message}`, 'error');
  }
}

// ==========================================================================
// EDIÇÃO E EXCLUSÃO DE PUBLICAÇÕES (ADMIN & AUTOR)
// ==========================================================================
async function openEditModal(pubId) {
  if (!state.token) {
    showToast('Conecte-se para editar publicações.', 'info');
    openAuthModal();
    return;
  }

  try {
    const res = await fetch(`${state.apiBase}/publicacoes/${pubId}`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const pub = data.publicacao;
    document.getElementById('editPubId').value = pub.id;
    document.getElementById('editPubTitulo').value = pub.titulo;
    document.getElementById('editPubCategoria').value = pub.categoria_chave;
    document.getElementById('editPubDescricao').value = pub.descricao;
    document.getElementById('editPubEndereco').value = pub.endereco;
    document.getElementById('editPubWhatsapp').value = pub.contato_whatsapp || '';
    document.getElementById('editPubImagem').value = pub.imagem_url || '';

    if (pub.data_inicio) {
      document.getElementById('editPubDataInicio').value = pub.data_inicio.split('T')[0];
    }
    if (pub.data_fim) {
      document.getElementById('editPubDataFim').value = pub.data_fim.split('T')[0];
    }

    const notice = document.getElementById('editPubReapprovalNotice');
    const isAdmin = state.user && state.user.tipo === 'ADMIN';
    if (notice) {
      notice.style.display = isAdmin ? 'none' : 'block';
    }

    const heading = document.getElementById('editModalHeading');
    if (heading) {
      heading.innerText = isAdmin ? '✏️ Editar Publicação (Administrador)' : '✏️ Editar Minha Publicação';
    }

    const modal = document.getElementById('editPubModal');
    document.body.classList.add('modal-open');
    modal.classList.add('active');
  } catch (err) {
    showToast(`Erro ao carregar dados da publicação: ${err.message}`, 'error');
  }
}

function closeEditModal() {
  const modal = document.getElementById('editPubModal');
  if (modal) modal.classList.remove('active');
  document.body.classList.remove('modal-open');
}

async function submitEditPublication(e) {
  e.preventDefault();
  if (!state.token) return;

  const id = document.getElementById('editPubId').value;
  const titulo = document.getElementById('editPubTitulo').value;
  const categoria_chave = document.getElementById('editPubCategoria').value;
  const descricao = document.getElementById('editPubDescricao').value;
  const endereco = document.getElementById('editPubEndereco').value;
  const data_inicio = document.getElementById('editPubDataInicio').value;
  const data_fim = document.getElementById('editPubDataFim').value;
  const contato_whatsapp = document.getElementById('editPubWhatsapp').value;
  const imagem_url = document.getElementById('editPubImagem').value;

  try {
    const res = await fetch(`${state.apiBase}/publicacoes/${id}`, {
      method: 'PUT',
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
        imagem_url
      })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(data.message, 'success');
    closeEditModal();
    loadFeed();
    if (state.activeView === 'moderacao') loadModerationData();
  } catch (err) {
    showToast(`Erro ao salvar edição: ${err.message}`, 'error');
  }
}

async function confirmDeletePublication(pubId) {
  if (!state.token) return;

  const confirmou = await showCustomDialog({
    title: '🗑️ Excluir Publicação',
    message: 'Tem certeza que deseja excluir esta publicação? Esta ação é definitiva e removerá o aviso da comunidade.',
    confirmText: 'Sim, Excluir Definitivamente',
    cancelText: 'Cancelar',
    isDanger: true
  });

  if (!confirmou) return;

  try {
    const res = await fetch(`${state.apiBase}/publicacoes/${pubId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    showToast(data.message, 'info');
    loadFeed();
    if (state.activeView === 'moderacao') loadModerationData();
  } catch (err) {
    showToast(`Erro ao excluir publicação: ${err.message}`, 'error');
  }
}

// ==========================================================================
// SISTEMA DE CHAT EM TEMPO REAL
// ==========================================================================
async function loadConversations() {
  const listEl = document.getElementById('chatConversationsList');
  if (!listEl) return;

  if (!state.token) {
    listEl.innerHTML = `
      <div class="chat-empty-state">
        <div class="chat-empty-icon">🔒</div>
        <h4>Faça login para ver suas mensagens</h4>
        <button class="btn-primary" onclick="openAuthModal()" style="margin-top:8px;">Entrar na Conta</button>
      </div>
    `;
    return;
  }

  listEl.innerHTML = '<div style="padding:16px; text-align:center; color:#64748b; font-size:0.85rem;">Carregando conversas...</div>';

  try {
    const res = await fetch(`${state.apiBase}/chat/conversas`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const conversas = data.conversas || [];

    // Contagem total de não lidas
    let totalNaoLidas = 0;
    conversas.forEach(c => totalNaoLidas += parseInt(c.nao_lidas || 0, 10));
    updateChatBadgeUI(totalNaoLidas);

    if (conversas.length === 0) {
      listEl.innerHTML = `
        <div style="padding:28px 16px; text-align:center; color:#64748b; font-size:0.84rem;">
          <div style="font-size:2.2rem; margin-bottom:8px;">💬</div>
          <strong>Nenhuma conversa iniciada</strong>
          <p style="margin-top:6px; line-height:1.4;">Clique em <strong>"💬 Chat"</strong> em qualquer publicação para tirar dúvidas diretamente com o anunciante.</p>
        </div>
      `;
      return;
    }

    listEl.innerHTML = conversas.map(c => {
      const isActive = state.activeConversationId === c.id;
      const dataFormatada = c.ultima_mensagem_data
        ? new Date(c.ultima_mensagem_data).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' })
        : '';
      const naoLidas = parseInt(c.nao_lidas || 0, 10);
      const avatarIcon = c.contato_tipo === 'ORGANIZACAO' ? '🏢' : c.contato_tipo === 'ADMIN' ? '🛡️' : '👤';

      return `
        <div class="chat-conversa-item ${isActive ? 'active' : ''}" onclick="openConversation(${c.id})">
          <div class="chat-avatar">
            ${avatarIcon}
          </div>
          <div class="chat-conversa-info">
            <div class="chat-conversa-top">
              <strong>${escapeHtml(c.contato_nome)}</strong>
              <span class="chat-conversa-date">${dataFormatada}</span>
            </div>
            <div class="chat-conversa-snippet">
              ${c.ultima_mensagem ? escapeHtml(c.ultima_mensagem) : '<em style="color:var(--text-subtle)">Sem mensagens ainda</em>'}
            </div>
            ${c.publicacao_titulo ? `
              <div class="chat-conversa-pub-tag">
                📌 ${escapeHtml(c.publicacao_titulo)}
              </div>
            ` : ''}
          </div>
          ${naoLidas > 0 ? `<span class="chat-unread-badge">${naoLidas}</span>` : ''}
        </div>
      `;
    }).join('');
  } catch (err) {
    listEl.innerHTML = `<div style="padding:16px; color:red; font-size:0.82rem;">Erro ao carregar conversas: ${err.message}</div>`;
  }
}

function updateChatBadgeUI(count) {
  const badgeDesk = document.getElementById('chatBadgeDesktop');
  const badgeMob = document.getElementById('chatBadgeMobile');

  [badgeDesk, badgeMob].forEach(el => {
    if (el) {
      if (count > 0) {
        el.innerText = count > 99 ? '99+' : count;
        el.style.display = 'inline-block';
      } else {
        el.style.display = 'none';
      }
    }
  });
}

async function openConversation(conversaId) {
  state.activeConversationId = conversaId;

  const chatContainer = document.querySelector('.chat-container');
  if (chatContainer) chatContainer.classList.add('mobile-active-chat');

  if (state.socket) {
    state.socket.emit('entrar_conversa', { conversaId });
  }

  // Atualiza classe ativa na lista lateral
  document.querySelectorAll('.chat-conversa-item').forEach(el => el.classList.remove('active'));

  const emptyState = document.getElementById('chatEmptyState');
  const activeArea = document.getElementById('chatActiveArea');
  if (emptyState) emptyState.style.display = 'none';
  if (activeArea) activeArea.style.display = 'flex';

  const messagesContainer = document.getElementById('chatMessagesContainer');
  messagesContainer.innerHTML = '<div style="padding:20px; text-align:center; color:#64748b; font-size:0.84rem;">Carregando mensagens...</div>';

  try {
    const res = await fetch(`${state.apiBase}/chat/conversas/${conversaId}/mensagens`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    state.activeConversationData = data.conversa;

    const outro = data.conversa.outroUsuario;
    document.getElementById('chatActiveName').innerText = outro.nome;
    document.getElementById('chatActiveType').innerText = outro.tipo;
    document.getElementById('chatActiveAvatar').innerText = outro.tipo === 'ORGANIZACAO' ? '🏢' : outro.tipo === 'ADMIN' ? '🛡️' : '👤';

    const pubInfo = document.getElementById('chatActivePubInfo');
    if (data.conversa.publicacao_titulo) {
      pubInfo.innerText = `📌 Sobre: ${data.conversa.publicacao_titulo}`;
      pubInfo.style.display = 'inline-block';
    } else {
      pubInfo.style.display = 'none';
    }

    renderChatMessages(data.mensagens || []);
    loadConversations();
  } catch (err) {
    messagesContainer.innerHTML = `<div style="padding:16px; color:red; font-size:0.84rem;">Erro ao carregar mensagens: ${err.message}</div>`;
  }
}

function renderChatMessages(mensagens) {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;

  if (mensagens.length === 0) {
    container.innerHTML = `
      <div style="margin:auto; text-align:center; color:#64748b; font-size:0.85rem; padding:24px;">
        <span style="font-size:2rem; display:block; margin-bottom:8px;">👋</span>
        Inicie a conversa enviando uma mensagem no campo abaixo!
      </div>
    `;
    return;
  }

  container.innerHTML = mensagens.map(m => {
    const isMine = state.user && m.id_remetente === state.user.id;
    const hora = new Date(m.criado_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });
    return `
      <div class="chat-msg ${isMine ? 'mine' : 'theirs'}">
        ${!isMine ? `<span class="chat-msg-author">${escapeHtml(m.remetente_nome)}</span>` : ''}
        <div class="chat-msg-bubble">${escapeHtml(m.conteudo)}</div>
        <span class="chat-msg-time">${hora}</span>
      </div>
    `;
  }).join('');

  container.scrollTop = container.scrollHeight;
}

function closeActiveChatOnMobile() {
  const chatContainer = document.querySelector('.chat-container');
  if (chatContainer) chatContainer.classList.remove('mobile-active-chat');
  state.activeConversationId = null;
}

async function submitChatMessage(e) {
  e.preventDefault();
  if (!state.token || !state.activeConversationId) return;

  const input = document.getElementById('chatMessageInput');
  const conteudo = input.value.trim();
  if (!conteudo) return;

  input.value = '';
  input.focus();

  try {
    const res = await fetch(`${state.apiBase}/chat/conversas/${state.activeConversationId}/mensagens`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ conteudo })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    appendMessageToThread(data.mensagem);
    loadConversations();
  } catch (err) {
    showToast(`Erro ao enviar mensagem: ${err.message}`, 'error');
  }
}

function appendMessageToThread(mensagem) {
  const container = document.getElementById('chatMessagesContainer');
  if (!container) return;

  // Se houver tela de boas-vindas vazia, limpa antes de inserir
  if (container.querySelector('.chat-msg') === null) {
    container.innerHTML = '';
  }

  const isMine = state.user && mensagem.id_remetente === state.user.id;
  const hora = new Date(mensagem.criado_em).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' });

  const msgEl = document.createElement('div');
  msgEl.className = `chat-msg ${isMine ? 'mine' : 'theirs'}`;
  msgEl.innerHTML = `
    ${!isMine ? `<span class="chat-msg-author">${escapeHtml(mensagem.remetente_nome)}</span>` : ''}
    <div class="chat-msg-bubble">${escapeHtml(mensagem.conteudo)}</div>
    <span class="chat-msg-time">${hora}</span>
  `;
  container.appendChild(msgEl);
  container.scrollTop = container.scrollHeight;
}

function handleIncomingChatMessage(dados) {
  const { conversaId, mensagem } = dados;

  if (state.user && mensagem.id_remetente === state.user.id) return;

  playNotificationChime();

  if (state.activeConversationId === conversaId) {
    appendMessageToThread(mensagem);
    // Atualiza status de lida no servidor
    fetch(`${state.apiBase}/chat/conversas/${conversaId}/mensagens`, {
      headers: { 'Authorization': `Bearer ${state.token}` }
    }).catch(() => {});
  } else {
    showToast(`💬 ${mensagem.remetente_nome}: "${mensagem.conteudo.substring(0, 32)}..."`, 'info');
    loadConversations();
  }
}

async function startChatWithUser(targetUserId, pubId, authorName, pubTitle) {
  if (!state.token) {
    showToast('Faça login para conversar.', 'info');
    openAuthModal();
    return;
  }

  if (state.user && state.user.id === targetUserId) {
    showToast('Você é o próprio autor desta publicação.', 'info');
    return;
  }

  try {
    const res = await fetch(`${state.apiBase}/chat/iniciar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${state.token}`
      },
      body: JSON.stringify({ destinatario_id: targetUserId, id_publicacao: pubId })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    switchView('chat');
    await openConversation(data.conversa.id);
  } catch (err) {
    showToast(`Erro ao abrir conversa: ${err.message}`, 'error');
  }
}
