/* Shared scenery art for the pseudo-3D racers: roadside props, gates,
   chevron signs and the scrolling backgrounds, all drawn in code. */
(function () {
  'use strict';
  const P = Road3D.paint;
  // ---------- seeded random ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function hexMix(a, b, t) {
    const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
    const A = p(a), B = p(b);
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  const PROP = {};
  function prop(name, ww, hit, img) { PROP[name] = { img, ww, hit }; }
  prop('palm', 0.55, 0.1, P(48, 100, c => {
    c.strokeStyle = '#8a5a2b'; c.lineWidth = 5; c.beginPath(); c.moveTo(22, 100); c.quadraticCurveTo(18, 55, 28, 22); c.stroke();
    c.strokeStyle = '#5e3b18'; c.lineWidth = 1; for (let y = 30; y < 98; y += 6) { c.beginPath(); c.moveTo(18, y); c.lineTo(26, y - 2); c.stroke(); }
    c.fillStyle = '#1f8a3a';
    for (const [a, l] of [[-2.8, 26], [-2.2, 22], [-1.4, 18], [-0.5, 22], [0.2, 25], [-3.4, 20]]) {
      c.beginPath(); c.moveTo(28, 22);
      c.quadraticCurveTo(28 + Math.cos(a) * l * 0.7, 14 + Math.sin(a) * l * 0.6, 28 + Math.cos(a) * l, 24 + Math.sin(a) * l * 0.3 + 10);
      c.quadraticCurveTo(28 + Math.cos(a) * l * 0.5, 20 + Math.sin(a) * l * 0.4, 28, 24); c.fill();
    }
    c.fillStyle = '#5b3a1a'; c.beginPath(); c.arc(27, 25, 3, 0, 7); c.fill();
  }));
  prop('pine', 0.45, 0.12, P(40, 80, c => {
    c.fillStyle = '#4a2e14'; c.fillRect(17, 64, 6, 16);
    for (let k = 0; k < 4; k++) { c.fillStyle = k % 2 ? '#14532b' : '#1b6b37'; c.beginPath(); c.moveTo(20, k * 14); c.lineTo(20 - 8 - k * 4, 30 + k * 12); c.lineTo(20 + 8 + k * 4, 30 + k * 12); c.fill(); }
  }));
  prop('snowpine', 0.45, 0.12, P(40, 80, c => {
    c.fillStyle = '#4a2e14'; c.fillRect(17, 64, 6, 16);
    for (let k = 0; k < 4; k++) { c.fillStyle = '#1b5a3a'; c.beginPath(); c.moveTo(20, k * 14); c.lineTo(20 - 8 - k * 4, 30 + k * 12); c.lineTo(20 + 8 + k * 4, 30 + k * 12); c.fill(); c.fillStyle = '#eef'; c.beginPath(); c.moveTo(20, k * 14); c.lineTo(15 - k, 12 + k * 14); c.lineTo(25 + k, 12 + k * 14); c.fill(); }
  }));
  prop('bush', 0.34, 0.26, P(40, 22, c => {
    for (const [x, y, r, col] of [[10, 14, 9, '#2a7d2e'], [22, 11, 11, '#34963a'], [32, 15, 8, '#2a7d2e'], [20, 16, 7, '#46ad4a']]) { c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); }
  }));
  prop('flowers', 0.34, 0, P(40, 14, c => {
    c.fillStyle = '#2f8a30'; c.fillRect(0, 8, 40, 6);
    for (let i = 0; i < 12; i++) { c.fillStyle = ['#ff3a6e', '#ffd21e', '#ff7a1a', '#fff'][i % 4]; c.fillRect(1 + i * 3.3, 4 + (i % 3) * 2, 3, 3); }
  }));
  prop('rock', 0.42, 0.34, P(44, 30, c => {
    c.fillStyle = '#7a5d48'; c.beginPath(); c.moveTo(2, 30); c.lineTo(8, 10); c.lineTo(20, 2); c.lineTo(34, 6); c.lineTo(42, 30); c.fill();
    c.fillStyle = '#a07e62'; c.beginPath(); c.moveTo(8, 10); c.lineTo(20, 2); c.lineTo(24, 16); c.lineTo(12, 30); c.lineTo(4, 30); c.fill();
  }));
  prop('redrock', 1.2, 0.9, P(80, 60, c => {
    c.fillStyle = '#a3421e'; c.beginPath(); c.moveTo(4, 60); c.lineTo(10, 12); c.lineTo(30, 4); c.lineTo(58, 8); c.lineTo(72, 20); c.lineTo(78, 60); c.fill();
    c.fillStyle = '#c95f2e'; c.fillRect(10, 16, 60, 5); c.fillRect(8, 34, 66, 4); c.fillStyle = '#7a2e12'; c.fillRect(40, 8, 30, 52);
  }));
  prop('cactus', 0.26, 0.12, P(28, 56, c => {
    c.fillStyle = '#2d8a3e'; c.fillRect(11, 4, 7, 52); c.fillRect(3, 20, 5, 16); c.fillRect(3, 32, 10, 5); c.fillRect(21, 12, 5, 18); c.fillRect(16, 26, 10, 5);
    c.fillStyle = '#4fb85c'; c.fillRect(12, 4, 2, 52);
  }));
  prop('windmill', 0.8, 0.3, P(56, 104, c => {
    c.fillStyle = '#e9e2d0'; c.beginPath(); c.moveTo(18, 104); c.lineTo(22, 34); c.lineTo(34, 34); c.lineTo(38, 104); c.fill();
    c.fillStyle = '#9b3b28'; c.beginPath(); c.moveTo(19, 36); c.lineTo(28, 24); c.lineTo(37, 36); c.fill();
    c.fillStyle = '#5a3a22'; c.fillRect(25, 84, 7, 20);
    c.strokeStyle = '#6b4a2e'; c.lineWidth = 3;
    for (let k = 0; k < 4; k++) { const a = 0.4 + k * Math.PI / 2; c.beginPath(); c.moveTo(28, 32); c.lineTo(28 + Math.cos(a) * 26, 32 + Math.sin(a) * 26); c.stroke(); }
    c.fillStyle = '#fff8'; for (let k = 0; k < 4; k++) { const a = 0.4 + k * Math.PI / 2; c.save(); c.translate(28, 32); c.rotate(a); c.fillRect(6, 1, 19, 6); c.restore(); }
  }));
  function building(tint, lit) {
    return P(60, 120, c => {
      c.fillStyle = tint; c.fillRect(0, 0, 60, 120);
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(44, 0, 16, 120);
      for (let y = 6; y < 112; y += 10) for (let x = 5; x < 56; x += 9) { c.fillStyle = lit && ((x * 7 + y * 3) % 5 < 3) ? '#ffe27a' : (lit ? '#1a1830' : '#2d4a66'); c.fillRect(x, y, 5, 6); }
    });
  }
  prop('building', 1.0, 0.95, building('#9aa7b5', false));
  prop('tower', 1.0, 0.95, building('#c9b89a', false));
  prop('nightbldg', 1.0, 0.95, building('#2a2540', true));
  prop('lamp', 0.14, 0.05, P(20, 96, c => { c.fillStyle = '#555'; c.fillRect(9, 8, 3, 88); c.fillRect(2, 6, 16, 3); c.fillStyle = '#ffe9a0'; c.fillRect(1, 9, 6, 3); }));
  prop('neonlamp', 0.14, 0.05, P(20, 96, c => { c.fillStyle = '#333'; c.fillRect(9, 8, 3, 88); c.fillRect(2, 6, 16, 3); c.fillStyle = '#ff5cf0'; c.fillRect(1, 9, 6, 3); c.fillStyle = 'rgba(255,92,240,.25)'; c.beginPath(); c.arc(4, 12, 6, 0, 7); c.fill(); }));
  prop('billboard', 0.75, 0.6, P(80, 64, c => {
    c.fillStyle = '#444'; c.fillRect(14, 36, 5, 28); c.fillRect(60, 36, 5, 28);
    c.fillStyle = '#fff'; c.fillRect(2, 2, 76, 36); c.fillStyle = '#ff4d8d'; c.fillRect(4, 4, 72, 32);
    const g = c.createLinearGradient(0, 4, 0, 36); g.addColorStop(0, '#ffcf3a'); g.addColorStop(1, '#ff4d8d'); c.fillStyle = g; c.fillRect(4, 4, 72, 32);
    c.fillStyle = '#ffef9a'; c.beginPath(); c.arc(40, 30, 13, Math.PI, 0); c.fill();
    c.fillStyle = '#6a1b8a'; for (let y = 22; y < 36; y += 4) c.fillRect(24, y, 32, 2);
  }));
  prop('column', 0.22, 0.14, P(22, 76, c => {
    c.fillStyle = '#e8dfc8'; c.fillRect(4, 8, 14, 64); c.fillRect(1, 2, 20, 6); c.fillRect(1, 70, 20, 6);
    c.fillStyle = '#b8ad92'; for (let x = 6; x < 18; x += 4) c.fillRect(x, 8, 1, 62);
  }));
  prop('sea', 3, 0, P(64, 8, c => { c.fillStyle = '#1b7fd1'; c.fillRect(0, 0, 64, 8); c.fillStyle = '#dff'; for (let x = 0; x < 64; x += 8) c.fillRect(x, 1, 5, 1); }));
  const CHEV = P(40, 30, c => {
    c.fillStyle = '#555'; c.fillRect(8, 20, 3, 10); c.fillRect(29, 20, 3, 10);
    c.fillStyle = '#ffd400'; c.fillRect(0, 0, 40, 20); c.fillStyle = '#111';
    for (let k = 0; k < 3; k++) { c.beginPath(); c.moveTo(8 + k * 10, 10); c.lineTo(15 + k * 10, 3); c.lineTo(18 + k * 10, 3); c.lineTo(11 + k * 10, 10); c.lineTo(18 + k * 10, 17); c.lineTo(15 + k * 10, 17); c.fill(); }
  });
  function gate(text, col) {
    return P(260, 70, c => {
      c.fillStyle = '#ddd'; c.fillRect(0, 0, 10, 70); c.fillRect(250, 0, 10, 70);
      c.fillStyle = col; c.fillRect(0, 2, 260, 22);
      c.fillStyle = '#fff'; c.font = '14px "Press Start 2P", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, 130, 14);
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(0, 24, 260, 3);
    });
  }
  const GATES = {};
  function gates() {
    GATES.start = gate('START', '#1f66e0'); GATES.check = gate('CHECKPOINT', '#e0301f'); GATES.goal = gate('GOAL', '#e0a81f');
    GATES.fork = P(60, 50, c => {
      c.fillStyle = '#555'; c.fillRect(28, 30, 4, 20);
      c.fillStyle = '#1a6a2a'; c.fillRect(0, 0, 60, 32); c.fillStyle = '#fff'; c.fillRect(2, 2, 56, 28); c.fillStyle = '#1a6a2a'; c.fillRect(4, 4, 52, 24);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(30, 24); c.lineTo(30, 16); c.lineTo(14, 8); c.lineTo(18, 6); c.lineTo(8, 6); c.lineTo(10, 14); c.lineTo(12, 10); c.lineTo(28, 18); c.fill();
      c.beginPath(); c.moveTo(30, 16); c.lineTo(46, 8); c.lineTo(42, 6); c.lineTo(52, 6); c.lineTo(50, 14); c.lineTo(48, 10); c.lineTo(32, 18); c.lineTo(32, 24); c.fill();
    });
  }

  // background layers per theme
  const BG = {};
  function bgFor(th) {
    if (BG[th.name]) return BG[th.name];
    const r = rng(th.name.length * 97 + th.name.charCodeAt(0));
    const far = P(640, 64, c => {
      c.fillStyle = th.farCol;
      if (th.far === 'sea') { c.fillRect(0, 50, 640, 14); c.fillStyle = hexMix(th.farCol, '#ffffff', 0.5); for (let x = 0; x < 640; x += 12) c.fillRect(x + r() * 6, 52 + r() * 10, 6, 1); c.fillStyle = hexMix(th.farCol, '#000000', 0.2); for (let k = 0; k < 4; k++) { const x = r() * 600; c.beginPath(); c.ellipse(x, 50, 30 + r() * 40, 6 + r() * 8, 0, Math.PI, 0); c.fill(); } }
      else if (th.far === 'city') { for (let x = 0; x < 640;) { const w = 10 + r() * 22, h = 14 + r() * 46; c.fillStyle = th.farCol; c.fillRect(x, 64 - h, w, h); if (th.sky[0] < '#30') { c.fillStyle = '#ffe27a'; for (let k = 0; k < h / 5; k++) if (r() < 0.5) c.fillRect(x + 2 + r() * (w - 4), 64 - h + 2 + r() * (h - 4), 1, 1); } x += w + 1; } }
      else if (th.far === 'mesa') { c.beginPath(); c.moveTo(0, 64); let y = 40; for (let x = 0; x <= 640; x += 8) { if (r() < 0.12) y = 18 + r() * 34; c.lineTo(x, y); } c.lineTo(640, 64); c.fill(); }
      else if (th.far === 'dunes') { c.beginPath(); c.moveTo(0, 64); for (let x = 0; x <= 640; x += 4) c.lineTo(x, 46 + Math.sin(x / 50) * 6 + Math.sin(x / 17) * 2); c.lineTo(640, 64); c.fill(); }
      else { // peaks / hills
        const sharp = th.far === 'peaks';
        c.beginPath(); c.moveTo(0, 64);
        const pts = [];
        for (let x = 0; x <= 640; x += sharp ? 40 : 64) pts.push([x, sharp ? 6 + r() * 36 : 30 + r() * 20]);
        pts[pts.length - 1][1] = pts[0][1];
        for (const [x, y] of pts) sharp ? c.lineTo(x, y) : c.quadraticCurveTo(x - 32, y - 6, x, y);
        c.lineTo(640, 64); c.fill();
        if (sharp && th.farCol !== '#4a1a10') { c.fillStyle = 'rgba(255,255,255,.7)'; for (const [x, y] of pts) { if (y > 26) continue; c.beginPath(); c.moveTo(x, y); c.lineTo(x - 7, y + 8); c.lineTo(x + 7, y + 8); c.fill(); } }
      }
    });
    const near = P(640, 30, c => {
      c.fillStyle = th.nearCol; c.beginPath(); c.moveTo(0, 30);
      for (let x = 0; x <= 640; x += 16) c.lineTo(x, 12 + r() * 12);
      c.lineTo(640, 30); c.fill();
    });
    return (BG[th.name] = { far, near });
  }

  window.RoadArt = { rng, hexMix, PROP, CHEV, GATES, gates, gate, bgFor };
})();
