import * as THREE from 'three';
import { base44 } from '@/api/base44Client';

// Online Versus networking.
//
// Two players connect peer-to-peer over a WebRTC data channel. The only server involvement is a
// short-lived VersusRoom record used to swap the connection offer/answer (with a 5-letter join
// code); it is deleted as soon as the players are connected, and no game traffic goes through it.
// STUN (public Google servers) lets each browser discover its public address; there is no TURN
// relay, so a few strict networks (some corporate / mobile carriers) cannot connect directly.

export const NET_VERSION = 'pth-net-1';
const ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const rooms = () => base44.entities.VersusRoom;

const randomCode = () => Array.from({ length: 5 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// non-trickle ICE: wait until candidates are gathered so one offer/answer carries everything
function gathered(pc, ms = 3500) {
  return new Promise((res) => {
    if (pc.iceGatheringState === 'complete') { res(); return; }
    const t = setTimeout(res, ms);
    pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
  });
}

export class NetSession {
  constructor(role, name) {
    this.role = role;
    this.name = name;
    this.peerName = '';
    this.pc = new RTCPeerConnection({ iceServers: ICE });
    this.ch = null;
    this.open = false;
    this.closed = false;
    this.handler = null;
    this.queue = [];
    this.lastRecv = 0;
    this.rtt = 0;
    this.onClose = null;
    this.roomId = null;
    this.code = null;
  }

  // ---------------------------------------------------------------- setup
  static async host(name, { onCode, onSession } = {}) {
    const s = new NetSession('host', name);
    onSession?.(s);
    s._bind(s.pc.createDataChannel('pth', { ordered: true }));
    await s.pc.setLocalDescription(await s.pc.createOffer());
    await gathered(s.pc);
    s.code = randomCode();
    const room = await rooms().create({ code: s.code, status: 'open', host_name: name, offer: JSON.stringify(s.pc.localDescription), version: NET_VERSION });
    s.roomId = room.id;
    if (s.closed) { s._dropRoom(); throw new Error('cancelled'); }
    onCode?.(s.code);
    // wait for a guest's answer (realtime push when available, polling as the fallback)
    let unsub = null;
    const answered = new Promise((resolve) => {
      try { unsub = rooms().subscribe((ev) => { const d = ev?.data; if (d && (ev.id === s.roomId || d.id === s.roomId) && d.answer) resolve(d); }); } catch { /* realtime unavailable */ }
      (async () => {
        while (!s.closed && !s.pc.remoteDescription) {
          try { const r = await rooms().get(s.roomId); if (r?.answer) { resolve(r); return; } } catch { /* retry */ }
          await sleep(1200);
        }
      })();
    });
    const r = await answered;
    try { unsub?.(); } catch { /* ignore */ }
    if (s.closed) throw new Error('cancelled');
    s.peerName = r.guest_name || 'Opponent';
    await s.pc.setRemoteDescription(JSON.parse(r.answer));
    await s._waitOpen();
    s._dropRoom();
    return s;
  }

  static async join(code, name) {
    const c = String(code || '').trim().toUpperCase();
    const found = await rooms().filter({ code: c, status: 'open' }, '-created_date', 3);
    const room = (found || []).find((r) => Date.now() - new Date(r.created_date || Date.now()).getTime() < 30 * 60 * 1000) || null;
    if (!room) throw new Error(`No open party with code ${c}.`);
    if (room.version && room.version !== NET_VERSION) throw new Error('That party is on a different game version. Both players should refresh.');
    const s = new NetSession('guest', name);
    s.peerName = room.host_name || 'Host';
    s.roomId = room.id;
    s.code = c;
    s.pc.ondatachannel = (e) => s._bind(e.channel);
    await s.pc.setRemoteDescription(JSON.parse(room.offer));
    await s.pc.setLocalDescription(await s.pc.createAnswer());
    await gathered(s.pc);
    await rooms().update(room.id, { answer: JSON.stringify(s.pc.localDescription), guest_name: name, status: 'full' });
    await s._waitOpen();
    return s;
  }

  _waitOpen(ms = 20000) {
    return new Promise((resolve, reject) => {
      if (this.open) { resolve(); return; }
      const t = setTimeout(() => reject(new Error('Could not connect. One of your networks may block direct connections; try another network (e.g. a phone hotspot).')), ms);
      this._onOpen = () => { clearTimeout(t); resolve(); };
    });
  }

  _bind(ch) {
    this.ch = ch;
    ch.onopen = () => {
      this.open = true;
      this.lastRecv = performance.now();
      this.send({ t: 'hello', name: this.name, v: NET_VERSION });
      this._ping = setInterval(() => {
        this.send({ t: 'ping', at: performance.now() });
        if (performance.now() - this.lastRecv > 7000) this._lost('Connection lost.');
      }, 1000);
      this._onOpen?.();
    };
    ch.onmessage = (e) => {
      this.lastRecv = performance.now();
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'ping') { this.send({ t: 'pong', at: m.at }); return; }
      if (m.t === 'pong') { this.rtt = performance.now() - m.at; return; }
      if (m.t === 'hello') { this.peerName = m.name || this.peerName; this.peerVersion = m.v; }
      if (m.t === 'bye') { this._lost(`${this.peerName || 'Your opponent'} left the party.`); return; }
      if (this.handler) this.handler(m); else this.queue.push(m);
    };
    ch.onclose = () => this._lost('Connection lost.');
    this.pc.onconnectionstatechange = () => { if (['failed', 'closed'].includes(this.pc.connectionState)) this._lost('Connection lost.'); };
  }

  async _dropRoom() {
    if (!this.roomId) return;
    const id = this.roomId; this.roomId = null;
    try { await rooms().delete(id); } catch { try { await rooms().update(id, { status: 'closed', offer: '', answer: '' }); } catch { /* best effort */ } }
  }

  _lost(reason) {
    if (this.closed) return;
    this.close(false);
    this.onClose?.(reason);
  }

  // ---------------------------------------------------------------- traffic
  setHandler(fn) {
    this.handler = fn;
    if (fn) { const q = this.queue; this.queue = []; for (const m of q) fn(m); }
  }

  send(obj) {
    if (!this.open || !this.ch || this.ch.readyState !== 'open') return;
    try { this.ch.send(JSON.stringify(obj)); } catch { /* channel closing */ }
  }

  close(sayBye = true) {
    if (this.closed) return;
    if (sayBye) this.send({ t: 'bye' });
    this.closed = true;
    this.open = false;
    clearInterval(this._ping);
    this._dropRoom();
    setTimeout(() => { try { this.ch?.close(); this.pc.close(); } catch { /* ignore */ } }, 50);
  }
}

// ---------------------------------------------------------------- input replication
// The combat actions a fighter's controller reads. Each frame the local player sends which are
// held and which were newly pressed, plus movement, camera yaw and their own fighter's state.
export const NET_ACTIONS = ['light', 'heavy', 'guard', 'rush', 'knockback', 'timestop', 'stand', 'dodge', 'sprint', 'lock', 'heavenAbility'];

export function encodeFrame(input, cameraYaw, f) {
  let d = 0; let p = 0;
  NET_ACTIONS.forEach((a, i) => { if (input.down(a)) d |= 1 << i; if (input.pressed(a)) p |= 1 << i; });
  const r2 = (v) => Math.round(v * 100) / 100;
  return {
    t: 'in', d, p, mx: r2(input.axes.moveX), my: r2(input.axes.moveY), cy: r2(cameraYaw),
    pos: [r2(f.pos.x), r2(f.pos.y), r2(f.pos.z)], vel: [r2(f.vel.x), r2(f.vel.y), r2(f.vel.z)], yaw: r2(f.yaw),
    en: Math.round(f.energy), st: Math.round(f.stamina), ts: r2(f.tsCharge ?? 0), sd: f.stand?.summoned ? 1 : 0,
  };
}

// Stands in for the keyboard/pad on the remote fighter: same down/pressed/released API as Input.
export class RemoteInput {
  constructor() {
    this.cur = 0; this.prev = 0; this.held = 0; this.pend = 0;
    this.axes = { moveX: 0, moveY: 0, lookX: 0, lookY: 0 };
    this.wheel = 0; this.padAxes = [0, 0, 0, 0]; this.padConnected = false; this.lastDevice = 'kbm';
    this.camYaw = 0;
    this.state = null;
  }

  receive(m) {
    this.held = m.d;
    this.pend |= m.p;
    this.axes.moveX = m.mx; this.axes.moveY = m.my;
    this.camYaw = m.cy;
    this.state = { pos: new THREE.Vector3(...m.pos), vel: new THREE.Vector3(...m.vel), yaw: m.yaw, en: m.en, st: m.st, ts: m.ts, sd: m.sd, at: performance.now() };
  }

  // advance one local frame: presses since the last frame count once, even if already released;
  // a press of a button that was already down is split into a release and a fresh press
  step() {
    this.prev = this.cur;
    let c = this.held | this.pend;
    const re = this.pend & this.prev;
    let carry = 0;
    if (re) { c &= ~re; carry = re; }
    this.cur = c;
    this.pend = carry;
  }

  _bit(a) { const i = NET_ACTIONS.indexOf(a); return i < 0 ? 0 : 1 << i; }
  down(a) { return !!(this.cur & this._bit(a)); }
  pressed(a) { const b = this._bit(a); return !!(this.cur & b) && !(this.prev & b); }
  released(a) { const b = this._bit(a); return !(this.cur & b) && !!(this.prev & b); }

  basis() {
    const y = this.camYaw;
    return { f: new THREE.Vector3(-Math.sin(y), 0, -Math.cos(y)), r: new THREE.Vector3(Math.cos(y), 0, -Math.sin(y)) };
  }
}
