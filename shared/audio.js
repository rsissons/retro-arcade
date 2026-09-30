/* Retro Arcade sampled audio: music tracks and sound effects on top of the
   engine's WebAudio context (Arcade.Sfx), so the mute button covers both.
   Files are fetched as soon as the page loads and decoded once the player's
   first tap or key press has created the audio context.
     Audio.load({ name: 'url', ... })
     Audio.play('name', { v, rate, delay })       one-shot
     Audio.loop('name', { v, rate })              returns { rate(r), vol(v), stop() }
     Audio.music('name', { v, fade })             one track at a time, loops
     Audio.stopMusic(fade)
   Music pauses with the game and stops at game over. */
(function () {
  'use strict';
  const Sfx = window.Arcade.Sfx;
  const raw = {};        // name -> Promise<ArrayBuffer>
  const bufs = {};       // name -> AudioBuffer
  const decoding = {};   // name -> Promise<AudioBuffer>
  let musicGain = null, musicSrc = null, musicName = null, musicWant = null;

  function ctx() { return Sfx.ctx; }

  function load(map) {
    for (const name in map) {
      if (raw[name]) continue;
      raw[name] = fetch(map[name]).then(r => { if (!r.ok) throw new Error(map[name] + ' ' + r.status); return r.arrayBuffer(); })
        .catch(e => { console.warn('audio', e.message); return null; });
    }
    decodeAll();
  }

  function decode(name) {
    if (bufs[name]) return Promise.resolve(bufs[name]);
    if (decoding[name]) return decoding[name];
    if (!ctx() || !raw[name]) return Promise.resolve(null);
    decoding[name] = raw[name].then(ab => {
      if (!ab) return null;
      // decodeAudioData detaches the buffer, so hand it a copy
      return new Promise(res => ctx().decodeAudioData(ab.slice(0), b => res(b), () => res(null)));
    }).then(b => {
      if (b) bufs[name] = trimPriming(b);
      return bufs[name] || null;
    });
    return decoding[name];
  }
  function decodeAll() { if (ctx()) for (const n in raw) decode(n); }

  // AAC files start with 1024 samples of encoder priming. Browsers that ignore
  // the file's edit list leave it in, which puts a click in every loop, so
  // strip near-silent lead-in of that length.
  function trimPriming(b) {
    const lead = Math.round(1024 * b.sampleRate / 44100);
    if (b.length < lead * 4) return b;
    const d = b.getChannelData(0);
    let quiet = true;
    for (let i = 0; i < lead; i++) if (Math.abs(d[i]) > 0.002) { quiet = false; break; }
    if (!quiet || Math.abs(d[lead + 32]) < 0.002) return b;
    const out = ctx().createBuffer(b.numberOfChannels, b.length - lead, b.sampleRate);
    for (let c = 0; c < b.numberOfChannels; c++) out.copyToChannel(b.getChannelData(c).subarray(lead), c);
    return out;
  }

  function out() {
    return Sfx.master;
  }

  function play(name, o) {
    o = o || {};
    const c = ctx();
    if (!c || Sfx.muted) return null;
    const b = bufs[name];
    if (!b) { decode(name); return null; }
    const src = c.createBufferSource();
    src.buffer = b;
    src.playbackRate.value = o.rate || 1;
    const g = c.createGain();
    g.gain.value = o.v == null ? 0.8 : o.v;
    src.connect(g); g.connect(out());
    src.start(c.currentTime + (o.delay || 0));
    return src;
  }

  function loop(name, o) {
    o = o || {};
    const h = { src: null, g: null, _rate: o.rate || 1, _v: o.v == null ? 0.5 : o.v, dead: false };
    const begin = b => {
      if (h.dead || !b || !ctx()) return;
      const c = ctx();
      h.src = c.createBufferSource();
      h.src.buffer = b; h.src.loop = true;
      h.src.playbackRate.value = h._rate;
      h.g = c.createGain(); h.g.gain.value = h._v;
      h.src.connect(h.g); h.g.connect(out());
      h.src.start();
    };
    h.rate = r => { h._rate = r; if (h.src) h.src.playbackRate.setTargetAtTime(r, ctx().currentTime, 0.03); };
    h.vol = v => { h._v = v; if (h.g) h.g.gain.setTargetAtTime(v, ctx().currentTime, 0.05); };
    h.stop = () => { h.dead = true; if (h.src) { try { h.src.stop(); } catch (e) { /* already stopped */ } h.src = null; } };
    if (bufs[name]) begin(bufs[name]); else decode(name).then(begin);
    return h;
  }

  function music(name, o) {
    o = o || {};
    if (musicName === name && musicSrc) return;
    stopMusic(o.fade == null ? 0.4 : o.fade);
    musicWant = name;
    const c = ctx();
    if (!c) return;
    decode(name).then(b => {
      if (!b || musicWant !== name || !ctx()) return;
      const c = ctx();
      musicGain = c.createGain();
      musicGain.gain.value = o.v == null ? 0.55 : o.v;
      musicGain.connect(out());
      musicSrc = c.createBufferSource();
      musicSrc.buffer = b;
      musicSrc.loop = o.loop !== false;
      musicSrc.connect(musicGain);
      musicSrc.start();
      musicName = name;
    });
  }

  function stopMusic(fade) {
    musicWant = null;
    if (!musicSrc) { musicName = null; return; }
    const c = ctx(), s = musicSrc, g = musicGain;
    const f = fade || 0;
    if (f > 0) {
      g.gain.setTargetAtTime(0, c.currentTime, f / 4);
      setTimeout(() => { try { s.stop(); } catch (e) { /* already stopped */ } }, f * 1000 + 50);
    } else { try { s.stop(); } catch (e) { /* already stopped */ } }
    musicSrc = null; musicGain = null; musicName = null;
  }

  // Follow the game: suspend audio while paused, stop music once it's over.
  let lastState = null;
  setInterval(() => {
    const c = ctx();
    if (!c) return;
    decodeAll();
    const a = window.__arcade;
    const st = a ? a.state : null;
    if (st === 'paused' && c.state === 'running') c.suspend();
    else if (st !== 'paused' && c.state === 'suspended' && !document.hidden) c.resume();
    if (st !== lastState && st === 'over') stopMusic(1.2);
    lastState = st;
  }, 100);

  window.Arcade.Audio = { load, play, loop, music, stopMusic, get musicName() { return musicName; }, _bufs: bufs };
})();
