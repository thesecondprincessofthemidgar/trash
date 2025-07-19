import debounce from "https://cdn.skypack.dev/lodash.debounce"

const { Application, Controller } = Stimulus
const application = Application.start()

const socket = io("http://127.0.0.1:5001");
let isSyncing = false;

const params = new URLSearchParams(window.location.search);
const room = params.get('room');
if (room) {
  socket.emit('join', room);
  console.log('Подключен к комнате:', room);
}

class ChatController extends Controller {
  static targets = ["input", "suggestions", "messages"]

  connect() {
    this.searchAbortController = null
    // this.search = debounce(this.search.bind(this), 400) // Эконом вариант
    this.renderInitialMessages();
  }

  renderInitialMessages() {
    const messages = INITIAL_MESSAGES || [];
    this.messagesTarget.innerHTML = '';

    let allCards = [];
    messages.forEach(msg => {
      if (msg.cards) allCards = allCards.concat(msg.cards);
    });

    // Фильтруем нужные
    const anime_id = params.get('anime_id');
    const episode = params.get('episode');
    const filteredCards = allCards.filter(card =>
      String(card.id) === String(anime_id) &&
      String(card.episode) === String(episode)
    );
    const lastIdx = filteredCards.length > 0 ? allCards.lastIndexOf(filteredCards[filteredCards.length - 1]) : -1;
    let cardCounter = 0;
    messages.forEach(msg => {
      if (msg.role === 'user') {
        this.messagesTarget.innerHTML += renderUserMessage(msg.content);
      } else {
        this.messagesTarget.innerHTML += renderAssistantMessage(msg.content);
        if (msg.cards) {
          msg.cards.forEach(card => {
            const showSync = (
              room &&
              String(card.id) === String(anime_id) &&
              String(card.episode) === String(episode) &&
              cardCounter === lastIdx
            );
            this.messagesTarget.innerHTML += renderCard(card, showSync);
            cardCounter++;
          })
        }
      }
    });
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

    // Фильтруем нужные
    const anime_id = params.get('anime_id');
    const episode = params.get('episode');
    const filteredCards = allCards.filter(card =>
      String(card.id) === String(anime_id) &&
      String(card.episode) === String(episode)
    );
    const lastIdx = filteredCards.length > 0 ? allCards.lastIndexOf(filteredCards[filteredCards.length - 1]) : -1;
    let cardCounter = 0;
    data.messages.forEach(msg => {
      if (msg.role === 'user') {
        this.messagesTarget.innerHTML += renderUserMessage(msg.content);
      } else {
        this.messagesTarget.innerHTML += renderAssistantMessage(msg.content);
        if (msg.cards) {
          msg.cards.forEach(card => {
            const showSync = (
              room &&
              String(card.id) === String(anime_id) &&
              String(card.episode) === String(episode) &&
              cardCounter === lastIdx
            );
            this.messagesTarget.innerHTML += renderCard(card, showSync);
            cardCounter++;
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
  if (!room || !player) return;
  setupSyncForPlayer(player, anime_id, episode);
}


function setupSyncForPlayer(player, anime_id, episode) {
  const room = params.get('room');
  const player_idx = params.get('player_idx');
  
  if (room && anime_id && episode) {
    const players = Array.from(document.querySelectorAll(
      `video[data-anime-id="${anime_id}"][data-episode="${episode}"]`
    ));
    
    const idx = player_idx ? parseInt(player_idx) : players.length - 1;
    const player = players[idx];
    
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
}

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

function renderCard(card, showSync = false) {
  const roomUrl = `/create_sync_room/?anime_id=${card.id}&episode=${card.episode}`;

  return `
    <div class="my-4 p-4 border rounded">
      ${showSync ? `<span class="sync-indicator text-green-600 font-bold mr-2">СИНХРОНИЗАЦИЯ${room ? ` (КОМНАТА: ${room})` : ''}</span>` : ''}
      <a href="${roomUrl}" class="inline-block px-4 py-2 mb-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition">Создать совместный просмотр</a>
      <h3 class="text-lg font-semibold">${card.title}</h3>
      <p class="mt-2 text-sm">${card.description}</p>
      ${card.video ? `<video data-anime-id="${card.id}" data-episode="${card.episode}" controls class="mt-4 w-full rounded">
        <source src="${card.video}" type="video/mp4"></video>` : ''}
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", function() {
  if (room) {
    const players = document.querySelectorAll(`video[data-anime-id][data-episode]`);
    players.forEach(player => {
      const anime_id = player.getAttribute('data-anime-id');
      const episode = player.getAttribute('data-episode');
      console.log('log: setupSyncForPlayer', player, anime_id, episode);
      setupSyncForPlayer(player, anime_id, episode);
    });
  }
});

application.register("chat", ChatController)
