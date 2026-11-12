import {monthParts,monthKey} from './music-meter.js';
import {defaultPreferences,type MusicPreferences} from './music-options.js';
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import type {Track} from 'shoukaku';
import {dirname} from 'node:path';

export type SavedTrack={identifier:string;title:string;author:string;url:string;length:number;requester:string;playNext?:boolean};
export type SavedSession={queue:SavedTrack[];current?:SavedTrack;position:number;loop:'off'|'song'|'queue';autoplay:boolean;volume:number;autoplayStyle?:'artist'|'mix';fair?:boolean};
export type ProfileSettings={theme:'red'|'purple'|'blue';background:'vinyl'|'waves'|'plain';accent?:string;bio:string};
export type Favorite={id:number;track:SavedTrack};
/** SQLite-backed music state. Writes are debounced per guild; close() flushes pending snapshots. */
export class MusicPersistence {
 private db:DatabaseSync; private pending=new Map<string,NodeJS.Timeout>(); private latest=new Map<string,SavedSession>();
 constructor(path:string){mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS music_profile_settings(user_id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS music_audience(guild_id TEXT NOT NULL,track_key TEXT NOT NULL,title TEXT NOT NULL,author TEXT NOT NULL,audience TEXT NOT NULL,ms INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,track_key,audience)); CREATE TABLE IF NOT EXISTS music_totals(guild_id TEXT NOT NULL,month TEXT NOT NULL,track_key TEXT NOT NULL,title TEXT NOT NULL,author TEXT NOT NULL,requester TEXT NOT NULL,plays INTEGER NOT NULL DEFAULT 0,ms INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,month,track_key,requester)); CREATE TABLE IF NOT EXISTS music_sessions(guild_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS music_history(guild_id TEXT NOT NULL, payload TEXT NOT NULL, played_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS music_history_guild ON music_history(guild_id,played_at DESC); CREATE TABLE IF NOT EXISTS music_favorites(user_id TEXT NOT NULL, track_key TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(user_id,track_key)); CREATE TABLE IF NOT EXISTS music_playlists(guild_id TEXT NOT NULL, name TEXT NOT NULL, tracks TEXT NOT NULL, PRIMARY KEY(guild_id,name)); CREATE TABLE IF NOT EXISTS music_panels(guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message_id TEXT NOT NULL); CREATE TABLE IF NOT EXISTS music_preferences(guild_id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS music_settings(guild_id TEXT PRIMARY KEY, payload TEXT NOT NULL);`);}
 save(guild:string,state:SavedSession){this.latest.set(guild,structuredClone(state));const old=this.pending.get(guild);if(old)clearTimeout(old);const timer=setTimeout(()=>{this.pending.delete(guild);this.flush(guild);},700).unref();this.pending.set(guild,timer);}
 private flush(guild:string){const state=this.latest.get(guild);if(!state)return;this.db.prepare('INSERT INTO music_sessions VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at').run(guild,JSON.stringify(state),Date.now());}
 load(guild:string):SavedSession|undefined{const pending=this.latest.get(guild);if(pending)return structuredClone(pending);const row=this.db.prepare('SELECT payload FROM music_sessions WHERE guild_id=?').get(guild) as {payload:string}|undefined;return row?JSON.parse(row.payload):undefined;}
 clearSession(guild:string){const t=this.pending.get(guild);if(t)clearTimeout(t);this.pending.delete(guild);this.latest.delete(guild);this.db.prepare('DELETE FROM music_sessions WHERE guild_id=?').run(guild);}
 addHistory(guild:string,track:SavedTrack){this.db.prepare('INSERT INTO music_history VALUES(?,?,?)').run(guild,JSON.stringify(track),Date.now());this.db.prepare('DELETE FROM music_history WHERE guild_id=? AND rowid NOT IN (SELECT rowid FROM music_history WHERE guild_id=? ORDER BY played_at DESC,rowid DESC LIMIT 100)').run(guild,guild);}
 history(guild:string){return (this.db.prepare('SELECT payload,played_at FROM music_history WHERE guild_id=? ORDER BY played_at DESC,rowid DESC LIMIT 100').all(guild) as {payload:string;played_at:number}[]).map(r=>({...JSON.parse(r.payload) as SavedTrack,playedAt:r.played_at}));}
 clearHistory(guild:string){this.db.prepare('DELETE FROM music_history WHERE guild_id=?').run(guild);}
 addFavorite(user:string,track:SavedTrack){const key=track.url||track.identifier;const result=this.db.prepare('INSERT OR IGNORE INTO music_favorites(user_id,track_key,payload) VALUES(?,?,?)').run(user,key,JSON.stringify(track));return Number(result.changes)>0;}
 favorites(user:string,limit=25,offset=0,query=''):Favorite[]{const rows=query?this.db.prepare('SELECT rowid AS id,payload FROM music_favorites WHERE user_id=? AND lower(payload) LIKE ? ORDER BY rowid DESC LIMIT ? OFFSET ?').all(user,`%${query.toLowerCase()}%`,limit,offset):this.db.prepare('SELECT rowid AS id,payload FROM music_favorites WHERE user_id=? ORDER BY rowid DESC LIMIT ? OFFSET ?').all(user,limit,offset);return (rows as {id:number;payload:string}[]).map(r=>({id:r.id,track:JSON.parse(r.payload) as SavedTrack}));}
 favorite(user:string,id:number){const row=this.db.prepare('SELECT rowid AS id,payload FROM music_favorites WHERE user_id=? AND rowid=?').get(user,id) as {id:number;payload:string}|undefined;return row?{id:row.id,track:JSON.parse(row.payload) as SavedTrack}:undefined;}
 removeFavorite(user:string,id:number){return Number(this.db.prepare('DELETE FROM music_favorites WHERE user_id=? AND rowid=?').run(user,id).changes)>0;}
 createPlaylist(guild:string,name:string){try{this.db.prepare('INSERT INTO music_playlists(guild_id,name,tracks) VALUES(?,?,?)').run(guild,name,'[]');return true;}catch{return false;}}
 deletePlaylist(guild:string,name:string){return Number(this.db.prepare('DELETE FROM music_playlists WHERE guild_id=? AND name=?').run(guild,name).changes)>0;}
 playlists(guild:string){return (this.db.prepare('SELECT name FROM music_playlists WHERE guild_id=? ORDER BY name COLLATE NOCASE').all(guild) as {name:string}[]).map(r=>r.name);}
 playlist(guild:string,name:string):SavedTrack[]|undefined{const row=this.db.prepare('SELECT tracks FROM music_playlists WHERE guild_id=? AND name=?').get(guild,name) as {tracks:string}|undefined;return row?JSON.parse(row.tracks) as SavedTrack[]:undefined;}
 setPlaylist(guild:string,name:string,tracks:SavedTrack[]){this.db.prepare('UPDATE music_playlists SET tracks=? WHERE guild_id=? AND name=?').run(JSON.stringify(tracks),guild,name);}
 djRole(guild:string):string|undefined{const row=this.db.prepare('SELECT payload FROM music_settings WHERE guild_id=?').get(guild) as {payload:string}|undefined;return row?(JSON.parse(row.payload) as {djRole?:string}).djRole:undefined;}
 setDjRole(guild:string,role:string|undefined){if(!role){this.db.prepare('DELETE FROM music_settings WHERE guild_id=?').run(guild);return;}this.db.prepare('INSERT INTO music_settings(guild_id,payload) VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET payload=excluded.payload').run(guild,JSON.stringify({djRole:role}));}
 profileSettings(user:string):ProfileSettings{const row=this.db.prepare('SELECT payload FROM music_profile_settings WHERE user_id=?').get(user) as {payload:string}|undefined;return {theme:'red',background:'vinyl',bio:'',...(row?JSON.parse(row.payload):{})};}
 setProfileSettings(user:string,patch:Partial<ProfileSettings>,reset=false){
  const value:ProfileSettings=reset?{theme:'red',background:'vinyl',bio:''}:{...this.profileSettings(user),...patch};
  if(!['red','purple','blue'].includes(value.theme)||!['vinyl','waves','plain'].includes(value.background)||value.accent&&!/^#[0-9a-f]{6}$/i.test(value.accent)||typeof value.bio!=='string'||value.bio.length>60)throw new Error('Pengaturan profil tidak valid.');
  value.bio=value.bio.replace(/[\r\n\t]/g,' ').trim();
  this.db.prepare('INSERT INTO music_profile_settings VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET payload=excluded.payload').run(user,JSON.stringify(value));return value;
 }
 leaderboard(guild:string,type:'listeners'|'tracks'|'artists'){
  if(type==='listeners')return this.db.prepare('SELECT j.value AS name,SUM(a.ms) AS ms FROM music_audience a,json_each(a.audience) j WHERE a.guild_id=? GROUP BY j.value ORDER BY ms DESC,name LIMIT 10').all(guild) as {name:string;ms:number;detail?:string}[];
  // Song/artist totals measure bot playback once, rather than multiplying by audience size.
  if(type==='tracks')return this.db.prepare('SELECT title AS name,author AS detail,SUM(ms) AS ms FROM music_totals WHERE guild_id=? GROUP BY track_key ORDER BY ms DESC,name LIMIT 10').all(guild) as {name:string;ms:number;detail?:string}[];
  return this.db.prepare('SELECT author AS name,SUM(ms) AS ms FROM music_totals WHERE guild_id=? GROUP BY lower(author) ORDER BY ms DESC,name LIMIT 10').all(guild) as {name:string;ms:number;detail?:string}[];
 }
 recordListening(guild:string,track:SavedTrack,listeners:string[],ms:number){
  if(!Number.isFinite(ms)||ms<=0||ms>15000)return;
  const audience=JSON.stringify([...new Set(listeners.filter(id=>/^\d{15,22}$/.test(id)))].sort());if(audience==='[]')return;
  const key=(track.title+'|'+track.author).normalize('NFKC').toLowerCase();
  this.db.prepare('INSERT INTO music_audience VALUES(?,?,?,?,?,?) ON CONFLICT(guild_id,track_key,audience) DO UPDATE SET ms=ms+excluded.ms').run(guild,key,track.title,track.author,audience,Math.floor(ms));
 }
 listeningProfile(user:string){
  const scope='EXISTS (SELECT 1 FROM json_each(a.audience) WHERE value=?)';
  const total=this.db.prepare(`SELECT COALESCE(SUM(ms),0) AS ms,COUNT(DISTINCT guild_id) AS servers,COUNT(DISTINCT track_key) AS tracks FROM music_audience a WHERE ${scope}`).get(user) as {ms:number;servers:number;tracks:number};
  const servers=this.db.prepare(`SELECT guild_id AS id,SUM(ms) AS ms FROM music_audience a WHERE ${scope} GROUP BY guild_id ORDER BY ms DESC,guild_id LIMIT 3`).all(user) as {id:string;ms:number}[];
  const tracks=this.db.prepare(`SELECT title,author,SUM(ms) AS ms FROM music_audience a WHERE ${scope} GROUP BY track_key ORDER BY ms DESC,title LIMIT 3`).all(user) as {title:string;author:string;ms:number}[];
  const friends=this.db.prepare(`SELECT j.value AS id,SUM(a.ms) AS ms FROM music_audience a,json_each(a.audience) j WHERE ${scope} AND j.value<>? GROUP BY j.value ORDER BY ms DESC,j.value LIMIT 3`).all(user,user) as {id:string;ms:number}[];
  return {total,servers,tracks,friends};
 }
 recordPlayback(guild:string,track:SavedTrack,ms:number,plays:number,at=Date.now()){
  if(!Number.isFinite(ms)||ms<0||ms>15000||![0,1].includes(plays))throw new Error('Invalid playback sample');
  if(ms===0&&plays===0)return;
  const key=(track.title+'|'+track.author).normalize('NFKC').toLowerCase();
  const parts=monthParts(at,ms);if(!parts.length)parts.push({month:monthKey(at),ms:0});
  const statement=this.db.prepare('INSERT INTO music_totals VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(guild_id,month,track_key,requester) DO UPDATE SET plays=plays+excluded.plays,ms=ms+excluded.ms');
  this.db.exec('BEGIN');try{parts.forEach((part,index)=>statement.run(guild,part.month,key,track.title,track.author,track.requester,index===0?plays:0,part.ms));this.db.exec('COMMIT');}catch(e){this.db.exec('ROLLBACK');throw e;}
 }
 wrapped(guild:string,month:string){
  const total=this.db.prepare('SELECT COALESCE(SUM(plays),0) AS plays,COALESCE(SUM(ms),0) AS ms FROM music_totals WHERE guild_id=? AND month=?').get(guild,month) as {plays:number;ms:number};
  const tracks=this.db.prepare('SELECT title,author,SUM(plays) AS plays,SUM(ms) AS ms FROM music_totals WHERE guild_id=? AND month=? GROUP BY track_key ORDER BY plays DESC,ms DESC,title LIMIT 5').all(guild,month) as {title:string;author:string;plays:number;ms:number}[];
  const artists=this.db.prepare('SELECT author,SUM(ms) AS ms FROM music_totals WHERE guild_id=? AND month=? GROUP BY author ORDER BY ms DESC,author LIMIT 5').all(guild,month) as {author:string;ms:number}[];
  const members=(this.db.prepare("SELECT requester,SUM(plays) AS plays FROM music_totals WHERE guild_id=? AND month=? AND requester NOT IN ('unknown','autoplay') GROUP BY requester ORDER BY plays DESC,requester LIMIT 5").all(guild,month) as {requester:string;plays:number}[]).filter(r=>/^\d{15,22}$/.test(r.requester));
  return {total,tracks,artists,members};
 }
 standbyGuilds(){return (this.db.prepare('SELECT guild_id AS guild,payload FROM music_preferences').all() as {guild:string;payload:string}[]).filter(r=>{const p=JSON.parse(r.payload);return p.stay&&p.stayVoice;}).map(r=>r.guild);}
 preferences(guild:string):MusicPreferences{const row=this.db.prepare('SELECT payload FROM music_preferences WHERE guild_id=?').get(guild) as {payload:string}|undefined;return {...defaultPreferences,...(row?JSON.parse(row.payload):{})};}
 setPreferences(guild:string,patch:Partial<MusicPreferences>){const value={...this.preferences(guild),...patch};this.db.prepare('INSERT INTO music_preferences VALUES(?,?) ON CONFLICT(guild_id) DO UPDATE SET payload=excluded.payload').run(guild,JSON.stringify(value));return value;}
 panel(guild:string){return this.db.prepare('SELECT channel_id AS channelId,message_id AS messageId FROM music_panels WHERE guild_id=?').get(guild) as {channelId:string;messageId:string}|undefined;}
 setPanel(guild:string,channel:string,message:string){this.db.prepare('INSERT INTO music_panels VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,message_id=excluded.message_id').run(guild,channel,message);}
 close(){for(const [guild,t] of this.pending){clearTimeout(t);this.flush(guild);}this.pending.clear();this.db.close();}
}

export function restoredTrack(t:SavedTrack):Track{return {encoded:`saved:${t.identifier}`,info:{identifier:t.identifier,title:t.title,author:t.author,uri:t.url,length:t.length,position:0,isStream:false,isSeekable:true,sourceName:'saved'},pluginInfo:{requester:t.requester,playNext:t.playNext??false}};}
