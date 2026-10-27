/* ============================================================
   How a Chatbot Learns
   Plain HTML/CSS/JS. No libraries, no build step.
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  /* ---- per-stage run tokens: bumping a token kills that stage's loops ---- */
  var run = {};
  function newRun(i) { run[i] = (run[i] || 0) + 1; return run[i]; }
  function alive(i, id) { return run[i] === id; }

  /* ============================================================
     1. NAVIGATION
     ============================================================ */
  var stages = $$('.stage');
  var rail = $('#rail');
  var stepNum = $('#stepNum');
  var progressBar = $('#progressBar');
  var prevBtn = $('#prevBtn');
  var nextBtn = $('#nextBtn');
  var autoBtn = $('#autoBtn');

  var cur = -1;
  var auto = false;
  var autoTimer = null;
  var inits = {};              // filled in by each stage below

  stages.forEach(function (s, i) {
    var b = document.createElement('button');
    b.className = 'rail-dot';
    b.type = 'button';
    b.title = (i + 1) + '. ' + (s.dataset.title || '');
    b.setAttribute('aria-label', b.title);
    b.appendChild(document.createElement('span'));
    b.addEventListener('click', function () { go(i, true); });
    rail.appendChild(b);
  });
  var dots = $$('.rail-dot');

  function go(i, manual) {
    i = Math.max(0, Math.min(stages.length - 1, i));
    if (cur >= 0) {
      newRun(cur);                                  // stop the old stage's animations
      stages[cur].classList.remove('active');
    }
    cur = i;
    stages[cur].classList.add('active');
    dots.forEach(function (d, k) { d.classList.toggle('on', k === cur); });
    stepNum.textContent = (cur + 1) + ' / ' + stages.length;
    progressBar.style.width = ((cur + 1) / stages.length * 100) + '%';
    prevBtn.disabled = cur === 0;
    nextBtn.innerHTML = cur === stages.length - 1 ? 'Start over' : 'Next &rarr;';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (inits[cur]) inits[cur]();
    if (manual) scheduleAuto();
  }

  prevBtn.addEventListener('click', function () { go(cur - 1, true); });
  nextBtn.addEventListener('click', function () {
    if (cur === stages.length - 1) go(0, true); else go(cur + 1, true);
  });
  $$('[data-replay]').forEach(function (btn) {
    btn.addEventListener('click', function () { go(cur, true); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'ArrowRight') go(cur + 1, true);
    if (e.key === 'ArrowLeft') go(cur - 1, true);
  });

  function scheduleAuto() {
    clearTimeout(autoTimer);
    if (!auto) return;
    autoTimer = setTimeout(function () { go(cur + 1, true); }, 15000);
  }
  autoBtn.addEventListener('click', function () {
    auto = !auto;
    autoBtn.textContent = auto ? 'Auto-play: on' : 'Auto-play';
    autoBtn.classList.toggle('btn-primary', auto);
    scheduleAuto();
  });

  /* ============================================================
     2. SMALL SHARED HELPERS
     ============================================================ */
  function ease(t) { return 1 - Math.pow(1 - t, 3); }

  function countUp(el, target, ms, id, stage) {
    var t0 = performance.now();
    function tick() {
      if (!alive(stage, id)) return;
      var p = Math.min(1, (performance.now() - t0) / ms);
      el.textContent = Math.floor(ease(p) * target).toLocaleString('en-US');
      if (p < 1) requestAnimationFrame(tick);
    }
    tick();
  }

  function setBar(el, pct, label) {
    el.style.width = pct + '%';
    if (label) label.textContent = Math.round(pct) + '%';
  }

  /* ============================================================
     STEP 1 — the pile of text
     ============================================================ */
  var BITS = ['book', 'page', 'chapter', 'article', 'blog', 'recipe', 'poem', 'letter',
    'code', 'news', 'wiki', 'story', 'song', 'review', 'notes', 'guide', 'essay',
    'script', 'data', 'paper', 'manual', 'novel', 'report', 'forum', 'docs'];

  inits[0] = function () {
    var id = newRun(0);
    var pile = $('#pile');
    pile.innerHTML = '';
    for (var i = 0; i < 96; i++) {
      var c = document.createElement('span');
      c.className = 'pile-chip';
      c.textContent = BITS[Math.floor(Math.random() * BITS.length)];
      c.style.setProperty('--d', (Math.random() * 1.7).toFixed(2) + 's');
      c.style.setProperty('--dx', (Math.random() * 460 - 230).toFixed(0) + 'px');
      c.style.setProperty('--dy', (Math.random() * 420 - 210).toFixed(0) + 'px');
      c.style.setProperty('--rot', (Math.random() * 50 - 25).toFixed(0) + 'deg');
      pile.appendChild(c);
    }
    var out = $('#pileCount');
    out.textContent = '0';
    setTimeout(function () {
      if (!alive(0, id)) return;
      countUp(out, 15000000000000, 2400, id, 0);
    }, 900);
  };

  /* ============================================================
     STEP 2 — tokenizer
     ============================================================ */
  function splitTrailingPunct(w) {
    var m = w.match(/^(.+?)([.,!?;:]+)$/);
    return m ? [m[1], m[2]] : [w];
  }

  function tokenize(text) {
    var words = String(text).trim().split(/\s+/).filter(Boolean);
    var flat = [];
    words.forEach(function (w) { splitTrailingPunct(w).forEach(function (p) { flat.push(p); }); });
    var toks = [];
    flat.forEach(function (t) {
      if (t.length > 7 && /^[A-Za-z]+$/.test(t)) {          // long words split into pieces
        for (var i = 0; i < t.length; i += 4) toks.push(t.slice(i, i + 4));
      } else {
        toks.push(t);
      }
    });
    return toks;
  }

  function tokenId(s) {
    var h = 2166136261, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return Math.abs(h) % 100000;
  }

  inits[1] = function () {
    newRun(1);
    var input = $('#tokInput');
    var out = $('#tokOut');

    function render() {
      var toks = tokenize(input.value || 'The Moon is a natural satellite.');
      out.innerHTML = '';
      toks.forEach(function (t, i) {
        var chip = document.createElement('span');
        chip.className = 'tok-chip';
        chip.style.setProperty('--d', Math.min(i * 55, 500) + 'ms');
        var b = document.createElement('b');
        b.textContent = t;
        var n = document.createElement('i');
        n.textContent = tokenId(t).toLocaleString('en-US');
        chip.appendChild(b); chip.appendChild(n);
        out.appendChild(chip);
      });
    }
    input.oninput = render;
    $('#tokBtn').onclick = render;
    input.onkeydown = function (e) { if (e.key === 'Enter') render(); };
    render();
  };

  /* ============================================================
     STEP 3 — guess the next token
     ============================================================ */
  var GUESS_ROUNDS = [
    { cands: [['rock', 40], ['satellite', 30], ['planet', 20], ['place', 10]], guess: 'rock', score: 24 },
    { cands: [['satellite', 55], ['rock', 25], ['planet', 14], ['place', 6]], guess: 'satellite', score: 58 },
    { cands: [['satellite', 88], ['planet', 7], ['rock', 3], ['place', 2]], guess: 'satellite', score: 93 }
  ];

  inits[2] = function () {
    var id = newRun(2);
    var candsEl = $('#guessCands');
    var blank = $('#gblank');
    var statusEl = $('#guessStatus');
    var bar = $('#guessBar');
    var pct = $('#guessPct');

    candsEl.innerHTML = '';
    blank.textContent = '?';
    blank.className = 'gblank';
    setBar(bar, 0, pct);

    (async function play() {
      for (var r = 0; r < GUESS_ROUNDS.length; r++) {
        if (!alive(2, id)) return;
        var R = GUESS_ROUNDS[r];

        statusEl.textContent = 'Round ' + (r + 1) + ' of 3 \u2014 show the sentence with the last token hidden';
        blank.textContent = '?';
        blank.className = 'gblank';
        candsEl.innerHTML = '';
        var rows = R.cands.map(function (c) {
          var d = document.createElement('div');
          d.className = 'cand';
          d.innerHTML = '<span class="cw"></span><span class="cbar"><i></i></span><span class="cp">0%</span>';
          d.querySelector('.cw').textContent = c[0];
          candsEl.appendChild(d);
          return d;
        });
        await sleep(700);
        if (!alive(2, id)) return;

        statusEl.textContent = 'It guesses by giving every possible token a score...';
        rows.forEach(function (d, i) {
          setTimeout(function () {
            if (!alive(2, id)) return;
            d.querySelector('.cbar > i').style.width = R.cands[i][1] + '%';
            d.querySelector('.cp').textContent = R.cands[i][1] + '%';
          }, i * 150);
        });
        await sleep(1000);
        if (!alive(2, id)) return;

        var pickIdx = R.cands.findIndex(function (c) { return c[0] === R.guess; });
        statusEl.textContent = 'Its guess: "' + R.guess + '"';
        rows[pickIdx].classList.add('picked');
        await sleep(750);
        if (!alive(2, id)) return;

        statusEl.textContent = 'The real token in the text was "satellite".';
        if (R.guess === 'satellite') {
          blank.textContent = 'satellite';
          blank.className = 'gblank done';
          rows[pickIdx].classList.add('best');
        } else {
          blank.textContent = 'satellite';
          blank.className = 'gblank done';
          rows[pickIdx].classList.remove('picked');
          rows[pickIdx].classList.add('miss');
          statusEl.textContent = 'Wrong. So it nudges its numbers \u2014 just a little.';
        }
        setBar(bar, R.score, pct);
        await sleep(1500);
        if (!alive(2, id)) return;
      }
      statusEl.textContent =
        'After trillions of rounds, its guesses get very good \u2014 but never perfect, because language is unpredictable.';
      blank.className = 'gblank done';
      setBar(bar, 96, pct);
    })();
  };

  /* ============================================================
     STEP 4 — the base model just continues text
     ============================================================ */
  inits[3] = function () {
    var id = newRun(3);
    var out = $('#baseOut');
    var stamp = $('#baseStamp');
    var caret = document.createElement('span');
    caret.className = 'caret';
    $$('.viz-base .tiny').forEach(function (n) { n.remove(); });
    out.innerHTML = '';
    out.appendChild(caret);
    stamp.style.animation = 'none';
    stamp.style.opacity = '0';

    var text = ' What is the capital of Spain? What is the capital of Italy? ' +
      'What is the capital of Germany? What is the capital of ...';
    var parts = text.split(/(\s+)/);
    var i = 0;

    (async function type() {
      while (i < parts.length) {
        if (!alive(3, id)) return;
        out.insertBefore(document.createTextNode(parts[i]), caret);
        i++;
        if (i % 2 === 1) await sleep(150);
      }
      stamp.style.animation = '';
      stamp.style.opacity = '';
      var note = document.createElement('div');
      note.className = 'tiny';
      note.style.marginTop = '4px';
      note.textContent = 'It saw a pattern of questions and simply kept the pattern going.';
      out.parentNode.appendChild(note);
    })();
  };

  /* ============================================================
     STEP 5 — fine-tuning on examples
     ============================================================ */
  var SFT_EXAMPLES = [
    ['What is the capital of France?', 'The capital of France is Paris.'],
    ['Say hello in Spanish.', 'Hola!'],
    ['Explain gravity in one simple line.', 'Gravity is the force that pulls things toward each other.']
  ];

  inits[4] = function () {
    var id = newRun(4);
    var wrap = $('#sftEx');
    var bar = $('#sftBar');
    var pct = $('#sftPct');
    var box = $('.model-box');
    wrap.innerHTML = '';
    setBar(bar, 0, pct);
    box.style.boxShadow = '';

    (async function play() {
      for (var i = 0; i < SFT_EXAMPLES.length; i++) {
        if (!alive(4, id)) return;
        var card = document.createElement('div');
        card.className = 'ex-card';
        card.innerHTML = '<span class="q"></span><span class="a"></span>';
        card.querySelector('.q').textContent = 'Person asks: ' + SFT_EXAMPLES[i][0];
        card.querySelector('.a').textContent = 'Great answer: ' + SFT_EXAMPLES[i][1];
        wrap.appendChild(card);
        await sleep(700);
        if (!alive(4, id)) return;
        box.style.boxShadow = '0 0 0 1px #2ad4ff, 0 0 40px rgba(42,212,255,.35)';
        setBar(bar, [35, 70, 92][i], pct);
        await sleep(500);
        if (!alive(4, id)) return;
        box.style.boxShadow = '';
        await sleep(700);
      }
      if (!alive(4, id)) return;
      var tail = document.createElement('div');
      tail.className = 'tiny';
      tail.style.marginTop = '12px';
      tail.textContent = 'Repeat with thousands of examples, and it starts answering in that helpful shape every time.';
      wrap.appendChild(tail);
    })();
  };

  /* ============================================================
     STEP 6 — human feedback (RLHF)
     ============================================================ */
  var RLHF_ROUNDS = [
    {
      prompt: 'I am nervous about my test tomorrow.',
      a: 'Just relax. It is not a big deal.',
      b: 'That feeling is really normal. Try studying in short blocks with breaks, then sleep well tonight. You have got this.',
      winner: 'b', score: 25
    },
    {
      prompt: 'Can you explain photosynthesis in one sentence?',
      a: 'Plants use sunlight, water and air to make their own food, and they release oxygen.',
      b: 'So photosynthesis is like a thing plants do with light and stuff and there is chlorophyll in there somewhere I think.',
      winner: 'a', score: 62
    },
    {
      prompt: 'My friend is sad. What should I say?',
      a: 'You should just tell them to get over it and move on with their day.',
      b: 'You could ask what happened, then just listen without trying to fix it right away.',
      winner: 'b', score: 91
    }
  ];

  inits[5] = function () {
    var id = newRun(5);
    var viz = $('#rlhfViz');
    var promptEl = $('#rlhfPrompt');
    var pairEl = $('#rlhfPair');
    var ghost = $('#ghost');
    var bar = $('#rlhfBar');
    var pct = $('#rlhfPct');
    setBar(bar, 0, pct);
    pairEl.innerHTML = '';
    promptEl.innerHTML = '';

    function moveGhost(el, click) {
      var v = viz.getBoundingClientRect(), t = el.getBoundingClientRect();
      ghost.classList.add('on');
      ghost.style.transform = 'translate(' + (t.left - v.left + t.width / 2 - 12) + 'px,' +
        (t.top - v.top + 18) + 'px)';
      if (click) {
        ghost.classList.remove('click');
        void ghost.offsetWidth;
        ghost.classList.add('click');
      }
    }

    (async function play() {
      for (var r = 0; r < RLHF_ROUNDS.length; r++) {
        if (!alive(5, id)) return;
        var R = RLHF_ROUNDS[r];
        promptEl.innerHTML = 'Someone asks: <b></b>';
        promptEl.querySelector('b').textContent = R.prompt;
        pairEl.innerHTML = '';
        var mk = function (label, txt, key) {
          var d = document.createElement('div');
          d.className = 'ans';
          d.innerHTML = '<span class="tag"></span><span class="flag">preferred</span><p></p>';
          d.querySelector('.tag').textContent = 'Answer ' + label;
          d.querySelector('p').textContent = txt;
          d.dataset.key = key;
          pairEl.appendChild(d);
          return d;
        };
        var aEl = mk('A', R.a, 'a');
        var bEl = mk('B', R.b, 'b');
        await sleep(900);
        if (!alive(5, id)) return;

        var winEl = R.winner === 'a' ? aEl : bEl;
        var loseEl = R.winner === 'a' ? bEl : aEl;
        moveGhost(winEl, false);
        await sleep(750);
        if (!alive(5, id)) return;
        moveGhost(winEl, true);
        await sleep(220);
        winEl.classList.add('winner');
        loseEl.classList.add('loser');
        setBar(bar, R.score, pct);
        await sleep(1700);
        if (!alive(5, id)) return;
        ghost.classList.remove('on');
        await sleep(300);
      }
      if (!alive(5, id)) return;
      promptEl.innerHTML = '';
      pairEl.innerHTML = '<p class="cand-empty">Thousands of these choices steer it toward answers that are helpful, honest and safe.</p>';
    })();
  };

  /* ============================================================
     STEP 7 — testing and freezing
     ============================================================ */
  var CHECKS = [
    'Answers everyday questions correctly',
    'Solves maths and coding problems',
    'Follows long, complicated instructions',
    'Refuses dangerous or illegal requests',
    'Does not fall for trick questions',
    'Does not leak private information'
  ];

  inits[6] = function () {
    var id = newRun(6);
    var list = $('#checklist');
    var freeze = $('#freezeBox');
    list.innerHTML = '';
    freeze.classList.remove('in');
    CHECKS.forEach(function (c) {
      var li = document.createElement('li');
      li.innerHTML = '<span class="tick">\u2713</span><span></span>';
      li.querySelector('span:last-child').textContent = c;
      list.appendChild(li);
    });
    var items = $$('li', list);
    items.forEach(function (li, i) {
      setTimeout(function () {
        if (!alive(6, id)) return;
        li.classList.add('in');
      }, 260 * i + 200);
    });
    setTimeout(function () {
      if (!alive(6, id)) return;
      freeze.classList.add('in');
    }, 260 * items.length + 500);
  };

  /* ============================================================
     STEP 8 — inference
     ============================================================ */

  /* --- tiny tokenizer-aware markup: every token has a leading space rule --- */
  function isPunct(s) { return /^[.,!?;:]+$/.test(s); }

  function parseTemplate(tpl) {
    var els = [], buf = '', i = 0;
    while (i < tpl.length) {
      var c = tpl[i];
      if (c === '{') {
        if (buf.trim()) els.push({ type: 'word', text: buf.trim() });
        buf = '';
        var end = tpl.indexOf('}', i);
        var body = tpl.slice(i + 1, end);
        els.push({
          type: 'choice',
          opts: body.split('|').map(function (o) {
            var parts = o.split(':');
            var w = parts.length > 1 ? parseFloat(parts[parts.length - 1]) : 3;
            var text = parts.length > 1 ? parts.slice(0, -1).join(':') : o;
            return { words: text.trim().split(/\s+/), w: isNaN(w) ? 3 : w };
          })
        });
        i = end + 1;
      } else { buf += c; i++; }
    }
    if (buf.trim()) els.push({ type: 'word', text: buf.trim() });
    return els;
  }

  /* Turn sentence "templates" into a real token-level graph.
     Every node holds weighted choices for the NEXT token; nodes with no
     choices are the stop point. This is exactly how a language model works. */
  function compile(templates) {
    var nodes = {}, n = 0;
    function NN() { var id = 'n' + (n++); nodes[id] = []; return id; }
    var start = NN(), cursor = start;

    templates.forEach(function (tpl, ti) {
      parseTemplate(tpl).forEach(function (el, ei) {
        var firstEl = (ti === 0 && ei === 0);

        if (el.type === 'word') {
          var toks = [];
          el.text.split(/\s+/).forEach(function (wd) {
            splitTrailingPunct(wd).forEach(function (s) { toks.push(s); });
          });
          toks.forEach(function (s, si) {
            var prefix = (firstEl && si === 0) || isPunct(s) ? '' : ' ';
            var nxt = NN();
            nodes[cursor].push({ t: prefix + s, w: 1, to: nxt });
            cursor = nxt;
          });
        } else {
          var after = NN();
          el.opts.forEach(function (alt) {
            var toks = [];
            alt.words.forEach(function (wd) {
              splitTrailingPunct(wd).forEach(function (s) { toks.push(s); });
            });
            var prev = cursor;
            toks.forEach(function (s, i) {
              var prefix = (firstEl && i === 0) || isPunct(s) ? '' : ' ';
              var isLast = i === toks.length - 1;
              var nxt = isLast ? after : NN();
              nodes[prev].push({ t: prefix + s, w: alt.w, to: nxt });
              prev = nxt;
            });
          });
          cursor = after;
        }
      });
    });
    return { start: start, nodes: nodes };
  }

  var KNOWLEDGE = {
    moon: compile([
      "{The|Our|Earth's} Moon is {Earth's only natural|a natural} satellite.",
      " It {orbits|goes around} {us|Earth} {about|roughly|nearly} every 27 days.",
      " It is about {one quarter|a quarter} the width of Earth.",
      " It has almost no air, so its sky is always black.",
      " Its gravity is about one sixth of Earth's, so astronauts could jump very high.",
      " The Moon makes no light of its own. It reflects sunlight.",
      " People first walked on it in 1969."
    ]),
    sky: compile([
      "The sky {looks|appears} blue because of the way air scatters sunlight.",
      " Sunlight is really a mix of all the colors.",
      " Tiny air molecules scatter the short blue light far more than the long red light.",
      " That scattered blue light reaches your eyes from every direction.",
      " So the whole sky glows blue instead of black.",
      " At sunset the light travels through much more air.",
      " The blue gets scattered away, which leaves the {reds|oranges} to reach your eyes."
    ]),
    rain: compile([
      "Rain taps soft on the window glass,",
      " and gray clouds drift on by.",
      " Small puddles hold a silver sky,",
      " then the sun comes out to dry.",
      " I like the smell of rain the best,",
      " it makes the whole world new.",
      " So if you hear a gentle drop,",
      " the sky is washing too."
    ]),
    hello: compile([
      "Hi there! It is nice to meet you.",
      " I am a tiny pretend model, but the trick I use is the same trick the big models use.",
      " I look at the text that came before, and I guess which token should come next.",
      " Then I do it again, and again, until I decide to stop."
    ]),
    generic: compile([
      "That is a good question.",
      " I am only a tiny model built for this one demo, so I cannot really answer it.",
      " A real model would use patterns it learned from trillions of tokens of text.",
      " And even then, it would be guessing what sounds likely, not looking up the truth.",
      " That is why a real model can sound completely sure and still be wrong."
    ])
  };

  var KNOWLEDGE_LABEL = {
    moon: 'Moon', sky: 'blue sky', rain: 'rain poem', hello: 'greetings', generic: 'not much'
  };

  function pickKnowledge(prompt) {
    var p = prompt.toLowerCase();
    if (/\bmoon\b/.test(p)) return 'moon';
    if (/\bsky\b|\bblue\b/.test(p)) return 'sky';
    if (/\brain\b|\bpoem\b|\bpoetry\b/.test(p)) return 'rain';
    if (/^(hi|hey|hello|yo|sup)\b/.test(p)) return 'hello';
    return 'generic';
  }

  /* temperature: p(i) ∝ w^(1/T)  — T=0 means "always take the most likely token" */
  function distribution(weights, T) {
    var t = Math.max(T, 0.05);
    var e = weights.map(function (w) { return Math.pow(w, 1 / t); });
    var sum = e.reduce(function (a, b) { return a + b; }, 0);
    return e.map(function (x) { return x / sum; });
  }

  function sampleIndex(ps) {
    var r = Math.random(), acc = 0;
    for (var i = 0; i < ps.length; i++) { acc += ps[i]; if (r <= acc) return i; }
    return ps.length - 1;
  }

  var tempValue = 0.7;
  var chatRunId = 0;
  var tokenTotal = 0;

  function renderProbs(container, opts, ps, picked) {
    container.innerHTML = '';
    var order = opts.map(function (o, i) { return i; });
    var maxP = Math.max.apply(null, ps);
    var topIdx = ps.indexOf(maxP);
    order.forEach(function (i) {
      var row = document.createElement('div');
      row.className = 'cand' + (i === topIdx ? ' best' : '') + (picked === i ? ' picked' : '');
      row.innerHTML = '<span class="cw"></span><span class="cbar"><i></i></span><span class="cp"></span>';
      row.querySelector('.cw').textContent = opts[i].t.replace(/^\s/, '\u2423');
      row.querySelector('.cp').textContent = Math.round(ps[i] * 100) + '%';
      container.appendChild(row);
      setTimeout(function () { row.querySelector('.cbar > i').style.width = (ps[i] * 100) + '%'; }, 20);
    });
  }

  /* --- the "how temperature reshapes the odds" mini-demo --- */
  var TEMP_DEMO = [['sunny', 10], ['windy', 5], ['cloudy', 4], ['purple', 1]];
  var tempBarsEl, tempValEl;

  function renderTempBars() {
    var ps = distribution(TEMP_DEMO.map(function (d) { return d[1]; }), tempValue);
    var top = ps.indexOf(Math.max.apply(null, ps));
    tempBarsEl.innerHTML = '';
    TEMP_DEMO.forEach(function (d, i) {
      var row = document.createElement('div');
      row.className = 'bar-row' + (i === top ? ' top' : '');
      row.innerHTML = '<span></span><span class="bar"><i></i></span><span></span>';
      row.children[0].textContent = d[0];
      row.children[2].textContent = Math.round(ps[i] * 100) + '%';
      tempBarsEl.appendChild(row);
      setTimeout(function () { row.querySelector('.bar > i').style.width = (ps[i] * 100) + '%'; }, 20);
    });
    if (tempValEl) tempValEl.textContent = tempValue.toFixed(2);
  }

  inits[7] = function () {
    newRun(7);
    chatRunId++;                                  // stop any generation in progress
    $('#chatLog').innerHTML = '<div class="msg bot">Pick a question below, or type your own. ' +
      'Watch it build a reply one token at a time.</div>';
    $('#chatSend').disabled = false;
    $('#chatStop').disabled = true;
    $('#chatInput').value = '';
    $('#chatInput').placeholder = 'Ask about the Moon, the sky or rain...';
    $('#liveCands').innerHTML = '<div class="cand-empty">Send a message to watch it choose.</div>';
    tempBarsEl = $('#tempBars');
    tempValEl = $('#tempVal');
    renderTempBars();

    var presets = $('#chatPresets');
    presets.innerHTML = '';
    ['Tell me about the Moon', 'Why is the sky blue?', 'Write a short poem about rain'].forEach(function (p) {
      var b = document.createElement('button');
      b.className = 'chip';
      b.type = 'button';
      b.textContent = p;
      b.onclick = function () { send(p); };
      presets.appendChild(b);
    });
  };

  function send(text) {
    text = String(text || '').trim();
    if (!text) return;
    var log = $('#chatLog');
    var hint = $('.msg.bot', log);
    if (log.children.length === 1 && hint && hint.textContent.indexOf('Pick a question') === 0) log.innerHTML = '';

    var u = document.createElement('div');
    u.className = 'msg user';
    u.textContent = text;
    log.appendChild(u);

    var key = pickKnowledge(text);
    var bot = document.createElement('div');
    bot.className = 'msg bot';
    var span = document.createElement('span');
    var caret = document.createElement('span');
    caret.className = 'caret';
    bot.appendChild(span); bot.appendChild(caret);
    log.appendChild(bot);
    log.scrollTop = log.scrollHeight;

    var graph = KNOWLEDGE[key];
    var nodeId = graph.start;
    var liveCands = $('#liveCands');
    var id = ++chatRunId;
    $('#chatStop').disabled = false;
    $('#chatSend').disabled = true;

    (async function generate() {
      while (nodeId && graph.nodes[nodeId] && graph.nodes[nodeId].length) {
        var opts = graph.nodes[nodeId];
        var weights = opts.map(function (o) { return o.w; });
        var ps = distribution(weights, tempValue);

        if (opts.length > 1) {
          renderProbs(liveCands, opts, ps, null);
          await sleep(260);
          if (id !== chatRunId) return finish(false);
        } else {
          renderProbs(liveCands, opts, ps, null);
        }

        var k = sampleIndex(ps);
        if (opts.length > 1) {
          var rows = $$('.cand', liveCands);
          if (rows[k]) rows[k].classList.add('picked');
          await sleep(200);
          if (id !== chatRunId) return finish(false);
        }

        span.textContent += opts[k].t;
        log.scrollTop = log.scrollHeight;
        tokenTotal++;
        $('#tokCount').textContent = tokenTotal.toLocaleString('en-US');
        nodeId = opts[k].to;
        await sleep(opts.length > 1 ? 190 : 70);
        if (id !== chatRunId) return finish(false);
      }

      caret.remove();
      var done = document.createElement('div');
      done.className = 'tiny';
      done.style.marginTop = '4px';
      done.textContent = 'It stopped because it reached its stop point. It never looked anything up.';
      bot.appendChild(done);
      var k2 = document.createElement('div');
      k2.className = 'tiny';
      k2.style.marginTop = '2px';
      k2.textContent = 'Knowledge card used: ' + KNOWLEDGE_LABEL[key] + '.';
      bot.appendChild(k2);
      log.scrollTop = log.scrollHeight;
      finish(true);
    })();

    function finish(ok) {
      $('#chatStop').disabled = true;
      $('#chatSend').disabled = false;
      if (ok) markTooLate();
    }
  }

  function markTooLate() {
    var liveCands = $('#liveCands');
    if (liveCands) {
      var tail = document.createElement('div');
      tail.className = 'cand-empty';
      tail.style.marginTop = '10px';
      tail.textContent = 'Done. Nothing inside the model changed.';
      liveCands.appendChild(tail);
    }
  }

  /* stop button */
  $('#chatStop').addEventListener('click', function () {
    chatRunId++;
    $('#chatStop').disabled = true;
    $('#chatSend').disabled = false;
    var btns = $$('.msg.bot .caret');
    btns.forEach(function (c) { c.remove(); });
  });

  $('#chatSend').addEventListener('click', function () { send($('#chatInput').value); });
  $('#chatInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') send($('#chatInput').value);
  });
  $('#temp').addEventListener('input', function (e) {
    tempValue = parseFloat(e.target.value);
    renderTempBars();
  });

  /* ============================================================
     WRAP-UP
     ============================================================ */
  inits[8] = function () {
    newRun(8);
    $$('.card').forEach(function (c, i) {
      c.style.animation = 'none';
      void c.offsetWidth;
      c.style.animation = 'rise .5s cubic-bezier(.2,.8,.3,1) both';
      c.style.animationDelay = (i * 120) + 'ms';
    });
  };

  /* ============================================================
     BOOT
     ============================================================ */
  $('#startBtn').addEventListener('click', function () {
    $('#cover').hidden = true;
    $('#app').hidden = false;
    go(0, true);
  });
})();
