/* Retro Arcade pseudo-3D road engine (the 80s sprite-scaler technique).
   The road is a list of short segments. Each has a curve value (bends are
   faked by shifting later segments sideways on screen), a height (hills) and
   a lateral centre `cx` in road widths. A second road `bx` can run beside it
   for forks. Sprites and cars are drawn back to front with the road, so
   hills hide whatever is behind them.
   Lateral positions are in road widths: 0 is the centre line of the road
   the track started on, +-1 its edges. */
(function () {
  'use strict';

  const ease = {
    in: (a, b, p) => a + (b - a) * p * p,
    out: (a, b, p) => a + (b - a) * (1 - (1 - p) * (1 - p)),
    inOut: (a, b, p) => a + (b - a) * (-Math.cos(p * Math.PI) / 2 + 0.5),
  };
  const lerp = (a, b, p) => a + (b - a) * p;

  // colour helpers (hex -> rgb once, then cached mixes)
  const rgbCache = {};
  function rgb(h) {
    let c = rgbCache[h];
    if (c) return c;
    let s = h.replace('#', '');
    if (s.length === 3) s = s.split('').map(x => x + x).join('');
    c = rgbCache[h] = [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
    return c;
  }
  function mix(a, b, t) {
    if (t <= 0.01) return a;
    const A = rgb(a), B = rgb(b);
    return 'rgb(' + Math.round(A[0] + (B[0] - A[0]) * t) + ',' + Math.round(A[1] + (B[1] - A[1]) * t) + ',' + Math.round(A[2] + (B[2] - A[2]) * t) + ')';
  }

  // Paint a small canvas with a drawing function (for sprites made in code).
  function paint(w, h, fn) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const x = c.getContext('2d');
    fn(x, w, h);
    return c;
  }

  function create(o) {
    o = o || {};
    const R = {
      W: o.width || 320, H: o.height || 224,
      segLen: o.segLen || 200,
      roadWidth: o.roadWidth || 2000,
      rumbleLen: o.rumbleLen || 3,
      lanes: o.lanes == null ? 3 : o.lanes,
      drawDist: o.drawDist || 260,
      camHeight: o.camHeight || 1000,
      fogDensity: o.fogDensity == null ? 4 : o.fogDensity,
      segs: [], cars: [],
    };
    R.camDepth = 1 / Math.tan(((o.fov || 100) / 2) * Math.PI / 180);
    R.playerZ = R.camHeight * R.camDepth;

    let lastY = 0, lastCx = 0, lastBx = null;

    R.reset = function () { R.segs = []; R.cars = []; lastY = 0; lastCx = 0; lastBx = null; };
    R.lastY = () => lastY;
    R.lastCx = () => lastCx;

    // theme: { road:[a,b], grass:[a,b], rumble:[a,b], lane, fog }
    R.addSegment = function (curve, y, theme, cx, bx) {
      const n = R.segs.length;
      if (cx == null) cx = lastCx;
      if (bx === undefined) bx = null;
      R.segs.push({
        i: n, curve, theme, sprites: [],
        p1: { y: lastY, z: n * R.segLen, cx: lastCx, bx: lastBx, s: {} },
        p2: { y, z: (n + 1) * R.segLen, cx, bx, s: {} },
        dark: Math.floor(n / R.rumbleLen) % 2,
      });
      lastY = y; lastCx = cx; lastBx = bx;
    };

    // A piece of road: ease into a curve/hill, hold, ease out.
    R.addRoad = function (enter, hold, leave, curve, height, theme) {
      const startY = lastY, endY = startY + (height || 0) * R.segLen;
      const total = enter + hold + leave;
      for (let n = 0; n < enter; n++) R.addSegment(ease.in(0, curve, n / enter), ease.inOut(startY, endY, n / total), theme);
      for (let n = 0; n < hold; n++) R.addSegment(curve, ease.inOut(startY, endY, (enter + n) / total), theme);
      for (let n = 0; n < leave; n++) R.addSegment(ease.inOut(curve, 0, n / leave), ease.inOut(startY, endY, (enter + hold + n) / total), theme);
    };

    // A fork: the road splits into two full-width roads that drift apart
    // by `spread` road widths each side over `len` segments.
    R.addFork = function (len, spread, theme) {
      const base = lastCx, start = R.segs.length;
      for (let n = 1; n <= len; n++) {
        const d = ease.inOut(0, spread, Math.min(1, n / (len * 0.7)));
        R.addSegment(0, lastY, theme, base - d, base + d);
      }
      return { start, end: R.segs.length - 1, base };
    };

    // After the player picks a branch, make it the main road and swing the
    // other one away so it leaves the screen.
    R.chooseBranch = function (fork, fromSeg, right) {
      for (let i = fromSeg; i <= fork.end; i++) {
        const s = R.segs[i];
        for (const p of [s.p1, s.p2]) {
          if (p.bx == null) continue;
          if (right) { const t = p.cx; p.cx = p.bx; p.bx = t; }
          const k = Math.max(0, (p.z / R.segLen) - fromSeg);
          p.bx += (right ? -1 : 1) * k * k * 0.004;
        }
      }
      const last = R.segs[fork.end].p2;
      lastCx = last.cx; lastBx = null;
      // the next segment starts the single road again
      return last.cx;
    };

    R.addSprite = function (n, sp) { if (R.segs[n]) R.segs[n].sprites.push(sp); };
    R.length = () => R.segs.length * R.segLen;
    R.findSeg = z => R.segs[Math.max(0, Math.min(R.segs.length - 1, Math.floor(z / R.segLen)))];

    // Which road (main or branch) is lateral position x on, and how far off it?
    // Returns { center, off } where off is |x - centre| in road widths.
    R.roadAt = function (seg, pct, x) {
      const cx = lerp(seg.p1.cx, seg.p2.cx, pct);
      let best = { center: cx, off: Math.abs(x - cx), branch: false };
      if (seg.p1.bx != null && seg.p2.bx != null) {
        const bx = lerp(seg.p1.bx, seg.p2.bx, pct);
        if (Math.abs(x - bx) < best.off) best = { center: bx, off: Math.abs(x - bx), branch: true };
      }
      return best;
    };

    function project(p, camX, camY, camZ, curveX) {
      const cz = p.z - camZ;
      p.s.cz = cz;
      const scale = R.camDepth / cz;
      p.s.scale = scale;
      p.s.x0 = R.W / 2 + scale * (curveX - camX) * R.W / 2;
      p.s.y = R.H / 2 - scale * (p.y - camY) * R.H / 2;
      p.s.w = scale * R.roadWidth * R.W / 2;
    }

    function quad(ctx, x1, y1, w1, x2, y2, w2, col) {
      ctx.fillStyle = col;
      ctx.beginPath();
      y2 -= 0.7;   // overlap the next segment slightly so no seam shows between them
      ctx.moveTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x1 + w1, y1);
      ctx.closePath(); ctx.fill();
    }

    function drawSegment(ctx, seg, fog) {
      const a = seg.p1.s, b = seg.p2.s, t = seg.theme, d = seg.dark;
      const fc = t.fog;
      // grass band
      ctx.fillStyle = mix(t.grass[d], fc, fog);
      ctx.fillRect(0, Math.floor(b.y), R.W, Math.ceil(a.y - b.y) + 1);
      const roads = [[seg.p1.cx, seg.p2.cx]];
      if (seg.p1.bx != null && seg.p2.bx != null) roads.push([seg.p1.bx, seg.p2.bx]);
      const rum = mix(t.rumble[d], fc, fog), road = mix(t.road[d], fc, fog);
      const r1 = a.w / Math.max(6, R.lanes * 2), r2 = b.w / Math.max(6, R.lanes * 2);
      for (const [c1, c2] of roads) quad(ctx, a.x0 + c1 * a.w, a.y, a.w + r1, b.x0 + c2 * b.w, b.y, b.w + r2, rum);
      for (const [c1, c2] of roads) quad(ctx, a.x0 + c1 * a.w, a.y, a.w, b.x0 + c2 * b.w, b.y, b.w, road);
      if (!d && R.lanes > 1 && t.lane) {
        const lc = mix(t.lane, fc, fog);
        const l1 = a.w / 40, l2 = b.w / 40;
        for (const [c1, c2] of roads) {
          for (let lane = 1; lane < R.lanes; lane++) {
            const f = -1 + lane * 2 / R.lanes;
            quad(ctx, a.x0 + (c1 + f) * a.w, a.y, l1, b.x0 + (c2 + f) * b.w, b.y, l2, lc);
          }
        }
      }
    }

    function drawSprite(ctx, img, sx, sy, destW, alignX, clipY, flip) {
      const destH = destW * img.height / img.width;
      const x = sx - destW * (alignX == null ? 0.5 : alignX), y = sy - destH;
      if (destW < 0.5 || x > R.W || x + destW < 0 || y > R.H) return;
      let h = destH, srcH = img.height;
      if (clipY != null && sy > clipY) {
        const cut = Math.min(destH, sy - clipY);
        h = destH - cut; srcH = img.height * h / destH;
        if (h <= 0) return;
      }
      if (flip) {
        ctx.save(); ctx.translate(x + destW, y); ctx.scale(-1, 1);
        ctx.drawImage(img, 0, 0, img.width, srcH, 0, 0, destW, h);
        ctx.restore();
      } else ctx.drawImage(img, 0, 0, img.width, srcH, x, y, destW, h);
    }

    // cam: { x (road widths), z (world), y (height above road), }
    // Returns the base segment.
    R.render = function (ctx, cam) {
      const base = R.findSeg(cam.z);
      const pct = (cam.z % R.segLen) / R.segLen;
      const playerY = lerp(base.p1.y, base.p2.y, pct);
      const camY = playerY + (cam.y == null ? R.camHeight : cam.y);
      const camX = cam.x * R.roadWidth;
      let x = 0, dx = -(base.curve * pct);
      let maxy = R.H;
      const vis = [];
      for (let n = 0; n < R.drawDist; n++) {
        const seg = R.segs[base.i + n];
        if (!seg) break;
        const looped = 0;
        project(seg.p1, camX, camY, cam.z - looped, x);
        project(seg.p2, camX, camY, cam.z - looped, x + dx);
        x += dx; dx += seg.curve;
        seg.fog = 1 - Math.exp(-((n / R.drawDist) ** 2) * R.fogDensity);
        seg.clip = maxy;
        if (seg.p1.s.cz <= R.camDepth || seg.p2.s.y >= maxy) { seg.hidden = true; vis.push(seg); continue; }
        seg.hidden = seg.p2.s.y >= seg.p1.s.y;
        vis.push(seg);
        if (!seg.hidden) maxy = seg.p2.s.y;
      }
      // cars into segment buckets
      for (const s of vis) s.carList = null;
      for (const c of R.cars) {
        const s = R.findSeg(c.z);
        if (s.i < base.i || s.i >= base.i + vis.length) continue;
        (s.carList || (s.carList = [])).push(c);
      }
      for (let k = vis.length - 1; k >= 0; k--) {
        const seg = vis[k];
        if (!seg.hidden && seg.p1.s.cz > R.camDepth) drawSegment(ctx, seg, seg.fog);
        if (seg.p1.s.cz <= R.camDepth) continue;
        const a = seg.p1.s;
        for (const sp of seg.sprites) {
          if (sp.gone) continue;
          const destW = sp.ww * a.w;
          drawSprite(ctx, sp.img, a.x0 + sp.x * a.w, a.y + (sp.lift || 0) * a.w, destW, sp.alignX, null, sp.flip);
        }
        if (seg.carList) {
          seg.carList.sort((p, q) => q.z - p.z);
          for (const c of seg.carList) {
            const p = (c.z % R.segLen) / R.segLen;
            const b = seg.p2.s;
            const w = lerp(a.w, b.w, p), sx = lerp(a.x0, b.x0, p), sy = lerp(a.y, b.y, p);
            const img = c.frame ? c.frame(c, cam) : c.img;
            if (c.draw) c.draw(ctx, sx + c.x * w, sy, w);
            else drawSprite(ctx, img, sx + c.x * w, sy, c.ww * w, 0.5, null, c.flip);
          }
        }
      }
      return base;
    };

    return R;
  }

  // Background layer: a canvas tiled horizontally and scrolled with the curves.
  function drawLayer(ctx, img, W, H, offset, y, h) {
    if (!img) return;
    const dh = h || img.height, dw = img.width * dh / img.height;
    let sx = (((offset % 1) + 1) % 1) * dw;
    for (let x = -sx; x < W; x += dw) ctx.drawImage(img, x, y, dw, dh);
  }

  // Optional tilt steering for tablets. Adds a TILT button to the top bar on
  // touch devices; returns an object whose .value is -1..1 while on.
  function tilt() {
    const t = { on: false, value: 0 };
    const touch = window.matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    if (!touch || !window.DeviceOrientationEvent) return t;
    const bar = document.querySelector('.arc-bar');
    if (!bar) return t;
    const btn = document.createElement('button');
    btn.className = 'arc-btn';
    btn.textContent = 'TILT OFF';
    bar.insertBefore(btn, bar.querySelector('[data-act=pause]'));
    let zero = null;
    const onOri = e => {
      const ang = (screen.orientation && screen.orientation.angle) || window.orientation || 0;
      let v = ang === 90 ? e.beta : ang === -90 || ang === 270 ? -e.beta : e.gamma;
      if (v == null) return;
      if (zero == null) zero = v;
      t.value = Math.max(-1, Math.min(1, (v - zero) / 22));
    };
    btn.addEventListener('click', async () => {
      if (t.on) { t.on = false; t.value = 0; window.removeEventListener('deviceorientation', onOri); btn.textContent = 'TILT OFF'; return; }
      try {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
          const r = await DeviceOrientationEvent.requestPermission();
          if (r !== 'granted') return;
        }
      } catch (e) { return; }
      zero = null; t.on = true; btn.textContent = 'TILT ON';
      window.addEventListener('deviceorientation', onOri);
    });
    return t;
  }

  window.Road3D = { create, paint, mix, ease, lerp, drawLayer, tilt };
})();
