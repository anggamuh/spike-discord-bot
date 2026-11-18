import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MusicPersistence,type SavedTrack} from '../src/music-persistence.js';
import {buildProgress,levelForXp,xpForLevel,rankForLevel} from '../src/hollowfang-xp.js';

const guild='1491933246542446743',other='1491933246542446744';
const member='111111111111111111',friend='222222222222222222';
const track:SavedTrack={identifier:'abc',title:'Gravits',author:'Artist',url:'',length:240000,requester:member};

test('levels have deterministic increasing thresholds and milestone rank names',()=>{
 assert.equal(levelForXp(0),1);
 assert.equal(levelForXp(99),1);
 assert.equal(levelForXp(100),2);
 assert.equal(levelForXp(399),2);
 assert.equal(levelForXp(400),3);
 assert.equal(xpForLevel(3),400);
 assert.equal(rankForLevel(12),'HOLLOW ELITE');
 const p=buildProgress({listeningMs:60000,tracks:1,friends:1,chatXp:99,chatMessages:1});
 assert.equal(p.xp,100);
 assert.equal(p.level,2);
 assert.equal(p.currentLevelXp,0);
 assert.equal(p.nextLevelXp,300);
 assert.ok(p.achievements.find(a=>a.id==='first-echo')!.unlocked);
 assert.ok(p.achievements.find(a=>a.id==='kindred-soul')!.unlocked);
 assert.ok(p.achievements.find(a=>a.id==='first-whisper')!.unlocked);
 assert.equal(p.achievements.find(a=>a.id==='music-addict')!.unlocked,false);
});

test('rate-limited chat XP persists, ignores duplicate/out-of-order messages, enforces 200 XP per WIB day and isolates guilds',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hfxp-')),path=join(dir,'db');
 let db=new MusicPersistence(path);
 try{
  const base=Date.UTC(2026,10,18,0,0,0);
  assert.equal(db.awardChatXP(guild,member,base),true);
  assert.equal(db.awardChatXP(guild,member,base),false);
  assert.equal(db.awardChatXP(guild,member,base+59_999),false);
  assert.equal(db.awardChatXP(guild,member,base+60_000),true);
  assert.equal(db.awardChatXP(guild,member,base-60_000),false);
  // Already 2 claims today; fill remaining 18.
  for(let n=2;n<20;n++)assert.equal(db.awardChatXP(guild,member,base+n*60_000),true);
  assert.equal(db.awardChatXP(guild,member,base+20*60_000),false);
  assert.equal(db.progress(guild,member).chatXp,200);
  assert.equal(db.progress(guild,member).chatMessages,20);
  assert.equal(db.progress(other,member).chatXp,0);
  assert.equal(db.awardChatXP(other,member,base),true);
  db.close();db=new MusicPersistence(path);
  assert.equal(db.progress(guild,member).xp,200);
  assert.equal(db.awardChatXP(guild,member,base+86400_000),true);
  assert.equal(db.progress(guild,member).chatXp,210);
  assert.equal(db.progress(other,member).chatXp,10);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('existing sampled listening yields music XP and achievements without writing a second voice ledger',()=>{
 const dir=mkdtempSync(join(tmpdir(),'hfmusic-')),db=new MusicPersistence(join(dir,'db'));
 try{
  for(let n=0;n<4;n++)db.recordListening(guild,track,[member,friend],15_000);
  db.recordListening(other,track,[member],15_000);
  const progress=db.progress(guild,member);
  assert.equal(progress.listeningMs,60_000);
  assert.equal(progress.xp,1);
  assert.equal(progress.tracks,1);
  assert.equal(progress.friends,1);
  assert.ok(progress.achievements.find(a=>a.id==='first-echo')!.unlocked);
  assert.ok(progress.achievements.find(a=>a.id==='kindred-soul')!.unlocked);
  assert.equal(db.progress(other,member).listeningMs,15_000);
  assert.equal(db.xpLeaderboard(guild)[0]!.xp,1);
  assert.deepEqual(db.xpLeaderboard(other).map(x=>x.xp),[0]);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});

test('achievement milestones unlock only when factual conditions are reached',()=>{
 const before=buildProgress({listeningMs:0,tracks:0,friends:0,chatXp:0,chatMessages:0});
 assert.equal(before.achievements.filter(x=>x.unlocked).length,0);
 const after=buildProgress({listeningMs:36_000_000,tracks:10,friends:2,chatXp:1000,chatMessages:100});
 for(const id of ['first-echo','night-listener','music-addict','track-hunter','kindred-soul','first-whisper','voice-of-hollow']){
  assert.ok(after.achievements.find(a=>a.id===id)!.unlocked,id);
 }
 assert.equal(after.achievements.find(a=>a.id==='hollow-elite')!.unlocked,false);
});
