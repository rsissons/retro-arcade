/* Retro Arcade shared engine.
   Each game calls Arcade.start({...}) with newGame/update/draw hooks.
   The engine owns the screen, the fixed 60 Hz loop, input (keyboard + touch),
   synth sound, high scores and the title / pause / game-over screens. */
(function () {
  'use strict';

  const FONT = '"Press Start 2P", monospace';
  const STEP = 1 / 60;

  const DEFAULT_KEYS = {
    left: ['ArrowLeft', 'KeyA'],
    right: ['ArrowRight', 'KeyD'],
    up: ['ArrowUp', 'KeyW'],
    down: ['ArrowDown', 'KeyS'],
    fire: ['Space', 'KeyZ', 'KeyJ'],
    b: ['KeyX', 'KeyK', 'ShiftLeft', 'ShiftRight'],
    c: ['KeyC', 'KeyL'],
    start: ['Enter', 'Space'],
    pause: ['KeyP', 'Escape'],
    mute: ['KeyM'],
  };

  // ---------- sound ----------
  const Sfx = {
    ctx: null,
    master: null,
    muted: false,
    init() {
      if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.5;
      this.master.connect(this.ctx.destination);
    },
    setMuted(m) {
      this.muted = m;
      try { localStorage.setItem('arcade.muted', m ? '1' : '0'); } catch (e) { /* storage blocked */ }
      if (this.master) this.master.gain.value = m ? 0 : 0.5;
    },
    // tone({f, f2, d, type, v, delay})
    tone(o) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + (o.delay || 0);
      const d = o.d || 0.1;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = o.type || 'square';
      osc.frequency.setValueAtTime(o.f || 440, t);
      if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.f2), t + d);
      const v = o.v == null ? 0.15 : o.v;
      g.gain.setValueAtTime(v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      osc.connect(g); g.connect(this.master);
      osc.start(t); osc.stop(t + d + 0.02);
    },
    // noise({d, v, f, f2, delay}) - filtered white noise burst
    noise(o) {
      if (!this.ctx || this.muted) return;
      const t = this.ctx.currentTime + (o.delay || 0);
      const d = o.d || 0.2;
      const len = Math.max(1, Math.floor(this.ctx.sampleRate * d));
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      const filt = this.ctx.createBiquadFilter();
      filt.type = 'lowpass';
      filt.frequency.setValueAtTime(o.f || 2000, t);
      if (o.f2) filt.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + d);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(o.v == null ? 0.3 : o.v, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      src.connect(filt); filt.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + d + 0.02);
    },
    // play a list of [freq, duration] notes back to back
    tune(notes, o) {
      o = o || {};
      let at = o.delay || 0;
      for (const [f, d] of notes) {
        if (f) this.tone({ f, d: d * 0.9, type: o.type || 'square', v: o.v || 0.1, delay: at });
        at += d;
      }
      return at;
    },
  };
  try { Sfx.muted = localStorage.getItem('arcade.muted') === '1'; } catch (e) { /* storage blocked */ }

  // ---------- sprites ----------
  // rows: array of strings, each char a palette key ('.' or ' ' = transparent)
  function sprite(rows, palette, scale) {
    scale = scale || 1;
    const h = rows.length, w = Math.max(...rows.map(r => r.length));
    const c = document.createElement('canvas');
    c.width = w * scale; c.height = h * scale;
    const x = c.getContext('2d');
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < rows[j].length; i++) {
        const col = palette[rows[j][i]];
        if (!col) continue;
        x.fillStyle = col;
        x.fillRect(i * scale, j * scale, scale, scale);
      }
    }
    return c;
  }
  function flipX(img) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const x = c.getContext('2d');
    x.translate(img.width, 0); x.scale(-1, 1); x.drawImage(img, 0, 0);
    return c;
  }

  // ---------- high scores ----------
  function loadHi(id) {
    try { return parseInt(localStorage.getItem('arcade.hi.' + id) || '0', 10) || 0; } catch (e) { return 0; }
  }
  function saveHi(id, v) {
    try { localStorage.setItem('arcade.hi.' + id, String(v)); } catch (e) { /* storage blocked */ }
  }

  // ---------- engine ----------
  function start(cfg) {
    const W = cfg.width, H = cfg.height;
    const keymap = Object.assign({}, DEFAULT_KEYS, cfg.keys || {});
    document.title = cfg.title + ' | Retro Arcade';

    const wrap = document.createElement('div');
    wrap.className = 'arc-wrap';
    const screen = document.createElement('div');
    screen.className = 'arc-screen';
    const canvas = document.createElement('canvas');
    canvas.className = 'arc-canvas';
    screen.appendChild(canvas);
    const scan = document.createElement('div');
    scan.className = 'arc-scan';
    screen.appendChild(scan);
    wrap.appendChild(screen);
    document.body.appendChild(wrap);

    const bar = document.createElement('div');
    bar.className = 'arc-bar';
    bar.innerHTML =
      '<a class="arc-btn" href="../../index.html" aria-label="Back to the arcade">&#9664; ARCADE</a>' +
      '<span class="arc-name"></span>' +
      '<button class="arc-btn" data-act="pause" aria-label="Pause">II</button>' +
      '<button class="arc-btn" data-act="mute" aria-label="Sound on or off"></button>';
    bar.querySelector('.arc-name').textContent = cfg.title;
    document.body.appendChild(bar);
    const muteBtn = bar.querySelector('[data-act=mute]');
    const setMuteLabel = () => { muteBtn.textContent = Sfx.muted ? 'SND OFF' : 'SND ON'; };
    setMuteLabel();

    const ctx = canvas.getContext('2d');
    let scale = 1;

    function resize() {
      const touchH = touchPad ? touchPad.offsetHeight : 0;   // fixed-position, so offsetParent is always null
      const availW = window.innerWidth - 16;
      const availH = window.innerHeight - bar.offsetHeight - touchH - 16;
      scale = Math.max(0.1, Math.min(availW / W, availH / H));
      const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
      screen.style.width = cssW + 'px';
      screen.style.height = cssH + 'px';
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      ctx.setTransform(canvas.width / W, 0, 0, canvas.height / H, 0, 0);
      ctx.imageSmoothingEnabled = false;
    }

    // ----- input -----
    const held = new Set();      // action names currently held
    const hit = new Set();       // actions pressed since last update
    const codeToActs = {};
    for (const act in keymap) for (const code of keymap[act]) (codeToActs[code] = codeToActs[code] || []).push(act);

    function press(act) { if (!held.has(act)) hit.add(act); held.add(act); }
    function release(act) { held.delete(act); }

    window.addEventListener('keydown', e => {
      if (cfg.onKey && state === 'play' && cfg.onKey(e, api) === true) { e.preventDefault(); return; }
      const acts = codeToActs[e.code];
      if (!acts) return;
      e.preventDefault();
      Sfx.init();
      if (!e.repeat) acts.forEach(press);
    });
    window.addEventListener('keyup', e => {
      const acts = codeToActs[e.code];
      if (acts) acts.forEach(release);
    });
    window.addEventListener('blur', () => { held.clear(); if (state === 'play') state = 'paused'; });
    document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') state = 'paused'; });

    // touch controls
    let touchPad = null;
    const isTouch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    const tcfg = cfg.touch || { dpad: '4', buttons: [{ act: 'fire', label: 'FIRE' }] };
    if (isTouch && cfg.touch !== false) {
      touchPad = document.createElement('div');
      touchPad.className = 'arc-touch';
      const pad = document.createElement('div');
      pad.className = 'arc-pad arc-pad-' + tcfg.dpad;
      const dirs = tcfg.dpad === 'lr' ? ['left', 'right'] : tcfg.dpad === 'none' ? [] : ['up', 'left', 'right', 'down'];
      const glyph = { up: '&#9650;', down: '&#9660;', left: '&#9664;', right: '&#9654;' };
      for (const d of dirs) {
        const b = document.createElement('div');
        b.className = 'arc-tbtn arc-d-' + d;
        b.innerHTML = glyph[d];
        b.dataset.act = d;
        pad.appendChild(b);
      }
      const btns = document.createElement('div');
      btns.className = 'arc-btns';
      for (const bd of tcfg.buttons || []) {
        const b = document.createElement('div');
        b.className = 'arc-tbtn arc-round';
        b.textContent = bd.label;
        b.dataset.act = bd.act;
        btns.appendChild(b);
      }
      touchPad.appendChild(pad);
      touchPad.appendChild(btns);
      document.body.appendChild(touchPad);
      document.body.classList.add('has-touch');

      // Track each pointer and which button it is over, so sliding a thumb
      // across the d-pad changes direction without lifting.
      const ptrs = new Map();
      const recompute = () => {
        const acts = new Set();
        for (const a of ptrs.values()) if (a) acts.add(a);
        for (const a of ['up', 'down', 'left', 'right', ...(tcfg.buttons || []).map(b => b.act)]) {
          if (acts.has(a)) press(a); else if (!keyboardHolds(a)) release(a);
        }
      };
      const actAt = (x, y) => {
        const el = document.elementFromPoint(x, y);
        return el && el.dataset && el.dataset.act && el.closest('.arc-touch') ? el.dataset.act : null;
      };
      touchPad.addEventListener('pointerdown', e => {
        e.preventDefault(); Sfx.init();
        if (state !== 'play') { startOrResume(); return; }
        ptrs.set(e.pointerId, actAt(e.clientX, e.clientY)); recompute();
      });
      touchPad.addEventListener('pointermove', e => {
        if (!ptrs.has(e.pointerId)) return;
        e.preventDefault();
        ptrs.set(e.pointerId, actAt(e.clientX, e.clientY)); recompute();
      });
      const end = e => { if (ptrs.delete(e.pointerId)) recompute(); };
      touchPad.addEventListener('pointerup', end);
      touchPad.addEventListener('pointercancel', end);
      touchPad.addEventListener('contextmenu', e => e.preventDefault());
    }
    function keyboardHolds() { return false; }

    const toGame = e => {
      const r = canvas.getBoundingClientRect();
      return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
    };
    screen.addEventListener('pointermove', e => {
      if (cfg.onPointerMove && state === 'play') cfg.onPointerMove(...toGame(e), api, e);
    });

    screen.addEventListener('pointerdown', e => {
      Sfx.init();
      if (cfg.onPointer && state === 'play') { e.preventDefault(); cfg.onPointer(...toGame(e), api, e); return; }
      if (state !== 'play') startOrResume();
    });

    bar.addEventListener('click', e => {
      const act = e.target.dataset && e.target.dataset.act;
      if (act === 'mute') { Sfx.init(); Sfx.setMuted(!Sfx.muted); setMuteLabel(); }
      if (act === 'pause') { if (state === 'play') state = 'paused'; else if (state === 'paused') state = 'play'; }
      e.target.blur && e.target.blur();
    });

    // ----- game state -----
    let state = 'title';     // title | play | paused | over
    let overTimer = 0;
    let titleT = 0;
    const api = {
      W, H, ctx, sfx: Sfx, FONT,
      score: 0,
      hi: loadHi(cfg.id),
      down: a => held.has(a),
      pressed: a => hit.has(a),
      addScore(n) {
        api.score += n;
        if (api.score > api.hi) { api.hi = api.score; saveHi(cfg.id, api.hi); }
      },
      gameOver() { state = 'over'; overTimer = 0; cfg.onGameOver && cfg.onGameOver(api); },
      get state() { return state; },
      text(str, x, y, size, color, align) {
        ctx.font = (size || 8) + 'px ' + FONT;
        ctx.fillStyle = color || '#fff';
        ctx.textAlign = align || 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(str, x, y);
      },
      sprite, flipX,
      rand: (a, b) => a + Math.random() * (b - a),
      randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
      pick: arr => arr[Math.floor(Math.random() * arr.length)],
    };

    function startOrResume() {
      if (state === 'paused') { state = 'play'; return; }
      if (state === 'over' && overTimer < 1) return;
      if (state === 'title' || state === 'over') {
        api.score = 0;
        held.clear(); hit.clear();
        cfg.newGame(api);
        state = 'play';
      }
    }

    function overlay(lines, footer) {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      const s = Math.max(6, Math.round(Math.min(W, H) / 40));
      let y = H * 0.25;
      for (const l of lines) {
        api.text(l.t, W / 2, y, l.size ? s * l.size : s, l.c || '#fff', 'center');
        y += (l.size ? s * l.size : s) * 1.8;
      }
      if (footer && Math.floor(titleT * 2) % 2 === 0) api.text(footer, W / 2, H * 0.82, s, '#ff0', 'center');
    }

    let acc = 0, last = performance.now();
    function frame(now) {
      let dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0)) dt = 0.001;
      if (dt > 0.25) dt = 0.25;
      titleT += dt;

      if (hit.has('mute')) { Sfx.setMuted(!Sfx.muted); setMuteLabel(); }
      if (state === 'play' && hit.has('pause')) { state = 'paused'; hit.clear(); }
      else if (state === 'paused' && (hit.has('pause') || hit.has('start'))) { state = 'play'; hit.clear(); }
      else if ((state === 'title' || state === 'over') && hit.has('start')) startOrResume();

      if (state === 'play') {
        acc += dt;
        let steps = 0;
        while (acc >= STEP && steps < 5) {
          cfg.update(api, STEP);
          hit.clear();
          acc -= STEP; steps++;
          if (state !== 'play') break;
        }
        if (steps === 5) acc = 0;
      } else {
        acc = 0;
        if (state === 'over') overTimer += dt;
        if (cfg.attract && state === 'title') cfg.attract(api, dt);
      }
      hit.delete('mute'); hit.delete('pause'); hit.delete('start');

      ctx.save();
      ctx.fillStyle = cfg.bg || '#000';
      ctx.fillRect(0, 0, W, H);
      if (state === 'title' && cfg.drawAttract) cfg.drawAttract(api);
      else if (state !== 'title') cfg.draw(api);
      ctx.restore();

      const startWord = isTouch ? 'TAP TO START' : 'PRESS ENTER';
      if (state === 'title') {
        const lines = [{ t: cfg.title, size: 2.2, c: cfg.color || '#0ff' }];
        if (cfg.subtitle) lines.push({ t: cfg.subtitle, c: '#aaa' });
        lines.push({ t: '' });
        for (const l of cfg.help || []) lines.push({ t: l, c: '#ddd' });
        lines.push({ t: '' });
        lines.push({ t: 'HI SCORE ' + api.hi, c: '#f80' });
        overlay(lines, startWord);
      } else if (state === 'paused') {
        overlay([{ t: 'PAUSED', size: 2, c: '#ff0' }], isTouch ? 'TAP TO RESUME' : 'P TO RESUME');
      } else if (state === 'over') {
        overlay([
          { t: 'GAME OVER', size: 2.2, c: '#f33' },
          { t: '' },
          { t: 'SCORE ' + api.score },
          { t: 'HI SCORE ' + api.hi, c: '#f80' },
        ], overTimer > 1 ? startWord : null);
      }
      requestAnimationFrame(frame);
    }

    window.__arcade = api;   // test hook
    api._start = startOrResume;
    api._press = press; api._release = release;

    const go = () => {
      resize();
      window.addEventListener('resize', resize);
      if (cfg.init) cfg.init(api);
      requestAnimationFrame(t => { last = t; requestAnimationFrame(frame); });
    };
    if (document.fonts && document.fonts.load) {
      Promise.race([document.fonts.load('8px "Press Start 2P"'), new Promise(r => setTimeout(r, 1500))]).then(go, go);
    } else go();
    return api;
  }

  window.Arcade = { start, Sfx, sprite, flipX, FONT };
})();
