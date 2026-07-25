// ─── State ───────────────────────────────────────────────────────────────────
let currentIdx = 0, currentQ = 0;
let answers = [];          // answers[qi] = chosen option index or null
let currentQuestions = []; // shuffled copy of questions for this load
let completedSet = new Set();
let sessionHistory = [];
let showEnPassage = false; // English toggle for the current passage
let showEnQuestion = false; // English toggle for the current question/answer section

function isAnswered(qi) { return answers[qi] !== null && answers[qi] !== undefined; }
function isCorrect(qi)  { return isAnswered(qi) && answers[qi] === currentQuestions[qi].correct; }
function allAnswered()  { return currentQuestions.every((_, i) => isAnswered(i)); }

// ─── Shuffle options each load ────────────────────────────────────────────────
function shuffleQuestions(questions) {
  return questions.map(q => {
    const indices = q.options.map((_, i) => i);
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    const shuffled = {
      ...q,
      options: indices.map(i => q.options[i]),
      correct: indices.indexOf(q.correct)
    };
    if (q.en) shuffled.en = { ...q.en, options: indices.map(i => q.en.options[i]) };
    return shuffled;
  });
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  if (name === 'geschiedenis') renderHistory();
}

// ─── Text navigation ──────────────────────────────────────────────────────────
function goTo(idx) { if (idx < 0 || idx >= TEXTS.length) return; currentIdx = idx; loadText(); }
function goToNext() {
  for (let i = 1; i <= TEXTS.length; i++) {
    const c = (currentIdx + i) % TEXTS.length;
    if (!completedSet.has(c)) { goTo(c); return; }
  }
  goTo((currentIdx + 1) % TEXTS.length);
}

function loadText() {
  const t = TEXTS[currentIdx];
  currentQ = 0;
  showEnPassage = false;
  showEnQuestion = false;
  const questionsWithEn = t.en ? t.questions.map((q, i) => ({ ...q, en: t.en.questions[i] })) : t.questions;
  currentQuestions = shuffleQuestions(questionsWithEn);
  answers = new Array(currentQuestions.length).fill(null);

  document.getElementById('topicTag').textContent    = t.topic;
  const passageEnBtn = document.getElementById('passageEnBtn');
  passageEnBtn.hidden = !t.en;
  passageEnBtn.classList.remove('active');
  renderPassage();
  document.getElementById('scoreBar').classList.remove('show');
  document.getElementById('scoreBar').innerHTML = '';
  document.getElementById('nextTextBtn').classList.remove('show');
  document.getElementById('allDone').classList.remove('show');

  updateNav(); renderDots(); renderPips(); renderQuestion();
}

function updateNav() {
  document.getElementById('navCounter').textContent = `${currentIdx + 1} / ${TEXTS.length}`;
  document.getElementById('prevBtn').disabled = currentIdx === 0;
  document.getElementById('nextBtn').disabled = currentIdx === TEXTS.length - 1;
}

function renderDots() {
  const c = document.getElementById('topicDots'); c.innerHTML = '';
  TEXTS.forEach((t, i) => {
    const d = document.createElement('button');
    d.className = 'topic-dot'; d.title = t.title;
    if (i === currentIdx)         d.classList.add('active');
    else if (completedSet.has(i)) d.classList.add('done');
    d.onclick = () => goTo(i);
    c.appendChild(d);
  });
}

// ─── Pips ─────────────────────────────────────────────────────────────────────
function renderPips() {
  const c = document.getElementById('qProgress'); c.innerHTML = '';
  currentQuestions.forEach((_, i) => {
    const pip = document.createElement('button');
    pip.className = 'q-pip';
    if (isAnswered(i)) pip.classList.add(isCorrect(i) ? 'done-correct' : 'done-wrong');
    else if (i === currentQ) pip.classList.add('current');
    pip.onclick = () => { currentQ = i; showEnQuestion = false; renderQuestion(); };
    pip.title = `Vraag ${i + 1}`;
    c.appendChild(pip);
  });
}

