// ─── State ───────────────────────────────────────────────────────────────────
let currentIdx = 0, currentQ = 0;
let answers = [];          // answers[qi] = chosen option index or null
let currentQuestions = []; // shuffled copy of questions for this load
let textScores = {}; // { [textIdx]: {score, total} } — last result per text, persisted to localStorage
let showEnPassage = false; // English toggle for the current passage
let showEnQuestion = false; // English toggle for the current question/answer section
let memoryBank = [];       // saved words for later practice, persisted to localStorage
let lastWordTap = { span: null, time: 0 };

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
  if (name === 'geheugenbank') {
    document.getElementById('bankPracticeView').hidden = true;
    document.getElementById('bankListView').hidden = false;
    renderMemoryBank();
  }
}

// ─── Text navigation ──────────────────────────────────────────────────────────
function goTo(idx) {
  if (idx < 0 || idx >= TEXTS.length) return;
  const prev = textScores[idx];
  if (prev) {
    const again = confirm(`Je scoorde eerder ${prev.score}/${prev.total} op deze tekst. Opnieuw proberen?`);
    if (!again) return;
  }
  currentIdx = idx;
  loadText();
}
function goToNext() {
  for (let i = 1; i <= TEXTS.length; i++) {
    const c = (currentIdx + i) % TEXTS.length;
    if (!(c in textScores)) { goTo(c); return; }
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

function scoreClass(score, total) {
  const pct = total > 0 ? score / total : 0;
  if (pct >= 1)   return 'score-green';
  if (pct >= 0.8) return 'score-yellow';
  if (pct >= 0.6) return 'score-orange';
  return 'score-red';
}

function renderDots() {
  const c = document.getElementById('topicDots'); c.innerHTML = '';
  TEXTS.forEach((t, i) => {
    const d = document.createElement('button');
    d.className = 'topic-dot'; d.title = t.title;
    if (i === currentIdx) d.classList.add('active');
    const s = textScores[i];
    if (s) d.classList.add(scoreClass(s.score, s.total));
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
  document.getElementById('qText').innerHTML      = tappableOrPlain(useEn ? q.en.text : q.text, useEn);

  const fb = document.getElementById('qFeedback');
  const hn = document.getElementById('highlightNote');
  fb.className = 'feedback'; fb.innerHTML = '';
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
    const text = document.createElement('span');
    const optDisplay = useEn ? q.en.options[oi] : opt;
    // Words only become tappable once answered — before that the whole option
    // must stay a single click target so tapping a word doesn't eat the answer tap.
    text.innerHTML = (useEn || !already) ? escapeHtml(optDisplay) : renderTappableText(optDisplay);
    div.appendChild(letter); div.appendChild(text);
    if (!already) div.addEventListener('click', () => selectOption(oi));
    opts.appendChild(div);
  });

  if (already) {
    fb.classList.add('show');
    fb.classList.add(isCorrect(currentQ) ? 'ok' : 'nee');
    const feedback = useEn ? q.en.feedback : q.feedback;
    const feedbackText = isCorrect(currentQ) ? feedback.ok : feedback.nee;
    fb.innerHTML = tappableOrPlain(feedbackText, useEn);
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

  textScores[currentIdx] = { score, total };
  saveTextScores();
  renderDots();

  const allDone = Object.keys(textScores).length === TEXTS.length;
  if (!allDone) document.getElementById('nextTextBtn').classList.add('show');
  if (allDone) showAllDone();
}

function showAllDone() {
  let ts = 0, tp = 0;
  Object.values(textScores).forEach(s => { ts += s.score; tp += s.total; });
  const pct = Math.round((ts / tp) * 100);
  const c = pct >= 80 ? 'Geweldig gedaan!' : pct >= 60 ? 'Goed werk! Blijf oefenen.' : 'Goed dat je alle teksten hebt gedaan!';
  document.getElementById('allDoneScore').textContent = `${ts}/${tp}`;
  document.getElementById('allDoneText').textContent  = `${pct}% correct over alle teksten — ${c}`;
  document.getElementById('allDone').classList.add('show');
}

function restartAll() {
  textScores = {};
  saveTextScores();
  currentIdx = 0;
  document.getElementById('allDone').classList.remove('show');
  loadText();
}

// ─── Tap-to-translate ─────────────────────────────────────────────────────────
const WORD_RE = /[A-Za-zÀ-ÖØ-öø-ÿ]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ]+)*/g;
const SENTENCE_RE = /[^.!?]+[.!?]*/g;

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function sentenceSpans(text) {
  const spans = [];
  SENTENCE_RE.lastIndex = 0;
  let m;
  while ((m = SENTENCE_RE.exec(text))) {
    if (m[0].trim()) spans.push({ start: m.index, end: m.index + m[0].length, text: m[0].trim() });
  }
  return spans;
}

function sentenceAt(spans, offset) {
  for (const s of spans) if (offset >= s.start && offset < s.end) return s.text;
  return spans.length ? spans[spans.length - 1].text : '';
}

function isWordSaved(key) {
  return memoryBank.some(e => e.key === key);
}

// All known sentences a word appears in across the whole corpus (used for
// practice variety), sourced from wordindex.js, always including the sentence
// it was originally saved from even if wordindex.js doesn't have it.
function sentencesForWord(entry) {
  const fromIndex = (typeof WORD_INDEX !== 'undefined' && WORD_INDEX[entry.key]) || [];
  const seen = new Set();
  const out = [];
  const add = (sentence, textIdx) => {
    if (!sentence || seen.has(sentence)) return;
    seen.add(sentence);
    const t = textIdx != null ? TEXTS[textIdx] : null;
    out.push({ sentence, sourceTitle: t ? t.title : entry.sourceTitle, topic: t ? t.topic : entry.topic });
  };
  add(entry.sentence, null);
  fromIndex.forEach(o => add(o.s, o.t));
  return out;
}

// Renders `text` as HTML with every Dutch word wrapped in a tappable span that
// carries its own containing sentence (for the memory-bank save). When
// markStart/markEnd are given, that character range is additionally wrapped
// in <mark> — used to keep answer-highlighting compatible with tap-to-translate.
function renderTappableText(text, markStart, markEnd) {
  const spans = sentenceSpans(text);
  const pieces = [];
  let last = 0;
  WORD_RE.lastIndex = 0;
  let m;
  while ((m = WORD_RE.exec(text))) {
    if (m.index > last) pieces.push({ start: last, end: m.index, html: escapeHtml(text.slice(last, m.index)) });
    const word = m[0];
    const lw = word.toLowerCase();
    const sent = sentenceAt(spans, m.index);
    const savedCls = isWordSaved(lw) ? ' saved' : '';
    pieces.push({
      start: m.index, end: m.index + word.length,
      html: `<span class="tapword${savedCls}" data-w="${escapeHtml(lw)}" data-s="${escapeHtml(sent)}">${escapeHtml(word)}</span>`
    });
    last = m.index + word.length;
  }
  if (last < text.length) pieces.push({ start: last, end: text.length, html: escapeHtml(text.slice(last)) });

  if (markStart == null) return pieces.map(p => p.html).join('');

  const pre  = pieces.filter(p => p.end <= markStart).map(p => p.html).join('');
  const mid  = pieces.filter(p => p.start >= markStart && p.end <= markEnd).map(p => p.html).join('');
  const post = pieces.filter(p => p.start >= markEnd).map(p => p.html).join('');
  return pre + (mid ? `<mark>${mid}</mark>` : '') + post;
}

function tappableOrPlain(text, useEn) {
  return useEn ? escapeHtml(text) : renderTappableText(text);
}

// ─── English toggle ──────────────────────────────────────────────────────────
function renderPassage() {
  const t = TEXTS[currentIdx];
  const useEn = showEnPassage && t.en;
  hideWordTooltip();
  const titleEl = document.getElementById('passageTitle');
  titleEl.innerHTML = tappableOrPlain(useEn ? t.en.title : t.title, useEn);
  const paragraphs = useEn ? t.en.paragraphs : t.paragraphs;
  document.getElementById('passageBody').innerHTML = paragraphs.map(p => `<p>${tappableOrPlain(p, useEn)}</p>`).join('');
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
  const t = TEXTS[currentIdx];
  const lower = phrase.toLowerCase();
  const body = document.getElementById('passageBody');
  t.paragraphs.forEach((text, i) => {
    const start = text.toLowerCase().indexOf(lower);
    if (start === -1) return;
    const p = body.children[i];
    if (!p) return;
    p.innerHTML = renderTappableText(text, start, start + phrase.length);
    setTimeout(() => p.querySelector('mark')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
  });
}

// ─── Word tooltip ─────────────────────────────────────────────────────────────
function glossFor(key) {
  return (typeof GLOSSARY !== 'undefined' && GLOSSARY[key]) || '(geen vertaling gevonden)';
}

function positionWordTooltipAtRect(tooltip, rect) {
  const tw = tooltip.offsetWidth, th = tooltip.offsetHeight;
  let left = rect.left + rect.width / 2 - tw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  let top = rect.top - th - 8;
  if (top < 8) top = rect.bottom + 8;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function positionWordTooltip(tooltip, span) {
  positionWordTooltipAtRect(tooltip, span.getBoundingClientRect());
}

// Re-renders the exercise view so tapword "saved" highlighting reflects the
// current memory bank (e.g. after a removal, the word's page highlight clears).
function refreshTapwordSavedState() {
  renderQuestion();
}

function showWordTooltip(span) {
  document.querySelectorAll('.tapword.tapped').forEach(s => s.classList.remove('tapped'));
  span.classList.add('tapped');
  const tooltip = document.getElementById('wordTooltip');
  const hint = isWordSaved(span.dataset.w) ? 'Tik nog een keer om te verwijderen' : 'Tik nog een keer om op te slaan';
  tooltip.innerHTML =
    `<span class="wt-word">${escapeHtml(span.textContent)}</span>` +
    `<span class="wt-gloss">${escapeHtml(glossFor(span.dataset.w))}</span>` +
    `<span class="wt-hint">${hint}</span>`;
  tooltip.classList.add('show');
  positionWordTooltip(tooltip, span);
}

function hideWordTooltip() {
  const tooltip = document.getElementById('wordTooltip');
  tooltip.classList.remove('show');
  document.querySelectorAll('.tapword.tapped').forEach(s => s.classList.remove('tapped'));
}

// Double-tap toggles: save it if it isn't in the bank yet, remove it if it is.
function saveWord(span) {
  const rect = span.getBoundingClientRect(); // capture before any re-render can detach this node
  const key = span.dataset.w;
  const sentence = span.dataset.s;
  const wordDisplay = span.textContent;
  const t = TEXTS[currentIdx];
  const tooltip = document.getElementById('wordTooltip');
  const existingIdx = memoryBank.findIndex(e => e.key === key);

  if (existingIdx !== -1) {
    memoryBank.splice(existingIdx, 1);
    saveMemoryBank();
    tooltip.innerHTML =
      `<span class="wt-word">${escapeHtml(wordDisplay)}</span>` +
      `<span class="wt-removed">Verwijderd uit de geheugenbank</span>`;
    refreshTapwordSavedState(); // safe here: tooltip isn't shown yet
  } else {
    memoryBank.unshift({
      word: wordDisplay, key, gloss: glossFor(key), sentence,
      sourceTitle: t.title, topic: t.topic, addedAt: Date.now()
    });
    saveMemoryBank();
    tooltip.innerHTML =
      `<span class="wt-word">${escapeHtml(wordDisplay)}</span>` +
      `<span class="wt-saved">&#10003; Opgeslagen in de geheugenbank</span>`;
    refreshTapwordSavedState(); // safe here: tooltip isn't shown yet
  }
  tooltip.classList.add('show');
  positionWordTooltipAtRect(tooltip, rect);
  setTimeout(hideWordTooltip, 1400);
}

// Capture phase so a tap on a word inside an answer option is caught (and its
// propagation stopped) before the option's own click-to-select listener fires.
document.addEventListener('click', (e) => {
  const span = e.target.closest('.tapword');
  if (!span) {
    if (!e.target.closest('#wordTooltip')) hideWordTooltip();
    return;
  }
  e.stopPropagation();
  const now = Date.now();
  if (lastWordTap.span === span && now - lastWordTap.time < 450) {
    saveWord(span);
    lastWordTap = { span: null, time: 0 };
  } else {
    showWordTooltip(span);
    lastWordTap = { span, time: now };
  }
}, true);

// ─── Per-text scores ──────────────────────────────────────────────────────────
function loadTextScores() {
  try {
    textScores = JSON.parse(localStorage.getItem('textScores') || '{}');
  } catch (e) { textScores = {}; }
}

function saveTextScores() {
  localStorage.setItem('textScores', JSON.stringify(textScores));
}

// ─── Memory bank ──────────────────────────────────────────────────────────────
function loadMemoryBank() {
  try {
    memoryBank = JSON.parse(localStorage.getItem('memoryBank') || '[]');
  } catch (e) { memoryBank = []; }
  updateBankCount();
}

function saveMemoryBank() {
  localStorage.setItem('memoryBank', JSON.stringify(memoryBank));
  updateBankCount();
}

function updateBankCount() {
  document.getElementById('bankCount').textContent = memoryBank.length;
}

function removeFromMemoryBank(i) {
  memoryBank.splice(i, 1);
  saveMemoryBank();
  renderMemoryBank();
  refreshTapwordSavedState();
}

function clearMemoryBank() {
  if (memoryBank.length && !confirm('Alle opgeslagen woorden verwijderen?')) return;
  memoryBank = [];
  saveMemoryBank();
  renderMemoryBank();
  refreshTapwordSavedState();
}

function renderMemoryBank() {
  const list = document.getElementById('memoryBankList'); list.innerHTML = '';
  if (memoryBank.length === 0) {
    list.innerHTML = '<div class="bank-empty"><strong>Nog geen woorden opgeslagen</strong>Tik op een woord in een tekst en tik er nogmaals op om het hier te bewaren.</div>';
    return;
  }

  const toolbar = document.createElement('div'); toolbar.className = 'bank-toolbar';
  const practiceBtn = document.createElement('button'); practiceBtn.className = 'btn-primary';
  practiceBtn.textContent = 'Oefenen';
  practiceBtn.onclick = startPractice;
  const clearBtn = document.createElement('button'); clearBtn.className = 'btn-secondary';
  clearBtn.textContent = 'Wis alles';
  clearBtn.onclick = clearMemoryBank;
  toolbar.appendChild(practiceBtn);
  toolbar.appendChild(clearBtn);
  list.appendChild(toolbar);

  const wrap = document.createElement('div'); wrap.className = 'bank-list';
  memoryBank.forEach((entry, i) => {
    const card = document.createElement('div'); card.className = 'bank-card';
    const wordRe = new RegExp(`(${entry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
    const sentenceHtml = escapeHtml(entry.sentence).replace(wordRe, '<mark>$1</mark>');
    const otherSentenceCount = sentencesForWord(entry).length - 1;
    card.innerHTML =
      `<button class="bank-remove" title="Verwijderen">&times;</button>` +
      `<div class="bank-card-header"><span class="bank-word">${escapeHtml(entry.word)}</span></div>` +
      `<div class="bank-gloss">${escapeHtml(entry.gloss || '(geen vertaling)')}</div>` +
      `<div class="bank-sentence">${sentenceHtml}</div>` +
      `<div class="bank-source">${escapeHtml(entry.topic)} &middot; ${escapeHtml(entry.sourceTitle)}</div>` +
      (otherSentenceCount > 0
        ? `<button class="bank-word-practice">Oefen dit woord (${otherSentenceCount + 1} zinnen) &rarr;</button>`
        : '');
    card.querySelector('.bank-remove').onclick = () => removeFromMemoryBank(i);
    const wordPracticeBtn = card.querySelector('.bank-word-practice');
    if (wordPracticeBtn) wordPracticeBtn.onclick = () => startPracticeWord(entry.key);
    wrap.appendChild(card);
  });
  list.appendChild(wrap);
}

// ─── Memory bank practice (simple flip-through) ──────────────────────────────
let practiceQueue = [];
let practiceIdx = 0;
let practiceFlipped = false;
let practiceLabel = ''; // shown on the completion screen

function shuffled(arr) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Whole list: one random sentence per word, so the same words come up in
// different contexts across sessions instead of always the sentence they were
// originally saved from.
function startPractice() {
  if (!memoryBank.length) return;
  practiceQueue = shuffled(memoryBank).map(entry => {
    const options = sentencesForWord(entry);
    const pick = options[Math.floor(Math.random() * options.length)];
    return { word: entry.word, key: entry.key, gloss: entry.gloss, ...pick };
  });
  practiceLabel = 'list';
  practiceIdx = 0;
  practiceFlipped = false;
  document.getElementById('bankListView').hidden = true;
  document.getElementById('bankPracticeView').hidden = false;
  renderPracticeCard();
}

// Single word: drill through every sentence that word appears in across the
// whole corpus (shuffled), so you see it used several different ways.
function startPracticeWord(key) {
  const entry = memoryBank.find(e => e.key === key);
  if (!entry) return;
  practiceQueue = shuffled(sentencesForWord(entry)).map(pick => ({
    word: entry.word, key: entry.key, gloss: entry.gloss, ...pick
  }));
  practiceLabel = entry.word;
  practiceIdx = 0;
  practiceFlipped = false;
  document.getElementById('bankListView').hidden = true;
  document.getElementById('bankPracticeView').hidden = false;
  renderPracticeCard();
}

function exitPractice() {
  document.getElementById('bankPracticeView').hidden = true;
  document.getElementById('bankListView').hidden = false;
  renderMemoryBank();
}

function flipPracticeCard() {
  practiceFlipped = true;
  renderPracticeCard();
}

function practicePrev() {
  if (practiceIdx > 0) { practiceIdx--; practiceFlipped = false; renderPracticeCard(); }
}

function practiceNext() {
  if (practiceIdx < practiceQueue.length) { practiceIdx++; practiceFlipped = false; renderPracticeCard(); }
}

function renderPracticeCard() {
  const container = document.getElementById('bankPracticeView');

  if (practiceIdx >= practiceQueue.length) {
    const isWordDrill = practiceLabel !== 'list';
    const wordKey = practiceQueue.length ? practiceQueue[0].key : null;
    const doneTitle = isWordDrill
      ? `Klaar! Je hebt "${escapeHtml(practiceLabel)}" in ${practiceQueue.length} zin${practiceQueue.length === 1 ? '' : 'nen'} geoefend.`
      : `Klaar! Je hebt ${practiceQueue.length} woord${practiceQueue.length === 1 ? '' : 'en'} geoefend.`;
    container.innerHTML =
      `<div class="bank-practice-inner"><div class="practice-done">` +
      `<div class="practice-done-title">${doneTitle}</div>` +
      `<div class="practice-done-actions">` +
      `<button class="btn-primary practice-restart-btn">Nog een keer</button>` +
      `<button class="btn-secondary" onclick="exitPractice()">Terug naar lijst</button>` +
      `</div></div></div>`;
    // Bound in JS rather than inlined into an onclick attribute string, since
    // Dutch words can contain apostrophes (e.g. "z'n") that would break the markup.
    container.querySelector('.practice-restart-btn').onclick = isWordDrill ? () => startPracticeWord(wordKey) : startPractice;
    return;
  }

  const entry = practiceQueue[practiceIdx];
  const wordRe = new RegExp(`(${entry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
  const sentenceHtml = escapeHtml(entry.sentence).replace(wordRe, '<mark>$1</mark>');
  const backHtml = practiceFlipped
    ? `<div class="practice-answer"><span class="practice-word">${escapeHtml(entry.word)}</span><span class="practice-gloss">${escapeHtml(entry.gloss || '(geen vertaling)')}</span></div>`
    : `<button class="btn-primary" onclick="flipPracticeCard()">Toon vertaling</button>`;

  container.innerHTML =
    `<div class="bank-practice-inner">` +
    `<div class="practice-progress">${practiceIdx + 1} / ${practiceQueue.length}</div>` +
    `<div class="practice-card"><div class="practice-sentence">${sentenceHtml}</div>${backHtml}</div>` +
    `<div class="practice-nav">` +
    `<button class="btn-back" ${practiceIdx === 0 ? 'disabled' : ''} onclick="practicePrev()">&larr; Vorige</button>` +
    `<button class="btn-secondary" onclick="exitPractice()">Stoppen</button>` +
    `<button class="btn-primary" onclick="practiceNext()">${practiceIdx === practiceQueue.length - 1 ? 'Klaar' : 'Volgende &rarr;'}</button>` +
    `</div></div>`;
}

// ─── Init ──────────────────────────────────────────────────────────────────────
loadTextScores();
loadMemoryBank();
loadText();
