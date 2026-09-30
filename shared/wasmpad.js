/* Retro Arcade wrapper for the real, compiled game engines (Chocolate Doom
   family in WebAssembly). Loads the engine and its data file with a
   progress bar, waits for a tap (which also unlocks sound on iPad), then
   starts it. On touch screens it adds on-screen controls that send the
   engine the same key presses a keyboard would.
     WasmPad.start({ title, engine: 'path/doom', data: [{ url, name }], args: [...],
                     files: { 'default.cfg': '...' }, buttons: [...] }) */
(function () {
  'use strict';
  const KEYS = {
    up: ['ArrowUp', 38], down: ['ArrowDown', 40], left: ['ArrowLeft', 37], right: ['ArrowRight', 39],
    fire: ['Control', 17, 'ControlLeft'], use: [' ', 32, 'Space'], strafe: ['Alt', 18, 'AltLeft'], run: ['Shift', 16, 'ShiftLeft'],
    enter: ['Enter', 13], esc: ['Escape', 27], map: ['Tab', 9], yes: ['y', 89, 'KeyY'],
    next: ['e', 69, 'KeyE'], prev: ['q', 81, 'KeyQ'], inv: ['Enter', 13], invl: ['[', 219, 'BracketLeft'], invr: [']', 221, 'BracketRight'],
    fly: ['PageUp', 33], flyd: ['PageDown', 34],
  };
  function send(type, name) {
    const k = KEYS[name]; if (!k) return;
    const ev = new KeyboardEvent(type, { key: k[0], code: k[2] || k[0], keyCode: k[1], which: k[1], bubbles: true, cancelable: true });
    try { Object.defineProperty(ev, 'keyCode', { get: () => k[1] }); Object.defineProperty(ev, 'which', { get: () => k[1] }); } catch (e) { /* read-only in some engines */ }
    window.dispatchEvent(ev);
  }

  function start(cfg) {
    document.title = cfg.title + ' | Retro Arcade';
    const bar = document.createElement('div');
    bar.className = 'arc-bar';
    bar.innerHTML = '<a class="arc-btn" href="../../index.html">&#9664; ARCADE</a><span class="arc-name"></span><button class="arc-btn" data-k="esc">MENU</button>';
    bar.querySelector('.arc-name').textContent = cfg.title;
    document.body.appendChild(bar);
    const wrap = document.createElement('div'); wrap.className = 'arc-wrap';
    const screen = document.createElement('div'); screen.className = 'arc-screen'; screen.style.aspectRatio = '4 / 3';
    const canvas = document.createElement('canvas'); canvas.id = 'canvas'; canvas.className = 'arc-canvas'; canvas.tabIndex = -1;
    canvas.oncontextmenu = e => e.preventDefault();
    screen.appendChild(canvas);
    const over = document.createElement('div');
    over.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;background:#000;color:#fff;font:12px "Press Start 2P",monospace;text-align:center;padding:16px;';
    over.innerHTML = '<div style="font-size:20px;color:' + (cfg.color || '#f33') + '"></div><div class="sub" style="color:#aaa;line-height:1.6"></div><div class="prog" style="width:70%;height:10px;border:2px solid #555"><div style="height:100%;width:0;background:' + (cfg.color || '#f33') + '"></div></div><div class="msg" style="color:#ff0">LOADING...</div>';
    over.firstChild.textContent = cfg.title;
    over.querySelector('.sub').innerHTML = cfg.subtitle || '';
    screen.appendChild(over);
    wrap.appendChild(screen); document.body.appendChild(wrap);
    bar.addEventListener('click', e => { const k = e.target.dataset && e.target.dataset.k; if (k) { send('keydown', k); setTimeout(() => send('keyup', k), 80); } });

    const touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    let pad = null;
    if (touch) {
      pad = document.createElement('div'); pad.className = 'arc-touch';
      const dp = document.createElement('div'); dp.className = 'arc-pad arc-pad-4';
      for (const d of ['up', 'left', 'right', 'down']) { const b = document.createElement('div'); b.className = 'arc-tbtn arc-d-' + d; b.dataset.k = d; b.innerHTML = { up: '&#9650;', down: '&#9660;', left: '&#9664;', right: '&#9654;' }[d]; dp.appendChild(b); }
      const bt = document.createElement('div'); bt.className = 'arc-btns'; bt.style.flexWrap = 'wrap'; bt.style.maxWidth = '230px'; bt.style.justifyContent = 'flex-end'; bt.style.gap = '8px';
      for (const b of cfg.buttons || [['strafe', 'STRAFE'], ['use', 'USE'], ['fire', 'FIRE'], ['next', 'WPN'], ['map', 'MAP'], ['enter', 'OK']]) { const e = document.createElement('div'); e.className = 'arc-tbtn arc-round'; e.style.width = e.style.height = '54px'; e.dataset.k = b[0]; e.textContent = b[1]; bt.appendChild(e); }
      pad.appendChild(dp); pad.appendChild(bt); document.body.appendChild(pad); document.body.classList.add('has-touch');
      const held = new Map();
      const at = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.dataset && el.dataset.k && el.closest('.arc-touch') ? el.dataset.k : null; };
      const sync = () => { const want = new Set(held.values()); for (const k of Object.keys(KEYS)) { const on = want.has(k), was = sync.s.has(k); if (on && !was) send('keydown', k); if (!on && was) send('keyup', k); } sync.s = want; };
      sync.s = new Set();
      pad.addEventListener('pointerdown', e => { e.preventDefault(); held.set(e.pointerId, at(e.clientX, e.clientY)); sync(); });
      pad.addEventListener('pointermove', e => { if (!held.has(e.pointerId)) return; e.preventDefault(); held.set(e.pointerId, at(e.clientX, e.clientY)); sync(); });
      const end = e => { if (held.delete(e.pointerId)) sync(); };
      pad.addEventListener('pointerup', end); pad.addEventListener('pointercancel', end);
    }
    function fit() {
      const th = pad ? pad.offsetHeight : 0;
      const aw = window.innerWidth - 16, ah = window.innerHeight - bar.offsetHeight - th - 16;
      const w = Math.min(aw, ah * 4 / 3);
      screen.style.width = Math.floor(w) + 'px'; screen.style.height = Math.floor(w * 3 / 4) + 'px';
      canvas.style.width = '100%'; canvas.style.height = '100%';
    }
    fit(); window.addEventListener('resize', fit);

    // download the data files with progress, then the engine
    const fill = over.querySelector('.prog div'), msg = over.querySelector('.msg');
    const blobs = {};
    let total = 0, got = 0;
    async function grab(d) {
      const r = await fetch(d.url);
      if (!r.ok) throw new Error(d.url + ' ' + r.status);
      const len = +r.headers.get('content-length') || d.size || 0;
      total += len;
      const rd = r.body.getReader(); const parts = [];
      for (;;) { const { done, value } = await rd.read(); if (done) break; parts.push(value); got += value.length; fill.style.width = Math.min(100, got / Math.max(total, 1) * 100) + '%'; }
      const buf = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { buf.set(p, o); o += p.length; }
      blobs[d.name] = buf;
    }
    Promise.all(cfg.data.map(grab)).then(() => {
      msg.textContent = touch ? 'TAP TO START' : 'CLICK OR PRESS A KEY TO START';
      const go = () => {
        window.removeEventListener('keydown', go, true); over.removeEventListener('pointerdown', go);
        msg.textContent = 'STARTING...';
        window.Module = {
          canvas, noInitialRun: true,
          locateFile: p => cfg.engine.replace(/[^/]*$/, '') + p,
          preRun: [() => {
            for (const n in blobs) window.Module.FS.writeFile('/' + n, blobs[n]);
            for (const n in cfg.files || {}) window.Module.FS.writeFile('/' + n, cfg.files[n]);
          }],
          onRuntimeInitialized: () => { over.style.display = 'none'; canvas.focus(); window.Module.callMain(cfg.args); },
          print: t => console.log(t), printErr: t => console.warn(t),
        };
        const s = document.createElement('script'); s.src = cfg.engine + '.js'; document.body.appendChild(s);
      };
      window.addEventListener('keydown', go, true); over.addEventListener('pointerdown', go);
    }).catch(e => { msg.textContent = 'COULD NOT LOAD: ' + e.message; msg.style.color = '#f55'; });
    window.__wasmpad = { send };
  }
  window.WasmPad = { start, send };
})();
