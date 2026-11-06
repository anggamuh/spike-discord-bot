import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';import {dirname} from 'node:path';
import type {Profile} from './domain.js';
export class Store{
 private db:DatabaseSync;
 constructor(path:string){mkdirSync(dirname(path),{recursive:true});this.db=new DatabaseSync(path);this.db.exec('PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS profiles(user_id TEXT NOT NULL, mode TEXT NOT NULL, profile TEXT NOT NULL, PRIMARY KEY(user_id,mode))');}
 get(user:string,mode:string):Profile|undefined{const row=this.db.prepare('SELECT profile FROM profiles WHERE user_id=? AND mode=?').get(user,mode);return row?JSON.parse(String(row.profile)):undefined;}
 set(user:string,mode:string,p:Profile){this.db.prepare('INSERT INTO profiles VALUES(?,?,?) ON CONFLICT(user_id,mode) DO UPDATE SET profile=excluded.profile').run(user,mode,JSON.stringify(p));}
 remove(user:string){this.db.prepare('DELETE FROM profiles WHERE user_id=?').run(user);}
 close(){this.db.close();}
}