// ─── Render question ──────────────────────────────────────────────────────────
function renderQuestion() {
  const q = currentQuestions[currentQ];
  const already = isAnswered(currentQ);
  const useEn = showEnQuestion && q.en;

  const questionEnBtn = document.getElementById('questionEnBtn');
  questionEnBtn.hidden = !q.en;
  questionEnBtn.classList.toggle('active', !!useEn);

  document.getElementById('qNumber').textContent  = `Vraag ${currentQ + 1} van ${currentQuestions.length}`;
  document.getElementById('qTypeTag').textContent = q.type;
  document.getElementById('qText').textContent    = useEn ? q.en.text : q.text;

  const fb = document.getElementById('qFeedback');
  const hn = document.getElementById('highlightNote');
  fb.className = 'feedback'; fb.textContent = '';
  hn.classList.remove('show');
  renderPassage();

  const opts = document.getElementById('qOptions'); opts.innerHTML = '';
  q.options.forEach((opt, oi) => {
    const div = document.createElement('div'); div.className = 'option';
    if (already) div.classList.add('disabled');
    if (answers[currentQ] === oi) div.classList.add('selected');
    if (already && oi === q.correct) div.classList.add('correct');
    if (already && answers[currentQ] === oi && oi !== q.correct) div.classList.add('wrong');
    const letter = document.createElement('span'); letter.className = 'option-letter';
    letter.textContent = String.fromCharCode(65 + oi);
    const text = document.createElement('span'); text.textContent = useEn ? q.en.options[oi] : opt;
    div.appendChild(letter); div.appendChild(text);
    if (!already) div.addEventListener('click', () => selectOption(oi));
    opts.appendChild(div);
  });

  if (already) {
    fb.classList.add('show');
    fb.classList.add(isCorrect(currentQ) ? 'ok' : 'nee');
    const feedback = useEn ? q.en.feedback : q.feedback;
    fb.textContent = isCorrect(currentQ) ? feedback.ok : feedback.nee;
    if (!showEnPassage) {
      hn.classList.add('show');
      applyHighlight(q.highlight);
    }
  }
  renderControls(); renderPips();
}

// ─── Select option ────────────────────────────────────────────────────────────
function selectOption(oi) {
  if (isAnswered(currentQ)) return;
  answers[currentQ] = oi;
  renderQuestion();
  if (allAnswered()) finalise();
}

// ─── Controls ─────────────────────────────────────────────────────────────────
function renderControls() {
  const c = document.getElementById('controls'); c.innerHTML = '';

  if (currentQ > 0) {
    const back = document.createElement('button'); back.className = 'btn-back';
    back.textContent = '← Vorige vraag';
    back.onclick = () => { currentQ--; showEnQuestion = false; renderQuestion(); };
    c.appendChild(back);
  }

  if (isAnswered(currentQ) && currentQ < currentQuestions.length - 1) {
    const next = document.createElement('button'); next.className = 'btn-primary';
    next.textContent = 'Volgende vraag →';
    next.onclick = () => { currentQ++; showEnQuestion = false; renderQuestion(); };
    c.appendChild(next);
  }

  const restart = document.createElement('button'); restart.className = 'btn-secondary';
  restart.textContent = 'Opnieuw beginnen';
  restart.onclick = () => loadText();
  c.appendChild(restart);
}

