/* Retro Arcade first-person shooter kit on top of raycast.js: map parsing,
   doors and push walls, movement, enemies with sight and chase, hitscan and
   projectile weapons, pickups, the status bar and floors. Each game supplies
   its own art, maps, weapons, enemy types and flavour through FPS.start(cfg). */
(function () {
  'use strict';
  const RC = window.Raycast;
  const W = 320, VIEW = 160, H = 200;

  function start(cfg) {
    const AU = window.Arcade.Audio;
    const R = RC.create(W, VIEW, 66);
    let G, A;

    // ---------- map ----------
    function parse(level) {
      const rows = level.map;
      const h = rows.length, w = rows[0].length;
      const cells = [];
      const world = { w, h, tex: cfg.tex, sprites: [], floor: level.floor, ceil: level.ceil, fog: level.fog, fogDist: level.fogDist || 14, jamb: cfg.jambTex };
      const enemies = [], items = [], doors = [];
      let px = 1.5, py = 1.5, pa = 0;
      for (let y = 0; y < h; y++) {
        const row = [];
        for (let x = 0; x < w; x++) {
          const ch = rows[y][x];
          let c = null;
          if (cfg.walls[ch] != null) c = { wall: cfg.walls[ch], ch };
          else if (ch === 'P') c = { wall: cfg.walls['#'] != null ? cfg.walls['#'] : 0, push: true, ch };
          else if (cfg.doors[ch]) {
            const horiz = cfg.walls[rows[y][x - 1]] != null && cfg.walls[rows[y][x + 1]] != null;
            const d = { x, y, open: 0, target: 0, t: 0, axis: horiz ? 'x' : 'y', tex: cfg.doors[ch].tex, key: cfg.doors[ch].key };
            c = { door: d }; doors.push(d);
          } else if ('^>v<'.includes(ch)) { px = x + 0.5; py = y + 0.5; pa = { '>': 0, 'v': Math.PI / 2, '<': Math.PI, '^': -Math.PI / 2 }[ch]; }
          else if (cfg.enemies[ch]) enemies.push(makeEnemy(ch, x + 0.5, y + 0.5));
          else if (cfg.items[ch]) items.push(Object.assign({ x: x + 0.5, y: y + 0.5, kind: ch }, cfg.items[ch]));
          else if (cfg.props[ch]) { const p = cfg.props[ch]; items.push({ x: x + 0.5, y: y + 0.5, prop: true, tex: p.tex, solid: p.solid, scale: p.scale, explode: p.explode, hp: p.explode ? 20 : 0 }); if (p.solid) c = { solid: true }; }
          row.push(c);
        }
        cells.push(row);
      }
      world.cell = (x, y) => (x < 0 || y < 0 || x >= w || y >= h) ? { wall: 0 } : cells[y][x];
      world.cells = cells;
      return { world, enemies, items, doors, px, py, pa };
    }

    function makeEnemy(ch, x, y) {
      const t = cfg.enemies[ch];
      const e = { type: t, ch, x, y, hp: t.hp, state: 'idle', t: 0, fireT: 0, frame: 'stand', sprite: null, painT: 0, deadT: 0, flying: t.flying };
      e.tryDoor = tryDoorFn(e);
      return e;
    }

    function loadLevel() {
      const lv = cfg.levels[G.level];
      const p = parse(lv);
      G.world = p.world; G.enemies = p.enemies; G.items = p.items; G.doors = p.doors;
      G.p = Object.assign(G.p || {}, { x: p.px, y: p.py, a: p.pa, bob: 0, keys: {} });
      G.shots = []; G.fx = [];
      G.stats = { kills: 0, killsMax: p.enemies.length, treasure: 0, treasureMax: p.items.filter(i => i.treasure).length, secrets: 0, secretsMax: 0, time: 0 };
      for (const row of G.world.cells) for (const c of row) if (c && c.push) G.stats.secretsMax++;
      for (const e of G.enemies) { e.sprite = { x: e.x, y: e.y, tex: null, enemy: e, scale: e.type.scale || 1, lift: e.type.lift || 0 }; G.world.sprites.push(e.sprite); }
      for (const it of G.items) { it.sprite = { x: it.x, y: it.y, tex: it.tex, scale: it.scale || (it.prop ? 1 : 0.5), item: it }; G.world.sprites.push(it.sprite); }
      G.phase = 'play'; G.banner = 2.5;
      G.msg = null;
      AU.music(lv.music || cfg.music);
    }

    // ---------- helpers ----------
    function cellAtPlayerFront(dist) {
      const p = G.p;
      return [Math.floor(p.x + Math.cos(p.a) * dist), Math.floor(p.y + Math.sin(p.a) * dist)];
    }
    function say(s, t) { G.msg = { s, t: t || 2 }; }
    function noise(x, y, r) {
      for (const e of G.enemies) if (e.state === 'idle' && Math.hypot(e.x - x, e.y - y) < r) wake(e);
    }
    function wake(e) { if (e.state === 'idle') { e.state = 'chase'; e.t = 0; if (e.type.alert) AU.play(e.type.alert, { v: 0.5 }); } }

    function hurtPlayer(n) {
      const p = G.p;
      if (G.phase !== 'play' || G.god) return;
      p.health -= n; G.hurtFlash = 0.35;
      AU.play(cfg.hurtSound || 'hit', { v: 0.6 });
      if (p.health <= 0) {
        p.health = 0; G.phase = 'dead'; G.deadT = 0;
        AU.play(cfg.dieSound || 'scream', { v: 0.8 });
      }
    }

    function damageEnemy(e, n, a) {
      if (e.state === 'dead') return;
      e.hp -= n;
      wake(e);
      if (e.hp <= 0) {
        e.state = 'dead'; e.deadT = 0; G.stats.kills++;
        a.addScore(e.type.points || 100);
        AU.play(e.type.death || 'scream', { v: 0.6 });
        if (e.type.drop) { const it = Object.assign({ x: e.x, y: e.y, kind: 'drop' }, cfg.items[e.type.drop]); it.sprite = { x: e.x, y: e.y, tex: it.tex, scale: 0.5, item: it }; G.items.push(it); G.world.sprites.push(it.sprite); }
        if (cfg.onKill) cfg.onKill(e, api);
        if (e.type.boss) { G.bossDown = true; }
      } else { e.painT = 0.25; e.state = e.state === 'idle' ? 'chase' : e.state; AU.play(e.type.pain || 'hit', { v: 0.4 }); }
    }

    function explode(x, y, r, dmg, a) {
      G.fx.push({ x, y, t: 0, boom: true });
      AU.play('boom', { v: 0.8 });
      for (const e of G.enemies) { const d = Math.hypot(e.x - x, e.y - y); if (d < r) damageEnemy(e, dmg * (1 - d / r) + 10, a); }
      const pd = Math.hypot(G.p.x - x, G.p.y - y); if (pd < r) hurtPlayer(Math.round(dmg * 0.5 * (1 - pd / r)));
      for (const it of G.items) if (it.explode && !it.gone && Math.hypot(it.x - x, it.y - y) < r && it !== G._exploding) { it.gone = true; it.sprite.hidden = true; const c = G.world.cells[Math.floor(it.y)][Math.floor(it.x)]; if (c && c.solid) G.world.cells[Math.floor(it.y)][Math.floor(it.x)] = null; setTimeout(() => explode(it.x, it.y, 2, 60, a), 120); }
      noise(x, y, 10);
    }

    function fire(a) {
      const w = cfg.weapons[G.weapon];
      const p = G.p;
      if (w.ammo && p.ammo[w.ammo] <= 0) { switchBest(); return; }
      G.fireT = w.rate; G.flashT = 0.08; G.swingT = 0.25;
      if (w.ammo) p.ammo[w.ammo]--;
      AU.play(w.sound, { v: w.vol || 0.6 });
      if (w.projectile) {
        G.shots.push({ x: p.x + Math.cos(p.a) * 0.4, y: p.y + Math.sin(p.a) * 0.4, vx: Math.cos(p.a) * w.speed, vy: Math.sin(p.a) * w.speed, dmg: w.dmg, r: w.radius, mine: true, tex: w.projTex });
        noise(p.x, p.y, 8);
        return;
      }
      if (!w.melee) noise(p.x, p.y, 9);
      const pellets = w.pellets || 1;
      for (let k = 0; k < pellets; k++) {
        const spread = w.spread ? (Math.random() - 0.5) * w.spread : 0;
        const hit = R.aimAt(G.world, p, s => s.enemy && s.enemy.state !== 'dead', spread + (w.melee ? 0 : 2));
        if (hit && (!w.melee || hit.dist < 1.2)) {
          const falloff = w.melee ? 1 : Math.max(0.35, 1 - hit.dist / 18);
          damageEnemy(hit.sprite.enemy, (w.dmg[0] + Math.random() * (w.dmg[1] - w.dmg[0])) * falloff, a);
        } else if (!w.melee) {
          // hit an exploding prop?
          const ph = R.aimAt(G.world, p, s => s.item && s.item.explode && !s.item.gone, spread);
          if (ph) { const it = ph.sprite.item; it.hp -= 15; if (it.hp <= 0) { it.gone = true; it.sprite.hidden = true; const cx = Math.floor(it.x), cy = Math.floor(it.y); if (G.world.cells[cy][cx] && G.world.cells[cy][cx].solid) G.world.cells[cy][cx] = null; explode(it.x, it.y, 2.2, 70, a); } }
        }
      }
    }
    function switchBest() {
      for (let i = cfg.weapons.length - 1; i >= 0; i--) { const w = cfg.weapons[i]; if (G.p.owned[i] && (!w.ammo || G.p.ammo[w.ammo] > 0)) { G.weapon = i; return; } }
    }

    function use(a) {
      const [cx, cy] = cellAtPlayerFront(1.0);
      const c = G.world.cell(cx, cy);
      if (!c) return;
      if (c.door) {
        const d = c.door;
        if (d.key && !G.p.keys[d.key]) { say('YOU NEED THE ' + d.key.toUpperCase() + ' KEY'); AU.play('bump', { v: 0.4 }); return; }
        d.target = d.target ? 0 : 1; d.t = 0; AU.play(cfg.doorSound || 'whoosh', { v: 0.4, rate: 0.7 });
        return;
      }
      if (c.push) {
        // slide the secret wall two cells away from the player
        const dx = Math.sign(Math.round(Math.cos(G.p.a))), dy = Math.sign(Math.round(Math.sin(G.p.a)));
        const cells = G.world.cells;
        let tx = cx, ty = cy;
        for (let k = 0; k < 2; k++) { const nx = tx + dx, ny = ty + dy; if (cells[ny] && cells[ny][nx] === null) { tx = nx; ty = ny; } else break; }
        cells[cy][cx] = null;
        if (tx !== cx || ty !== cy) cells[ty][tx] = { wall: c.wall };
        G.stats.secrets++; a.addScore(1000); say('A SECRET!'); AU.play('powerup', { v: 0.6 });
        return;
      }
      if (c.wall === cfg.exitTex) {
        if (cfg.levels[G.level].needBoss && !G.bossDown) { say('THE WAY IS BARRED'); return; }
        G.phase = 'done'; G.doneT = 0; AU.play('fanfare', { v: 0.8 }); AU.stopMusic(0.5);
      }
    }

    // ---------- enemies ----------
    function updateEnemies(dt, a) {
      const p = G.p, world = G.world;
      for (const e of G.enemies) {
        const s = e.sprite;
        e.t += dt;
        if (e.state === 'dead') { e.deadT += dt; s.tex = e.deadT < 0.15 ? e.type.frames.die1 : e.deadT < 0.3 ? e.type.frames.die2 : e.type.frames.dead; s.lift = 0; continue; }
        const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy);
        const see = d < 20 && RC.sight(world, e.x, e.y, p.x, p.y);
        if (e.state === 'idle') { s.tex = e.type.frames.stand; if (see && d < 12) { e.seeT = (e.seeT || 0) + dt; if (e.seeT > 0.3) wake(e); } continue; }
        if (e.painT > 0) { e.painT -= dt; s.tex = e.type.frames.pain; continue; }
        e.fireT -= dt;
        const t = e.type;
        if (e.state === 'chase') {
          if (see && d < t.range && e.fireT <= 0) { e.state = 'aim'; e.aimT = t.aim || 0.35; }
          else {
            // step toward the player, sliding along walls, opening doors on the way
            const sp = t.speed * dt;
            const nx = e.x + dx / d * sp, ny = e.y + dy / d * sp;
            const rr = t.flying ? 0.2 : 0.3;
            if (d > (t.melee ? 0.8 : 1.2)) {
              if (RC.free(world, nx, e.y, rr)) e.x = nx; else if (!e.tryDoor(nx, e.y)) e.x += (Math.random() - 0.5) * sp;
              if (RC.free(world, e.x, ny, rr)) e.y = ny; else if (!e.tryDoor(e.x, ny)) e.y += (Math.random() - 0.5) * sp;
            }
            s.tex = Math.floor(e.t * 5) % 2 ? t.frames.walk1 : t.frames.walk2;
          }
        } else if (e.state === 'aim') {
          e.aimT -= dt; s.tex = t.frames.aim;
          if (e.aimT <= 0) {
            e.state = 'shoot'; e.shootT = 0.18; e.fireT = t.rate * (0.7 + Math.random() * 0.6);
            if (t.melee) { if (d < 1.3) hurtPlayer(t.dmg[0] + Math.random() * (t.dmg[1] - t.dmg[0])); AU.play(t.sound || 'punch', { v: 0.5 }); }
            else if (t.projectile) { G.shots.push({ x: e.x, y: e.y, vx: dx / d * t.projSpeed, vy: dy / d * t.projSpeed, dmg: t.dmg, r: t.radius || 0, tex: t.projTex }); AU.play(t.sound || 'shot', { v: 0.4 }); }
            else {
              AU.play(t.sound || 'shot', { v: 0.45 });
              if (see) {
                const chance = Math.max(0.15, 0.9 - d * 0.06) * (G.p.moving ? 0.75 : 1);
                if (Math.random() < chance) hurtPlayer(Math.round(t.dmg[0] + Math.random() * (t.dmg[1] - t.dmg[0])));
              }
            }
          }
        } else if (e.state === 'shoot') {
          e.shootT -= dt; s.tex = t.frames.shoot;
          if (e.shootT <= 0) e.state = t.burst && Math.random() < 0.6 && see ? 'aim' : 'chase', e.aimT = 0.12;
        }
        s.x = e.x; s.y = e.y;
        s.lift = t.flying ? 0.25 + Math.sin(G.t * 3 + e.x) * 0.05 : 0;
      }
    }
    // enemies push doors open when they walk into them
    function tryDoorFn(e) {
      return (x, y) => {
        const c = G.world.cell(Math.floor(x), Math.floor(y));
        if (c && c.door && !c.door.key && c.door.target === 0) { c.door.target = 1; c.door.t = 0; return true; }
        return false;
      };
    }

    // ---------- API for the game ----------
    const api = {};
    A = window.Arcade.start({
      id: cfg.id, title: cfg.title, subtitle: cfg.subtitle, color: cfg.color, width: W, height: H, bg: '#000',
      help: cfg.help,
      keys: { fire: ['Space', 'ControlLeft', 'KeyZ', 'KeyJ'], b: ['KeyX', 'KeyE', 'Enter', 'KeyK'], c: ['KeyC', 'ShiftLeft', 'KeyL'] },
      touch: { dpad: '4', buttons: [{ act: 'c', label: 'STRAFE' }, { act: 'b', label: 'OPEN' }, { act: 'fire', label: 'FIRE' }] },
      onKey(e) {
        const n = parseInt(e.key, 10);
        if (n >= 1 && n <= cfg.weapons.length && G.p.owned[n - 1]) { G.weapon = n - 1; return true; }
        if (e.code === 'KeyQ') { cycleWeapon(); return true; }
        return false;
      },
      init() { G = { level: 0, t: 0, p: { health: 100, lives: 3, ammo: Object.assign({}, cfg.startAmmo), owned: cfg.weapons.map((w, i) => i < cfg.startWeapons) } }; G.weapon = cfg.startWeapons - 1; loadLevel(); G.phase = 'demo'; },
      attract(a, dt) { G.t += dt; G.p.a += dt * 0.2; },
      drawAttract(a) { drawView(a); },
      newGame(a) {
        G = { level: 0, t: 0, p: { health: 100, lives: 3, ammo: Object.assign({}, cfg.startAmmo), owned: cfg.weapons.map((w, i) => i < cfg.startWeapons) }, fireT: 0 };
        G.weapon = cfg.startWeapons - 1;
        loadLevel();
        if (cfg.onStart) cfg.onStart(api);
      },
      update(a, dt) {
        G.t += dt;
        if (G.msg) { G.msg.t -= dt; if (G.msg.t <= 0) G.msg = null; }
        if (G.banner > 0) G.banner -= dt;
        if (G.hurtFlash > 0) G.hurtFlash -= dt;
        if (G.pickFlash > 0) G.pickFlash -= dt;
        for (const d of G.doors) {
          d.open += (d.target - d.open) * Math.min(1, dt * 4);
          if (d.target === 1) { d.t += dt; const pc = [Math.floor(G.p.x), Math.floor(G.p.y)]; const blocked = (pc[0] === d.x && pc[1] === d.y) || G.enemies.some(e => e.state !== 'dead' && Math.floor(e.x) === d.x && Math.floor(e.y) === d.y); if (d.t > 5 && !blocked) { d.target = 0; d.t = 0; AU.play(cfg.doorSound || 'whoosh', { v: 0.25, rate: 0.7 }); } }
        }
        if (G.phase === 'dead') {
          G.deadT += dt;
          if (G.deadT > 2.5) {
            G.p.lives--;
            if (G.p.lives <= 0) { a.gameOver(); return; }
            G.p.health = 100; G.p.ammo = Object.assign({}, cfg.startAmmo); G.p.owned = cfg.weapons.map((w, i) => i < cfg.startWeapons); G.weapon = cfg.startWeapons - 1;
            loadLevel();
          }
          return;
        }
        if (G.phase === 'done') {
          G.doneT += dt;
          if (G.doneT > 4 || (G.doneT > 1.5 && a.pressed('fire'))) {
            const s = G.stats;
            a.addScore((s.kills >= s.killsMax ? 10000 : 0) + (s.treasure >= s.treasureMax ? 10000 : 0) + (s.secretsMax && s.secrets >= s.secretsMax ? 10000 : 0));
            G.level++;
            if (G.level >= cfg.levels.length) { G.phase = 'won'; G.doneT = 0; AU.play('fanfare', { v: 0.9 }); return; }
            loadLevel();
          }
          return;
        }
        if (G.phase === 'won') { G.doneT += dt; if (G.doneT > 5) a.gameOver(); return; }
        G.stats.time += dt;
        const p = G.p, world = G.world;
        // movement
        const strafe = a.down('c');
        const turn = (a.down('right') ? 1 : 0) - (a.down('left') ? 1 : 0);
        const fwd = (a.down('up') ? 1 : 0) - (a.down('down') ? 1 : 0);
        let mx = Math.cos(p.a) * fwd, my = Math.sin(p.a) * fwd;
        if (strafe) { mx += Math.cos(p.a + Math.PI / 2) * turn; my += Math.sin(p.a + Math.PI / 2) * turn; }
        else p.a += turn * 2.6 * dt;
        const sp = (cfg.speed || 3.6) * dt;
        p.moving = !!(mx || my);
        if (p.moving) {
          const nx = p.x + mx * sp, ny = p.y + my * sp;
          if (RC.free(world, nx, p.y, 0.22)) p.x = nx;
          if (RC.free(world, p.x, ny, 0.22)) p.y = ny;
          p.bob += dt * 10;
        }
        // weapon
        G.fireT -= dt; if (G.flashT > 0) G.flashT -= dt; if (G.swingT > 0) G.swingT -= dt;
        const w = cfg.weapons[G.weapon];
        if (G.fireT <= 0 && (w.auto ? a.down('fire') : a.pressed('fire'))) fire(a);
        if (a.pressed('b')) use(a);
        // pickups
        for (const it of G.items) {
          if (it.gone || it.prop) continue;
          if (Math.hypot(it.x - p.x, it.y - p.y) > 0.6) continue;
          if (cfg.pickup(it, p, api) === false) continue;
          it.gone = true; it.sprite.hidden = true; G.pickFlash = 0.2;
          if (it.treasure) { G.stats.treasure++; a.addScore(it.treasure); }
        }
        updateEnemies(dt, a);
        // projectiles
        for (let k = G.shots.length - 1; k >= 0; k--) {
          const s = G.shots[k];
          s.x += s.vx * dt; s.y += s.vy * dt;
          if (!s.spr) { s.spr = { x: s.x, y: s.y, tex: s.tex, scale: 0.35, lift: 0.3 }; world.sprites.push(s.spr); }
          s.spr.x = s.x; s.spr.y = s.y;
          const c = world.cell(Math.floor(s.x), Math.floor(s.y));
          let done = c && (c.wall != null || c.solid || (c.door && c.door.open < 0.8));
          if (!done && s.mine) for (const e of G.enemies) if (e.state !== 'dead' && Math.hypot(e.x - s.x, e.y - s.y) < 0.45) { done = true; if (!s.r) damageEnemy(e, s.dmg[0] + Math.random() * (s.dmg[1] - s.dmg[0]), a); break; }
          if (!done && !s.mine && Math.hypot(p.x - s.x, p.y - s.y) < 0.4) { done = true; if (!s.r) hurtPlayer(Math.round(s.dmg[0] + Math.random() * (s.dmg[1] - s.dmg[0]))); }
          if (done) {
            if (s.r) explode(s.x - s.vx * dt, s.y - s.vy * dt, s.r, s.dmg[1], a);
            s.spr.hidden = true; world.sprites.splice(world.sprites.indexOf(s.spr), 1);
            G.shots.splice(k, 1);
          }
        }
        for (let k = G.fx.length - 1; k >= 0; k--) { G.fx[k].t += dt; if (G.fx[k].t > 0.5) G.fx.splice(k, 1); }
        if (cfg.update) cfg.update(api, dt);
      },
      draw(a) { drawView(a); drawHud(a); },
    });

    function cycleWeapon() { for (let k = 1; k <= cfg.weapons.length; k++) { const i = (G.weapon + k) % cfg.weapons.length; const w = cfg.weapons[i]; if (G.p.owned[i] && (!w.ammo || G.p.ammo[w.ammo] > 0)) { G.weapon = i; return; } } }

    function drawView(a) {
      const c = a.ctx, p = G.p;
      const cam = { x: p.x, y: p.y, a: p.a, bob: p.moving ? Math.sin(p.bob) * 2 : 0 };
      if (G.phase === 'dead') cam.bob = Math.min(40, G.deadT * 30);
      R.render(G.world, cam);
      c.drawImage(R.canvas, 0, 0, W, VIEW);
      for (const f of G.fx) {
        if (!f.boom) continue;
        // explosions drawn over the view where they project
        const dx = f.x - p.x, dy = f.y - p.y;
        const ang = Math.atan2(dy, dx) - p.a, dist = Math.hypot(dx, dy);
        const rel = Math.atan2(Math.sin(ang), Math.cos(ang));
        if (Math.abs(rel) > 0.7 || dist < 0.3) continue;
        const sx = W / 2 + Math.tan(rel) / Math.tan(33 * Math.PI / 180) * W / 2, sz = 90 / dist * (0.4 + f.t);
        c.globalAlpha = Math.max(0, 1 - f.t * 2);
        c.fillStyle = '#ff8a1a'; c.beginPath(); c.arc(sx, VIEW / 2, sz, 0, 7); c.fill();
        c.fillStyle = '#ffe04a'; c.beginPath(); c.arc(sx, VIEW / 2, sz * 0.5, 0, 7); c.fill();
        c.globalAlpha = 1;
      }
      if (G.phase !== 'demo' && G.phase !== 'dead') {
        const w = cfg.weapons[G.weapon];
        const bobX = p.moving ? Math.sin(p.bob * 0.5) * 6 : 0, bobY = p.moving ? Math.abs(Math.cos(p.bob * 0.5)) * 5 : 0;
        cfg.drawWeapon(c, w, G.flashT > 0, G.swingT, W / 2 + bobX, VIEW + bobY);
      }
      if (G.hurtFlash > 0) { c.fillStyle = `rgba(255,0,0,${G.hurtFlash})`; c.fillRect(0, 0, W, VIEW); }
      if (G.pickFlash > 0) { c.fillStyle = `rgba(255,220,120,${G.pickFlash})`; c.fillRect(0, 0, W, VIEW); }
      if (G.phase === 'dead') { c.fillStyle = `rgba(160,0,0,${Math.min(0.7, G.deadT * 0.4)})`; c.fillRect(0, 0, W, VIEW); }
    }

    function drawHud(a) {
      const c = a.ctx, p = G.p;
      cfg.drawBar(c, a, G, p, VIEW, W, H);
      if (G.msg) a.text(G.msg.s, W / 2, 8, 8, '#fff', 'center');
      if (G.banner > 0 && G.phase === 'play') { a.text(cfg.levels[G.level].name, W / 2, 50, 10, cfg.color, 'center'); a.text('FLOOR ' + (G.level + 1), W / 2, 68, 8, '#fff', 'center'); }
      if (G.phase === 'done' || G.phase === 'won') {
        const s = G.stats;
        c.fillStyle = 'rgba(0,0,0,.8)'; c.fillRect(40, 24, 240, 110);
        a.text(G.phase === 'won' ? cfg.winText : 'FLOOR ' + (G.level + 1) + ' COMPLETE', W / 2, 32, 8, cfg.color, 'center');
        const pct = (n, m) => (m ? Math.round(n / m * 100) : 100) + '%';
        a.text('KILLS    ' + pct(s.kills, s.killsMax), 70, 56, 8, '#fff');
        a.text('TREASURE ' + pct(s.treasure, s.treasureMax), 70, 72, 8, '#fff');
        a.text('SECRETS  ' + pct(s.secrets, s.secretsMax), 70, 88, 8, '#fff');
        const t = Math.floor(s.time);
        a.text('TIME     ' + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'), 70, 104, 8, '#fff');
      }
    }

    Object.assign(api, { say, hurtPlayer, damageEnemy, explode });
    Object.defineProperty(api, 'G', { get: () => G });
    Object.defineProperty(api, 'A', { get: () => A });
    window.__g = () => G;
    window.__fps = api;
    return api;
  }

  window.FPS = { start, W, H, VIEW };
})();
