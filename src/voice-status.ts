export type VoiceStatusOptions={
 put:(channelId:string,status:string|null)=>Promise<unknown>;
 loadOwned:(guildId:string)=>{channelId:string;status:string}|undefined;
 saveOwned:(guildId:string,channelId:string,status:string)=>void;
 clearOwned:(guildId:string)=>void;
 onError?:(error:unknown)=>void;
 debounceMs?:number;
};
type State={channelId:string;observed?:string|null;managed?:string;desired?:string|null;timer?:NodeJS.Timeout;chain:Promise<void>;waiters:Array<()=>void>};

/** Owns only statuses that Manuk has successfully written, independently per guild. */
export class VoiceStatusManager {
 private states=new Map<string,State>();
 private observedByChannel=new Map<string,string|null>();
 constructor(private options:VoiceStatusOptions){}
 observe(channelId:string,status:string|null){
  this.observedByChannel.set(channelId,status);
  for(const [guild,state] of this.states){if(state.channelId!==channelId)continue;state.observed=status;
   if(state.managed!==undefined&&status!==state.managed){state.managed=undefined;state.desired=undefined;this.options.clearOwned(guild);}
  }
 }
 private state(guildId:string,channelId:string){
  let state=this.states.get(guildId);
  if(state&&state.channelId!==channelId){void this.clear(guildId,state.channelId);state=undefined;}
  if(!state){const saved=this.options.loadOwned(guildId),observed=this.observedByChannel.get(channelId);state={channelId,observed:this.observedByChannel.has(channelId)?observed:(saved?.channelId===channelId?saved.status:undefined),managed:saved?.channelId===channelId?saved.status:undefined,chain:Promise.resolve(),waiters:[]};this.states.set(guildId,state);}
  return state;
 }
 async update(guildId:string,channelId:string,status:string,allowed:boolean){
  const state=this.state(guildId,channelId);if(!allowed)return;
  const safe=Array.from(status).slice(0,500).join('');
  if(state.desired===safe||state.managed===safe||state.observed===safe)return;
  state.desired=safe;this.debounce(guildId,state);await new Promise<void>(resolve=>state.waiters.push(resolve));
 }
 async clear(guildId:string,channelId?:string,allowed=true){
  let state=this.states.get(guildId);if(!state){const saved=this.options.loadOwned(guildId);if(!saved||channelId&&saved.channelId!==channelId)return;state=this.state(guildId,saved.channelId);}
  if(channelId&&state.channelId!==channelId)return;
  if(!allowed)return;
  if(state.timer){clearTimeout(state.timer);state.timer=undefined;}
  state.desired=null;this.debounce(guildId,state);await new Promise<void>(resolve=>state.waiters.push(resolve));
 }
 private debounce(guildId:string,state:State){
  if(state.timer)clearTimeout(state.timer);
  state.timer=setTimeout(()=>{state.timer=undefined;const waiters=state.waiters.splice(0);state.chain=state.chain.then(()=>this.commit(guildId,state)).catch(error=>this.options.onError?.(error)).finally(()=>{for(const resolve of waiters)resolve();});},this.options.debounceMs??250).unref();
 }
 private async commit(guildId:string,state:State){
  const desired=state.desired;if(desired===undefined)return;
  const managed=state.managed;
  // A status observed from another actor wins. Never clear or replace it.
  if(state.observed!==undefined&&state.observed!==null&&state.observed!==managed){this.options.clearOwned(guildId);state.managed=undefined;return;}
  if(desired===null){if(managed===undefined||state.observed!==undefined&&state.observed!==managed)return;await this.options.put(state.channelId,null);state.observed=null;state.managed=undefined;this.options.clearOwned(guildId);return;}
  if(state.observed===desired)return;
  const observedBefore=state.observed;await this.options.put(state.channelId,desired);
  if(state.observed!==observedBefore&&state.observed!==desired){state.managed=undefined;this.options.clearOwned(guildId);return;}
  state.observed=desired;state.managed=desired;this.options.saveOwned(guildId,state.channelId,desired);
 }
}
