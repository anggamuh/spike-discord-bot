import {readFile,writeFile,mkdir,rename} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {createHash,randomBytes} from 'node:crypto';
import type {Track} from 'shoukaku';
import {MusicError} from './music-core.js';
export const REDIRECT='http://127.0.0.1:8888/callback';
export const AUTH_FILE=resolve('data/spotify-auth.json');
type Tokens={access_token:string;refresh_token:string;expires_at:number;client_id:string};
export function loginRequest(clientId:string){
 if(!clientId)throw new MusicError('Isi SPOTIFY_CLIENT_ID di .env dahulu.');
 const state=randomBytes(24).toString('base64url'),verifier=randomBytes(48).toString('base64url');
 const params=new URLSearchParams({client_id:clientId,response_type:'code',scope:'playlist-read-private playlist-read-collaborative',redirect_uri:REDIRECT,state,code_challenge_method:'S256',code_challenge:createHash('sha256').update(verifier).digest('base64url')});
 return {state,verifier,url:`https://accounts.spotify.com/authorize?${params}`};
}
export function callbackCode(url:string,state:string){
 const q=new URL(url,REDIRECT).searchParams;
 if(q.get('state')!==state)throw new MusicError('State login tidak cocok.');
 if(q.has('error'))throw new MusicError('Izin Spotify tidak diberikan.');
 const code=q.get('code');if(!code)throw new MusicError('Kode login tidak tersedia.');return code;
}
export class SpotifyUser {
 private refreshing?:Promise<Tokens>;
 constructor(private clientId=process.env.SPOTIFY_CLIENT_ID??'',private file=AUTH_FILE,private request:typeof fetch=fetch){}
 private async save(t:Tokens){await mkdir(dirname(this.file),{recursive:true});const tmp=this.file+'.tmp';await writeFile(tmp,JSON.stringify(t),{mode:0o600});await rename(tmp,this.file);}
 private async tokenPost(params:URLSearchParams){
  const res=await this.request('https://accounts.spotify.com/api/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:params,signal:AbortSignal.timeout(15000),redirect:'error'});
  if(!res.ok)throw new MusicError(`Spotify token HTTP ${res.status}. Jalankan npm run spotify:login lagi; pastikan Client ID dan Redirect URI benar.`);
  const data=await res.json() as {access_token?:string;refresh_token?:string;expires_in?:number};
  if(!data.access_token||!data.expires_in)throw new MusicError('Respons token Spotify tidak lengkap.');return data;
 }
 async exchange(code:string,verifier:string){
  const t=await this.tokenPost(new URLSearchParams({client_id:this.clientId,grant_type:'authorization_code',code,redirect_uri:REDIRECT,code_verifier:verifier}));
  if(!t.refresh_token)throw new MusicError('Spotify tidak memberikan refresh token.');
  await this.save({access_token:t.access_token!,refresh_token:t.refresh_token,expires_at:Date.now()+t.expires_in!*1000,client_id:this.clientId});
 }
 private async token(force=false):Promise<Tokens>{
  if(this.refreshing)return this.refreshing;
  let t:Tokens;
  try{t=JSON.parse(await readFile(this.file,'utf8'));}catch{throw new MusicError('Spotify belum terhubung. Pemilik bot perlu menjalankan npm run spotify:login.');}
  if(!this.clientId||t.client_id!==this.clientId||!t.refresh_token)throw new MusicError('Client ID berubah atau sesi Spotify tidak valid. Jalankan npm run spotify:login.');
  if(!force&&t.access_token&&t.expires_at>Date.now()+60000)return t;
  this.refreshing=(async()=>{const fresh=await this.tokenPost(new URLSearchParams({client_id:this.clientId,grant_type:'refresh_token',refresh_token:t.refresh_token}));const result={...t,access_token:fresh.access_token!,refresh_token:fresh.refresh_token??t.refresh_token,expires_at:Date.now()+fresh.expires_in!*1000};await this.save(result);return result;})();
  try{return await this.refreshing;}finally{this.refreshing=undefined;}
 }
 async get(path:string):Promise<any>{
  if(!path.startsWith('/')||path.startsWith('//'))throw new MusicError('Path API Spotify tidak valid.');
  for(let attempt=0;attempt<2;attempt++){
   const t=await this.token(attempt===1);
   const res=await this.request('https://api.spotify.com/v1'+path,{headers:{Authorization:`Bearer ${t.access_token}`},signal:AbortSignal.timeout(15000),redirect:'error'});
   if(res.status===401&&attempt===0)continue;
   if(res.status===401)throw new MusicError('Spotify HTTP 401: login pengguna ditolak. Jalankan npm run spotify:login lagi.');
   if(res.status===403||res.status===404)throw new MusicError(`Spotify HTTP ${res.status}: playlist tidak tersedia untuk akun/app ini. Coba playlist publik milik akun yang login atau yang kamu kolaborasikan.`);
   if(res.status===429)throw new MusicError('Spotify membatasi permintaan (429). Tunggu sebelum mencoba lagi.');
   if(!res.ok)throw new MusicError(`Spotify API HTTP ${res.status}.`);
   return res.json();
  }
  throw new MusicError('Spotify tidak merespons.');
 }
 async load(url:string):Promise<Track[]>{
  const u=new URL(url);const match=/^\/(playlist|album|track)\/([A-Za-z0-9]{22})\/?$/.exec(u.pathname);
  if(u.origin!=='https://open.spotify.com'||!match)throw new MusicError('Link Spotify tidak valid.');
  const [,kind,id]=match;const rows:Track[]=[];
  if(kind==='track'){const row=spotifyTrack(await this.get(`/tracks/${id}?market=ID`));if(row)rows.push(row);}
  else{
   if(kind==='playlist'){
    const meta=await this.get(`/playlists/${id}?fields=public&market=ID`);
    if(meta.public!==true)throw new MusicError('Bot hanya mengimpor playlist publik, agar playlist privat akun pemilik bot tidak dibagikan ke server.');
   }
   // Read at most 100 entries to keep imported playlists within the player queue cap.
   for(let offset=0;offset<100&&rows.length<100;offset+=50){
    const page=await this.get(`/${kind==='playlist'?'playlists':'albums'}/${id}/${kind==='playlist'?'items':'tracks'}?limit=50&offset=${offset}&market=ID`);
    if(!Array.isArray(page.items))throw new MusicError('Respons daftar lagu Spotify tidak lengkap.');
    for(const entry of page.items){if(entry?.is_local)continue;const row=spotifyTrack(kind==='playlist'?(entry?.item??entry?.track):entry);if(row)rows.push(row);if(rows.length===100)break;}
    if(!page.next)break;
   }
  }
  if(!rows.length)throw new MusicError('Spotify: tidak ada lagu yang bisa diimpor.');
  return rows;
 }
}
export function spotifyTrack(t:any):Track|undefined{
 if(!t||t.type!=='track'||t.is_local||!t.id||!t.name||!Array.isArray(t.artists))return;
 return {encoded:`spotify-meta:${t.id}`,info:{identifier:t.id,title:t.name,author:t.artists.map((a:any)=>a.name).filter(Boolean).join(', '),length:t.duration_ms??0,isStream:false,isSeekable:true,position:0,sourceName:'spotify',uri:`https://open.spotify.com/track/${t.id}`},pluginInfo:{}};
}
export const spotifyUser=new SpotifyUser();
