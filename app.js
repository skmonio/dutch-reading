// ─── State ───────────────────────────────────────────────────────────────────
let currentIdx = 0, currentQ = 0;
let answers = [];          // answers[qi] = chosen option index or null
let currentQuestions = []; // shuffled copy of questions for this load
// { [textIdx]: {originalAnswers: [origOptionIdxOrNull, ...], currentQ} } — full per-question
// progress per text, persisted to localStorage. originalAnswers is keyed by the question's
// ORIGINAL (unshuffled) option index so it survives a fresh reshuffle on reload.
let textProgress = {};
let showEnPassage = false; // English toggle for the current passage
let showEnQuestion = false; // English toggle for the current question/answer section
let memoryBank = [];       // saved words for later practice, persisted to localStorage
let lastWordTap = { span: null, time: 0 };
let activeTabName = 'oefening'; // which tab is open, persisted so the app reopens where you left it
let bankViewMode = 'list'; // 'list' or 'practice' — whether Geheugenbank is mid flashcard/quiz session
let bankSessionKind = null; // 'flashcard' | 'quiz' | null — which practice view is active, when bankViewMode is 'practice'
let bankSortField = 'recent'; // 'recent' | 'alpha-nl' | 'alpha-en'
let bankSortDir = 'desc';     // 'asc' or 'desc' — meaning depends on the field; persisted
let bankFilterStatus = 'all'; // 'all' | 'learnt' | 'studying' | 'untested'; persisted

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
      correct: indices.indexOf(q.correct),
      _indices: indices // _indices[shuffledPos] = originalPos — used to resume progress across reshuffles
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
  activeTabName = name;
  saveAppState();
  if (name === 'geheugenbank' && bankViewMode !== 'practice') {
    // Leave an in-progress flashcard/quiz session exactly as it was if we're
    // returning to one — only render the list view when we're not mid-session.
    document.getElementById('bankPracticeView').hidden = true;
    document.getElementById('bankListView').hidden = false;
    renderMemoryBank();
  }
  if (name === 'statistieken') renderStats();
}

// ─── App state (which text + tab was open) ───────────────────────────────────
function loadAppState() {
  try {
    return JSON.parse(localStorage.getItem('appState') || '{}');
  } catch (e) { return {}; }
}

function saveAppState() {
  localStorage.setItem('appState', JSON.stringify({ currentIdx, activeTab: activeTabName }));
}

// ─── Text navigation ──────────────────────────────────────────────────────────
function goTo(idx) {
  if (idx < 0 || idx >= TEXTS.length) return;
  currentIdx = idx;
  saveAppState();
  loadText();
}
function goToNext() {
  for (let i = 1; i <= TEXTS.length; i++) {
    const c = (currentIdx + i) % TEXTS.length;
    if (!isTextComplete(textProgress[c])) { goTo(c); return; }
  }
  goTo((currentIdx + 1) % TEXTS.length);
}

