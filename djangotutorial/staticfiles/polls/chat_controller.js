import debounce from "https://cdn.skypack.dev/lodash.debounce"

const { Application, Controller } = Stimulus
const application = Application.start()

class ChatController extends Controller {
  static targets = ["input", "suggestions", "messages"]

  connect() {
    this.searchAbortController = null
    // this.search = debounce(this.search.bind(this), 400) // Эконом вариант
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
  }

  async clear() {
    await fetch("/clear");
    window.location.reload();
  }
}

function renderUserMessage(content) {
  return `<div class="text-right font-bold mb-2">${content}</div>`;
}

function renderAssistantMessage(content) {
  return `<div class="mb-2">${content || ''}</div>`;
}

function renderCard(card) {
  return `
    <div class="my-4 p-4 border rounded">
      <h3 class="text-lg font-semibold">${card.title}</h3>
      <p class="mt-2 text-sm">${card.description}</p>
      ${card.video ? `<video controls class="mt-4 w-full rounded"><source src="${card.video}" type="video/mp4"></video>` : ''}
    </div>
  `;
}

application.register("chat", ChatController)
