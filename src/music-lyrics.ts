import type {Track} from 'shoukaku';
import {MusicError} from './music-core.js';
export function lyricPages(text:string,size=1700){
 const pages:string[]=[];let page='';
 for(const line of text.replace(/\r/g,'').split('\n')){
  for(let offset=0;offset<Math.max(1,line.length);offset+=size){
   const piece=line.slice(offset,offset+size);
   if(page.length+piece.length+1>size){pages.push(page);page='';}
   page+=(page?'\n':'')+piece;
  }
 }
 if(page)pages.push(page);return pages.length?pages:['Lirik belum tersedia.'];
}
export class Lyrics {
 private cache=new Map<string,{until:number;value:string}>();
 private pending=new Map<string,Promise<string>>();
 constructor(private appId:()=>string,private request:typeof fetch=fetch){}
 async get(track:Track):Promise<string>{
  if(track.info.isStream)throw new MusicError('Lirik tidak tersedia untuk siaran langsung.');
  const title=track.info.title.replace(/\s*[\[(][^\])]*(?:official|lyrics?|audio|video)[^\])]*[\])]/gi,'').trim();
  const artist=track.info.author.replace(/\s*-\s*Topic$/i,'').trim();
  const params=new URLSearchParams({track_name:title,artist_name:artist,duration:String(Math.round(track.info.length/1000))});
  const key=params.toString(),cached=this.cache.get(key);if(cached&&cached.until>Date.now())return cached.value;
  const existing=this.pending.get(key);if(existing)return existing;
  const task=(async()=>{
   let response:Response;
   try{response=await this.request(`https://lrclib.net/api/get?${params}`,{headers:{'User-Agent':`ManukAPP/1.5 (https://discord.com/users/${this.appId()})`},signal:AbortSignal.timeout(8000),redirect:'error'});}
   catch{throw new MusicError('Layanan lirik belum dapat dihubungi. Coba lagi nanti.');}
   if(response.status===404)throw new MusicError('Lirik belum ditemukan untuk judul dan artis ini.');
   if(response.status===429)throw new MusicError('Layanan lirik sedang membatasi permintaan. Coba lagi nanti.');
   if(!response.ok)throw new MusicError('Layanan lirik sedang bermasalah.');
   const data=await response.json() as {plainLyrics?:string;syncedLyrics?:string;instrumental?:boolean};
   const text=data.instrumental?'Lagu instrumental — tidak ada lirik.':data.plainLyrics||data.syncedLyrics?.replace(/\[\d+:\d+(?:\.\d+)?\]/g,'').trim();
   if(!text)throw new MusicError('Lirik belum tersedia untuk lagu ini.');
   if(this.cache.size>=100)this.cache.delete(this.cache.keys().next().value!);
   this.cache.set(key,{until:Date.now()+3600000,value:text});return text;
  })();
  this.pending.set(key,task);try{return await task;}finally{this.pending.delete(key);}
 }
}
