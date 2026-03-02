(function() {
  'use strict';

  // Encontrar el script actual y leer data-key
  // document.currentScript funciona en HTML estatico, pero es null cuando
  // React/Vue/Angular insertan el script dinamicamente via createElement
  let scriptTag = document.currentScript;
  if (!scriptTag) {
    // Fallback: buscar por src o data-key
    scriptTag = document.querySelector('script[data-key][src*="webchat/widget"]')
      || document.querySelector('script[data-key][src*="crecetec"]');
  }

  // Si aun no se encuentra, verificar si hay un div contenedor con data attributes
  const API_KEY = scriptTag?.getAttribute('data-key')
    || document.getElementById('crecetec-chat')?.getAttribute('data-key');

  if (!API_KEY) {
    console.error('[CreceTec Chat] No se encontro data-key. Usa: <script src="..." data-key="TU_KEY"></script>');
    return;
  }

  // Detectar API base desde src del script o desde data-api-url
  const scriptSrc = scriptTag?.getAttribute('src') || '';
  const API_BASE = scriptTag?.getAttribute('data-api-url')
    || document.getElementById('crecetec-chat')?.getAttribute('data-api-url')
    || (scriptSrc ? scriptSrc.replace('/api/webchat/widget.js', '') : '');

  // Session ID persistente
  const STORAGE_KEY = 'crecetec_chat_session';
  const MESSAGES_KEY = 'crecetec_chat_messages';
  let SESSION_ID = localStorage.getItem(STORAGE_KEY);
  if (!SESSION_ID) {
    SESSION_ID = 'web_' + crypto.randomUUID();
    localStorage.setItem(STORAGE_KEY, SESSION_ID);
  }

  let config = null;
  let isOpen = false;
  let isLoading = false;
  let messages = [];
  let lastMsgId = 0;
  let pollInterval = null;
  let hasSentMessage = false;

  // Restaurar mensajes previos
  try {
    const saved = localStorage.getItem(MESSAGES_KEY);
    if (saved) messages = JSON.parse(saved);
  } catch(e) {}

  function saveMessages() {
    try {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(messages.slice(-100)));
    } catch(e) {}
  }

  // ==========================================
  // ESTILOS
  // ==========================================
  function getStyles(cfg) {
    const color = cfg.color_primario || '#2d3a5c';
    const textColor = cfg.color_texto_header || '#ffffff';
    const pos = cfg.posicion || 'bottom-right';
    const isLeft = pos === 'bottom-left';
    const sizes = { pequeno: { btn: 50, width: 320, height: 420 }, normal: { btn: 60, width: 370, height: 520 }, grande: { btn: 70, width: 420, height: 600 } };
    const s = sizes[cfg.tamano] || sizes.normal;

    return `
      :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      * { box-sizing: border-box; margin: 0; padding: 0; }

      .ct-container { position: fixed; bottom: 20px; ${isLeft ? 'left: 20px' : 'right: 20px'}; z-index: 2147483647; font-size: 14px; }

      /* Boton flotante */
      .ct-bubble { width: ${s.btn}px; height: ${s.btn}px; border-radius: 50%; background: ${color}; color: ${textColor}; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 16px rgba(0,0,0,0.2); transition: transform 0.2s, box-shadow 0.2s; position: relative; }
      .ct-bubble:hover { transform: scale(1.08); box-shadow: 0 6px 24px rgba(0,0,0,0.3); }
      .ct-bubble svg { width: 28px; height: 28px; fill: ${textColor}; transition: opacity 0.2s; }
      .ct-bubble .ct-icon-close { position: absolute; opacity: 0; }
      .ct-bubble.open .ct-icon-chat { opacity: 0; }
      .ct-bubble.open .ct-icon-close { opacity: 1; }

      /* Ventana */
      .ct-window { display: none; position: absolute; bottom: ${s.btn + 16}px; ${isLeft ? 'left: 0' : 'right: 0'}; width: ${s.width}px; height: ${s.height}px; max-height: calc(100vh - 120px); background: #fff; border-radius: 16px; box-shadow: 0 8px 40px rgba(0,0,0,0.15); overflow: hidden; flex-direction: column; animation: ct-slideUp 0.25s ease-out; }
      .ct-window.open { display: flex; }

      @keyframes ct-slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }

      /* Header */
      .ct-header { background: ${color}; color: ${textColor}; padding: 16px 20px; display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
      .ct-header-logo { width: 36px; height: 36px; border-radius: 50%; object-fit: cover; background: rgba(255,255,255,0.2); }
      .ct-header-info { flex: 1; }
      .ct-header-title { font-size: 16px; font-weight: 600; }
      .ct-header-status { font-size: 12px; opacity: 0.85; }

      /* Mensajes */
      .ct-messages { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; background: #f7f8fa; }
      .ct-msg { max-width: 85%; padding: 10px 14px; border-radius: 16px; line-height: 1.45; word-wrap: break-word; white-space: pre-wrap; font-size: 14px; }
      .ct-msg-bot { background: #fff; color: #1a1a1a; border-bottom-left-radius: 4px; align-self: flex-start; box-shadow: 0 1px 2px rgba(0,0,0,0.06); }
      .ct-msg-user { background: ${color}; color: ${textColor}; border-bottom-right-radius: 4px; align-self: flex-end; }

      /* Botones de flujo */
      .ct-buttons { display: flex; flex-direction: column; gap: 6px; margin-top: 8px; align-self: flex-start; max-width: 85%; }
      .ct-btn-option { background: #fff; color: ${color}; border: 1.5px solid ${color}; border-radius: 20px; padding: 8px 16px; cursor: pointer; font-size: 13px; font-weight: 500; transition: all 0.15s; text-align: left; }
      .ct-btn-option:hover { background: ${color}; color: ${textColor}; }
      .ct-btn-option:disabled { opacity: 0.5; cursor: default; }

      /* Lista */
      .ct-list { display: flex; flex-direction: column; gap: 4px; margin-top: 8px; align-self: flex-start; max-width: 85%; }
      .ct-list-item { background: #fff; border: 1px solid #e2e4e9; border-radius: 10px; padding: 10px 14px; cursor: pointer; font-size: 13px; transition: all 0.15s; }
      .ct-list-item:hover { border-color: ${color}; background: #f0f2ff; }
      .ct-list-title { font-weight: 500; color: #1a1a1a; }
      .ct-list-desc { font-size: 12px; color: #666; margin-top: 2px; }

      /* Typing */
      .ct-typing { display: flex; align-items: center; gap: 4px; padding: 10px 14px; align-self: flex-start; }
      .ct-typing-dot { width: 7px; height: 7px; border-radius: 50%; background: #b0b3ba; animation: ct-bounce 1.2s infinite; }
      .ct-typing-dot:nth-child(2) { animation-delay: 0.2s; }
      .ct-typing-dot:nth-child(3) { animation-delay: 0.4s; }
      @keyframes ct-bounce { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-6px); } }

      /* Input */
      .ct-input-area { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-top: 1px solid #e8e8e8; background: #fff; flex-shrink: 0; }
      .ct-input { flex: 1; border: 1px solid #ddd; border-radius: 24px; padding: 10px 16px; font-size: 14px; outline: none; font-family: inherit; resize: none; max-height: 80px; line-height: 1.4; }
      .ct-input:focus { border-color: ${color}; }
      .ct-input::placeholder { color: #aaa; }
      .ct-send { width: 38px; height: 38px; border-radius: 50%; background: ${color}; color: ${textColor}; border: none; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: opacity 0.15s; }
      .ct-send:disabled { opacity: 0.4; cursor: default; }
      .ct-send svg { width: 18px; height: 18px; fill: ${textColor}; }

      /* Fuera de horario */
      .ct-offline { padding: 20px; text-align: center; background: #fff8f0; border-radius: 12px; margin: 16px; }
      .ct-offline-icon { font-size: 32px; margin-bottom: 8px; }
      .ct-offline-text { color: #666; font-size: 14px; line-height: 1.5; }

      /* Powered by */
      .ct-powered { text-align: center; padding: 6px; font-size: 11px; color: #bbb; background: #fff; }
      .ct-powered a { color: #999; text-decoration: none; }

      /* Responsive movil */
      @media (max-width: 480px) {
        .ct-window { width: calc(100vw - 24px); height: calc(100vh - 100px); ${isLeft ? 'left: -8px' : 'right: -8px'}; bottom: ${s.btn + 12}px; border-radius: 12px; }
      }
    `;
  }

  // ==========================================
  // SVG ICONS
  // ==========================================
  const ICON_CHAT = '<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>';
  const ICON_CLOSE = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
  const ICON_SEND = '<svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';

  // ==========================================
  // POLLING - Recibir mensajes del admin/bot
  // ==========================================
  function startPolling(renderFn, messagesEl, scrollFn) {
    if (pollInterval) return;
    pollInterval = setInterval(async function() {
      if (!hasSentMessage || isLoading) return;
      try {
        const url = API_BASE + '/api/webchat/poll?api_key=' + encodeURIComponent(API_KEY)
          + '&session_id=' + encodeURIComponent(SESSION_ID)
          + (lastMsgId ? '&last_id=' + lastMsgId : '');
        const res = await fetch(url);
        const data = await res.json();
        if (data.success && data.mensajes && data.mensajes.length > 0) {
          let added = false;
          for (const m of data.mensajes) {
            // Evitar duplicados: solo agregar si el ID es mayor al ultimo visto
            if (m.id > lastMsgId) {
              // Verificar que no sea un mensaje que ya se mostro via la respuesta de send()
              const isDuplicate = messages.some(function(existing) {
                return existing.from === 'bot' && existing.contenido === m.contenido && existing._serverId === m.id;
              });
              if (!isDuplicate) {
                messages.push({ tipo: m.tipo, contenido: m.contenido, from: 'bot', _serverId: m.id });
                added = true;
              }
              lastMsgId = m.id;
            }
          }
          if (added) {
            saveMessages();
            renderFn(messagesEl);
            scrollFn(messagesEl);
          }
        }
      } catch(e) { /* silencioso */ }
    }, 3000);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // Sincronizar lastMsgId con el servidor para no duplicar mensajes ya mostrados
  async function syncLastMsgId() {
    try {
      const url = API_BASE + '/api/webchat/poll?api_key=' + encodeURIComponent(API_KEY)
        + '&session_id=' + encodeURIComponent(SESSION_ID);
      const res = await fetch(url);
      const data = await res.json();
      if (data.success && data.mensajes && data.mensajes.length > 0) {
        lastMsgId = data.mensajes[data.mensajes.length - 1].id;
      }
    } catch(e) { /* silencioso */ }
  }

  // ==========================================
  // CREAR WIDGET
  // ==========================================
  function createWidget() {
    const host = document.createElement('div');
    host.id = 'crecetec-chat-widget';
    const shadow = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = getStyles(config);
    shadow.appendChild(style);

    const container = document.createElement('div');
    container.className = 'ct-container';
    container.innerHTML = `
      <div class="ct-window" id="ctWindow">
        <div class="ct-header">
          ${config.logo_url ? `<img class="ct-header-logo" src="${escapeAttr(config.logo_url)}" alt="">` : ''}
          <div class="ct-header-info">
            <div class="ct-header-title">${escape(config.titulo_chat || config.nombre_marca || 'Chat')}</div>
            <div class="ct-header-status" id="ctStatus">En linea</div>
          </div>
        </div>
        <div class="ct-messages" id="ctMessages"></div>
        <div class="ct-input-area" id="ctInputArea">
          <textarea class="ct-input" id="ctInput" placeholder="Escribe un mensaje..." rows="1"></textarea>
          <button class="ct-send" id="ctSend"><svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg></button>
        </div>
        <div class="ct-powered">Powered by <a href="https://crecetec.com" target="_blank" rel="noopener">CreceTec</a></div>
      </div>
      <button class="ct-bubble" id="ctBubble">
        <span class="ct-icon-chat">${ICON_CHAT}</span>
        <span class="ct-icon-close">${ICON_CLOSE}</span>
      </button>
    `;
    shadow.appendChild(container);
    document.body.appendChild(host);

    // Referencias
    const bubble = shadow.getElementById('ctBubble');
    const window_ = shadow.getElementById('ctWindow');
    const messagesEl = shadow.getElementById('ctMessages');
    const input = shadow.getElementById('ctInput');
    const sendBtn = shadow.getElementById('ctSend');
    const statusEl = shadow.getElementById('ctStatus');
    const inputArea = shadow.getElementById('ctInputArea');

    // Verificar horario
    if (isOutsideHours()) {
      inputArea.style.display = 'none';
      const offlineEl = document.createElement('div');
      offlineEl.className = 'ct-offline';
      offlineEl.innerHTML = `
        <div class="ct-offline-icon">&#128340;</div>
        <div class="ct-offline-text">${escape(config.mensaje_fuera_horario || 'Estamos fuera de horario.')}</div>
      `;
      messagesEl.after(offlineEl);
      statusEl.textContent = 'Fuera de horario';
    }

    // Toggle ventana
    bubble.addEventListener('click', function() {
      isOpen = !isOpen;
      window_.classList.toggle('open', isOpen);
      bubble.classList.toggle('open', isOpen);
      if (isOpen) {
        renderMessages(messagesEl);
        scrollBottom(messagesEl);
        if (!isOutsideHours()) input.focus();
        // Mostrar bienvenida si no hay mensajes
        if (messages.length === 0 && config.mensaje_bienvenida) {
          messages.push({ tipo: 'texto', contenido: config.mensaje_bienvenida, from: 'bot' });
          saveMessages();
          renderMessages(messagesEl);
        }
        // Iniciar polling si ya se envio algun mensaje
        if (hasSentMessage) {
          startPolling(renderMessages, messagesEl, scrollBottom);
        }
      } else {
        stopPolling();
      }
    });

    // Enviar mensaje
    async function send() {
      const text = input.value.trim();
      if (!text || isLoading || isOutsideHours()) return;

      // Agregar mensaje usuario
      messages.push({ tipo: 'texto', contenido: text, from: 'user' });
      saveMessages();
      input.value = '';
      input.style.height = 'auto';
      renderMessages(messagesEl);
      scrollBottom(messagesEl);

      // Mostrar typing
      isLoading = true;
      sendBtn.disabled = true;
      showTyping(messagesEl);

      try {
        const res = await fetch(API_BASE + '/api/webchat/message', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ api_key: API_KEY, session_id: SESSION_ID, mensaje: text })
        });
        const data = await res.json();

        hideTyping(messagesEl);

        if (data.respuestas && data.respuestas.length > 0) {
          for (const r of data.respuestas) {
            messages.push({ ...r, from: 'bot' });
          }
        } else if (data.error) {
          messages.push({ tipo: 'texto', contenido: 'Error: ' + data.error, from: 'bot' });
        }
        saveMessages();

        // Activar polling despues del primer mensaje
        hasSentMessage = true;
        // Sincronizar lastMsgId para que el poll no repita lo que ya llego
        syncLastMsgId();
        startPolling(renderMessages, messagesEl, scrollBottom);
      } catch(e) {
        hideTyping(messagesEl);
        messages.push({ tipo: 'texto', contenido: 'Error de conexion. Intenta de nuevo.', from: 'bot' });
        saveMessages();
      }

      isLoading = false;
      sendBtn.disabled = false;
      renderMessages(messagesEl);
      scrollBottom(messagesEl);
    }

    sendBtn.addEventListener('click', send);
    input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
      }
    });

    // Auto-resize textarea
    input.addEventListener('input', function() {
      this.style.height = 'auto';
      this.style.height = Math.min(this.scrollHeight, 80) + 'px';
    });

    // Funcion para enviar boton/lista como mensaje
    function sendOption(id, texto) {
      input.value = texto;
      send();
    }

    // Renderizar mensajes
    function renderMessages(el) {
      el.innerHTML = '';
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m.tipo === 'texto') {
          const div = document.createElement('div');
          div.className = 'ct-msg ' + (m.from === 'user' ? 'ct-msg-user' : 'ct-msg-bot');
          div.textContent = m.contenido;
          el.appendChild(div);
        }
        if (m.tipo === 'botones' && m.from === 'bot') {
          const div = document.createElement('div');
          div.className = 'ct-msg ct-msg-bot';
          div.textContent = m.contenido;
          el.appendChild(div);

          const isLast = (i === messages.length - 1);
          const btnsDiv = document.createElement('div');
          btnsDiv.className = 'ct-buttons';
          for (const btn of (m.botones || [])) {
            const b = document.createElement('button');
            b.className = 'ct-btn-option';
            b.textContent = btn.texto || btn.title || btn.id;
            b.disabled = !isLast;
            if (isLast) {
              b.addEventListener('click', function() { sendOption(btn.id, btn.texto || btn.title || btn.id); });
            }
            btnsDiv.appendChild(b);
          }
          el.appendChild(btnsDiv);
        }
        if (m.tipo === 'lista' && m.from === 'bot') {
          const div = document.createElement('div');
          div.className = 'ct-msg ct-msg-bot';
          div.textContent = m.contenido;
          el.appendChild(div);

          const isLast = (i === messages.length - 1);
          const listDiv = document.createElement('div');
          listDiv.className = 'ct-list';
          for (const opt of (m.opciones || [])) {
            const item = document.createElement('div');
            item.className = 'ct-list-item';
            item.innerHTML = `<div class="ct-list-title">${escape(opt.titulo || opt.title || opt.id)}</div>${opt.descripcion ? `<div class="ct-list-desc">${escape(opt.descripcion)}</div>` : ''}`;
            if (isLast) {
              item.addEventListener('click', function() { sendOption(opt.id, opt.titulo || opt.title || opt.id); });
            } else {
              item.style.cursor = 'default';
            }
            listDiv.appendChild(item);
          }
          el.appendChild(listDiv);
        }
      }
    }

    // Typing indicator
    function showTyping(el) {
      const div = document.createElement('div');
      div.className = 'ct-typing';
      div.id = 'ctTyping';
      div.innerHTML = '<div class="ct-typing-dot"></div><div class="ct-typing-dot"></div><div class="ct-typing-dot"></div>';
      el.appendChild(div);
      scrollBottom(el);
    }

    function hideTyping(el) {
      const t = el.querySelector('#ctTyping');
      if (t) t.remove();
    }

    function scrollBottom(el) {
      requestAnimationFrame(function() { el.scrollTop = el.scrollHeight; });
    }

    // Render inicial si habia mensajes
    if (messages.length > 0 && isOpen) {
      renderMessages(messagesEl);
    }
  }

  // ==========================================
  // UTILIDADES
  // ==========================================
  function escape(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function escapeAttr(str) {
    return str ? str.replace(/"/g, '&quot;').replace(/'/g, '&#39;') : '';
  }

  function isOutsideHours() {
    if (!config || !config.horario_activo) return false;
    if (!config.horario_inicio || !config.horario_fin) return false;

    try {
      const now = new Date();
      const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone: config.horario_zona || 'America/Santiago',
        hour: 'numeric', minute: 'numeric', hour12: false
      });
      const parts = formatter.format(now).split(':');
      const currentMinutes = parseInt(parts[0]) * 60 + parseInt(parts[1]);

      const [hI, mI] = config.horario_inicio.split(':').map(Number);
      const [hF, mF] = config.horario_fin.split(':').map(Number);
      const inicio = hI * 60 + mI;
      const fin = hF * 60 + mF;

      if (inicio < fin) {
        return currentMinutes < inicio || currentMinutes > fin;
      } else {
        // Horario nocturno (ej: 22:00 - 06:00)
        return currentMinutes > fin && currentMinutes < inicio;
      }
    } catch(e) {
      return false;
    }
  }

  // ==========================================
  // INICIALIZAR
  // ==========================================
  async function init() {
    try {
      const res = await fetch(API_BASE + '/api/webchat/config?key=' + encodeURIComponent(API_KEY));
      const data = await res.json();

      if (!data.success || !data.config) {
        console.error('[CreceTec Chat] Config no encontrada para esta API key');
        return;
      }

      config = data.config;

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', createWidget);
      } else {
        createWidget();
      }
    } catch(e) {
      console.error('[CreceTec Chat] Error al cargar configuracion:', e);
    }
  }

  init();
})();
