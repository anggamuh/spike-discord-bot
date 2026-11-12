import {backup,DatabaseSync} from 'node:sqlite';
import {mkdir,readdir,rename,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';

/** Online SQLite backup includes committed WAL data. Rotate only our own completed snapshots. */
export class DatabaseBackups {
 private running?:Promise<string>;private timer?:NodeJS.Timeout;private stopped=false;
 constructor(private path:string,private directory=join(dirname(path),'backups'),private keep=7){}
 run():Promise<string>{
  if(this.running)return this.running;
  if(this.stopped)return Promise.reject(new Error('Backup manager stopped'));
  this.running=this.snapshot().finally(()=>{this.running=undefined;});return this.running;
 }
 private async snapshot(){
  await mkdir(this.directory,{recursive:true});
  const prefix=`manuk-${createHash('sha256').update(resolve(this.path)).digest('hex').slice(0,12)}-`;
  const name=`${prefix}${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}.sqlite`;
  const target=join(this.directory,name),temp=target+'.partial';
  const db=new DatabaseSync(this.path,{readOnly:true});
  try{await backup(db,temp);}catch(error){await rm(temp,{force:true});throw error;}finally{db.close();}
  try{await rename(temp,target);}catch(error){await rm(temp,{force:true});throw error;}
  const files=(await readdir(this.directory)).filter(f=>f.startsWith(prefix)&&f.endsWith('.sqlite')).sort().reverse();
  for(const file of files.slice(Math.max(1,this.keep)))await rm(join(this.directory,file));
  return target;
 }
 start(){
  if(this.timer||this.stopped)return;
  const tick=()=>{void this.run().then(()=>console.log('[BACKUP] Snapshot SQLite tersimpan.')).catch(()=>console.warn('[BACKUP] Gagal menyimpan snapshot. Periksa ruang disk dan izin folder data/backups.'));};
  tick();this.timer=setInterval(tick,24*60*60*1000).unref();
 }
 async stop(){this.stopped=true;if(this.timer)clearInterval(this.timer);await this.running?.catch(()=>{});}
}