function loadText() {
  const t = TEXTS[currentIdx];
  showEnPassage = false;
  showEnQuestion = false;
  const questionsWithEn = t.en ? t.questions.map((q, i) => ({ ...q, en: t.en.questions[i] })) : t.questions;
  currentQuestions = shuffleQuestions(questionsWithEn);

  const saved = textProgress[currentIdx];
  if (saved && Array.isArray(saved.originalAnswers) && saved.originalAnswers.length === currentQuestions.length) {
    answers = saved.originalAnswers.map((origIdx, i) => origIdx == null ? null : currentQuestions[i]._indices.indexOf(origIdx));
    currentQ = Math.min(saved.currentQ || 0, currentQuestions.length - 1);
  } else {
    answers = new Array(currentQuestions.length).fill(null);
    currentQ = 0;
  }

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

  if (allAnswered()) displayScoreBar(false); // show the existing result without re-triggering the all-done screen
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

// A text is "complete" once every question has a recorded answer.
function isTextComplete(p) {
  return !!p && Array.isArray(p.originalAnswers) && p.originalAnswers.every(a => a != null);
}

function scoreForProgress(idx) {
  const p = textProgress[idx];
  if (!isTextComplete(p)) return null;
  const t = TEXTS[idx];
  let score = 0;
  t.questions.forEach((q, i) => { if (p.originalAnswers[i] === q.correct) score++; });
  return { score, total: t.questions.length };
}

function renderDots() {
  const c = document.getElementById('topicDots'); c.innerHTML = '';
  TEXTS.forEach((t, i) => {
    const d = document.createElement('button');
    d.className = 'topic-dot'; d.title = t.title;
    if (i === currentIdx) d.classList.add('active');
    const p = textProgress[i];
    if (isTextComplete(p)) {
      const s = scoreForProgress(i);
      d.classList.add(scoreClass(s.score, s.total));
    } else if (p && p.originalAnswers.some(a => a != null)) {
      d.classList.add('in-progress');
    }
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
    pip.onclick = () => { currentQ = i; showEnQuestion = false; saveCurrentProgress(); renderQuestion(); };
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
  saveCurrentProgress();
  renderQuestion();
  if (allAnswered()) finalise();
}

// ─── Controls ─────────────────────────────────────────────────────────────────
function renderControls() {
  const c = document.getElementById('controls'); c.innerHTML = '';

  if (currentQ > 0) {
    const back = document.createElement('button'); back.className = 'btn-back';
    back.textContent = '← Vorige vraag';
    back.onclick = () => { currentQ--; showEnQuestion = false; saveCurrentProgress(); renderQuestion(); };
    c.appendChild(back);
  }

  if (isAnswered(currentQ) && currentQ < currentQuestions.length - 1) {
    const next = document.createElement('button'); next.className = 'btn-primary';
    next.textContent = 'Volgende vraag →';
    next.onclick = () => { currentQ++; showEnQuestion = false; saveCurrentProgress(); renderQuestion(); };
    c.appendChild(next);
  }

  if (allAnswered()) {
    const restart = document.createElement('button'); restart.className = 'btn-secondary';
    restart.textContent = 'Opnieuw beginnen';
    restart.onclick = () => {
      delete textProgress[currentIdx];
      saveTextProgress();
      loadText();
    };
    c.appendChild(restart);
  }
}

// ─── Finalise ─────────────────────────────────────────────────────────────────
function finalise() {
  saveCurrentProgress(); // ensure completion is persisted even if a caller skipped it
  updateStreak();
  displayScoreBar(true);
}

// Shows the score bar for the current (fully-answered) text. Pass triggerAllDone=true
// only for a just-completed attempt — restoring an already-done text on load must not
// re-fire the celebratory all-done screen every time you revisit it.
function displayScoreBar(triggerAllDone) {
  const score = answers.filter((a, i) => a === currentQuestions[i].correct).length;
  const total = currentQuestions.length;
  const pct = Math.round((score / total) * 100);
  const comment = pct >= 80 ? 'Uitstekend!' : pct >= 60 ? 'Goed bezig.' : 'Blijf oefenen!';

  const bar = document.getElementById('scoreBar'); bar.classList.add('show');
  bar.innerHTML = `<div class="score-number">${score}/${total}</div><div class="score-text">${pct}% goed — ${comment}</div>`;

  const allDone = TEXTS.every((_, i) => isTextComplete(textProgress[i]));
  if (!allDone) document.getElementById('nextTextBtn').classList.add('show');
  if (triggerAllDone && allDone) showAllDone();
}

function showAllDone() {
  let ts = 0, tp = 0;
  TEXTS.forEach((_, i) => {
    const s = scoreForProgress(i);
    if (s) { ts += s.score; tp += s.total; }
  });
  const pct = Math.round((ts / tp) * 100);
  const c = pct >= 80 ? 'Geweldig gedaan!' : pct >= 60 ? 'Goed werk! Blijf oefenen.' : 'Goed dat je alle teksten hebt gedaan!';
  document.getElementById('allDoneScore').textContent = `${ts}/${tp}`;
  document.getElementById('allDoneText').textContent  = `${pct}% correct over alle teksten — ${c}`;
  document.getElementById('allDone').classList.add('show');
}

function restartAll() {
  textProgress = {};
  saveTextProgress();
  currentIdx = 0;
  saveAppState();
  document.getElementById('allDone').classList.remove('show');
  loadText();
}

// ─── Streaks & milestones ─────────────────────────────────────────────────────
let streak = 0, bestStreak = 0;
const STREAK_MILESTONES = [3, 5, 10, 20, 50];
const WORDBANK_MILESTONES = [10, 25, 50, 100, 200];

function loadStreak() {
  try {
    const d = JSON.parse(localStorage.getItem('streakData') || '{}');
    streak = d.streak || 0;
    bestStreak = d.bestStreak || 0;
  } catch (e) { streak = 0; bestStreak = 0; }
  updateStreakBadge();
}

function saveStreak() {
  localStorage.setItem('streakData', JSON.stringify({ streak, bestStreak }));
}

function updateStreakBadge() {
  const el = document.getElementById('streakBadge');
  if (!el) return;
  el.hidden = streak === 0;
  el.textContent = `\u{1F525} ${streak}`;
  el.title = `Opeenvolgende teksten met minstens 4/5 goed — beste reeks: ${bestStreak}`;
}

// A "good" finish (4/5 or better) extends the streak; anything lower resets it.
function updateStreak() {
  const score = answers.filter((a, i) => a === currentQuestions[i].correct).length;
  const total = currentQuestions.length;
  const good = total > 0 && score / total >= 0.8;
  streak = good ? streak + 1 : 0;
  if (streak > bestStreak) bestStreak = streak;
  saveStreak();
  updateStreakBadge();
  if (good && STREAK_MILESTONES.includes(streak)) showMilestoneToast(`\u{1F525} ${streak} op een rij!`);
}

let milestoneToastTimer = null;
function showMilestoneToast(text) {
  const toast = document.getElementById('milestoneToast');
  if (!toast) return;
  toast.textContent = text;
  toast.classList.add('show');
  clearTimeout(milestoneToastTimer);
  milestoneToastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
}

// ─── Stats dashboard ──────────────────────────────────────────────────────────
// Everything here is derived on the fly from textProgress/memoryBank/bestStreak —
// no separate stats store to keep in sync.
const QUESTION_TYPE_ORDER = ['Detail', 'Hoofdgedachte', 'Inferentie', 'Woordbetekenis'];

function computeStats() {
  let completedCount = 0, scoreSum = 0, questionSum = 0;
  const tierCounts = { 'score-green': 0, 'score-yellow': 0, 'score-orange': 0, 'score-red': 0 };
  const typeStats = {};

  TEXTS.forEach((t, i) => {
    const p = textProgress[i];
    if (isTextComplete(p)) {
      completedCount++;
      const s = scoreForProgress(i);
      scoreSum += s.score;
      questionSum += s.total;
      tierCounts[scoreClass(s.score, s.total)]++;
    }
    if (p && Array.isArray(p.originalAnswers)) {
      t.questions.forEach((q, qi) => {
        const ans = p.originalAnswers[qi];
        if (ans == null) return;
        const st = typeStats[q.type] || (typeStats[q.type] = { correct: 0, total: 0 });
        st.total++;
        if (ans === q.correct) st.correct++;
      });
    }
  });

  const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const wordsThisWeek = memoryBank.filter(e => e.addedAt && e.addedAt >= oneWeekAgo).length;

  return {
    completedCount,
    avgPct: questionSum > 0 ? Math.round((scoreSum / questionSum) * 100) : null,
    tierCounts,
    typeStats,
    wordsThisWeek
  };
}

function renderStats() {
  const container = document.getElementById('statsContent');
  const s = computeStats();

  const tilesHtml =
    `<div class="stats-tiles">` +
    `<div class="stat-tile"><div class="stat-value">${s.completedCount}/${TEXTS.length}</div><div class="stat-label">Teksten voltooid</div></div>` +
    `<div class="stat-tile"><div class="stat-value">${s.avgPct == null ? '&mdash;' : s.avgPct + '%'}</div><div class="stat-label">Gemiddelde score</div></div>` +
    `<div class="stat-tile"><div class="stat-value">${bestStreak}</div><div class="stat-label">Beste reeks &#128293;</div></div>` +
    `<div class="stat-tile"><div class="stat-value">${memoryBank.length}</div><div class="stat-label">Woorden opgeslagen` +
    (s.wordsThisWeek > 0 ? ` <span class="stat-sub">(+${s.wordsThisWeek} deze week)</span>` : '') +
    `</div></div>` +
    `</div>`;

  const typeRows = QUESTION_TYPE_ORDER.map(type => {
    const st = s.typeStats[type];
    if (!st || st.total === 0) {
      return `<div class="stat-bar-row"><div class="stat-bar-label">${escapeHtml(type)}</div><div class="stat-bar-track"></div><div class="stat-bar-value stat-bar-nodata">nog niet geoefend</div></div>`;
    }
    const pct = Math.round((st.correct / st.total) * 100);
    return `<div class="stat-bar-row"><div class="stat-bar-label">${escapeHtml(type)}</div><div class="stat-bar-track"><div class="stat-bar-fill" style="width:${pct}%"></div></div><div class="stat-bar-value">${pct}% <span class="stat-bar-count">(${st.correct}/${st.total})</span></div></div>`;
  }).join('');

  const tiers = [
    { cls: 'score-green', label: 'Uitstekend (5/5)' },
    { cls: 'score-yellow', label: 'Goed (4/5)' },
    { cls: 'score-orange', label: 'Matig (3/5)' },
    { cls: 'score-red', label: '2/5 of lager' }
  ];
  let distHtml;
  if (s.completedCount > 0) {
    const segments = tiers.map(t => {
      const count = s.tierCounts[t.cls];
      if (!count) return '';
      const width = Math.round((count / s.completedCount) * 100);
      return `<div class="dist-segment ${t.cls}" style="width:${width}%" title="${escapeHtml(t.label)}: ${count}"></div>`;
    }).join('');
    const legend = tiers.map(t =>
      `<div class="dist-legend-item"><span class="dist-dot ${t.cls}"></span>${escapeHtml(t.label)} <strong>${s.tierCounts[t.cls]}</strong></div>`
    ).join('');
    distHtml = `<div class="dist-bar">${segments}</div><div class="dist-legend">${legend}</div>`;
  } else {
    distHtml = `<div class="bank-empty">Maak een tekst af om je scoreverdeling te zien.</div>`;
  }

  const wb = computeWordBankStats();
  const wordTiers = [
    { cls: 'word-learnt', label: 'Geleerd', count: wb.learnt },
    { cls: 'word-studying', label: 'In studie', count: wb.studying },
    { cls: 'word-untested', label: 'Nog niet getest', count: wb.untested }
  ];
  let wordProgressHtml;
  if (wb.total > 0) {
    const learntPct = Math.round((wb.learnt / wb.total) * 100);
    const segments = wordTiers.map(t => {
      if (!t.count) return '';
      const width = Math.round((t.count / wb.total) * 100);
      return `<div class="dist-segment ${t.cls}" style="width:${width}%" title="${escapeHtml(t.label)}: ${t.count}"></div>`;
    }).join('');
    const legend = wordTiers.map(t =>
      `<div class="dist-legend-item"><span class="dist-dot ${t.cls}"></span>${escapeHtml(t.label)} <strong>${t.count}</strong></div>`
    ).join('');
    wordProgressHtml =
      `<div class="wb-summary"><span class="wb-summary-pct">${learntPct}%</span> geleerd van ${wb.total} opgeslagen woord${wb.total === 1 ? '' : 'en'}</div>` +
      `<div class="dist-bar">${segments}</div><div class="dist-legend">${legend}</div>`;
  } else {
    wordProgressHtml = `<div class="bank-empty">Sla woorden op en doe de Quiz om voortgang te zien.</div>`;
  }

  container.innerHTML =
    tilesHtml +
    `<div class="stats-section">` +
    `<div class="stats-section-title">Nauwkeurigheid per vraagtype</div>` +
    `<div class="stat-bars">${typeRows}</div>` +
    `</div>` +
    `<div class="stats-section">` +
    `<div class="stats-section-title">Verdeling van scores</div>` +
    distHtml +
    `</div>` +
    `<div class="stats-section">` +
    `<div class="stats-section-title">Voortgang woordenbank</div>` +
    wordProgressHtml +
    `</div>`;
}

// A word only counts as "geleerd" once quizzed more than once at ≥80% —
// mirrors wordLearnStatus() used for the per-card badge, aggregated across the bank.
function computeWordBankStats() {
  let untested = 0, studying = 0, learnt = 0;
  memoryBank.forEach(e => {
    const status = wordLearnStatus(e);
    if (status === 'learnt') learnt++;
    else if (status === 'studying') studying++;
    else untested++;
  });
  return { total: memoryBank.length, untested, studying, learnt };
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
function renderTappableText(text, markStart, markEnd, source) {
  const spans = sentenceSpans(text);
  const pieces = [];
  const sourceAttrs = source ? ` data-title="${escapeHtml(source.title)}" data-topic="${escapeHtml(source.topic)}"` : '';
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
      html: `<span class="tapword${savedCls}" data-w="${escapeHtml(lw)}" data-s="${escapeHtml(sent)}"${sourceAttrs}>${escapeHtml(word)}</span>`
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

// Re-renders whichever view(s) currently show tapwords, so "saved" highlighting
// reflects the current memory bank (e.g. after a removal, the highlight clears).
function refreshTapwordSavedState() {
  renderQuestion();
  if (bankViewMode === 'practice') {
    if (bankSessionKind === 'quiz') renderQuizCard();
    else if (bankSessionKind === 'flashcard') renderPracticeCard();
  }
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
  const title = span.dataset.title || TEXTS[currentIdx].title;
  const topic = span.dataset.topic || TEXTS[currentIdx].topic;
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
      sourceTitle: title, topic, addedAt: Date.now()
    });
    saveMemoryBank();
    tooltip.innerHTML =
      `<span class="wt-word">${escapeHtml(wordDisplay)}</span>` +
      `<span class="wt-saved">&#10003; Opgeslagen in de geheugenbank</span>`;
    refreshTapwordSavedState(); // safe here: tooltip isn't shown yet
    if (WORDBANK_MILESTONES.includes(memoryBank.length)) {
      showMilestoneToast(`\u{1F389} ${memoryBank.length} woorden opgeslagen!`);
    }
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

// ─── Per-text progress ────────────────────────────────────────────────────────
function loadTextProgress() {
  try {
    textProgress = JSON.parse(localStorage.getItem('textProgress') || '{}');
  } catch (e) { textProgress = {}; }
}

function saveTextProgress() {
  localStorage.setItem('textProgress', JSON.stringify(textProgress));
}

// Persists the current answers (converted to original, pre-shuffle option indices so
// they still make sense after a fresh reshuffle) and which question you're viewing.
function saveCurrentProgress() {
  const originalAnswers = currentQuestions.map((q, i) => {
    const sel = answers[i];
    return sel == null ? null : q._indices[sel];
  });
  textProgress[currentIdx] = { originalAnswers, currentQ };
  saveTextProgress();
  renderDots(); // keep the current text's dot live as you answer, not just on navigation
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

const ALPHA_SORT_FIELDS = ['alpha-nl', 'alpha-en'];

function loadBankSortMode() {
  try {
    const s = JSON.parse(localStorage.getItem('bankSort') || '{}');
    bankSortField = ALPHA_SORT_FIELDS.includes(s.field) ? s.field : 'recent';
    bankSortDir = s.dir === 'asc' ? 'asc' : 'desc';
  } catch (e) { bankSortField = 'recent'; bankSortDir = 'desc'; }
}

function saveBankSortMode() {
  localStorage.setItem('bankSort', JSON.stringify({ field: bankSortField, dir: bankSortDir }));
}

function loadBankFilterStatus() {
  const s = localStorage.getItem('bankFilterStatus');
  bankFilterStatus = ['learnt', 'studying', 'untested'].includes(s) ? s : 'all';
}

function setBankFilter(status) {
  bankFilterStatus = status;
  localStorage.setItem('bankFilterStatus', status);
  renderMemoryBank();
}

// Tapping the already-active sort button flips its direction; tapping a different
// field switches to it with that field's natural default direction.
function setBankSort(field) {
  if (bankSortField === field) {
    bankSortDir = bankSortDir === 'asc' ? 'desc' : 'asc';
  } else {
    bankSortField = field;
    bankSortDir = ALPHA_SORT_FIELDS.includes(field) ? 'asc' : 'desc';
  }
  saveBankSortMode();
  renderMemoryBank();
}

// memoryBank itself stays in "most recently added first" order (unshift on save) —
// that's already bankSortField 'recent' + dir 'desc', so only reverse for 'asc'.
// Sorting only reorders a display copy; removal/practice handlers resolve back to
// the real array index via indexOf.
function getSortedBank() {
  const arr = [...memoryBank];
  if (bankSortField === 'alpha-nl') {
    arr.sort((a, b) => a.word.localeCompare(b.word, 'nl', { sensitivity: 'base' }));
    if (bankSortDir === 'desc') arr.reverse();
  } else if (bankSortField === 'alpha-en') {
    arr.sort((a, b) => (a.gloss || '').localeCompare(b.gloss || '', 'en', { sensitivity: 'base' }));
    if (bankSortDir === 'desc') arr.reverse();
  } else if (bankSortDir === 'asc') {
    arr.reverse();
  }
  return arr;
}

function bankStatusCounts() {
  const counts = { all: memoryBank.length, learnt: 0, studying: 0, untested: 0 };
  memoryBank.forEach(e => { counts[wordLearnStatus(e)]++; });
  return counts;
}

// Sorted, then narrowed to the active status filter (if any).
function getVisibleBank() {
  const sorted = getSortedBank();
  if (bankFilterStatus === 'all') return sorted;
  return sorted.filter(e => wordLearnStatus(e) === bankFilterStatus);
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

  const sortWrap = document.createElement('div'); sortWrap.className = 'bank-sort';
  const recentBtn = document.createElement('button');
  recentBtn.className = 'sort-btn' + (bankSortField === 'recent' ? ' active' : '');
  recentBtn.textContent = bankSortField === 'recent' ? (bankSortDir === 'desc' ? 'Recent ▾' : 'Recent ▴') : 'Recent';
  recentBtn.title = 'Recent: nieuwste eerst / oudste eerst';
  recentBtn.onclick = () => setBankSort('recent');
  const nlBtn = document.createElement('button');
  nlBtn.className = 'sort-btn' + (bankSortField === 'alpha-nl' ? ' active' : '');
  nlBtn.textContent = bankSortField === 'alpha-nl' && bankSortDir === 'desc' ? 'NL Z-A' : 'NL A-Z';
  nlBtn.title = 'Sorteer op het Nederlandse woord: A-Z / Z-A';
  nlBtn.onclick = () => setBankSort('alpha-nl');
  const enBtn = document.createElement('button');
  enBtn.className = 'sort-btn' + (bankSortField === 'alpha-en' ? ' active' : '');
  enBtn.textContent = bankSortField === 'alpha-en' && bankSortDir === 'desc' ? 'EN Z-A' : 'EN A-Z';
  enBtn.title = 'Sorteer op de Engelse vertaling: A-Z / Z-A';
  enBtn.onclick = () => setBankSort('alpha-en');
  sortWrap.appendChild(recentBtn);
  sortWrap.appendChild(nlBtn);
  sortWrap.appendChild(enBtn);

  const actionsWrap = document.createElement('div'); actionsWrap.className = 'bank-actions';
  const practiceBtn = document.createElement('button'); practiceBtn.className = 'btn-primary';
  practiceBtn.textContent = 'Oefenen';
  practiceBtn.onclick = startPractice;
  const quizBtn = document.createElement('button'); quizBtn.className = 'btn-primary';
  quizBtn.textContent = 'Quiz';
  quizBtn.onclick = startVocabQuiz;
  const clearBtn = document.createElement('button'); clearBtn.className = 'btn-secondary';
  clearBtn.textContent = 'Wis alles';
  clearBtn.onclick = clearMemoryBank;
  actionsWrap.appendChild(practiceBtn);
  actionsWrap.appendChild(quizBtn);
  actionsWrap.appendChild(clearBtn);

  toolbar.appendChild(sortWrap);
  toolbar.appendChild(actionsWrap);
  list.appendChild(toolbar);

  const filterRow = document.createElement('div'); filterRow.className = 'bank-filter-row';
  const counts = bankStatusCounts();
  [['all', 'Alles'], ['learnt', 'Geleerd'], ['studying', 'In studie'], ['untested', 'Nog niet getest']].forEach(([status, label]) => {
    const chip = document.createElement('button');
    chip.className = 'filter-chip' + (bankFilterStatus === status ? ' active' : '');
    chip.textContent = `${label} (${counts[status]})`;
    chip.onclick = () => setBankFilter(status);
    filterRow.appendChild(chip);
  });
  list.appendChild(filterRow);

  const visible = getVisibleBank();
  if (visible.length === 0) {
    const empty = document.createElement('div'); empty.className = 'bank-empty';
    empty.innerHTML = '<strong>Geen woorden met deze status</strong>Kies een ander filter hierboven.';
    list.appendChild(empty);
    return;
  }

  const wrap = document.createElement('div'); wrap.className = 'bank-list';
  visible.forEach((entry) => {
    const i = memoryBank.indexOf(entry);
    const card = document.createElement('div'); card.className = 'bank-card';
    const wordRe = new RegExp(`(${entry.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
    const sentenceHtml = escapeHtml(entry.sentence).replace(wordRe, '<mark>$1</mark>');
    const otherSentenceCount = sentencesForWord(entry).length - 1;
    card.innerHTML =
      `<button class="bank-remove" title="Verwijderen">&times;</button>` +
      `<div class="bank-card-header"><span class="bank-word">${escapeHtml(entry.word)}</span>${wordStatusBadge(entry)}</div>` +
      `<div class="bank-gloss">${escapeHtml(entry.gloss || '(geen vertaling)')}</div>` +
      `<div class="bank-sentence">${sentenceHtml}</div>` +
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
let practiceShowEn = false;
let practiceLabel = ''; // shown on the completion screen

function sentenceTranslation(sentence) {
  return (typeof SENTENCE_INDEX !== 'undefined' && SENTENCE_INDEX[sentence]) || null;
}

// Plain, non-interactive rendering with just the target word marked — used
// before a card is answered/flipped, so tapping can't leak the meaning early.
function markedSentenceHtml(sentence, word) {
  const wordRe = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
  return escapeHtml(sentence).replace(wordRe, '<mark>$1</mark>');
}

// Fully tappable rendering (translate + double-tap save/remove) with the target
// word still marked — used once a card is answered/flipped, so users can look
// up any other unfamiliar word in the sentence too.
function tapSentenceHtml(sentence, word, source) {
  const wordRe = new RegExp(`(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'i');
  const m = wordRe.exec(sentence);
  const markStart = m ? m.index : null;
  const markEnd = m ? m.index + m[0].length : null;
  return renderTappableText(sentence, markStart, markEnd, source);
}

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
  const words = getVisibleBank();
  if (!words.length) return;
  practiceQueue = shuffled(words).map(entry => {
    const options = sentencesForWord(entry);
    const pick = options[Math.floor(Math.random() * options.length)];
    return { word: entry.word, key: entry.key, gloss: entry.gloss, ...pick };
  });
  practiceLabel = 'list';
  practiceIdx = 0;
  practiceFlipped = false;
  practiceShowEn = false;
  bankViewMode = 'practice';
  bankSessionKind = 'flashcard';
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
  practiceShowEn = false;
  bankViewMode = 'practice';
  bankSessionKind = 'flashcard';
  document.getElementById('bankListView').hidden = true;
  document.getElementById('bankPracticeView').hidden = false;
  renderPracticeCard();
}

function exitPractice() {
  bankViewMode = 'list';
  bankSessionKind = null;
  document.getElementById('bankPracticeView').hidden = true;
  document.getElementById('bankListView').hidden = false;
  renderMemoryBank();
}

function flipPracticeCard() {
  practiceFlipped = true;
  renderPracticeCard();
}

function practicePrev() {
  if (practiceIdx > 0) { practiceIdx--; practiceFlipped = false; practiceShowEn = false; renderPracticeCard(); }
}

function practiceNext() {
  if (practiceIdx < practiceQueue.length) { practiceIdx++; practiceFlipped = false; practiceShowEn = false; renderPracticeCard(); }
}

function togglePracticeEn() {
  practiceShowEn = !practiceShowEn;
  renderPracticeCard();
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
  const enSentence = sentenceTranslation(entry.sentence);
  const source = { title: entry.sourceTitle, topic: entry.topic };
  const sentenceHtml = (practiceShowEn && enSentence)
    ? escapeHtml(enSentence)
    : practiceFlipped
      ? tapSentenceHtml(entry.sentence, entry.word, source)
      : markedSentenceHtml(entry.sentence, entry.word);
  const enToggleHtml = (practiceFlipped && enSentence)
    ? `<button class="sentence-en-toggle" onclick="togglePracticeEn()">${practiceShowEn ? 'NL' : 'EN'}</button>`
    : '';
  const backHtml = practiceFlipped
    ? `<div class="practice-answer"><span class="practice-word">${escapeHtml(entry.word)}</span><span class="practice-gloss">${escapeHtml(entry.gloss || '(geen vertaling)')}</span></div>`
    : `<button class="btn-primary" onclick="flipPracticeCard()">Toon vertaling</button>`;

  container.innerHTML =
    `<div class="bank-practice-inner">` +
    `<div class="practice-progress">${practiceIdx + 1} / ${practiceQueue.length}</div>` +
    `<div class="practice-card"><div class="practice-sentence">${sentenceHtml}${enToggleHtml}</div>${backHtml}</div>` +
    `<div class="practice-nav">` +
    `<button class="btn-back" ${practiceIdx === 0 ? 'disabled' : ''} onclick="practicePrev()">&larr; Vorige</button>` +
    `<button class="btn-secondary" onclick="exitPractice()">Stoppen</button>` +
    `<button class="btn-primary" onclick="practiceNext()">${practiceIdx === practiceQueue.length - 1 ? 'Klaar' : 'Volgende &rarr;'}</button>` +
    `</div></div>`;
}

// ─── Memory bank practice: multiple-choice quiz ──────────────────────────────
// Retrieval practice (recall the meaning, then check) beats passively flipping a
// card for retention, so this is a second, more active mode alongside Oefenen.
let quizQueue = [];
let quizIdx = 0;
let quizScore = 0;
let quizAnswered = null; // the option text the user picked, or null before they answer
let quizShowEn = false;

// Wrong-answer options for one word: prefer other saved words' glosses (so the
// choices feel relevant to what you're actually studying), padding from the full
// glossary if the bank is too small to supply three distinct distractors.
function pickDistractors(correctEntry, count) {
  const seen = new Set([correctEntry.gloss]);
  const distractors = [];
  shuffled(memoryBank.filter(e => e.key !== correctEntry.key)).forEach(e => {
    if (distractors.length < count && e.gloss && !seen.has(e.gloss)) { distractors.push(e.gloss); seen.add(e.gloss); }
  });
  if (distractors.length < count && typeof GLOSSARY !== 'undefined') {
    shuffled(Object.keys(GLOSSARY)).forEach(k => {
      if (distractors.length >= count) return;
      const g = GLOSSARY[k];
      if (k !== correctEntry.key && g && !seen.has(g)) { distractors.push(g); seen.add(g); }
    });
  }
  return distractors;
}

function startVocabQuiz() {
  const words = getVisibleBank();
  if (!words.length) return;
  quizQueue = shuffled(words).map(entry => {
    const options = sentencesForWord(entry);
    const pick = options[Math.floor(Math.random() * options.length)];
    const choices = shuffled([entry.gloss, ...pickDistractors(entry, 3)]);
    return { word: entry.word, key: entry.key, gloss: entry.gloss, sentence: pick.sentence, sourceTitle: pick.sourceTitle, topic: pick.topic, choices };
  });
  quizIdx = 0;
  quizScore = 0;
  quizAnswered = null;
  quizShowEn = false;
  bankViewMode = 'practice';
  bankSessionKind = 'quiz';
  document.getElementById('bankListView').hidden = true;
  document.getElementById('bankPracticeView').hidden = false;
  renderQuizCard();
}

function selectQuizOption(choiceText) {
  if (quizAnswered != null) return;
  quizAnswered = choiceText;
  const item = quizQueue[quizIdx];
  const correct = choiceText === item.gloss;
  if (correct) quizScore++;
  recordQuizResult(item.key, correct);
  renderQuizCard();
}

// Only the multiple-choice Quiz produces a real right/wrong signal per word —
// flipping a flashcard is a self-report with no answer to check, so it doesn't count.
function recordQuizResult(key, correct) {
  const entry = memoryBank.find(e => e.key === key);
  if (!entry) return;
  entry.quizStats = entry.quizStats || { attempts: 0, correct: 0 };
  entry.quizStats.attempts++;
  if (correct) entry.quizStats.correct++;
  saveMemoryBank();
}

// A word counts as "geleerd" only once it's been quizzed more than once and
// answered right at least 75% of the time — one lucky first guess shouldn't count.
function wordLearnStatus(entry) {
  const qs = entry.quizStats;
  if (!qs || qs.attempts === 0) return 'untested';
  return qs.attempts >= 2 && qs.correct / qs.attempts >= 0.75 ? 'learnt' : 'studying';
}

function wordStatusBadge(entry) {
  const status = wordLearnStatus(entry);
  if (status === 'untested') return '';
  const qs = entry.quizStats;
  const pct = Math.round((qs.correct / qs.attempts) * 100);
  const cls = status === 'learnt' ? 'bank-status-learnt' : 'bank-status-studying';
  return `<span class="bank-status ${cls}">${pct}%</span>`;
}

function quizNext() {
  quizIdx++;
  quizAnswered = null;
  quizShowEn = false;
  renderQuizCard();
}

function toggleQuizEn() {
  quizShowEn = !quizShowEn;
  renderQuizCard();
}

function renderQuizCard() {
  const container = document.getElementById('bankPracticeView');

  if (quizIdx >= quizQueue.length) {
    const pct = quizQueue.length ? Math.round((quizScore / quizQueue.length) * 100) : 0;
    container.innerHTML =
      `<div class="bank-practice-inner"><div class="practice-done">` +
      `<div class="practice-done-title">Klaar! Je scoorde ${quizScore}/${quizQueue.length} (${pct}%).</div>` +
      `<div class="practice-done-actions">` +
      `<button class="btn-primary quiz-restart-btn">Nog een keer</button>` +
      `<button class="btn-secondary" onclick="exitPractice()">Terug naar lijst</button>` +
      `</div></div></div>`;
    container.querySelector('.quiz-restart-btn').onclick = startVocabQuiz;
    return;
  }

  const item = quizQueue[quizIdx];
  const enSentence = sentenceTranslation(item.sentence);
  const source = { title: item.sourceTitle, topic: item.topic };
  const answered = quizAnswered != null;
  const sentenceHtml = (quizShowEn && enSentence)
    ? escapeHtml(enSentence)
    : answered
      ? tapSentenceHtml(item.sentence, item.word, source)
      : markedSentenceHtml(item.sentence, item.word);
  const enToggleHtml = (answered && enSentence)
    ? `<button class="sentence-en-toggle" onclick="toggleQuizEn()">${quizShowEn ? 'NL' : 'EN'}</button>`
    : '';

  container.innerHTML =
    `<div class="bank-practice-inner">` +
    `<div class="practice-progress">${quizIdx + 1} / ${quizQueue.length} &middot; ${quizScore} goed</div>` +
    `<div class="practice-card">` +
    `<div class="practice-sentence">${sentenceHtml}${enToggleHtml}</div>` +
    `<div class="quiz-question">Wat betekent <strong>${escapeHtml(item.word)}</strong>?</div>` +
    `<div class="options quiz-options"></div>` +
    `</div>` +
    `<div class="practice-nav">` +
    `<button class="btn-secondary" onclick="exitPractice()">Stoppen</button>` +
    (answered ? `<button class="btn-primary quiz-next-btn">${quizIdx === quizQueue.length - 1 ? 'Klaar' : 'Volgende &rarr;'}</button>` : '') +
    `</div></div>`;

  const opts = container.querySelector('.quiz-options');
  item.choices.forEach((choice, oi) => {
    const div = document.createElement('div'); div.className = 'option';
    if (answered) {
      div.classList.add('disabled');
      if (choice === item.gloss) div.classList.add('correct');
      else if (choice === quizAnswered) div.classList.add('wrong');
    }
    const letter = document.createElement('span'); letter.className = 'option-letter';
    letter.textContent = String.fromCharCode(65 + oi);
    const text = document.createElement('span'); text.textContent = choice;
    div.appendChild(letter); div.appendChild(text);
    if (!answered) div.addEventListener('click', () => selectQuizOption(choice));
    opts.appendChild(div);
  });

  if (answered) container.querySelector('.quiz-next-btn').onclick = quizNext;
}

// ─── Init ──────────────────────────────────────────────────────────────────────
const savedAppState = loadAppState();
if (typeof savedAppState.currentIdx === 'number' && savedAppState.currentIdx >= 0 && savedAppState.currentIdx < TEXTS.length) {
  currentIdx = savedAppState.currentIdx;
}
loadTextProgress();
loadMemoryBank();
loadBankSortMode();
loadBankFilterStatus();
loadStreak();
loadText();
if (savedAppState.activeTab === 'geheugenbank') {
  switchTab('geheugenbank', document.getElementById('tabBankBtn'));
}
