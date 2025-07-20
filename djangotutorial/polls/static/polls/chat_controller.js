import debounce from "https://cdn.skypack.dev/lodash.debounce"

const { Application, Controller } = Stimulus
const application = Application.start()

const socket = io("http://127.0.0.1:5001");
let isSyncing = false;

const params = new URLSearchParams(window.location.search);
const room = params.get('room');
const anime_id = params.get('anime_id');
const episode = params.get('episode');

window.room = room;
window.anime_id = anime_id;
window.episode = episode;

window.syncedPlayers = window.syncedPlayers || new Set();

if (window.room && window.anime_id && window.episode) {
  const key = `${window.anime_id}_${window.episode}`;
  window.syncedPlayers.add(key);
}

if (room) {
  socket.emit('join', room);
  console.log('Подключен к комнате:', room);
}

function renderInitialMessages(messagesTarget) {
  const params = new URLSearchParams(window.location.search);

  const messages = INITIAL_MESSAGES || [];
  messagesTarget.innerHTML = '';

  let allCards = [];
  messages.forEach(msg => {
    if (msg.cards) allCards = allCards.concat(msg.cards);
  });

  messages.forEach(msg => {
    if (msg.role === 'user') {
      messagesTarget.innerHTML += renderUserMessage(msg.content);
    } else {
      messagesTarget.innerHTML += renderAssistantMessage(msg.content);
      if (msg.cards) {
        msg.cards.forEach(card => {
          messagesTarget.innerHTML += renderCard(card);
        })
      }
    }
  });
}

class ChatController extends Controller {
  static targets = ["input", "suggestions", "messages"]

  connect() {
    this.searchAbortController = null
    // this.search = debounce(this.search.bind(this), 400) // Эконом вариант
    renderInitialMessages(document.querySelector('[data-chat-target="messages"]'));
  }  

  onInput() {
    const q = this.inputTarget.value.trim()
    if (q.length) {
      this.search(q)
    } else {
      this.clearSuggestions()
    }
  }

  async search(q) {
    if (!q) {
      this.clearSuggestions()
      return
    }

    if (this.searchAbortController) {
      this.searchAbortController.abort()
    }
    this.searchAbortController = new AbortController()

    this.showLoading()
    
    try {
      const resp = await fetch(`/suggestions?q=${encodeURIComponent(q)}`, {signal: this.searchAbortController.signal});
      const items = await resp.json()
      
      const current = this.inputTarget.value.trim();
      if (current !== q) return;
      
      this.showSuggestions(items.slice(0, 5))
    } catch (error) {
      console.error(error)
      this.clearSuggestions()
    } finally {
      this.hideLoading()
    }
  }

  showLoading() {
    this.clearSuggestions()
    this.suggestionsTarget.innerHTML = `
      <div class="loading-message px-4 py-2 text-gray-500 italic">Загрузка...</div>
    `
  }

  hideLoading() {
    const el = this.suggestionsTarget.querySelector(".loading-message")
    if (el) el.remove()
  }

  showSuggestions(items) {
    if (items.length === 0) {
      return this.clearSuggestions()
    }
    
    const list = items.map(i => `
      <div
      class="suggestion-item px-4 py-2 hover:bg-gray-200 cursor-pointer rounded transition"
      data-id="${i.id}" data-value="${i.text}">
        ${i.text}
      </div>
    `).join("")

    this.suggestionsTarget.innerHTML = `
      <div class="suggestion-message bg-gray-100 border border-gray-200 rounded-lg shadow-sm my-4">
        ${list}
      </div>
    `
  }

  clearSuggestions() {
    this.suggestionsTarget.innerHTML = ""
  }

  select(e) {
    const el = e.target.closest(".suggestion-item")
    if (!el) return

    const value = el.getAttribute("data-value")

    this.inputTarget.value = value
    this.clearSuggestions()
    this.inputTarget.form.requestSubmit()
  }
  
  async send(e) {
    e.preventDefault()
    const q = this.inputTarget.value.trim()
    if (!q) return

    const resp = await fetch(`/search?q=${encodeURIComponent(q)}`, {headers: {"X-Requested-With": "XMLHttpRequest"}});
    const data = await resp.json()
    this.messagesTarget.innerHTML = ''

    let allCards = [];
    data.messages.forEach(msg => {
      if (msg.cards) allCards = allCards.concat(msg.cards);
    });

    data.messages.forEach(msg => {
      if (msg.role === 'user') {
        this.messagesTarget.innerHTML += renderUserMessage(msg.content);
      } else {
        this.messagesTarget.innerHTML += renderAssistantMessage(msg.content);
        if (msg.cards) {
          msg.cards.forEach(card => {
            this.messagesTarget.innerHTML += renderCard(card);
          })
        }
      }
    })

    console.log('room:', room);
    if (room) {
      const players = this.messagesTarget.querySelectorAll(`video[data-anime-id][data-episode]`);
      players.forEach(player => {
        const anime_id = player.getAttribute('data-anime-id');
        const episode = player.getAttribute('data-episode');
        attachSyncHandlerToPlayer(player, anime_id, episode);
      });
    }
  }

