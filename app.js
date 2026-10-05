(() => {
  const $ = (id) => document.getElementById(id);
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
  };

  const s = {
    wpm: store.get('tp.wpm', 150),
    size: store.get('tp.size', 72),
    mirror: store.get('tp.mirror', false),
    countdown: store.get('tp.countdown', 3),
    theme: store.get('tp.theme', null), // null = system
    title: store.get('tp.title', ''),
    text: store.get('tp.text', ''),
  };
  let scripts = store.get('tp.scripts', []);

  // --- theme
  const applyTheme = () => {
    if (s.theme) document.documentElement.dataset.theme = s.theme;
    else delete document.documentElement.dataset.theme;
  };
  const toggleTheme = () => {
    const dark = s.theme ? s.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    s.theme = dark ? 'light' : 'dark';
    store.set('tp.theme', s.theme);
    applyTheme();
  };

  // --- editor
  const countWords = (t) => (t.trim().match(/\S+/g) || []).length;
  const fmtTime = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
  const syncEditor = () => {
    $('wpmOut').textContent = s.wpm;
    $('sizeOut').textContent = s.size;
    $('wpm').value = s.wpm;
    $('size').value = s.size;
    $('countdown').value = String(s.countdown);
    $('mirror').checked = s.mirror;
    const w = countWords($('scriptText').value);
    $('wordCount').textContent = `${w} words · ~${fmtTime(w / s.wpm * 60)}`;
  };
  const renderSaved = () => {
    const ul = $('saved');
    ul.innerHTML = '';
    if (!scripts.length) { ul.innerHTML = '<li class="muted">Nothing saved yet</li>'; return; }
    scripts.forEach((sc, i) => {
      const li = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = sc.title || 'Untitled';
      name.onclick = () => { $('scriptTitle').value = sc.title; $('scriptText').value = sc.text; persistDraft(); syncEditor(); };
      const del = document.createElement('button');
      del.textContent = '✕';
      del.title = 'Delete';
      del.onclick = () => { scripts.splice(i, 1); store.set('tp.scripts', scripts); renderSaved(); };
      li.append(name, del);
      ul.append(li);
    });
  };
  const persistDraft = () => { store.set('tp.title', $('scriptTitle').value); store.set('tp.text', $('scriptText').value); };
  const setSetting = (k, v) => { s[k] = v; store.set('tp.' + k, v); syncEditor(); syncBar(); applyLayout(); };

  $('scriptTitle').value = s.title;
  $('scriptText').value = s.text;
  $('scriptText').addEventListener('input', () => { persistDraft(); syncEditor(); });
  $('scriptTitle').addEventListener('input', persistDraft);
  $('wpm').addEventListener('input', (e) => setSetting('wpm', +e.target.value));
  $('size').addEventListener('input', (e) => setSetting('size', +e.target.value));
  $('countdown').addEventListener('change', (e) => setSetting('countdown', +e.target.value));
  $('mirror').addEventListener('change', (e) => setSetting('mirror', e.target.checked));
  $('themeBtn').onclick = toggleTheme;
  $('saveBtn').onclick = () => {
    const text = $('scriptText').value.trim();
    if (!text) return;
    const title = $('scriptTitle').value.trim() || text.split('\n')[0].slice(0, 40);
    const existing = scripts.findIndex((x) => x.title === title);
    if (existing >= 0) scripts[existing] = { title, text }; else scripts.unshift({ title, text });
    $('scriptTitle').value = title;
    persistDraft();
    store.set('tp.scripts', scripts);
    renderSaved();
  };

  // --- prompter
  let pos = 0;            // scroll offset in px
  let playing = false;
  let last = 0;
  let raf = 0;
  let countTimer = 0;
  let hideTimer = 0;
  let pxPerWord = 60;

  const textEl = $('text');
  const viewport = $('viewport');

  const applyLayout = () => {
    textEl.style.fontSize = s.size + 'px';
    $('band').style.setProperty('--band-h', Math.round(s.size * 1.35 + 30) + 'px');
    viewport.classList.toggle('mirror', s.mirror);
    measure();
  };
  const measure = () => {
    // average vertical pixels consumed per word → converts WPM to px/sec
    const words = Math.max(1, countWords(textEl.textContent));
    const total = textEl.scrollHeight;
    pxPerWord = total / words;
    groupRows();
  };
  let rows = [];          // visual rows: { center, spans }
  let activeRow = -1;
  const buildText = () => {
    textEl.innerHTML = '';
    const raw = $('scriptText').value.replace(/\r/g, '');
    raw.split('\n').forEach((l) => {
      const d = document.createElement('div');
      if (!l.trim()) { d.className = 'gap'; textEl.append(d); return; }
      d.className = 'para';
      l.trim().split(/\s+/).forEach((w, i, arr) => {
        const sp = document.createElement('span');
        sp.className = 'w';
        sp.textContent = w;
        d.append(sp);
        if (i < arr.length - 1) d.append(' ');
      });
      textEl.append(d);
    });
    applyLayout();
  };
  const groupRows = () => {
    rows = [];
    const map = new Map();
    textEl.querySelectorAll('.w').forEach((sp) => {
      const top = sp.offsetTop;
      let r = map.get(top);
      if (!r) { r = { top, bottom: top + sp.offsetHeight, spans: [] }; map.set(top, r); rows.push(r); }
      r.spans.push(sp);
    });
    rows.forEach((r) => { r.center = (r.top + r.bottom) / 2; });
    activeRow = -1;
  };
  const maxPos = () => Math.max(0, textEl.scrollHeight - 1);
  const render = () => {
    const mid = viewport.clientHeight / 2;
    textEl.style.transform = `translateY(${mid - pos}px)`;
    let best = 0, bd = Infinity;
    rows.forEach((r, i) => {
      const d = Math.abs(r.center - pos);
      if (d < bd) { bd = d; best = i; }
    });
    if (best !== activeRow) {
      rows.forEach((r, i) => {
        const dist = Math.abs(i - best);
        const cls = dist === 0 ? 'active' : dist === 1 ? 'near' : '';
        r.spans.forEach((sp) => { sp.className = cls ? 'w ' + cls : 'w'; });
      });
      activeRow = best;
    }
    $('progress').firstElementChild.style.width = (maxPos() ? Math.min(100, pos / maxPos() * 100) : 0) + '%';
  };
  const tick = (t) => {
    if (!playing) return;
    const dt = Math.min(0.1, (t - last) / 1000);
    last = t;
    pos += (s.wpm / 60) * pxPerWord * dt;
    if (pos >= maxPos()) { pos = maxPos(); render(); setPlaying(false); return; }
    render();
    raf = requestAnimationFrame(tick);
  };
  const setPlaying = (p) => {
    playing = p;
    $('playBtn').textContent = p ? 'Pause' : (pos >= maxPos() && pos > 0 ? 'Restart' : 'Play');
    cancelAnimationFrame(raf);
    if (p) { last = performance.now(); raf = requestAnimationFrame(tick); }
    wakeBar();
  };
  const togglePlay = () => {
    if (countTimer) { cancelCountdown(); return; }
    if (!playing && pos >= maxPos() && pos > 0) { pos = firstLinePos(); render(); }
    setPlaying(!playing);
  };
  const firstLinePos = () => (rows[0] ? rows[0].center : 0);
  const nudgeLine = (dir) => {
    const next = rows[Math.min(rows.length - 1, Math.max(0, (activeRow < 0 ? 0 : activeRow) + dir))];
    if (next) { pos = next.center; render(); }
    wakeBar();
  };
  const syncBar = () => { $('barWpm').textContent = s.wpm + ' WPM'; };

  const cancelCountdown = () => {
    clearTimeout(countTimer); countTimer = 0;
    $('countdownOverlay').classList.add('hidden');
  };
  const runCountdown = (n, done) => {
    if (n <= 0) { cancelCountdown(); done(); return; }
    const o = $('countdownOverlay');
    o.textContent = n;
    o.classList.remove('hidden');
    countTimer = setTimeout(() => runCountdown(n - 1, done), 1000);
  };

  const wakeBar = () => {
    const bar = $('bar');
    bar.classList.remove('faded');
    clearTimeout(hideTimer);
    if (playing) hideTimer = setTimeout(() => bar.classList.add('faded'), 2500);
  };

  const openPrompter = () => {
    if (!$('scriptText').value.trim()) { $('scriptText').focus(); return; }
    persistDraft();
    $('editor').classList.add('hidden');
    $('prompter').classList.remove('hidden');
    buildText();
    syncBar();
    pos = firstLinePos();
    render();
    if (s.countdown > 0) runCountdown(s.countdown, () => setPlaying(true));
    else setPlaying(true);
  };
  const closePrompter = () => {
    cancelCountdown();
    setPlaying(false);
    $('prompter').classList.add('hidden');
    $('editor').classList.remove('hidden');
    syncEditor();
  };
  const inPrompter = () => !$('prompter').classList.contains('hidden');

  $('startBtn').onclick = openPrompter;
  $('backBtn').onclick = closePrompter;
  $('playBtn').onclick = togglePlay;
  $('slower').onclick = () => setSetting('wpm', Math.max(40, s.wpm - 10));
  $('faster').onclick = () => setSetting('wpm', Math.min(260, s.wpm + 10));
  $('smaller').onclick = () => { setSetting('size', Math.max(28, s.size - 6)); render(); };
  $('larger').onclick = () => { setSetting('size', Math.min(140, s.size + 6)); render(); };
  $('mirrorBtn').onclick = () => setSetting('mirror', !s.mirror);
  $('barTheme').onclick = toggleTheme;

  viewport.addEventListener('wheel', (e) => {
    e.preventDefault();
    pos = Math.min(maxPos(), Math.max(0, pos + e.deltaY));
    render(); wakeBar();
  }, { passive: false });
  viewport.addEventListener('click', togglePlay);
  addEventListener('mousemove', () => inPrompter() && wakeBar());
  addEventListener('resize', () => { if (inPrompter()) { applyLayout(); render(); } });

  addEventListener('keydown', (e) => {
    const tag = (e.target.tagName || '').toLowerCase();
    if (!inPrompter()) return;
    if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
    const k = e.key;
    const handled = () => e.preventDefault();
    if (k === ' ' || k === 'Enter' || k === 'b' || k === 'B') { handled(); togglePlay(); }
    else if (k === 'ArrowUp') { handled(); setSetting('wpm', Math.min(260, s.wpm + 5)); wakeBar(); }
    else if (k === 'ArrowDown') { handled(); setSetting('wpm', Math.max(40, s.wpm - 5)); wakeBar(); }
    else if (k === 'ArrowLeft' || k === 'PageUp') { handled(); nudgeLine(-1); }
    else if (k === 'ArrowRight' || k === 'PageDown') { handled(); nudgeLine(1); }
    else if (k === '+' || k === '=') { setSetting('size', Math.min(140, s.size + 4)); render(); wakeBar(); }
    else if (k === '-') { setSetting('size', Math.max(28, s.size - 4)); render(); wakeBar(); }
    else if (k === 'm' || k === 'M') { setSetting('mirror', !s.mirror); }
    else if (k === 't' || k === 'T') { toggleTheme(); }
    else if (k === 'Escape') { closePrompter(); }
  });

  applyTheme();
  syncEditor();
  renderSaved();
})();
