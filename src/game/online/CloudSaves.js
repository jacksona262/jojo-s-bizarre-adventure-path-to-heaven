import { base44 } from '@/api/base44Client';
import { Save } from '../state/Save';
import { ui } from '../core/Store';

// Per-account cloud saves layered over the local saves.
//
// Every save is written locally first (with the previous one kept as a backup), then uploaded to
// the player's own CloudSave record for that slot. Row-level security means a record can only be
// read or written by the account that created it.
//
// Each slot carries a revision number. Before uploading, the remote revision is checked: if
// another device has saved that slot since this device last synced, nothing is overwritten - the
// other copy is kept aside as a "conflict" and the Load screen asks which to keep. On sign-in the
// cloud copies are pulled the same way. Failed uploads stay queued and retry when the connection
// returns; the local save is always there.

const DEVICE = (() => {
  try {
    let d = localStorage.getItem('pth.device');
    if (!d) { d = Math.random().toString(36).slice(2, 12); localStorage.setItem('pth.device', d); }
    return d;
  } catch { return 'device'; }
})();
const store = () => base44.entities.CloudSave;
const metaKey = (slot) => `meta.${slot}`;

function setStatus(state, msg = '') { ui.set({ cloud: { state, msg, at: Date.now() } }); }

export const CloudSaves = {
  enabled: false,
  pending: new Set(),
  conflicts: {},          // slot -> { data, saved_at, chapter, rev, id }
  _t: null,
  _busy: false,

  enable(on) {
    this.enabled = !!on;
    Save.onSaved = on ? (slot) => this.queue(slot) : null;
  },

  // newest record per slot (duplicates from a race are ignored, never deleted)
  async _remote() {
    const rows = (await store().list('-rev', 50)) || [];
    const by = {};
    for (const r of rows) if (!by[r.slot] || (r.rev || 0) > (by[r.slot].rev || 0)) by[r.slot] = r;
    return by;
  },

  async pull() {
    if (!this.enabled) return { conflicts: [] };
    setStatus('syncing', 'Syncing saves…');
    let remote;
    try { remote = await this._remote(); } catch (e) {
      console.warn('[cloud] pull failed', e);
      setStatus('error', 'Could not reach cloud saves. Playing from this device; will sync later.');
      return { conflicts: [], error: true };
    }
    const conflicts = [];
    for (const slot of Save.slots) {
      const c = remote[slot];
      const local = Save.raw(`save.${slot}`);
      const meta = Save.raw(metaKey(slot)) || {};
      if (!c && !local) continue;
      if (!c && local) { this.pending.add(slot); continue; }
      let cd = null;
      try { cd = JSON.parse(c.data); } catch { cd = null; }
      if (!cd) continue;
      if (!local) {
        Save.writeRaw(`save.${slot}`, cd);
        Save.writeRaw(metaKey(slot), { rev: c.rev || 1, syncedAt: cd.savedAt, id: c.id });
        continue;
      }
      if (local.savedAt === cd.savedAt) { Save.writeRaw(metaKey(slot), { rev: c.rev || 1, syncedAt: cd.savedAt, id: c.id }); continue; }
      const localChanged = (local.savedAt || 0) > (meta.syncedAt || 0);
      const cloudChanged = (c.rev || 0) > (meta.rev || 0);
      if (cloudChanged && !localChanged) {
        Save.writeRaw(`save.${slot}.bak`, local);
        Save.writeRaw(`save.${slot}`, cd);
        Save.writeRaw(metaKey(slot), { rev: c.rev, syncedAt: cd.savedAt, id: c.id });
      } else if (localChanged && !cloudChanged) {
        this.pending.add(slot);
      } else if (localChanged && cloudChanged) {
        this.conflicts[slot] = { data: cd, saved_at: cd.savedAt, chapter: c.chapter, rev: c.rev, id: c.id };
        conflicts.push(slot);
      }
    }
    if (this.pending.size) await this.flush();
    else setStatus(conflicts.length ? 'conflict' : 'synced', conflicts.length ? 'A save differs between devices: choose which to keep in Load Game.' : 'Saves synced.');
    return { conflicts };
  },

  queue(slot) {
    if (!this.enabled) return;
    this.pending.add(slot);
    setStatus('pending', 'Saving to cloud…');
    clearTimeout(this._t);
    this._t = setTimeout(() => this.flush(), 1200);
  },

  async flush() {
    if (!this.enabled || this._busy) return;
    this._busy = true;
    clearTimeout(this._t);
    const slots = [...this.pending];
    let failed = false;
    for (const slot of slots) {
      try {
        const r = await this._push(slot);
        if (r !== 'retry') this.pending.delete(slot);
      } catch (e) {
        console.warn('[cloud] upload failed', slot, e);
        failed = true;
      }
    }
    this._busy = false;
    if (failed) {
      setStatus('error', 'Cloud save failed. Your progress is saved on this device and will upload when the connection returns.');
      this._t = setTimeout(() => this.flush(), 20000);
    } else if (Object.keys(this.conflicts).length) setStatus('conflict', 'A save differs between devices: choose which to keep in Load Game.');
    else if (slots.length) setStatus('saved', 'Saved to cloud.');
  },

  async _push(slot, { force = false } = {}) {
    const local = Save.raw(`save.${slot}`);
    if (!local) return 'none';
    const meta = Save.raw(metaKey(slot)) || {};
    const rows = (await store().filter({ slot }, '-rev', 5)) || [];
    const c = rows[0] || null;
    if (c && !force && (c.rev || 0) > (meta.rev || 0)) {
      let cd = null; try { cd = JSON.parse(c.data); } catch { /* unreadable */ }
      if (cd && cd.savedAt !== local.savedAt) {
        this.conflicts[slot] = { data: cd, saved_at: cd.savedAt, chapter: c.chapter, rev: c.rev, id: c.id };
        return 'conflict';
      }
    }
    const rev = (c?.rev || 0) + 1;
    const body = {
      slot, data: JSON.stringify(local), rev, saved_at: local.savedAt || Date.now(), chapter: local.chapterName || '',
      step: local.step || 0, playtime_ms: Math.round((local.totalMs || (local.playtime || 0) * 1000)), story_ms: Math.round(local.run?.storyMs || 0), device: DEVICE, version: local.version || 1,
    };
    const rec = c ? await store().update(c.id, body) : await store().create(body);
    Save.writeRaw(metaKey(slot), { rev, syncedAt: local.savedAt, id: rec?.id || c?.id });
    delete this.conflicts[slot];
    return 'ok';
  },

  // resolve a conflict from the Load screen (the player chose)
  async useCloud(slot) {
    const cf = this.conflicts[slot];
    if (!cf) return;
    const local = Save.raw(`save.${slot}`);
    if (local) Save.writeRaw(`save.${slot}.bak`, local);
    Save.writeRaw(`save.${slot}`, cf.data);
    Save.writeRaw(metaKey(slot), { rev: cf.rev, syncedAt: cf.data.savedAt, id: cf.id });
    delete this.conflicts[slot];
    setStatus('synced', 'Cloud copy restored. The replaced copy was kept as a backup.');
  },
  async keepLocal(slot) {
    if (!this.conflicts[slot]) return;
    try { await this._push(slot, { force: true }); setStatus('saved', 'This device\'s save was uploaded.'); } catch { setStatus('error', 'Upload failed; try again shortly.'); }
  },

  // copy a signed-out journey into the account (empty slots only; nothing is overwritten)
  importGuest(guest) {
    let n = 0;
    const taken = new Set(Save.slots.filter((s) => Save.raw(`save.${s}`)));
    for (const { slot, data } of guest) {
      let target = slot;
      if (taken.has(target)) target = Save.slots.find((s) => s !== 'auto' && !taken.has(s));
      if (!target) break;
      Save.writeRaw(`save.${target}`, { ...data, savedAt: data.savedAt || Date.now() });
      taken.add(target);
      this.queue(target);
      n += 1;
    }
    return n;
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (CloudSaves.pending.size) CloudSaves.flush(); });
}
