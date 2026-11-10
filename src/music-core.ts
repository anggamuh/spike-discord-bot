import {fairOrder} from './music-options.js';
import {reportMusicError} from './music-diagnostics.js';
import {LoadType,type LavalinkResponse,type Track} from 'shoukaku';
export class MusicError extends Error {}
export function identifier(query:string,source:string){
 const q=query.trim();if(!q||q.length>500)throw new MusicError('Judul/link harus berisi 1–500 karakter.');
 if(/^https?:\/\//i.test(q)){
  const url=new URL(q);
  const hosts=['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','soundcloud.com','www.soundcloud.com','open.spotify.com'];
  if(url.protocol!=='https:'||url.username||url.password||url.port||!hosts.includes(url.hostname))throw new MusicError('Gunakan link HTTPS YouTube, SoundCloud, atau open.spotify.com (playlist/album/track), atau ketik judul lagu.');
  if(url.hostname==='open.spotify.com'){
   const path=url.pathname.replace(/^\/intl-[a-z]{2}(?=\/)/i,'');
   if(!/^\/(playlist|album|track)\/[A-Za-z0-9]{22}\/?$/.test(path))throw new MusicError('Gunakan link Spotify playlist, album, atau track lengkap dari open.spotify.com.');
   url.pathname=path;url.search='';url.hash='';
  }
  return url.toString();
 }
 if(q.includes('://')||/^[a-z]+:/i.test(q))throw new MusicError('Sumber ini tidak didukung. Gunakan judul lagu atau link YouTube/SoundCloud.');
 return `${source==='soundcloud'?'scsearch':source==='bandcamp'?'bcsearch':'ytmsearch'}:${q}`;
}
export function tracksFrom(result:LavalinkResponse|null|undefined,source='unknown',allSearch=false){
 if(!result||result.loadType===LoadType.EMPTY)throw new MusicError('Lagu tidak ditemukan. Coba judul lain atau sumber SoundCloud.');
 if(result.loadType===LoadType.ERROR)throw new MusicError(reportMusicError('LOAD '+source,result.data));
 const rows=result.loadType===LoadType.TRACK?[result.data]:result.loadType===LoadType.SEARCH?(allSearch?result.data:result.data.slice(0,1)):result.data.tracks;
 if(!rows.length)throw new MusicError('Playlist/hasil pencarian kosong.');return rows;
}
export class Serial {
 private tails=new Map<string,Promise<unknown>>();
 async run<T>(key:string,fn:()=>Promise<T>):Promise<T>{
  const task=(this.tails.get(key)??Promise.resolve()).catch(()=>{}).then(fn);this.tails.set(key,task);
  try{return await task;}finally{if(this.tails.get(key)===task)this.tails.delete(key);}
 }
}
export interface AudioPlayer {playTrack(options:{track:{encoded:string}}):Promise<unknown>;stopTrack():Promise<unknown>;setPaused(value:boolean):Promise<unknown>;seekTo?(position:number):Promise<unknown>}
export class MusicSession {
 queue:Track[]=[];current?:Track;lastError='';closed=false;paused=false;loop:'off'|'song'|'queue'='off';autoplay=false;autoplayStyle:'artist'|'mix'='artist';fair=false;stay=false;
 private requestedAt=0;private lastAdvanceAt=0;private maxPosition=0;private startTimer?:NodeJS.Timeout;started=false;progressed=false;
 get position(){return this.maxPosition;}
 private clearStartTimer(){if(this.startTimer)clearTimeout(this.startTimer);this.startTimer=undefined;}
 private armStartTimer(encoded:string){this.clearStartTimer();if(!this.onStartTimeout||this.progressed||this.current?.encoded!==encoded)return;this.startTimer=setTimeout(()=>this.onStartTimeout?.(encoded),20000).unref();}
 private begin(track:Track){this.clearStartTimer();this.current=track;this.lastError='';this.requestedAt=this.clock();this.lastAdvanceAt=this.clock();this.maxPosition=0;this.started=false;this.progressed=false;this.paused=false;}
 async setPaused(value:boolean){await this.player.setPaused(value);this.paused=value;this.lastAdvanceAt=this.clock();}
 start(encoded:string){if(this.current?.encoded===encoded)this.started=true;}
 progress(position:number){if(!this.current||!this.started||!Number.isFinite(position))return false;const first=!this.progressed&&position>0;if(position>this.maxPosition)this.lastAdvanceAt=this.clock();this.maxPosition=Math.max(this.maxPosition,position);if(position>0){this.progressed=true;this.lastError='';this.clearStartTimer();}return first;}
 // Only a real playback position near the reported end can trigger this guard.
 endIsStalled(){
  const info=this.current?.info;
  if(!info||info.isStream||!Number.isFinite(info.length)||info.length<=0||this.closed||this.paused||!this.progressed)return false;
  const remaining=info.length-this.maxPosition;
  const nearEnd=remaining<=Math.min(5000,info.length*0.05);
  return nearEnd&&(this.clock()-this.lastAdvanceAt>=15000||remaining<=-15000);
 }
 constructor(public player:AudioPlayer,public channelId:string,private fallback?:(track:Track)=>Promise<Track|undefined>,private clock:()=>number=Date.now,private prepare?:(track:Track)=>Promise<Track>,private onStartTimeout?:(encoded:string)=>void){}
 private async recover(track:Track){
  if(!this.fallback||!['youtube','soundcloud'].includes(track.info.sourceName)||this.closed)return false;
  let candidate=track;
  for(let attempt=0;attempt<8&&!this.closed;attempt++){
   try{
    const replacement=await this.fallback(candidate);if(!replacement)return false;
    console.log(`[MUSIC FALLBACK CANDIDATE] source=${replacement.info.sourceName} title=${replacement.info.title.slice(0,100)}`);
    replacement.pluginInfo={...(replacement.pluginInfo as Record<string,unknown>),requester:(track.pluginInfo as any)?.requester};this.begin(replacement);this.lastError=`Mencoba hasil terdekat dari ${replacement.info.sourceName}; versi lagu bisa berbeda.`;
    console.log(`[MUSIC PLAYBACK ATTEMPT] source=${replacement.info.sourceName} title=${replacement.info.title.slice(0,100)}`);
    await this.player.setPaused(false);await this.player.playTrack({track:{encoded:replacement.encoded}});this.armStartTimer(replacement.encoded);return true;
   }catch(error){this.lastError=reportMusicError('FALLBACK PLAYBACK',error);candidate=this.current??candidate;}
  }
  return false;
 }
 async failed(encoded?:string){
  if(this.closed||!this.current||!encoded||encoded!==this.current.encoded)return;
  this.clearStartTimer();
  if(await this.recover(this.current))return;
  await this.next();
 }
 add(rows:Track[]){const count=Math.min(rows.length,100-this.queue.length-(this.current?1:0));if(count<=0)throw new MusicError('Antrean penuh (maksimal 100 lagu termasuk yang diputar).');this.queue.push(...rows.slice(0,count));this.rebalance();return count;}
 rebalance(){if(this.fair)this.queue=fairOrder(this.queue,this.current);}
 addNext(rows:Track[]){const count=this.add(rows.map(t=>({...t,pluginInfo:{...(t.pluginInfo as Record<string,unknown>),playNext:true}})));const added=this.queue.filter(t=>(t.pluginInfo as any)?.playNext);this.queue=[...added,...this.queue.filter(t=>!(t.pluginInfo as any)?.playNext)];return count;}
 async seek(position:number){const t=this.current;if(!t)throw new MusicError('Tidak ada lagu aktif.');if(t.info.isStream||!t.info.isSeekable||!this.player.seekTo)throw new MusicError('Sumber ini tidak mendukung seek.');if(!Number.isFinite(position)||position<0||position>=t.info.length)throw new MusicError('Posisi harus sebelum akhir lagu.');await this.player.seekTo(position);this.maxPosition=position;t.info.position=position;this.lastAdvanceAt=this.clock();}
 shuffle(){for(let i=this.queue.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[this.queue[i],this.queue[j]]=[this.queue[j]!,this.queue[i]!];}return this.queue.length;}
 async next(){
  this.clearStartTimer();this.current=undefined;let failures=0;
  while(!this.closed&&this.queue.length){
   let track=this.queue.shift()!;track={...track,pluginInfo:{...(track.pluginInfo as Record<string,unknown>),playNext:false}};this.begin(track);
   try{if(this.prepare){track=await this.prepare(track);if(this.closed)return;this.begin(track);}console.log(`[MUSIC PLAYBACK ATTEMPT] source=${track.info.sourceName} title=${track.info.title.slice(0,100)}`);await this.player.setPaused(false);await this.player.playTrack({track:{encoded:track.encoded}});this.armStartTimer(track.encoded);return;}catch(error){this.lastError=reportMusicError('PLAYBACK ERROR',error);if(await this.recover(track))return;this.current=undefined;failures++;}
  }
  if(!this.current&&failures)console.error(`[MUSIC QUEUE] ${failures} track playback request(s) failed; queue advanced after exhausting available tracks.`);
 }
 async end(reason:string,encoded?:string){
  if(this.closed||!this.current||(encoded&&encoded!==this.current.encoded))return;
  this.clearStartTimer();
  const track=this.current,elapsed=this.clock()-this.requestedAt;
  console.log(`[MUSIC END] source=${track.info.sourceName} reason=${reason} started=${this.started} progressed=${this.progressed} elapsedMs=${elapsed} positionMs=${this.maxPosition}`);
  if(reason==='loadFailed'){
   if(!this.lastError)this.lastError='Sumber gagal memutar lagu; mencoba cadangan.';
   await this.failed(track.encoded);return;
  }
  if(reason==='finished'){
   if(!this.progressed){
    console.error(`[MUSIC PLAYBACK ERROR] track ended without positive position progress; source=${track.info.sourceName}`);
    this.lastError='Lavalink mengakhiri track tanpa progres audio; mencoba sumber cadangan.';
    await this.failed(track.encoded);return;
   }
   if(this.loop==='song'){await this.playAgain(track);return;}
   if(this.loop==='queue')this.queue.push({...track,info:{...track.info,position:0}});
   this.lastError='Lagu selesai menurut Lavalink. Antrean berikutnya dilanjutkan jika tersedia.';
   await this.next();return;
  }
 }
 private async playAgain(track:Track){this.begin({...track,info:{...track.info,position:0}});await this.player.setPaused(false);await this.player.playTrack({track:{encoded:track.encoded}});this.armStartTimer(track.encoded);}
 async skip(){if(!this.current)throw new MusicError('Tidak ada lagu yang sedang diputar.');await this.player.stopTrack();await this.next();}
 async stop(){this.clearStartTimer();this.closed=true;this.queue=[];this.current=undefined;await this.player.stopTrack();}
}
export function duration(ms:number,live=false){if(live)return 'LIVE';const sec=Math.floor(ms/1000);return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}
