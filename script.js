// GSS Connect v2 — iOS-like UI + Onboarding + robust OpenAI connection
const LS = {
  TODOS: 'gss_todos_v2',
  PROFILE: 'gss_profile_v2',
  SCHEDULE: 'gss_schedule_v2',
  API_KEY: 'gss_api_key_v2',
  THEME: 'gss_theme_v2',
  ONBOARDED: 'gss_onboarded_v2'
};

// Tabs
const tabs = document.querySelectorAll('.tabbar .tab');
const pages = document.querySelectorAll('.page');
tabs.forEach(btn => btn.addEventListener('click', () => {
  tabs.forEach(b => b.classList.remove('active')); btn.classList.add('active');
  const id = btn.dataset.page; pages.forEach(p => p.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}));

// Theme
const themeToggle = document.getElementById('theme-toggle');
function applyTheme(mode) {
  document.documentElement.setAttribute('data-theme', mode === 'dark' ? 'dark' : 'light');
  localStorage.setItem(LS.THEME, mode);
  if (themeToggle) themeToggle.checked = mode === 'dark';
}
applyTheme(localStorage.getItem(LS.THEME) || 'light');
themeToggle?.addEventListener('change', () => applyTheme(themeToggle.checked ? 'dark' : 'light'));

// PWA install
let deferredPrompt; const installBtn = document.getElementById('installBtn');
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferredPrompt = e; installBtn.hidden = false; });
installBtn?.addEventListener('click', async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; installBtn.hidden = true; });

// Profile save
const nameInput = document.getElementById('profile-name');
const classInput = document.getElementById('profile-class');
const storedProfile = JSON.parse(localStorage.getItem(LS.PROFILE) || '{}');
if (storedProfile.name) nameInput.value = storedProfile.name;
if (storedProfile.class) classInput.value = storedProfile.class;
document.getElementById('profile')?.addEventListener('change', () => {
  const data = { name: nameInput.value.trim(), class: classInput.value.trim() };
  localStorage.setItem(LS.PROFILE, JSON.stringify(data));
});

// API Key handling
const apiKeyInput = document.getElementById('api-key');
const saveKeyBtn = document.getElementById('save-key');
const checkKeyBtn = document.getElementById('check-key');
const toggleKeyBtn = document.getElementById('toggle-key');
apiKeyInput.value = localStorage.getItem(LS.API_KEY) || '';
saveKeyBtn?.addEventListener('click', () => { localStorage.setItem(LS.API_KEY, apiKeyInput.value.trim()); alert('API‑Key gespeichert (nur lokal).'); });
toggleKeyBtn?.addEventListener('click', () => { apiKeyInput.type = apiKeyInput.type === 'password' ? 'text' : 'password'; });
checkKeyBtn?.addEventListener('click', async () => { const ok = await testOpenAIKey(); alert(ok.ok ? '✅ Verbindung ok.' : '❌ ' + ok.msg); });

async function testOpenAIKey() {
  try {
    const key = localStorage.getItem(LS.API_KEY);
    if (!key) return { ok: false, msg: 'Kein Key gesetzt.' };
    const r = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role:'user', content:'ping' }], max_tokens: 2 })
    });
    if (r.ok) return { ok: true };
    const t = await r.json().catch(() => ({}));
    let msg = (t?.error?.message) || r.statusText;
    if (r.status === 401) msg = '401: Key ungültig / kein Guthaben / Projekt nicht freigeschaltet.';
    if (r.status === 429) msg = '429: Rate-Limit / Guthabenlimit erreicht.';
    if (r.status === 404) msg = '404: Modell nicht gefunden – verwende gpt‑4o‑mini.';
    return { ok: false, msg };
  } catch (e) {
    return { ok: false, msg: 'Netzwerk/CORS: HTTPS, Adblocker/Firewall prüfen.' };
  }
}

// Chat
const chatWindow = document.getElementById('chat-window');
const userInput = document.getElementById('userInput');
const sendBtn = document.getElementById('sendBtn');
function addMsg(text, who='bot') {
  const div = document.createElement('div');
  div.className = 'msg ' + (who === 'user' ? 'user' : 'bot');
  div.textContent = text;
  chatWindow.appendChild(div);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}
document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => { userInput.value = chip.getAttribute('data-suggest'); userInput.focus(); }));
sendBtn?.addEventListener('click', onSend);
userInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') onSend(); });