  async clear() {
    await fetch("/clear");
    window.location = "/";
  }
}

function attachSyncHandlerToPlayer(player, anime_id, episode) {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');

  if (!room || !player) return;

  console.log('log: setupSyncForPlayer (2)', player, anime_id, episode);
  setupSyncForPlayer(player, anime_id, episode, room);
}


function setupSyncForPlayer(player, anime_id, episode, room) {
  if (!room || !anime_id || !episode) return;

  console.log('log: setupSyncForPlayer (complete)', player, anime_id, episode, room);

  const players = Array.from(document.querySelectorAll(
    `video[data-anime-id="${anime_id}"][data-episode="${episode}"]`
  ));
  player = players.length ? players[players.length - 1] : null;
  
  function sendSync(data) {
    socket.emit('sync', {room:room, anime_id: anime_id, episode: episode, ...data});
    console.log('Комната для синхронизации:', room, 'Аниме:', anime_id, 'Эпизод:', episode);
  }
  
  player.addEventListener('play', () => {
    if (!isSyncing) {
      console.log('play event отправлен');
      sendSync({action: 'play', time: player.currentTime});  
    }
  });
  player.addEventListener('pause', () => {
    if (!isSyncing) {
      console.log('pause event отправлен');
      sendSync({action: 'pause', time: player.currentTime});
    }
  });
  player.addEventListener('seeked', () => {
    if (!isSyncing) {
      console.log('seeked event отправлен');
      sendSync({action: 'seek', time: player.currentTime});
    }
  });
}

console.log('Socket подключен?', socket.connected);
socket.on('connect', () => console.log('Socket: подключение установлено'));
socket.on('sync', data => {
  console.log('sync event получен (глобально)', data);
  const { anime_id, episode, action, time } = data;

  const players = Array.from(document.querySelectorAll(
    `video[data-anime-id="${anime_id}"][data-episode="${episode}"]`
  ));
  // Взять только последний
  const player = players.length ? players[players.length - 1] : null;
  if (!player) return;

  isSyncing = true;
  console.log('sync event получен (JS)', data);

  if (data.action === 'play') {
    player.currentTime = data.time;
    player.play().catch(error => {
      console.error('Ошибка при воспроизведении видео:', error);
    });
  }
  if (data.action === 'pause') {
    player.currentTime = data.time;
    player.pause();
  }
  if (data.action === 'seek') {
    player.currentTime = data.time;
  }
  setTimeout(() => { isSyncing = false; }, 100);
});

function renderUserMessage(content) {
  return `<div class="text-right font-bold mb-2">${content}</div>`;
}

function renderAssistantMessage(content) {
  return `<div class="mb-2">${content || ''}</div>`;
}

function renderCard(card) {
  const params = new URLSearchParams(window.location.search);

  const key = `${card.id}_${card.episode}`;
  const showSync = window.room && syncedPlayers.has(key);

  const roomUrl = `/create_sync_room/?anime_id=${card.id}&episode=${card.episode}`;
  const syncId = `sync-btn-${card.id}-${card.episode}`;
  const unsyncId = `unsync-btn-${card.id}-${card.episode}`;

  const room = params.get('room');
  const syncRoomLink = showSync && room ? `
    <input value="${window.location.origin + window.location.pathname}?room=${room}&anime_id=${card.id}&episode=${card.episode}" 
           class="w-full p-1 mb-2 text-xs rounded border bg-gray-50" readonly>
  ` : '';


  return `
    <div class="card my-4 p-4 border rounded">
      ${showSync ? `<span class="sync-indicator text-green-600 font-bold mr-2">СИНХРОНИЗАЦИЯ${room ? ` (КОМНАТА: ${room})` : ''}</span>` : ''}
      ${syncRoomLink}
      <button id="${syncId}" class="sync-btn ${showSync ? 'hidden' : ''} inline-block px-4 py-2 mb-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition" data-anime-id="${card.id}" data-episode="${card.episode}">
        Синхронизировать
      </button>
      <button id="${unsyncId}" class="unsync-btn ${showSync ? '' : 'hidden'} inline-block px-4 py-2 mb-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-bold transition" data-anime-id="${card.id}" data-episode="${card.episode}">
        Выйти из синхронизации
      </button>
      <h3 class="text-lg font-semibold">${card.title}</h3>
      <p class="mt-2 text-sm">${card.description}</p>
      ${card.video ? `<video data-anime-id="${card.id}" data-episode="${card.episode}" controls class="mt-4 w-full rounded">
        <source src="${card.video}" type="video/mp4"></video>` : ''}
    </div>
  `;
}

