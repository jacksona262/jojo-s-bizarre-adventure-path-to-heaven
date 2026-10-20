import { base44 } from '@/api/base44Client';

// The signed-in player: Base44 authentication (sessions, passwords, OAuth and recovery are all
// handled by the platform; nothing secret is stored by the game) plus a public PlayerProfile that
// holds the unique username, stats, achievements and personal bests.
//
// Ownership is enforced by the database's row-level security (a profile can only be written by
// the account that created it); the game never sends a user id as proof of anything.
// Everything here is event-driven: nothing polls, nothing runs in the render loop.

const RESERVED = ['admin', 'administrator', 'mod', 'moderator', 'staff', 'support', 'system', 'root', 'owner', 'base44', 'official', 'developer', 'dev', 'gm', 'null', 'undefined', 'guest', 'anonymous', 'everyone', 'server'];
// a compact filter for slurs and obvious abuse (checked against the name with separators removed)
const BLOCKED = ['nigg', 'fagg', 'retard', 'rape', 'nazi', 'hitler', 'kkk', 'cunt', 'whore', 'slut', 'pedo', 'molest', 'tranny', 'spic', 'chink', 'kike', 'faggot', 'porn', 'sex', 'fuck', 'shit', 'bitch', 'dick', 'penis', 'vagina'];
const USERNAME_RE = /^[A-Za-z0-9_]{3,20}$/;
const CHANGE_COOLDOWN_MS = 7 * 24 * 3600 * 1000;

const listeners = new Set();
const profiles = () => base44.entities.PlayerProfile;

function emptyStats() {
  return { completions: 0, fastest_ms: null, bosses: [], side_quests: [], lore: [], playtime_ms: 0, deaths: 0, versus_wins: 0, versus_losses: 0, runs: 0, bossrush: 0 };
}

