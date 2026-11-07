import type {Track} from 'shoukaku';
import {MusicError} from './music-core.js';
import {spotifyUser,spotifyTrack} from './spotify-user.js';
/** Reads only the anonymous embed document. Never sends account tokens or cookies. */
export function parsePublicPlaylist(html:string,id:string):Track[]{
 const script=/<script\b(?=[^>]*\bid=["']__NEXT_DATA__["'])[^>]*>([\s\S]*?)<\/script>/i.exec(html);
 if(!script)throw new MusicError('Spotify tidak menyediakan data playlist publik.');
 let data:any;try{data=JSON.parse(script[1]!);}catch{throw new MusicError('Data playlist publik Spotify tidak valid.');}
 const entity=data?.props?.pageProps?.state?.data?.entity;
 if(entity?.uri!==`spotify:playlist:${id}`||!Array.isArray(entity.trackList))throw new MusicError('Playlist tidak tersedia di embed publik Spotify.');
 const rows:Track[]=[];
 for(const item of entity.trackList){
  const match=/^spotify:track:([A-Za-z0-9]{22})$/.exec(item?.uri??'');
  if(!match||typeof item.title!=='string'||typeof item.subtitle!=='string')continue;
  const row=spotifyTrack({type:'track',id:match[1],name:item.title,artists:[{name:item.subtitle}],duration_ms:Number.isFinite(item.duration)?Math.max(0,item.duration):0});
  if(row)rows.push(row);if(rows.length>=100)break;
 }
 if(!rows.length)throw new MusicError('Playlist publik tidak memiliki lagu yang bisa diimpor.');
 return rows;
}
export async function publicPlaylist(id:string,request:typeof fetch=fetch){
 if(!/^[A-Za-z0-9]{22}$/.test(id))throw new MusicError('ID playlist Spotify tidak valid.');
 const response=await request(`https://open.spotify.com/embed/playlist/${id}`,{headers:{Accept:'text/html'},signal:AbortSignal.timeout(12000),redirect:'error',credentials:'omit'});
 if(!response.ok)throw new MusicError(`Embed Spotify HTTP ${response.status}.`);
 // Bound the public document without retaining tokens, preview URLs or raw HTML.
 const reader=response.body?.getReader();if(!reader)throw new MusicError('Halaman Spotify kosong.');
 const chunks:Uint8Array[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>2_000_000){await reader.cancel();throw new MusicError('Halaman playlist Spotify terlalu besar.');}chunks.push(value);}}finally{reader.releaseLock();}
 return parsePublicPlaylist(Buffer.concat(chunks).toString('utf8'),id);
}
export async function loadSpotify(url:string){
 const parsed=new URL(url),match=/^\/playlist\/([A-Za-z0-9]{22})\/?$/.exec(parsed.pathname);
 if(parsed.origin==='https://open.spotify.com'&&match){
  try{const rows=await publicPlaylist(match[1]!);console.log(`[SPOTIFY PUBLIC] Imported ${rows.length} track(s), cap=100; public embed may contain only part of the playlist.`);return rows;}
  catch{console.log('[SPOTIFY PUBLIC] Embed tidak tersedia; mencoba API akun.');}
 }
 return spotifyUser.load(url);
}
