import {loadSpotify} from './spotify-public.js';
import {LoadType,type LavalinkResponse,type Track} from 'shoukaku';
import {MusicError,tracksFrom} from './music-core.js';
import {reportMusicError} from './music-diagnostics.js';
export type Resolve=(query:string)=>Promise<LavalinkResponse|undefined|null>;
const words=(s:string)=>s.toLowerCase().replace(/\b(?:official|video|lyrics?|audio|topic)\b/g,' ').normalize('NFKD').replace(/[^\p{L}\p{N}]+/gu,' ').trim().split(/\s+/).filter(Boolean);
type SearchState={rows:Track[];index:number;query:string};
const searchStates=new WeakMap<Track,SearchState>();
export function cleanTitle(title:string){
 return title.replace(/\([^)]*(?:official|lyrics?|audio|video)[^)]*\)|\[[^\]]*(?:official|lyrics?|audio|video)[^\]]*\]/gi,' ').replace(/\b(?:official|music video|lyrics?|audio)\b/gi,' ').replace(/\s+/g,' ').trim();
}
export function matches(original:Track,candidate:Track){
 const title=words(cleanTitle(original.info.title)),other=new Set(words(candidate.info.title+' '+candidate.info.author));
 const overlap=title.filter(w=>other.has(w)).length/Math.max(1,title.length);
 const short=words(cleanTitle(candidate.info.title)),originalWords=new Set([...title,...words(original.info.author)]);
 const shortOverlap=short.filter(w=>originalWords.has(w)).length/Math.max(1,short.length);
 const artistWords=words(candidate.info.author).filter(w=>!['the','music','records','official'].includes(w));
 const artistMatch=artistWords.some(w=>originalWords.has(w));
 const versions=['remix','cover','karaoke','instrumental','sped','slowed','live'];
 const wrongVersion=versions.some(w=>words(candidate.info.title).includes(w)&&!title.includes(w));
 const a=original.info.length,b=candidate.info.length;
 return !wrongVersion&&(overlap>=0.7||(shortOverlap>=0.8&&artistMatch))&&!candidate.info.isStream&&(!a||Math.abs(a-b)<=Math.max(15000,a*0.15));
}
function overlap(a:string,b:string){
 const x=new Set(words(cleanTitle(a))),y=new Set(words(cleanTitle(b)));
 if(!x.size||!y.size)return 0;
 const common=[...x].filter(w=>y.has(w)).length;
 return 2*common/(x.size+y.size);
}
export function similarity(candidate:Track,query:string,original?:Track){
 const title=candidate.info.title,author=candidate.info.author;
 let score=original?65*overlap(original.info.title,title)+15*overlap(query,title+' '+author)+10*overlap(original.info.author,author):90*overlap(query,title+' '+author);
 if(original?.info.length&&candidate.info.length)score+=10*Math.max(0,1-Math.abs(original.info.length-candidate.info.length)/original.info.length);
 const target=words(original?.info.title??query),version=words(title);
 for(const word of ['cover','remix','karaoke','instrumental','sped','slowed','live'])if(version.includes(word)&&!target.includes(word))score-=8;
 if(candidate.info.isStream)score-=15;
 return score;
}
// Soundy accepts scsearch: only. Rank results instead of rejecting approximate matches.
const soundcloudStates=new WeakMap<Track,{rows:Track[];index:number}>();
export async function soundcloud(resolve:Resolve,query:string,original?:Track,alternate?:string):Promise<Track>{
 let failed=0;const candidates=new Map<string,Track>();
 const queries=[...new Set([query,alternate].filter((q):q is string=>!!q))];
 for(const term of queries){
  try{
   const result=await resolve(`scsearch:${term.slice(0,450)}`);
   if(!result||result.loadType===LoadType.EMPTY)continue;
   for(const row of tracksFrom(result,'SoundCloud',true).slice(0,10)){
    const id=row.info.identifier||row.encoded;
    if(row.encoded&&!candidates.has(id))candidates.set(id,row);
   }
  }catch(error){failed++;reportMusicError('SEARCH SoundCloud',error);}
 }
 const ranked=[...candidates.values()].sort((a,b)=>similarity(b,query,original)-similarity(a,query,original));
 if(ranked.length){
  const state={rows:ranked.slice(0,3),index:1};
  for(const row of state.rows)soundcloudStates.set(row,state);
  console.log(`[MUSIC SC RANK] candidates=${ranked.length} score=${similarity(state.rows[0],query,original).toFixed(1)}; memilih hasil terdekat.`);
  return state.rows[0];
 }
 throw new MusicError(`SoundCloud tidak menghasilkan kandidat; ${failed} pencarian gagal. Coba judul + artis lain.`);
}
export async function bandcamp(resolve:Resolve,query:string):Promise<Track>{
 const result=await resolve(`bcsearch:${query.slice(0,450)}`);
 const track=tracksFrom(result,'Bandcamp')[0];
 console.log(`[MUSIC LOAD SUCCESS] source=Bandcamp title=${track.info.title.slice(0,100)}`);
 return track;
}
export async function resolveRequest(resolve:Resolve,query:string):Promise<Track[]>{
 if(query.startsWith('https://open.spotify.com/'))return loadSpotify(query);
 if(query.startsWith('bcsearch:'))return [await bandcamp(resolve,query.slice(9))];
 if(query.startsWith('scsearch:')){
  try{const track=await soundcloud(resolve,query.slice(9));console.log('[MUSIC LOAD SUCCESS] source=SoundCloud count=1');return [track];}
  catch(error){reportMusicError('LOAD SoundCloud search',error);console.log('[MUSIC FALLBACK] SoundCloud tidak menemukan track; mencoba Bandcamp.');return [await bandcamp(resolve,query.slice(9))];}
 }
 const search=query.startsWith('ytmsearch:')||query.startsWith('ytsearch:');
 const term=query.startsWith('ytmsearch:')?query.slice(10):query.slice(9);
 const attempts=query.startsWith('ytmsearch:')?[query,`ytsearch:${term}`]:[query];
 for(const identifier of attempts){
  if(identifier.startsWith('yt'))console.log(`[YOUTUBE LOAD] request=${identifier.startsWith('ytmsearch:')?'music-search':identifier.startsWith('ytsearch:')?'search':'track'}`);
  let result:LavalinkResponse|null|undefined;
  try{result=await resolve(identifier);}
  catch(error){reportMusicError(identifier.startsWith('yt')?'YOUTUBE LOAD':'TRACK LOAD',error);continue;}
  try{
   const rows=tracksFrom(result,identifier.startsWith('yt')?'YouTube search':'track URL',search);
   if(search){
    // Rank the full result set once, then retain the remaining YouTube candidates
    // so a login/region/load failure can advance to another result before switching source.
    const unique=[...new Map(rows.filter(track=>track.encoded).map(track=>[track.info.identifier||track.encoded,track])).values()];
    const ranked=unique.sort((a,b)=>similarity(b,term)-similarity(a,term));
    if(!ranked.length)throw new MusicError('Pencarian tidak menghasilkan track yang bisa diputar.');
    const candidates=ranked.slice(0,3);
    const state:SearchState={rows:candidates,index:1,query:term};for(const track of candidates)searchStates.set(track,state);
    console.log(`[YOUTUBE LOAD] source=${ranked[0]?.info.sourceName??'unknown'} results=${ranked.length} playbackCandidates=${candidates.length}`);
    return [ranked[0]!];
   }
   if(identifier.startsWith('yt'))console.log(`[YOUTUBE LOAD] source=${rows[0]?.info.sourceName??'unknown'} tracks=${rows.length}`);
   else console.log(`[MUSIC LOAD SUCCESS] source=${rows[0]?.info.sourceName??'unknown'} count=${rows.length}`);
   return rows;
  }catch(error){reportMusicError(identifier.startsWith('yt')?'YOUTUBE LOAD':'LOAD track URL',error);}
 }
 if(search){
  console.log('[MUSIC FALLBACK] YouTube Music dan YouTube gagal dimuat; mencari SoundCloud.');
  try{return [await soundcloud(resolve,term)];}
  catch(error){reportMusicError('LOAD SoundCloud fallback',error);console.log('[MUSIC FALLBACK] SoundCloud tidak menemukan track; mencoba Bandcamp.');return [await bandcamp(resolve,term)];}
 }
 throw new MusicError('Link gagal dimuat. Gunakan judul + artis untuk fallback lintas sumber.');
}
export async function fallbackTrack(resolve:Resolve,track:Track){
 const source=track.info.sourceName;
 if(source!=='youtube'&&source!=='soundcloud')return undefined;
 if(source==='soundcloud'){const alternatives=soundcloudStates.get(track);if(alternatives&&alternatives.index<alternatives.rows.length){console.log('[MUSIC FALLBACK] Mencoba kandidat SoundCloud berikutnya.');return alternatives.rows[alternatives.index++];}}
 const state=searchStates.get(track);
 if(source==='youtube'&&state&&state.index<state.rows.length){
  const candidate=state.rows[state.index++]!;
  console.log(`[MUSIC FALLBACK] Mencoba kandidat YouTube berikutnya (${state.index}/${state.rows.length}) sebelum berpindah sumber.`);
  return candidate;
 }

 const cleaned=cleanTitle(track.info.title),query=state?.query??cleaned;
 if(source==='youtube'){
  try{console.log('[MUSIC FALLBACK] Hasil YouTube Music/YouTube gagal; mencoba SoundCloud.');return await soundcloud(resolve,query,track,cleaned);}
  catch(error){reportMusicError('LOAD SoundCloud fallback',error);}
 }
 try{console.log(`[MUSIC FALLBACK] ${source==='soundcloud'?'SoundCloud':'YouTube dan SoundCloud'} gagal; mencoba Bandcamp.`);return await bandcamp(resolve,`${query} ${cleaned}`.trim());}
 catch(error){reportMusicError('LOAD Bandcamp fallback',error);return undefined;}
}

// Spotify provides metadata only. Resolve the audio just before this item's turn.
export async function prepareTrack(resolve:Resolve,track:Track):Promise<Track>{
 if(track.info.sourceName!=='spotify')return track;
 const query=`${track.info.title} ${track.info.author}`.slice(0,450);
 console.log('[MUSIC SPOTIFY RESOLVE] Mencari audio untuk track antrean.');
 const rows=await resolveRequest(resolve,`ytmsearch:${query}`);
 const playable=rows[0];
 if(!playable||playable.info.sourceName==='spotify')throw new MusicError('Sumber audio untuk track Spotify tidak ditemukan.');
 return playable;
}
