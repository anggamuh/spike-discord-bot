import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {DatabaseBackups} from '../src/database-backup.js';
import {MusicPersistence,type SavedTrack} from '../src/music-persistence.js';
import {commands} from '../src/commands.js';
import {commandLines,helpGroups,helpView} from '../src/help.js';
import {Music} from '../src/music.js';
const u='111111111111111111',v='222222222222222222';
const track:SavedTrack={identifier:'a',title:'Song',author:'Artist',url:'',length:100000,requester:u};
test('help covers every registered command exactly once including all subcommands; every category fits Discord',()=>{
 const names=Object.values(helpGroups).flatMap(g=>g.names);
 assert.deepEqual([...names].sort(),commands.map(c=>c.name).sort());
 for(const [key,g] of Object.entries(helpGroups)){
  const data=helpView(key);const embed=data.embeds[0]!.toJSON();
  assert.ok(embed.description!.length<=4096);assert.ok(data.embeds[0]!.length<=6000);
  assert.equal(data.components[0]!.toJSON().components.length,1);
  for(const command of commands.filter(c=>g.names.includes(c.name))){
   const subs=command.toJSON().options?.filter(o=>o.type===1)??[];
   for(const sub of subs)assert.ok(commandLines(g.names).some(line=>line.includes(`/${command.name} ${sub.name}`)));
  }
 }
});
test('profile settings persist, isolate users, reject unsafe colors and reset without deleting stats',()=>{
 const dir=mkdtempSync(join(tmpdir(),'settings-')),path=join(dir,'db');let db=new MusicPersistence(path);
 try{
  db.recordListening('g',track,[u],5000);
  db.setProfileSettings(u,{theme:'purple',background:'waves',accent:'#a78bfa',bio:'Rock & roll'});
  assert.throws(()=>db.setProfileSettings(u,{accent:'"/><x>'}));assert.equal(db.profileSettings(v).bio,'');
  db.close();db=new MusicPersistence(path);assert.equal(db.profileSettings(u).bio,'Rock & roll');
  db.setProfileSettings(u,{},true);assert.deepEqual(db.profileSettings(u),{theme:'red',background:'vinyl',bio:''});assert.equal(db.listeningProfile(u).total.ms,5000);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('leaderboard isolates guilds and counts each listener while playback totals are not multiplied',()=>{
 const dir=mkdtempSync(join(tmpdir(),'top-')),db=new MusicPersistence(join(dir,'db'));
 try{
  db.recordListening('g',track,[u,v],5000);db.recordListening('g',track,[v],3000);db.recordListening('other',track,[u],15000);
  db.recordPlayback('g',track,5000,1);db.recordPlayback('g',{...track,author:'ARTIST'},3000,1);db.recordPlayback('other',track,15000,1);
  assert.deepEqual(db.leaderboard('g','listeners').map(r=>[r.name,r.ms]),[[v,8000],[u,5000]]);
  assert.equal(db.leaderboard('g','tracks')[0]!.ms,8000);assert.equal(db.leaderboard('g','artists')[0]!.ms,8000);
  assert.deepEqual(db.leaderboard('empty','listeners'),[]);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('online backup includes WAL, coalesces overlapping calls, rotates only its own files, and can be reopened',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'backup-')),path=join(dir,'db'),out=join(dir,'backups');const db=new DatabaseSync(path);
 const backups=new DatabaseBackups(path,out,2);
 try{
  db.exec('PRAGMA journal_mode=WAL; CREATE TABLE sample(value TEXT); INSERT INTO sample VALUES(\'committed in WAL\')');
  const a=backups.run(),b=backups.run();assert.equal(a,b);const snapshot=await a;
  const restored=new DatabaseSync(snapshot);try{assert.equal(restored.prepare('SELECT value FROM sample').get()!.value,'committed in WAL');assert.equal(restored.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');}finally{restored.close();}
  writeFileSync(join(out,'personal.sqlite'),'keep');
  await backups.run();await backups.run();assert.equal(readdirSync(out).filter(f=>f.startsWith('manuk-')).length,2);assert.ok(readdirSync(out).includes('personal.sqlite'));
  await backups.stop();await assert.rejects(backups.run());
 }finally{await backups.stop();db.close();rmSync(dir,{recursive:true,force:true});}
});
test('failed backup does not delete existing snapshots',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'backup-error-')),b=new DatabaseBackups(join(dir,'missing'),dir,1);
 try{writeFileSync(join(dir,'personal.sqlite'),'keep');await assert.rejects(b.run());assert.ok(readdirSync(dir).includes('personal.sqlite'));}finally{await b.stop();rmSync(dir,{recursive:true,force:true});}
});
test('top and profileset work without voice connection and suppress mentions',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'commands-')),db=new MusicPersistence(join(dir,'db'));let response:any;
 const owner:any={persistence:db,leaderboard:(Music.prototype as any).leaderboard,profileSettings:(Music.prototype as any).profileSettings,client:{users:{fetch:async()=>({username:'@everyone'})}}};
 const values:Record<string,string>={theme:'blue',bio:'My music'};
 const i:any={commandName:'profileset',inGuild:()=>true,guild:{id:'g'},guildId:'g',user:{id:u},options:{getString:(key:string)=>values[key]??null,getBoolean:()=>false},editReply:async(r:any)=>{response=r;}};
 try{await (Music.prototype as any).handle.call(owner,i);assert.equal(db.profileSettings(u).theme,'blue');i.commandName='top';await (Music.prototype as any).handle.call(owner,i);assert.deepEqual(response.allowedMentions.parse,[]);}finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