async function onSend() {
  const text = userInput.value.trim();
  if (!text) return;
  userInput.value = '';
  addMsg(text, 'user');
  const loader = document.createElement('div');
  loader.className = 'msg bot'; loader.textContent = 'Denke …';
  chatWindow.appendChild(loader);
  chatWindow.scrollTop = chatWindow.scrollHeight;
  try {
    const reply = await askOpenAI(text);
    loader.remove();
    addMsg(reply || 'Ich konnte nichts erzeugen.', 'bot');
  } catch (err) {
    loader.remove();
    addMsg('Fehler: ' + (err?.message || err), 'bot');
  }
}

// OpenAI request with robust fallback
async function askOpenAI(prompt) {
  const key = localStorage.getItem(LS.API_KEY);
  if (!key) throw new Error('Kein OpenAI‑Key gesetzt (Profil > API‑Key oder Onboarding).');
  const profile = JSON.parse(localStorage.getItem(LS.PROFILE) || '{}');
  const system = `Du bist SmartSchool, ein hilfsbereiter Schul‑Assistent für ${profile.name || 'Schüler'} (Klasse ${profile.class || '?'}).
Antworten: deutsch, klar, kompakt, Schritt‑für‑Schritt bei Rechenwegen, kurze Beispiele.`;

  let lastError = null;

  // Try chat.completions with gpt-4o first
  for (const model of ['gpt-4o', 'gpt-4o-mini']) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role:'system', content: system }, { role:'user', content: prompt }], temperature: 0.2, max_tokens: 800 })
      });
      if (r.ok) {
        const data = await r.json();
        return data.choices?.[0]?.message?.content?.trim();
      } else {
        const err = await r.json().catch(() => ({}));
        lastError = new Error(err?.error?.message || r.statusText);
        if (r.status === 404) continue; // model not available → try next
        if (r.status === 401 || r.status === 429) throw lastError;
      }
    } catch (e) {
      lastError = e;
    }
  }

  // Fallback: Responses API
  try {
    const r2 = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', input: [{ role:'system', content: system }, { role:'user', content: prompt }] })
    });
    if (r2.ok) {
      const d2 = await r2.json();
      const out = d2.output_text || d2.choices?.[0]?.message?.content || '';
      return (out || '').toString().trim();
    } else {
      const err = await r2.json().catch(() => ({}));
      throw new Error(err?.error?.message || r2.statusText);
    }
  } catch (e) {
    throw lastError || e;
  }
}

// Lern-Tools
const learnInput = document.getElementById('learn-input');
const learnOutput = document.getElementById('learn-output');
document.getElementById('summarize-btn')?.addEventListener('click', async () => {
  const text = learnInput.value.trim();
  if (!text) return (learnOutput.textContent = 'Bitte Text eingeben.');
  learnOutput.textContent = 'Arbeite …';
  try {
    const res = await askOpenAI(`Fasse folgenden Text in 5–7 Bulletpoints zusammen und markiere Schlüsselbegriffe **fett**:\n\n${text}`);
    learnOutput.innerHTML = res.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br />');
  } catch (e) { learnOutput.textContent = e.message; }
});
document.getElementById('quiz-btn')?.addEventListener('click', async () => {
  const text = learnInput.value.trim();
  learnOutput.textContent = 'Erstelle Quiz …';
  try {
    const res = await askOpenAI(`Erstelle 5 Quizfragen (Multiple Choice, A–D) mit Lösungen zu folgendem Inhalt:\n\n${text || 'Thema: Potenzgesetze Klasse 10'}\nFormat:\n1) Frage\nA)\nB)\nC)\nD)\nLösung: X`);
    learnOutput.textContent = res;
  } catch (e) { learnOutput.textContent = e.message; }
});

// Todos
const todoListEl = document.getElementById('todo-list');
const todoInput = document.getElementById('todo-input');
const addTodoBtn = document.getElementById('add-todo');
let todos = JSON.parse(localStorage.getItem(LS.TODOS) || '[]');
function renderTodos() {
  todoListEl.innerHTML = '';
  if (!todos.length) {
    const li = document.createElement('li'); li.className = 'tiny'; li.textContent = 'Keine Aufgaben. 🎉';
    todoListEl.appendChild(li); return;
  }
  todos.forEach((t, idx) => {
    const li = document.createElement('li'); li.className = 'todo-item glass';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!t.done;
    cb.addEventListener('change', () => { t.done = cb.checked; saveTodos(); });
    const txt = document.createElement('div'); txt.textContent = t.text; if (t.done) txt.style.opacity = .55;
    const del = document.createElement('button'); del.className = 'ghost small'; del.textContent = '✕';
    del.addEventListener('click', () => { todos.splice(idx,1); saveTodos(); });
    li.append(cb, txt, del); todoListEl.appendChild(li);
  });
}
function saveTodos(){ localStorage.setItem(LS.TODOS, JSON.stringify(todos)); renderTodos(); }
addTodoBtn?.addEventListener('click', () => {
  const val = todoInput.value.trim(); if (!val) return;
  todos.push({ text: val, done: false }); todoInput.value = ''; saveTodos();
});
renderTodos();

