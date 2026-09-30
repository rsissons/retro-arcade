/* Retro Arcade raycaster (the 1992 grid-walls technique), shared by the
   first-person games. The world is a grid: each cell is empty, a wall with a
   texture, or a door that slides open along the middle of its cell.
   Sprites (enemies, pickups, props) are camera-facing billboards clipped
   against a per-column depth buffer.
     const R = Raycast.create(320, 160);
     R.render(world, cam) -> draws into R.canvas
   world: { w, h, cell(x, y) -> { wall: texIndex } | { door } | null,
            tex: [Uint32Array(64*64)], sprites: [{ x, y, tex, scale, lift }],
            floor, ceil (colour ints), fog }
   cam: { x, y, a } in cells / radians. */
(function () {
  'use strict';
  const TS = 64;

  // pack r,g,b into the little-endian ABGR layout ImageData uses
  const rgb = (r, g, b) => (255 << 24) | (b << 16) | (g << 8) | r;
  function hex(h) { const n = parseInt(h.slice(1), 16); return rgb((n >> 16) & 255, (n >> 8) & 255, n & 255); }
  function shade(c, k) {
    const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
    return rgb(Math.min(255, r * k) | 0, Math.min(255, g * k) | 0, Math.min(255, b * k) | 0);
  }
  function mixc(c, f, k) {
    const r = c & 255, g = (c >> 8) & 255, b = (c >> 16) & 255;
    const fr = f & 255, fg = (f >> 8) & 255, fb = (f >> 16) & 255;
    return rgb(r + (fr - r) * k | 0, g + (fg - g) * k | 0, b + (fb - b) * k | 0);
  }

  // Draw a texture with the 2D canvas API, then read it back as pixels.
  function texture(fn, w, h) {
    w = w || TS; h = h || TS;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    fn(x, w, h);
    const d = x.getImageData(0, 0, w, h).data;
    const out = new Uint32Array(w * h);
    for (let i = 0; i < w * h; i++) out[i] = d[i * 4 + 3] < 128 ? 0 : rgb(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
    out.w = w; out.h = h;
    return out;
  }

  function create(W, H, fovDeg) {
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(W, H);
    const buf = new Uint32Array(img.data.buffer);
    const zbuf = new Float32Array(W);
    const fov = (fovDeg || 66) * Math.PI / 180;
    const plane = Math.tan(fov / 2);

    function render(world, cam) {
      const dirX = Math.cos(cam.a), dirY = Math.sin(cam.a);
      const plX = -dirY * plane, plY = dirX * plane;
      const half = H / 2 + (cam.bob || 0);
      // floor and ceiling, darkened toward the horizon
      for (let y = 0; y < H; y++) {
        const below = y >= half;
        const dist = Math.abs(H / 2 / (y - half + 0.5));
        const base = below ? world.floor : world.ceil;
        const k = world.fog ? Math.min(1, dist / world.fogDist) : 0;
        const col = world.fog ? mixc(base, world.fog, k * 0.85) : base;
        buf.fill(col, y * W, y * W + W);
      }
      for (let x = 0; x < W; x++) {
        const camX = 2 * x / W - 1;
        const rx = dirX + plX * camX, ry = dirY + plY * camX;
        let mx = Math.floor(cam.x), my = Math.floor(cam.y);
        const ddx = Math.abs(1 / rx), ddy = Math.abs(1 / ry);
        const sx = rx < 0 ? -1 : 1, sy = ry < 0 ? -1 : 1;
        let sdx = rx < 0 ? (cam.x - mx) * ddx : (mx + 1 - cam.x) * ddx;
        let sdy = ry < 0 ? (cam.y - my) * ddy : (my + 1 - cam.y) * ddy;
        let side = 0, hit = null, perp = 0, u = 0, guard = 0;
        while (guard++ < 128) {
          if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; }
          const c = world.cell(mx, my);
          if (!c) continue;
          if (c.door) {
            // door plane sits half a cell in, and slides along its length
            const d = c.door;
            if (d.axis === 'x' ? side === 1 : side === 0) {
              const half2 = side === 0 ? (sdx - ddx / 2) : (sdy - ddy / 2);
              const hx = cam.x + rx * half2, hy = cam.y + ry * half2;
              const inCell = side === 1 ? Math.floor(hx) === mx : Math.floor(hy) === my;
              let f = side === 1 ? hx - mx : hy - my;
              if (inCell && f >= d.open) { perp = half2; u = f - d.open; hit = { tex: d.tex, door: true }; break; }
              continue;
            }
            // looking along the door's edge: the jamb
            perp = side === 0 ? sdx - ddx : sdy - ddy;
            hit = { tex: world.jamb != null ? world.jamb : c.door.tex };
            const wx = side === 0 ? cam.y + perp * ry : cam.x + perp * rx; u = wx - Math.floor(wx);
            break;
          }
          if (c.wall != null) {
            perp = side === 0 ? sdx - ddx : sdy - ddy;
            const wx = side === 0 ? cam.y + perp * ry : cam.x + perp * rx;
            u = wx - Math.floor(wx);
            if ((side === 0 && rx > 0) || (side === 1 && ry < 0)) u = 1 - u;
            hit = { tex: c.wall };
            break;
          }
        }
        if (!hit) { zbuf[x] = 1e9; continue; }
        zbuf[x] = perp;
        const lineH = H / perp;
        const top = half - lineH / 2;
        const t = world.tex[hit.tex] || world.tex[0];
        const tx = Math.min(TS - 1, (u * TS) | 0);
        const y0 = Math.max(0, top | 0), y1 = Math.min(H, (top + lineH) | 0);
        const step = TS / lineH;
        let ty = (y0 - top) * step;
        const dark = side === 1 ? 0.72 : 1;
        const fogK = world.fog ? Math.min(1, perp / world.fogDist) * 0.85 : 0;
        for (let y = y0; y < y1; y++) {
          let c = t[((ty | 0) & 63) * TS + tx];
          ty += step;
          if (dark !== 1) c = shade(c, dark);
          if (fogK > 0.02) c = mixc(c, world.fog, fogK);
          buf[y * W + x] = c;
        }
      }
      // sprites, far to near
      const list = [];
      for (const s of world.sprites) {
        if (s.hidden) continue;
        const dx = s.x - cam.x, dy = s.y - cam.y;
        s._d = dx * dx + dy * dy;
        list.push(s);
      }
      list.sort((a, b) => b._d - a._d);
      const inv = 1 / (plX * dirY - dirX * plY);
      for (const s of list) {
        const dx = s.x - cam.x, dy = s.y - cam.y;
        const tX = inv * (dirY * dx - dirX * dy), tY = inv * (-plY * dx + plX * dy);
        if (tY <= 0.1) continue;
        const t = s.tex; if (!t) continue;
        const sc = s.scale || 1;
        const sxs = (W / 2) * (1 + tX / tY) | 0;
        const hh = Math.abs(H / tY) * sc, ww = hh * t.w / t.h;
        const lift = (s.lift || 0) * H / tY;
        const y0 = half + (H / tY) / 2 - hh - lift;
        const x0 = sxs - ww / 2;
        const fogK = world.fog ? Math.min(1, tY / world.fogDist) * 0.85 : 0;
        const xa = Math.max(0, x0 | 0), xb = Math.min(W, (x0 + ww) | 0);
        const ya = Math.max(0, y0 | 0), yb = Math.min(H, (y0 + hh) | 0);
        for (let x = xa; x < xb; x++) {
          if (zbuf[x] < tY) continue;
          const tx = ((x - x0) / ww * t.w) | 0;
          for (let y = ya; y < yb; y++) {
            const ty = ((y - y0) / hh * t.h) | 0;
            let c = t[ty * t.w + tx];
            if (!c) continue;
            if (s.flash) c = mixc(c, rgb(255, 255, 255), 0.6);
            if (fogK > 0.02) c = mixc(c, world.fog, fogK);
            buf[y * W + x] = c;
          }
        }
        s._sx = sxs; s._w = ww; s._dist = tY;
      }
      ctx.putImageData(img, 0, 0);
    }

    // What the centre of the screen is looking at: the nearest sprite that
    // passes `pick` before the wall. Returns { sprite, dist } or null.
    function aimAt(world, cam, pick, spread) {
      let best = null;
      const wallD = zbuf[W / 2 | 0];
      for (const s of world.sprites) {
        if (s.hidden || !pick(s) || s._dist == null) continue;
        if (s._dist > wallD + 0.3) continue;
        const half = Math.max(s._w * 0.35, 3) + (spread || 0);
        if (Math.abs(s._sx - W / 2) > half) continue;
        if (!best || s._dist < best.dist) best = { sprite: s, dist: s._dist };
      }
      return best;
    }

    return { canvas, render, aimAt, zbuf, W, H };
  }

  // Line of sight across the grid (doors that aren't open block it).
  function sight(world, x0, y0, x1, y1) {
    const dx = x1 - x0, dy = y1 - y0, n = Math.ceil(Math.hypot(dx, dy) * 4);
    for (let i = 1; i < n; i++) {
      const c = world.cell(Math.floor(x0 + dx * i / n), Math.floor(y0 + dy * i / n));
      if (!c) continue;
      if (c.wall != null) return false;
      if (c.door && c.door.open < 0.7) return false;
    }
    return true;
  }
  // Can a body of radius r stand at x,y?
  function free(world, x, y, r) {
    for (const [ox, oy] of [[-r, -r], [r, -r], [-r, r], [r, r]]) {
      const c = world.cell(Math.floor(x + ox), Math.floor(y + oy));
      if (!c) continue;
      if (c.wall != null || c.solid) return false;
      if (c.door && c.door.open < 0.9) return false;
    }
    return true;
  }

  window.Raycast = { create, texture, sight, free, rgb, hex, shade };
})();
