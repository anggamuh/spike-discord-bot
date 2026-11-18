// Restored from 14ed01d; ownership remains local to this process. A saved value
// alone cannot prove ownership after a restart while another user edited it.
export type VoiceStatusOptions = {
 put: (channelId: string, status: string | null) => Promise<unknown>;
 canWrite: (guildId: string, channelId: string, clearing: boolean) => boolean;
 onError?: (error: unknown) => void;
 onDebug?: (message: string) => void;
 /** Explicitly authorized initial takeover for this dedicated music voice channel. */
 allowInitialTakeover?: (guildId: string, channelId: string) => boolean;
 enabled?: boolean;
 debounceMs?: number;
 retryMs?: number;
};
type State = {
 guild: string; channel: string; observed?: string | null; managed?: string;
 desired?: string | null; sending?: string | null; revision: number;
 timer?: NodeJS.Timeout; running?: Promise<void>; retryAt: number;
 waiters: Array<() => void>;
 initialTakeoverAvailable: boolean;
};

export function musicVoiceStatus(track: {info: {title: string; author: string}}, paused: boolean) {
 const clean = (s: string) => s.replace(/[\r\n\t]/g, ' ').trim();
 return Array.from(`${paused ? '⏸️ ' : ''}${clean(track.info.title)} — ${clean(track.info.author)}`).slice(0, 500).join('');
}

/** Coalesced, serialized writes per channel; only successful writes are owned. */
export class VoiceStatusManager {
 private states = new Map<string, State>();
 private observations = new Map<string, string | null>();
 private closed = false;
 constructor(private options: VoiceStatusOptions) {}
 hasObservation(channel: string): boolean {
  return this.observations.has(channel);
 }
 observe(channel: string, status: string | null) {
  if (this.options.enabled === false || this.closed) return;
  // Discord may normalize surrounding whitespace on the status we PUT.
  // Compare canonical values so our own gateway acknowledgement is not
  // mistaken for a manual edit, while genuinely different edits stay protected.
  status = status?.trim() ?? null;
  this.observations.set(channel, status);
  const state = this.states.get(channel);
  if (!state) return;
  // Discord can send an empty CHANNEL_INFO snapshot followed by the actual
  // existing status before the first song starts. Do not revoke the one-time
  // startup takeover for that initial snapshot race. Once a bot write succeeds,
  // initialTakeoverAvailable is already consumed and later manual edits remain
  // protected by the managed/observed ownership check below.
  state.observed = status;
  // Gateway acknowledgement can precede the HTTP response.
  if (status !== state.sending && status !== state.managed) {
   state.revision++;
   state.managed = undefined;
  }
  if (state.desired !== undefined) this.schedule(state);
 }
 update(guild: string, channel: string, status: string) {
  return this.request(guild, channel, Array.from(status.trim()).slice(0, 500).join(''));
 }
 clear(guild: string, channel: string) {
  if (!this.states.has(channel)) return Promise.resolve();
  return this.request(guild, channel, null);
 }
 private request(guild: string, channel: string, desired: string | null) {
  if (this.options.enabled === false || this.closed) return Promise.resolve();
  let state = this.states.get(channel);
  if (!state) {
   state = {guild, channel, observed: this.observations.get(channel), revision: 0, retryAt: 0, waiters: [], initialTakeoverAvailable: this.options.allowInitialTakeover !== undefined};
   this.states.set(channel, state);
  }
  state.desired = desired;
  if(state.retryAt > Date.now()){this.schedule(state);return Promise.resolve();}
  const done = new Promise<void>(resolve => state!.waiters.push(resolve));
  this.schedule(state);
  return done;
 }
 private schedule(state: State) {
  if (this.closed || state.timer || state.running) return;
  state.timer = setTimeout(() => {
   state.timer = undefined;
   const waiters=state.waiters.splice(0);
   state.running = this.commit(state).finally(() => {
    state.running = undefined;
    for (const resolve of waiters) resolve();
    if (state.desired !== undefined) this.schedule(state);
   });
  }, Math.max(this.options.debounceMs ?? 100, state.retryAt - Date.now()));
  // Keep normal awaited work alive; background retries must not keep shutdown alive.
  if (state.retryAt > Date.now()) state.timer.unref();
 }
 private async commit(state: State) {
  const desired = state.desired;
  state.desired = undefined;
  if (desired === undefined) return;
  // Unknown initial status is deliberately not assumed empty. CHANNEL_INFO
  // supplies the initial snapshot; a known manual status always wins.
  if (state.observed === undefined) { this.options.onDebug?.('skip: no CHANNEL_INFO observation channel='+state.channel); return; }
  // A restarted bot cannot prove ownership of an existing Discord status.
  // Only an explicitly allowlisted channel may be adopted once per process.
  // Defer the authorization check: request() may run before music starts.
  // Pre-playback gateway snapshots do not consume or revoke the one-time eligibility.
  if (state.initialTakeoverAvailable && desired !== null &&
      this.options.allowInitialTakeover?.(state.guild, state.channel) === true) {
   state.initialTakeoverAvailable = false;
   if (state.managed === undefined && state.observed !== null) {
    state.managed = state.observed;
    this.options.onDebug?.('startup takeover authorized channel='+state.channel);
   }
  }
  if (state.observed !== null && state.observed !== state.managed) { this.options.onDebug?.('skip: manual status preserved channel='+state.channel); return; }
  if (desired === null && state.managed === undefined || desired === state.observed) { this.options.onDebug?.('skip: status unchanged or not owned channel='+state.channel); return; }
  try {
   if (!this.options.canWrite(state.guild, state.channel, desired === null)) {
    throw Object.assign(new Error('Voice status: unsupported channel, disconnected, or missing Set Voice Channel Status / Manage Channels permission.'), {code: 'VOICE_STATUS_UNAVAILABLE'});
   }
   const revision = state.revision;
   state.sending = desired;
   this.options.onDebug?.('PUT status channel='+state.channel+' value='+JSON.stringify(desired));
   await this.options.put(state.channel, desired);
   this.options.onDebug?.('PUT success channel='+state.channel);
   if (revision === state.revision) {
    state.observed = desired;
    state.managed = desired ?? undefined;
    this.observations.set(state.channel, desired);
   }
   state.retryAt = 0;
  } catch (error) {
   this.options.onError?.(error);
   const retry = Number((error as {retry_after?: number})?.retry_after);
   state.retryAt = Date.now() + Math.max(this.options.retryMs ?? 60_000, Number.isFinite(retry) ? retry * 1000 : 0);
   // Retry cleanup even after a music session has ended. Newer desired state wins.
   if(state.desired === undefined) state.desired = desired;
  } finally {
   state.sending = undefined;
  }
 }
 async shutdown() {
  this.closed = true;
  for (const state of this.states.values()) {
   if (state.timer) clearTimeout(state.timer);
   for (const resolve of state.waiters.splice(0)) resolve();
  }
  await Promise.allSettled([...this.states.values()].map(s => s.running));
  this.states.clear(); this.observations.clear();
 }
}