document.addEventListener('click', function(e) {
  if (e.target.classList.contains('sync-btn')) {
    const card = e.target.closest('.card');
    const video = card.querySelector('video');
    const anime_id = video.dataset.animeId;
    const episode = video.dataset.episode;
    const key = `${anime_id}_${episode}`;
    let room = window.room || getOrCreateRoom();

    const url = new URL(window.location);
    url.searchParams.set('room', room);
    url.searchParams.set('anime_id', anime_id);
    url.searchParams.set('episode', episode);
    history.replaceState(null, '', url.toString());

    window.room = room;
    window.anime_id = anime_id;
    window.episode = episode;
    syncedPlayers.add(key);

    
    e.target.classList.add('hidden');
    card.querySelector('.unsync-btn').classList.remove('hidden');
    
    renderInitialMessages(document.querySelector('[data-chat-target="messages"]'));
    if (room) {
      socket.emit('join', room);
      console.log('Подключен к комнате:', room);
    }
    onSyncButtonHelper();
  }
  if (e.target.classList.contains('unsync-btn')) {
    const card = e.target.closest('.card');
    const video = card.querySelector('video');
    const anime_id = video.dataset.animeId;
    const episode = video.dataset.episode;
    const key = `${anime_id}_${episode}`;
    syncedPlayers.delete(key);
    detachSyncHandlerFromPlayer(video);
    e.target.classList.add('hidden');
    card.querySelector('.sync-btn').classList.remove('hidden');

    window.room = null;
    const url = new URL(window.location);
    url.searchParams.delete('room');
    url.searchParams.delete('anime_id');
    url.searchParams.delete('episode');
    history.replaceState(null, '', url.pathname);

    window.room = room_id;
    window.anime_id = anime_id;
    window.episode = episode;
    renderInitialMessages(document.querySelector('[data-chat-target="messages"]'));
    // setupAllSyncedPlayers();
  }
});

function detachSyncHandlerFromPlayer(player) {
  const clone = player.cloneNode(true);
  player.parentNode.replaceChild(clone, player);
}

function onSyncButtonHelper() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');

  const players = document.querySelectorAll(`video[data-anime-id][data-episode]`);
  players.forEach(player => {
    const anime_id = player.getAttribute('data-anime-id');
    const episode = player.getAttribute('data-episode');
    const key = `${anime_id}_${episode}`;
    if (window.room && syncedPlayers.has(key)) {
      console.log('log: setupSyncForPlayer', player, anime_id, episode);
      setupSyncForPlayer(player, anime_id, episode, room);
    }
  });
}

document.addEventListener("DOMContentLoaded", function() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get('room');

  const players = document.querySelectorAll(`video[data-anime-id][data-episode]`);
  players.forEach(player => {
    const anime_id = player.getAttribute('data-anime-id');
    const episode = player.getAttribute('data-episode');
    const key = `${anime_id}_${episode}`;
    if (window.room && syncedPlayers.has(key)) {
      console.log('log: setupSyncForPlayer', player, anime_id, episode);
      setupSyncForPlayer(player, anime_id, episode, room);
    }
  });
});

function getOrCreateRoom() {
  let params = new URLSearchParams(window.location.search);
  let room = params.get('room');
  if (!room) {
    room = Math.random().toString(36).substring(2, 10); // простой uuid
    params.set('room', room);
    window.history.replaceState({}, '', `${window.location.pathname}?${params}`);
  }
  return room;
}

function renderSyncRoomLink(room, anime_id, episode) {
  const url = `${location.origin}${location.pathname}?room=${room}&anime_id=${anime_id}&episode=${episode}`;
  return `<div class="mb-2"><span class="text-sm text-gray-500">Ссылка для подключения:</span>
    <input class="ml-2 border px-2 py-1 rounded" value="${url}" readonly onclick="this.select()" style="width:80%">
  </div>`;
}

function setupAllSyncedPlayers() {
  const params = new URLSearchParams(window.location.search);
  window.room = params.get('room');

  if (!window.room) return;
  document.querySelectorAll('video[data-anime-id][data-episode]').forEach(player => {
    const anime_id = player.getAttribute('data-anime-id');
    const episode = player.getAttribute('data-episode');
    const key = `${anime_id}_${episode}`;
    if (syncedPlayers.has(key)) {
      attachSyncHandlerToPlayer(player, anime_id, episode);
    }
  });
}

application.register("chat", ChatController)
