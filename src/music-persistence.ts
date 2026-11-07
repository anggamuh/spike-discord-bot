import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import type {Track} from 'shoukaku';
import {dirname} from 'node:path';

export type SavedTrack={identifier:string;title:string;author:string;url:string;length:number;requester:string};
export type SavedSession={queue:SavedTrack[];current?:SavedTrack;position:number;loop:'off'|'song'|'queue';autoplay:boolean;volume:number};
export type Favorite={id:number;track:SavedTrack};
/** SQLite-backed music state. Writes are debounced per guild; close() flushes pending snapshots. */
export class MusicPersistence {
 private db:DatabaseSync; private pending=new Map<string,NodeJS.Timeout>(); private latest=new Map<string,SavedSession>();
 constructor(path:string){mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);this.db.exec(`PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS music_sessions(guild_id TEXT PRIMARY KEY, payload TEXT NOT NULL, updated_at INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS music_history(guild_id TEXT NOT NULL, payload TEXT NOT NULL, played_at INTEGER NOT NULL); CREATE INDEX IF NOT EXISTS music_history_guild ON music_history(guild_id,played_at DESC); CREATE TABLE IF NOT EXISTS music_favorites(user_id TEXT NOT NULL, track_key TEXT NOT NULL, payload TEXT NOT NULL, PRIMARY KEY(user_id,track_key)); CREATE TABLE IF NOT EXISTS music_playlists(guild_id TEXT NOT NULL, name TEXT NOT NULL, tracks TEXT NOT NULL, PRIMARY KEY(guild_id,name)); CREATE TABLE IF NOT EXISTS music_panels(guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, message_id TEXT NOT NULL); CREATE TABLE IF NOT EXISTS music_voice_status(guild_id TEXT PRIMARY KEY, channel_id TEXT NOT NULL, status TEXT NOT NULL); CREATE TABLE IF NOT EXISTS music_settings(guild_id TEXT PRIMARY KEY, payload TEXT NOT NULL);`);}
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
 panel(guild:string){return this.db.prepare('SELECT channel_id AS channelId,message_id AS messageId FROM music_panels WHERE guild_id=?').get(guild) as {channelId:string;messageId:string}|undefined;}
 setPanel(guild:string,channel:string,message:string){this.db.prepare('INSERT INTO music_panels VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,message_id=excluded.message_id').run(guild,channel,message);}
 voiceStatus(guild:string){return this.db.prepare('SELECT channel_id AS channelId,status FROM music_voice_status WHERE guild_id=?').get(guild) as {channelId:string;status:string}|undefined;}
 setVoiceStatus(guild:string,channel:string,status:string){this.db.prepare('INSERT INTO music_voice_status VALUES(?,?,?) ON CONFLICT(guild_id) DO UPDATE SET channel_id=excluded.channel_id,status=excluded.status').run(guild,channel,status);}
 clearVoiceStatus(guild:string){this.db.prepare('DELETE FROM music_voice_status WHERE guild_id=?').run(guild);}
 close(){for(const [guild,t] of this.pending){clearTimeout(t);this.flush(guild);}this.pending.clear();this.db.close();}
}

export function restoredTrack(t:SavedTrack):Track{return {encoded:`saved:${t.identifier}`,info:{identifier:t.identifier,title:t.title,author:t.author,uri:t.url,length:t.length,position:0,isStream:false,isSeekable:true,sourceName:'saved'},pluginInfo:{requester:t.requester}};}
