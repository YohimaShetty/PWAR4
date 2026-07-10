/* =========================================================
   StadiumMind AI — chat.js
   The AI Stadium Operations Copilot widget: streaming replies,
   lightweight markdown rendering, conversation memory (sessionId
   persisted in this tab), and a typing indicator.
   ========================================================= */

(function () {
  const toggle = document.getElementById('copilotToggle');
  const panel = document.getElementById('copilotPanel');
  const closeBtn = document.getElementById('copilotClose');
  const clearBtn = document.getElementById('copilotClear');
  const form = document.getElementById('copilotForm');
  const input = document.getElementById('copilotInput');
  const messages = document.getElementById('copilotMessages');

  const sessionId = (() => {
    let id = sessionStorage.getItem('smind-session');
    if (!id) {
      id = 'sess-' + Math.random().toString(36).slice(2) + Date.now();
      sessionStorage.setItem('smind-session', id);
    }
    return id;
  })();

  toggle.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    if (!panel.hidden) input.focus();
  });
  closeBtn.addEventListener('click', () => {
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    toggle.focus(); // return focus to the trigger, standard dialog-close behavior
  });
  clearBtn.addEventListener('click', async () => {
    await fetch(`/api/chat/session/${sessionId}`, { method: 'DELETE' });
    messages.innerHTML = '<div class="msg msg--bot">Conversation cleared. What can I help with?</div>';
  });

  // Minimal, safe markdown: bold, italics, inline code, and line breaks only.
  function renderMarkdown(text) {
    const escaped = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return escaped
      .replace(/```([\s\S]*?)```/g, (_, code) => `<pre style="background:rgba(0,0,0,0.25);padding:8px;border-radius:6px;overflow-x:auto;"><code>${code}</code></pre>`)
      .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.2);padding:1px 4px;border-radius:4px;">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/\*([^*]+)\*/g, '<i>$1</i>')
      .replace(/\n/g, '<br/>');
  }

  function addMessage(text, who) {
    const el = document.createElement('div');
    el.className = `msg msg--${who}`;
    el.innerHTML = renderMarkdown(text);
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  function addTyping() {
    const el = document.createElement('div');
    el.className = 'msg msg--bot msg--typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    messages.appendChild(el);
    messages.scrollTop = messages.scrollHeight;
    return el;
  }

  async function requestFallbackReply(userText) {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userText, sessionId }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(payload.error || 'AI service temporarily unavailable. Please try again.');
    }
    return payload.answer || '';
  }

  async function streamReply(userText, typingEl) {
    const res = await fetch('/api/chat/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: userText, sessionId }),
    });

    if (!res.ok) {
      let errMsg = "I don't have enough information to answer that accurately right now — the AI service may be unavailable.";
      try {
        const payload = await res.json();
        if (payload && payload.error) errMsg = payload.error;
      } catch (_) {
        // Keep the default fallback message if body is not JSON.
      }
      try {
        const fallback = await requestFallbackReply(userText);
        typingEl.remove();
        addMessage(fallback, 'bot');
      } catch (_) {
        typingEl.remove();
        addMessage(errMsg, 'bot');
      }
      return;
    }

    if (!res.body) {
      try {
        const fallback = await requestFallbackReply(userText);
        typingEl.remove();
        addMessage(fallback, 'bot');
      } catch (_) {
        typingEl.remove();
        addMessage("I don't have enough information to answer that accurately right now — the AI service may be unavailable.", 'bot');
      }
      return;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    let started = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();
      for (const part of parts) {
        const line = part.replace(/^data:\s*/, '');
        if (!line) continue;
        try {
          const payload = JSON.parse(line);
          if (payload.chunk) {
            if (!started) { typingEl.remove(); typingEl = addMessage('', 'bot'); started = true; }
            full += payload.chunk;
            typingEl.innerHTML = renderMarkdown(full);
            messages.scrollTop = messages.scrollHeight;
          } else if (payload.error) {
            if (!started) typingEl.remove();
            addMessage(payload.error, 'bot');
          }
        } catch (e) { /* ignore partial JSON */ }
      }
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    addMessage(text, 'user');
    input.value = '';
    const typingEl = addTyping();
    try {
      await streamReply(text, typingEl);
    } catch (err) {
      typingEl.remove();
      addMessage("I don't have enough information to answer that accurately.", 'bot');
    }
  });
})();