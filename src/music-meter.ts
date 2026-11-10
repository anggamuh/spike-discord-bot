import type {Track} from 'shoukaku';
/** Conservative sampled playback time, not per-member listening time. */
export class PlaybackMeter {
 private samples=new WeakMap<Track,{position:number;at:number;counted:boolean}>();
 reset(track:Track,position:number,at=Date.now()){const old=this.samples.get(track);this.samples.set(track,{position,at,counted:old?.counted??false});}
 sample(track:Track,position:number,paused:boolean,at=Date.now()){
  const old=this.samples.get(track);if(!Number.isFinite(position)||position<0)return {ms:0,plays:0};
  if(!old){this.reset(track,position,at);return {ms:0,plays:0};}
  const elapsed=Math.max(0,at-old.at),delta=position-old.position;
  // Discontinuous positions (seek), duplicate REST snapshots, pauses, and long gaps do not invent listening time.
  const ms=!paused&&delta>0&&delta<=elapsed+2000&&elapsed<=15000?Math.max(0,Math.min(delta,elapsed)):0;
  const plays=ms>0&&!old.counted?1:0;
  this.samples.set(track,{position,at,counted:old.counted||plays===1});return {ms:Math.floor(ms),plays};
 }
}
export function monthKey(at=Date.now()){return new Date(at+7*3600000).toISOString().slice(0,7);}
export function validMonth(month:string){return /^20\d{2}-(0[1-9]|1[0-2])$/.test(month);}
/** Split a sampled interval at WIB month boundaries. */
export function monthParts(end:number,ms:number){const parts:{month:string;ms:number}[]=[];let start=end-ms;while(start<end){const shifted=new Date(start+7*3600000);const boundary=Date.UTC(shifted.getUTCFullYear(),shifted.getUTCMonth()+1,1)-7*3600000;const until=Math.min(end,boundary);parts.push({month:monthKey(start),ms:until-start});start=until;}return parts;}
