/* A compact Z-machine version 3 interpreter (enough for Infocom's Zork I).
   Written from the Z-Machine Standards Document 1.1.
   Usage:
     const zm = new ZMachine(bytes, { print, readLine, status, save, restore, quit });
     zm.run();                    // runs until the game asks for input
     zm.input('open mailbox');    // feeds a line and keeps running        */
(function () {
  'use strict';

  const A0 = 'abcdefghijklmnopqrstuvwxyz';
  const A1 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const A2 = '*\n0123456789.,!?_#\'"/\\-:()';
  const s16 = v => (v << 16) >> 16;

  class ZMachine {
    constructor(story, io) {
      this.story = story;
      this.io = io;
      this.reset();
    }

    reset() {
      this.mem = new Uint8Array(this.story);
      const m = this.mem;
      if (m[0] !== 3) throw new Error('Only version 3 story files are supported (this one is v' + m[0] + ')');
      this.pc = this.rw(0x06);
      this.dict = this.rw(0x08);
      this.objTab = this.rw(0x0A);
      this.globals = this.rw(0x0C);
      this.staticMem = this.rw(0x0E);
      this.abbrevs = this.rw(0x18);
      // flags 1: status line available, no split screen, variable-pitch font off
      m[0x01] &= ~0x10; m[0x01] &= ~0x20;
      this.stack = [];
      this.frames = [{ ret: 0, store: -1, locals: [], sp: 0 }];
      this.waiting = null;       // pending sread operands
      this.halted = false;
      this.streams3 = [];        // output_stream 3 table addresses
      this.seed = 0;
      this.readSeps();
    }

    // ---------- memory ----------
    rw(a) { return (this.mem[a] << 8) | this.mem[a + 1]; }
    ww(a, v) { this.mem[a] = (v >> 8) & 0xff; this.mem[a + 1] = v & 0xff; }

    // ---------- variables ----------
    get frame() { return this.frames[this.frames.length - 1]; }
    getVar(v) {
      if (v === 0) { if (!this.stack.length) throw new Error('Stack underflow'); return this.stack.pop(); }
      if (v < 16) return this.frame.locals[v - 1];
      return this.rw(this.globals + 2 * (v - 16));
    }
    setVar(v, val) {
      val &= 0xffff;
      if (v === 0) this.stack.push(val);
      else if (v < 16) this.frame.locals[v - 1] = val;
      else this.ww(this.globals + 2 * (v - 16), val);
    }
    // "indirect" variable references read/write the stack top in place
    readInd(v) { return v === 0 ? this.stack[this.stack.length - 1] : this.getVar(v); }
    writeInd(v, val) { if (v === 0) this.stack[this.stack.length - 1] = val & 0xffff; else this.setVar(v, val); }

    // ---------- instruction helpers ----------
    store(val) { this.setVar(this.mem[this.pc++], val); }
    branch(cond) {
      const b = this.mem[this.pc++];
      let off;
      if (b & 0x40) off = b & 0x3f;
      else { off = ((b & 0x3f) << 8) | this.mem[this.pc++]; if (off & 0x2000) off -= 0x4000; }
      if (!!cond === !!(b & 0x80)) {
        if (off === 0) this.ret(0);
        else if (off === 1) this.ret(1);
        else this.pc += off - 2;
      }
    }
    call(addr, args, storeVar) {
      if (addr === 0) { if (storeVar >= 0) this.setVar(storeVar, 0); return; }
      const frame = { ret: this.pc, store: storeVar, locals: [], sp: this.stack.length };
      let p = addr * 2;
      const n = this.mem[p++];
      for (let i = 0; i < n; i++) { frame.locals.push(this.rw(p)); p += 2; }
      for (let i = 0; i < args.length && i < n; i++) frame.locals[i] = args[i];
      this.frames.push(frame);
      this.pc = p;
    }
    ret(val) {
      const f = this.frames.pop();
      this.stack.length = f.sp;
      this.pc = f.ret;
      if (f.store >= 0) this.setVar(f.store, val);
    }

    // ---------- text ----------
    decode(addr, maxWords) {
      const out = [];
      let alpha = 0, shift = -1, abbr = -1, esc = -1, escHi = 0;
      let a = addr, words = 0;
      for (;;) {
        const w = this.rw(a); a += 2; words++;
        for (const z of [(w >> 10) & 31, (w >> 5) & 31, w & 31]) {
          if (esc >= 0) {
            if (esc === 0) { escHi = z; esc = 1; } else { out.push(this.zscii(escHi << 5 | z)); esc = -1; }
            continue;
          }
          if (abbr >= 0) {
            const ea = this.rw(this.abbrevs + 2 * (32 * abbr + z)) * 2;
            out.push(this.decode(ea)[0]);
            abbr = -1; continue;
          }
          const al = shift >= 0 ? shift : alpha;
          shift = -1;
          if (z === 0) out.push(' ');
          else if (z <= 3) abbr = z - 1;
          else if (z === 4) shift = 1;
          else if (z === 5) shift = 2;
          else if (al === 2 && z === 6) esc = 0;
          else out.push(al === 0 ? A0[z - 6] : al === 1 ? A1[z - 6] : A2[z - 6]);
        }
        if (w & 0x8000 || (maxWords && words >= maxWords)) break;
      }
      return [out.join(''), a];
    }
    zscii(c) {
      if (c === 13) return '\n';
      if (c >= 32 && c <= 126) return String.fromCharCode(c);
      if (c >= 155 && c <= 223) return 'äöüÄÖÜß»«ëïÿËÏáéíóúýÁÉÍÓÚÝàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛåÅøØãñõÃÑÕæÆçÇþðÞÐ£œŒ¡¿'[c - 155] || '?';
      return '';
    }
    print(s) {
      if (!s) return;
      if (this.streams3.length) {
        const t = this.streams3[this.streams3.length - 1];
        for (const ch of s) { const code = ch === '\n' ? 13 : ch.charCodeAt(0); this.mem[t.addr + 2 + t.n++] = code & 0xff; }
        return;
      }
      if (this.window === 1) return;   // upper window text isn't shown in this simple UI
      this.io.print(s);
    }

    // encode a word to the 2-word (6 z-char) dictionary form
    encode(word) {
      const zs = [];
      for (const ch of word.toLowerCase()) {
        let i = A0.indexOf(ch);
        if (i >= 0) { zs.push(i + 6); continue; }
        i = A2.indexOf(ch);
        if (i >= 2) { zs.push(5, i + 6); continue; }
        const c = ch.charCodeAt(0);
        zs.push(5, 6, (c >> 5) & 31, c & 31);
      }
      while (zs.length < 6) zs.push(5);
      zs.length = 6;
      return [(zs[0] << 10) | (zs[1] << 5) | zs[2], 0x8000 | (zs[3] << 10) | (zs[4] << 5) | zs[5]];
    }
    readSeps() {
      const n = this.mem[this.dict];
      this.seps = [];
      for (let i = 0; i < n; i++) this.seps.push(String.fromCharCode(this.mem[this.dict + 1 + i]));
      this.entryLen = this.mem[this.dict + 1 + n];
      this.entryCount = s16(this.rw(this.dict + 2 + n));
      this.entries = this.dict + 4 + n;
    }
    lookup(word) {
      const [w1, w2] = this.encode(word);
      let lo = 0, hi = Math.abs(this.entryCount) - 1;
      if (this.entryCount < 0) {   // unsorted: linear scan
        for (let i = 0; i <= hi; i++) {
          const a = this.entries + i * this.entryLen;
          if (this.rw(a) === w1 && this.rw(a + 2) === w2) return a;
        }
        return 0;
      }
      while (lo <= hi) {
        const mid = (lo + hi) >> 1, a = this.entries + mid * this.entryLen;
        const v1 = this.rw(a), v2 = this.rw(a + 2);
        if (v1 === w1 && v2 === w2) return a;
        if (v1 < w1 || (v1 === w1 && v2 < w2)) lo = mid + 1; else hi = mid - 1;
      }
      return 0;
    }

    // ---------- objects ----------
    objAddr(o) { return this.objTab + 62 + (o - 1) * 9; }
    parent(o) { return this.mem[this.objAddr(o) + 4]; }
    sibling(o) { return this.mem[this.objAddr(o) + 5]; }
    child(o) { return this.mem[this.objAddr(o) + 6]; }
    setParent(o, v) { this.mem[this.objAddr(o) + 4] = v; }
    setSibling(o, v) { this.mem[this.objAddr(o) + 5] = v; }
    setChild(o, v) { this.mem[this.objAddr(o) + 6] = v; }
    propTable(o) { return this.rw(this.objAddr(o) + 7); }
    objName(o) {
      if (!o) return '';
      const p = this.propTable(o);
      return this.mem[p] ? this.decode(p + 1)[0] : '';
    }
    attr(o, a) { return (this.mem[this.objAddr(o) + (a >> 3)] >> (7 - (a & 7))) & 1; }
    setAttr(o, a, on) {
      const addr = this.objAddr(o) + (a >> 3), bit = 0x80 >> (a & 7);
      if (on) this.mem[addr] |= bit; else this.mem[addr] &= ~bit;
    }
    removeObj(o) {
      const p = this.parent(o);
      if (!p) return;
      if (this.child(p) === o) this.setChild(p, this.sibling(o));
      else {
        let s = this.child(p);
        while (s && this.sibling(s) !== o) s = this.sibling(s);
        if (s) this.setSibling(s, this.sibling(o));
      }
      this.setParent(o, 0); this.setSibling(o, 0);
    }
    insertObj(o, d) {
      this.removeObj(o);
      this.setSibling(o, this.child(d));
      this.setChild(d, o);
      this.setParent(o, d);
    }
    firstProp(o) { const p = this.propTable(o); return p + 1 + 2 * this.mem[p]; }
    findProp(o, prop) {
      let a = this.firstProp(o);
      for (;;) {
        const sb = this.mem[a];
        if (!sb) return 0;
        const num = sb & 31, size = (sb >> 5) + 1;
        if (num === prop) return a;
        if (num < prop) return 0;
        a += 1 + size;
      }
    }
    getProp(o, prop) {
      const a = this.findProp(o, prop);
      if (!a) return this.rw(this.objTab + 2 * (prop - 1));
      const size = (this.mem[a] >> 5) + 1;
      return size === 1 ? this.mem[a + 1] : this.rw(a + 1);
    }

    // ---------- save / restore ----------
    snapshot() {
      return {
        v: 1,
        dyn: Array.from(this.mem.subarray(0, this.staticMem)),
        stack: this.stack.slice(),
        frames: this.frames.map(f => ({ ret: f.ret, store: f.store, locals: f.locals.slice(), sp: f.sp })),
        pc: this.pc,
      };
    }
    load(s) {
      const flags2 = this.rw(0x10);
      this.mem.set(s.dyn, 0);
      this.ww(0x10, (this.rw(0x10) & ~3) | (flags2 & 3));
      this.stack = s.stack.slice();
      this.frames = s.frames.map(f => ({ ret: f.ret, store: f.store, locals: f.locals.slice(), sp: f.sp }));
      this.pc = s.pc;
    }

    statusLine() {
      const loc = this.objName(this.getVarPeek(16));
      const a = s16(this.getVarPeek(17)), b = this.getVarPeek(18);
      const timeGame = this.mem[1] & 0x02;
      const right = timeGame ? (a % 12 || 12) + ':' + String(b).padStart(2, '0') + (a < 12 ? ' AM' : ' PM') : 'Score: ' + a + '   Moves: ' + b;
      this.io.status && this.io.status(loc, right);
    }
    getVarPeek(v) { return this.rw(this.globals + 2 * (v - 16)); }

    random(n) {
      n = s16(n);
      if (n <= 0) { this.seed = -n; return 0; }
      if (this.seed) { this.seedState = ((this.seedState || 0) % this.seed) + 1; return this.seedState; }
      return 1 + Math.floor(Math.random() * n);
    }

    // ---------- input ----------
    input(line) {
      if (!this.waiting) return;
      const { text, parse } = this.waiting;
      this.waiting = null;
      const max = Math.max(0, this.mem[text] - 1);
      const s = line.toLowerCase().slice(0, max);
      for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); this.mem[text + 1 + i] = c < 128 ? c : 63; }
      this.mem[text + 1 + s.length] = 0;
      // tokenise
      const words = [];
      let i = 0;
      while (i < s.length) {
        const ch = s[i];
        if (ch === ' ') { i++; continue; }
        if (this.seps.includes(ch)) { words.push([ch, i]); i++; continue; }
        let j = i;
        while (j < s.length && s[j] !== ' ' && !this.seps.includes(s[j])) j++;
        words.push([s.slice(i, j), i]);
        i = j;
      }
      const maxWords = this.mem[parse];
      const n = Math.min(words.length, maxWords);
      this.mem[parse + 1] = n;
      for (let k = 0; k < n; k++) {
        const [w, pos] = words[k];
        const a = parse + 2 + k * 4;
        this.ww(a, this.lookup(w));
        this.mem[a + 2] = w.length;
        this.mem[a + 3] = pos + 1;
      }
      this.run();
    }

    // ---------- main loop ----------
    run() {
      try {
        let n = 0;
        while (!this.waiting && !this.halted) {
          this.step();
          if (++n > 2000000) throw new Error('Runaway execution');
        }
      } catch (e) {
        this.halted = true;
        this.io.print('\n\n[Interpreter error: ' + e.message + ' at pc ' + this.pc.toString(16) + ']\n');
        if (window.console) console.error(e);
      }
    }

    step() {
      const m = this.mem;
      const start = this.pc;
      const op = m[this.pc++];
      let form, count, num;
      const ops = [];
      const readOperand = t => {
        if (t === 0) { const v = this.rw(this.pc); this.pc += 2; return v; }
        if (t === 1) return m[this.pc++];
        return this.getVar(m[this.pc++]);
      };
      if (op < 0x80) {
        form = 'long'; count = 2; num = op & 0x1f;
        ops.push(readOperand(op & 0x40 ? 2 : 1));
        ops.push(readOperand(op & 0x20 ? 2 : 1));
      } else if (op < 0xc0) {
        const t = (op >> 4) & 3;
        num = op & 0x0f;
        if (t === 3) count = 0; else { count = 1; ops.push(readOperand(t)); }
      } else {
        count = op < 0xe0 ? 2 : -1;   // -1 = VAR
        num = op & 0x1f;
        const types = m[this.pc++];
        const ts = [(types >> 6) & 3, (types >> 4) & 3, (types >> 2) & 3, types & 3];
        for (const t of ts) { if (t === 3) break; ops.push(readOperand(t)); }
      }
      const [a, b, c, d] = ops;

      if (count === 2) {
        switch (num) {
          case 1: this.branch(ops.slice(1).some(x => x === a)); return;
          case 2: this.branch(s16(a) < s16(b)); return;
          case 3: this.branch(s16(a) > s16(b)); return;
          case 4: { const v = s16(this.readInd(a)) - 1; this.writeInd(a, v); this.branch(v < s16(b)); return; }
          case 5: { const v = s16(this.readInd(a)) + 1; this.writeInd(a, v); this.branch(v > s16(b)); return; }
          case 6: this.branch(this.parent(a) === b); return;
          case 7: this.branch((a & b) === b); return;
          case 8: this.store(a | b); return;
          case 9: this.store(a & b); return;
          case 10: this.branch(this.attr(a, b)); return;
          case 11: this.setAttr(a, b, true); return;
          case 12: this.setAttr(a, b, false); return;
          case 13: this.writeInd(a, b); return;
          case 14: this.insertObj(a, b); return;
          case 15: this.store(this.rw((a + 2 * s16(b)) & 0xffff)); return;
          case 16: this.store(m[(a + s16(b)) & 0xffff]); return;
          case 17: this.store(this.getProp(a, b)); return;
          case 18: { const p = this.findProp(a, b); this.store(p ? p + 1 : 0); return; }
          case 19: {
            if (b === 0) { this.store(m[this.firstProp(a)] & 31); return; }
            const p = this.findProp(a, b);
            if (!p) { this.store(0); return; }
            this.store(m[p + 1 + ((m[p] >> 5) + 1)] & 31); return;
          }
          case 20: this.store(s16(a) + s16(b)); return;
          case 21: this.store(s16(a) - s16(b)); return;
          case 22: this.store(Math.imul(s16(a), s16(b))); return;
          case 23: if (s16(b) === 0) throw new Error('Division by zero'); this.store(Math.trunc(s16(a) / s16(b))); return;
          case 24: if (s16(b) === 0) throw new Error('Division by zero'); this.store(s16(a) % s16(b)); return;
        }
      } else if (count === 1) {
        switch (num) {
          case 0: this.branch(a === 0); return;
          case 1: { const s = a ? this.sibling(a) : 0; this.store(s); this.branch(s !== 0); return; }
          case 2: { const s = a ? this.child(a) : 0; this.store(s); this.branch(s !== 0); return; }
          case 3: this.store(a ? this.parent(a) : 0); return;
          case 4: this.store(a ? (m[a - 1] >> 5) + 1 : 0); return;
          case 5: this.writeInd(a, s16(this.readInd(a)) + 1); return;
          case 6: this.writeInd(a, s16(this.readInd(a)) - 1); return;
          case 7: this.print(this.decode(a)[0]); return;
          case 9: this.removeObj(a); return;
          case 10: this.print(this.objName(a)); return;
          case 11: this.ret(a); return;
          case 12: this.pc += s16(a) - 2; return;
          case 13: this.print(this.decode(a * 2)[0]); return;
          case 14: this.store(this.readInd(a)); return;
          case 15: this.store(~a); return;
        }
      } else if (count === 0) {
        switch (num) {
          case 0: this.ret(1); return;
          case 1: this.ret(0); return;
          case 2: { const [s, end] = this.decode(this.pc); this.pc = end; this.print(s); return; }
          case 3: { const [s, end] = this.decode(this.pc); this.pc = end; this.print(s + '\n'); this.ret(1); return; }
          case 4: return;
          case 5: {   // save: remember where the branch data is, so restore can resume here
            const snap = this.snapshot();
            const ok = this.io.save ? this.io.save(snap) : false;
            this.branch(ok); return;
          }
          case 6: {
            const snap = this.io.restore ? this.io.restore() : null;
            if (snap) { this.load(snap); this.branch(true); } else this.branch(false);
            return;
          }
          case 7: { const flags2 = this.rw(0x10); this.reset(); this.ww(0x10, (this.rw(0x10) & ~3) | (flags2 & 3)); this.io.restarted && this.io.restarted(); return; }
          case 8: this.ret(this.getVar(0)); return;
          case 9: this.getVar(0); return;
          case 10: this.halted = true; this.io.quit && this.io.quit(); return;
          case 11: this.print('\n'); return;
          case 12: this.statusLine(); return;
          case 13: this.branch(true); return;
        }
      } else {
        switch (num) {
          case 0: { const sv = m[this.pc++]; this.call(a, ops.slice(1), sv); return; }
          case 1: this.ww((a + 2 * s16(b)) & 0xffff, c); return;
          case 2: m[(a + s16(b)) & 0xffff] = c & 0xff; return;
          case 3: {
            const p = this.findProp(a, b);
            if (!p) throw new Error('put_prop: object ' + a + ' has no property ' + b);
            if ((m[p] >> 5) === 0) m[p + 1] = c & 0xff; else this.ww(p + 1, c);
            return;
          }
          case 4: this.statusLine(); this.waiting = { text: a, parse: b }; this.io.readLine && this.io.readLine(); return;
          case 5: this.print(this.zscii(a)); return;
          case 6: this.print(String(s16(a))); return;
          case 7: this.store(this.random(a)); return;
          case 8: this.setVar(0, a); return;
          case 9: { const v = this.getVar(0); this.writeInd(a, v); return; }
          case 10: return;                          // split_window
          case 11: this.window = a; return;         // set_window
          case 19: {                                // output_stream
            const s = s16(a);
            if (s === 3) this.streams3.push({ addr: b, n: 0 });
            else if (s === -3) { const t = this.streams3.pop(); if (t) this.ww(t.addr, t.n); }
            return;
          }
          case 20: return;                          // input_stream
          case 21: return;                          // sound_effect
        }
      }
      throw new Error('Unknown opcode 0x' + op.toString(16) + ' (' + (count < 0 ? 'VAR' : count + 'OP') + ':' + num + ') at 0x' + start.toString(16));
    }
  }

  window.ZMachine = ZMachine;
})();