// Schedule
const scheduleGrid = document.getElementById('schedule-grid');
const HOURS = ['1','2','3','4','5','6','7','8'];
const DAYS = ['Mo','Di','Mi','Do','Fr'];
let schedule = JSON.parse(localStorage.getItem(LS.SCHEDULE) || '[]');
if (!schedule.length) schedule = HOURS.map(() => Array(5).fill(''));
function renderSchedule() {
  scheduleGrid.innerHTML = '';
  HOURS.forEach((h, r) => {
    const row = document.createElement('div'); row.className = 'grid-row';
    const hourCell = document.createElement('div'); hourCell.textContent = h + '.'; row.appendChild(hourCell);
    DAYS.forEach((_, c) => {
      const cell = document.createElement('div'); cell.className = 'grid-cell'; cell.contentEditable = 'true';
      cell.textContent = schedule[r][c] || '';
      cell.addEventListener('input', () => { schedule[r][c] = cell.textContent.trim(); localStorage.setItem(LS.SCHEDULE, JSON.stringify(schedule)); });
      row.appendChild(cell);
    });
    scheduleGrid.appendChild(row);
  });
}
renderSchedule();

// Welcome message
addMsg('Hi! Ich bin dein Schul‑Assistent. Frag mich z. B.:\n• Erkläre Potenzgesetze\n• Rechne: (2/3)^-2 * 9\n• Erstelle einen Lernplan für Englisch', 'bot');

// Onboarding logic
const onb = document.getElementById('onboarding');
const onbPages = [...document.querySelectorAll('.onb-page')];
const onbSkip = document.getElementById('onb-skip');
const onbPrev = document.getElementById('onb-prev');
const onbNext = document.getElementById('onb-next');
const onbStart = document.getElementById('onb-start');
const onbApi = document.getElementById('onb-api-key');
const onbToggle = document.getElementById('onb-toggle');
const onbSave = document.getElementById('onb-save');
const onbTest = document.getElementById('onb-test');
const onbStatus = document.getElementById('onb-status');

function setOnbStep(i) {
  onbPages.forEach((p, idx) => p.classList.toggle('onb-active', idx === i));
  onbPrev.disabled = i === 0;
  onbNext.classList.toggle('hidden', i === onbPages.length - 1);
  onbStart.classList.toggle('hidden', i !== onbPages.length - 1);
}
function closeOnboarding() { onb.classList.add('hidden'); localStorage.setItem(LS.ONBOARDED, '1'); }
onbSkip.addEventListener('click', closeOnboarding);
onbPrev.addEventListener('click', () => { const idx = onbPages.findIndex(p => p.classList.contains('onb-active')); if (idx > 0) setOnbStep(idx - 1); });
onbNext.addEventListener('click', () => { const idx = onbPages.findIndex(p => p.classList.contains('onb-active')); if (idx < onbPages.length - 1) setOnbStep(idx + 1); });
onbStart.addEventListener('click', closeOnboarding);
onbToggle.addEventListener('click', () => { onbApi.type = onbApi.type === 'password' ? 'text' : 'password'; });
onbSave.addEventListener('click', () => { localStorage.setItem(LS.API_KEY, onbApi.value.trim()); onbStatus.textContent = 'Key gespeichert (nur lokal).'; });
onbTest.addEventListener('click', async () => {
  onbStatus.textContent = 'Teste Verbindung …';
  localStorage.setItem(LS.API_KEY, onbApi.value.trim());
  const res = await testOpenAIKey();
  onbStatus.textContent = res.ok ? '✅ Verbindung ok.' : '❌ ' + res.msg;
});

// Show onboarding on first visit or when no key
if (!localStorage.getItem(LS.ONBOARDED)) {
  onb.classList.remove('hidden'); setOnbStep(0);
} else {
  // If no key saved, show onboarding step 3
  if (!localStorage.getItem(LS.API_KEY)) {
    onb.classList.remove('hidden'); setOnbStep(2);
  }
}