// ─── Finalise ─────────────────────────────────────────────────────────────────
function finalise() {
  const score = answers.filter((a, i) => a === currentQuestions[i].correct).length;
  const total = currentQuestions.length;
  const pct = Math.round((score / total) * 100);
  const comment = pct >= 80 ? 'Uitstekend!' : pct >= 60 ? 'Goed bezig.' : 'Blijf oefenen!';

  const bar = document.getElementById('scoreBar'); bar.classList.add('show');
  bar.innerHTML = `<div class="score-number">${score}/${total}</div><div class="score-text">${pct}% goed — ${comment}</div>`;

  completedSet.add(currentIdx); renderDots();
  if (completedSet.size < TEXTS.length) document.getElementById('nextTextBtn').classList.add('show');
  if (completedSet.size === TEXTS.length) showAllDone();

  const t = TEXTS[currentIdx]; const now = new Date();
  sessionHistory.unshift({
    title: t.title, topic: t.topic,
    date: now.toLocaleString('nl-NL', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' }),
    score, total, pct,
    questions: currentQuestions.map((q, i) => ({
      text: q.text, correct: answers[i] === q.correct,
      yourAnswer: q.options[answers[i]], rightAnswer: q.options[q.correct]
    }))
  });
  document.getElementById('histCount').textContent = sessionHistory.length;
}

function showAllDone() {
  const ts = sessionHistory.reduce((a, e) => a + e.score, 0);
  const tp = sessionHistory.reduce((a, e) => a + e.total, 0);
  const pct = Math.round((ts / tp) * 100);
  const c = pct >= 80 ? 'Geweldig gedaan!' : pct >= 60 ? 'Goed werk! Blijf oefenen.' : 'Goed dat je alle teksten hebt gedaan!';
  document.getElementById('allDoneScore').textContent = `${ts}/${tp}`;
  document.getElementById('allDoneText').textContent  = `${pct}% correct over alle teksten — ${c}`;
  document.getElementById('allDone').classList.add('show');
}

function restartAll() {
  completedSet.clear(); currentIdx = 0;
  document.getElementById('allDone').classList.remove('show');
  loadText();
}

// ─── English toggle ──────────────────────────────────────────────────────────
function renderPassage() {
  const t = TEXTS[currentIdx];
  const useEn = showEnPassage && t.en;
  document.getElementById('passageTitle').textContent = useEn ? t.en.title : t.title;
  const paragraphs = useEn ? t.en.paragraphs : t.paragraphs;
  document.getElementById('passageBody').innerHTML = paragraphs.map(p => `<p>${p}</p>`).join('');
}

function togglePassageEN() {
  const t = TEXTS[currentIdx];
  if (!t.en) return;
  showEnPassage = !showEnPassage;
  document.getElementById('passageEnBtn').classList.toggle('active', showEnPassage);
  renderPassage();
  const q = currentQuestions[currentQ];
  if (isAnswered(currentQ) && !showEnPassage) applyHighlight(q.highlight);
}

function toggleQuestionEN() {
  const q = currentQuestions[currentQ];
  if (!q.en) return;
  showEnQuestion = !showEnQuestion;
  renderQuestion();
}

// ─── Highlight ─────────────────────────────────────────────────────────────────
function applyHighlight(phrase) {
  if (!phrase) return;
  const body = document.getElementById('passageBody');
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'i');
  body.querySelectorAll('p').forEach(p => {
    if (regex.test(p.textContent)) {
      p.innerHTML = p.textContent.replace(regex, '<mark>$1</mark>');
      setTimeout(() => p.querySelector('mark')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  });
}

// ─── History ───────────────────────────────────────────────────────────────────
function renderHistory() {
  const list = document.getElementById('historyList'); list.innerHTML = '';
  if (sessionHistory.length === 0) {
    list.innerHTML = '<div class="history-empty"><strong>Nog geen oefeningen voltooid</strong>Maak een oefening af om deze hier te zien.</div>';
    return;
  }
  const wrap = document.createElement('div'); wrap.className = 'history-list';
  sessionHistory.forEach(entry => {
    const pc = entry.pct >= 80 ? 'pill-good' : entry.pct >= 60 ? 'pill-mid' : 'pill-low';
    const card = document.createElement('div'); card.className = 'history-card';
    const qRows = entry.questions.map(q => `<div class="hq"><span class="hq-icon ${q.correct ? 'ok' : 'nee'}">${q.correct ? '✓' : '✗'}</span><span>${q.text}</span></div>`).join('');
    card.innerHTML = `<div class="history-card-header"><div class="history-title">${entry.title}</div><span class="score-pill ${pc}">${entry.score}/${entry.total}</span></div><div class="history-date">${entry.topic} · ${entry.date}</div><details><summary>Bekijk vragen</summary><div class="hq-list">${qRows}</div></details>`;
    wrap.appendChild(card);
  });
  list.appendChild(wrap);
}

// ─── Init ──────────────────────────────────────────────────────────────────────
loadText();