export const Account = {
  user: null,
  profile: null,
  ready: false,
  offline: false,

  on(fn) { listeners.add(fn); return () => listeners.delete(fn); },
  _emit() { for (const fn of listeners) { try { fn(this); } catch (e) { console.error(e); } } },

  get loggedIn() { return !!this.user; },
  get id() { return this.user?.id || null; },
  get username() { return this.profile?.username || null; },
  get needsUsername() { return this.loggedIn && !this.profile; },

  async init() {
    try {
      if (base44.auth.hasToken?.() && await base44.auth.isAuthenticated()) this.user = await base44.auth.me();
    } catch { this.user = null; }
    if (this.user) await this.loadProfile();
    this.ready = true;
    this._emit();
    return this;
  },

  // The platform's own sign-in pages (routed inside this app); they return here afterwards.
  login() { window.location.href = '/login?returnTo=%2F'; },
  register() { window.location.href = '/register?returnTo=%2F'; },
  logout() { base44.auth.logout(`${window.location.origin}/`); },

  async loadProfile() {
    if (!this.user) return null;
    try {
      const rows = await profiles().filter({ created_by_id: this.user.id }, '-created_date', 5);
      this.profile = rows?.[0] || null;
      if (this.profile) {
        this.profile.stats = { ...emptyStats(), ...(this.profile.stats || {}) };
        this.profile.achievements = this.profile.achievements || [];
        this.profile.bests = this.profile.bests || {};
        this.profile.fighter_usage = this.profile.fighter_usage || {};
      }
      this.offline = false;
    } catch (e) {
      console.warn('[account] profile load failed', e);
      this.offline = true;
    }
    return this.profile;
  },

  // ---------------------------------------------------------------- usernames
  validateUsername(name) {
    const n = String(name || '').trim();
    if (!USERNAME_RE.test(n)) return 'Use 3–20 letters, numbers or underscores.';
    const low = n.toLowerCase();
    const bare = low.replace(/[_0-9]/g, '').replace(/1/g, 'i');
    if (RESERVED.includes(low) || RESERVED.some((r) => low.replace(/_/g, '') === r)) return 'That name is reserved.';
    if (BLOCKED.some((b) => bare.includes(b) || low.replace(/_/g, '').includes(b))) return 'Please choose a different name.';
    return null;
  },

  async isAvailable(name) {
    const low = String(name).trim().toLowerCase();
    const rows = await profiles().filter({ username_lower: low }, 'created_date', 5);
    return !(rows || []).some((r) => r.created_by_id !== this.user?.id);
  },

  // Claim (or change) the username. Uniqueness is case-insensitive: availability is checked
  // first, then re-checked after writing; if two players raced for the same name the earlier
  // claim keeps it and the later one is rolled back.
  async claimUsername(name) {
    if (!this.user) throw new Error('Sign in first.');
    const n = String(name).trim();
    const err = this.validateUsername(n);
    if (err) throw new Error(err);
    const low = n.toLowerCase();
    if (this.profile && this.profile.username_lower === low) {
      if (this.profile.username !== n) { this.profile = await profiles().update(this.profile.id, { username: n }); }
      this._emit();
      return this.profile;
    }
    if (this.profile?.username_changed_at && Date.now() - this.profile.username_changed_at < CHANGE_COOLDOWN_MS) {
      const days = Math.ceil((CHANGE_COOLDOWN_MS - (Date.now() - this.profile.username_changed_at)) / 86400000);
      throw new Error(`You can change your username again in ${days} day${days === 1 ? '' : 's'}.`);
    }
    if (!(await this.isAvailable(n))) throw new Error('That username is taken.');
    const prev = this.profile ? { username: this.profile.username, username_lower: this.profile.username_lower } : null;
    const patch = { username: n, username_lower: low, username_changed_at: Date.now() };
    const rec = this.profile
      ? await profiles().update(this.profile.id, patch)
      : await profiles().create({ ...patch, stats: emptyStats(), achievements: [], bests: {}, fighter_usage: {} });
    // race check
    const holders = (await profiles().filter({ username_lower: low }, 'created_date', 10)) || [];
    const others = holders.filter((r) => r.id !== rec.id);
    const lostRace = others.some((r) => new Date(r.updated_date || r.created_date) < new Date(rec.updated_date || rec.created_date));
    if (lostRace) {
      if (prev) await profiles().update(rec.id, prev);
      else await profiles().delete(rec.id);
      if (!prev) this.profile = null;
      throw new Error('That username was just taken. Try another.');
    }
    await this.loadProfile();
    this._emit();
    return this.profile;
  },

  // ---------------------------------------------------------------- stats / achievements / bests
  _pending: null,
  _flushT: null,
  // merge a change into the profile now and write it to the server shortly (batched)
  updateProfile(mutator) {
    if (!this.profile) return;
    mutator(this.profile);
    this._emit();
    clearTimeout(this._flushT);
    this._flushT = setTimeout(() => this.flush(), 1500);
  },
  async flush() {
    clearTimeout(this._flushT);
    if (!this.profile?.id) return;
    const { stats, achievements, bests, fighter_usage: fu } = this.profile;
    try {
      await profiles().update(this.profile.id, { stats, achievements, bests, fighter_usage: fu });
      this.offline = false;
    } catch (e) {
      console.warn('[account] profile save failed; will retry', e);
      this.offline = true;
      this._flushT = setTimeout(() => this.flush(), 15000);
    }
  },

  // personal best: lower time wins; returns true when it is a new best
  recordBest(key, ms, extra = {}) {
    if (!this.profile) return false;
    const cur = this.profile.bests[key];
    if (cur && cur.ms <= ms) return false;
    this.updateProfile((p) => { p.bests[key] = { ms, at: Date.now(), ...extra }; });
    return true;
  },
};

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (Account.offline) Account.flush(); });
  window.addEventListener('pagehide', () => { if (Account._flushT) Account.flush(); });
}
