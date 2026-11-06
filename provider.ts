import {parseId,normalizeMatches,type Profile,type Rank,type Match} from './domain.js';
export const demoProfile:Profile={name:'Angga',tag:'IDN',region:'ap',puuid:'demo-angga'};
export const demoMatches:Match[]=[['Ascent','Jett',26,14,5,13,8],['Bind','Reyna',21,16,7,13,10],['Lotus','Omen',14,18,9,9,13],['Split','Jett',28,17,4,13,11],['Ascent','Omen',17,15,12,13,7]].map(([map,agent,k,d,a,w,l])=>({map:String(map),agent:String(agent),kills:Number(k),deaths:Number(d),assists:Number(a),headshots:12,bodyshots:25,legshots:3,score:Number(k)*220,rounds:Number(w)+Number(l),result:Number(w)>Number(l)?'MENANG':'KALAH',scoreline:`${w}–${l}`}));
export class Provider {
 private cache=new Map<string,{expires:number;data:unknown}>();
 constructor(public mode:'demo'|'henrik',private key='',private request:typeof fetch=fetch){}
 private async get(path:string):Promise<any>{
  if(!this.key)throw new Error('HENRIK_API_KEY belum diisi oleh pengelola bot.');
  const cached=this.cache.get(path);if(cached&&cached.expires>Date.now())return cached.data;
  let response:Response;
  try{response=await this.request('https://api.henrikdev.xyz'+path,{headers:{Authorization:this.key},signal:AbortSignal.timeout(12000)});}catch{throw new Error('API tidak merespons. Coba lagi sebentar.');}
  if(!response.ok){const messages:Record<number,string>={401:'API key tidak valid. Hubungi pengelola bot.',403:'Akses data ditolak provider. Akun atau akses API mungkin dibatasi.',404:'Akun atau riwayat belum tersedia. Cek Riot ID dan region.',429:'Batas request API tercapai. Tunggu sebentar sebelum mencoba lagi.'};throw new Error(messages[response.status]??'Layanan statistik sedang bermasalah. Coba lagi nanti.');}
  const json:any=await response.json().catch(()=>{throw new Error('Respons API bukan JSON yang valid.');});
  if(json?.status!==200||json.data==null)throw new Error('API tidak mengembalikan data yang valid.');
  if(this.cache.size>=100)this.cache.delete(this.cache.keys().next().value!);
  this.cache.set(path,{expires:Date.now()+60000,data:json.data});return json.data;
 }
 async account(id:string,region:string):Promise<Profile>{
  const {name,tag}=parseId(id);
  if(this.mode==='demo'){if(name.toLowerCase()!=='angga'||tag.toLowerCase()!=='idn')throw new Error('Mode demo: gunakan Angga#IDN. Untuk akun asli aktifkan DATA_MODE=henrik.');return demoProfile;}
  const data=await this.get(`/valorant/v2/account/${encodeURIComponent(name)}/${encodeURIComponent(tag)}`);
  if(typeof data.puuid!=='string'||typeof data.name!=='string'||typeof data.tag!=='string')throw new Error('Format akun dari API tidak lengkap.');
  if(data.region!==region)throw new Error(`Region tidak cocok. Pilih region ${String(data.region).slice(0,10)}.`);
  return {name:data.name,tag:data.tag,puuid:data.puuid,region};
 }
 async rank(p:Profile):Promise<Rank>{
  if(this.mode==='demo')return {tier:'Diamond 2',rr:64,change:22,peak:'Ascendant 1'};
  const d=await this.get(`/valorant/v3/mmr/${encodeURIComponent(p.region)}/pc/${encodeURIComponent(p.name)}/${encodeURIComponent(p.tag)}`);
  if(typeof d.current?.tier?.name!=='string'||!Number.isFinite(d.current.rr)||!Number.isFinite(d.current.last_change))throw new Error('Data rank belum tersedia atau format API berubah.');
  return {tier:d.current.tier.name,rr:d.current.rr,change:d.current.last_change,peak:d.peak?.tier?.name??'Belum tersedia'};
 }
 async matches(p:Profile):Promise<Match[]>{
  if(this.mode==='demo')return demoMatches;
  return normalizeMatches(await this.get(`/valorant/v4/matches/${encodeURIComponent(p.region)}/pc/${encodeURIComponent(p.name)}/${encodeURIComponent(p.tag)}?mode=competitive&size=10`),p.puuid);
 }
}
