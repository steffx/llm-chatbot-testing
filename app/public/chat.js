const MAX = 500;
const messages = document.getElementById('messages');
const form = document.getElementById('composer');
const input = document.getElementById('message');
const send = document.getElementById('send');
const counter = document.getElementById('counter');
const suggestions = document.getElementById('suggestions');
let busy = false;

const me = await fetch('/api/me');
if (me.status === 401) window.location.href = '/login';
document.querySelector('[data-testid="customer-name"]').textContent = (await me.json()).name;

function addMessage(role, text, { guarded = false } = {}) {
  const el = document.createElement('div');
  el.className = 'message';
  el.dataset.role = role;
  el.dataset.testid = 'message';
  // textContent, never innerHTML: model output is untrusted and could contain markup.
  const body = document.createElement('span');
  body.dataset.testid = 'message-text';
  body.textContent = text;
  el.appendChild(body);
  if (guarded) {
    const badge = document.createElement('div');
    badge.className = 'safety-badge';
    badge.dataset.testid = 'safety-badge';
    badge.textContent = 'Protected by NovaPay safety checks';
    el.appendChild(badge);
  }
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
  return el;
}

function greet() {
  addMessage('assistant', "Hi! I'm Nova. Ask me about your balances, recent transactions, blocked payments or card security.");
}

function updateComposer() {
  const length = input.value.trim().length;
  counter.textContent = `${input.value.length}/${MAX}`;
  counter.classList.toggle('over', input.value.length > MAX);
  send.disabled = busy || length === 0 || input.value.length > MAX;
}

async function ask(text) {
  busy = true;
  updateComposer();
  suggestions.hidden = true;
  addMessage('user', text);
  const typing = document.createElement('div');
  typing.className = 'typing';
  typing.dataset.testid = 'typing';
  typing.textContent = 'Nova is typing…';
  messages.appendChild(typing);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text }),
    });
    if (res.status === 401) return (window.location.href = '/login');
    const data = await res.json();
    if (!res.ok) {
      addMessage('error', data.error || 'Something went wrong. Please try again.');
    } else {
      const guarded = data.source === 'guardrail' || data.guard.output.length > 0;
      addMessage('assistant', data.reply, { guarded });
    }
  } catch {
    addMessage('error', 'You seem to be offline. Please try again.');
  } finally {
    typing.remove();
    busy = false;
    updateComposer();
    input.focus();
  }
}

form.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy || input.value.length > MAX) return;
  input.value = '';
  ask(text);
});

input.addEventListener('input', updateComposer);
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    form.requestSubmit();
  }
});

suggestions.addEventListener('click', (e) => {
  const button = e.target.closest('button');
  if (button && !busy) ask(button.textContent);
});

document.getElementById('new-chat').addEventListener('click', async () => {
  await fetch('/api/chat/reset', { method: 'POST' });
  messages.replaceChildren();
  suggestions.hidden = false;
  greet();
});

document.getElementById('logout').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST' });
  window.location.href = '/login';
});

greet();
updateComposer();
input.focus();
