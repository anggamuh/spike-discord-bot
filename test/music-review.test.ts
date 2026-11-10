import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LoadType,type Track} from 'shoukaku';
import {MusicPersistence,restoredTrack,type SavedSession} from '../src/music-persistence.js';
import {MusicSession} from '../src/music-core.js';
import {Music} from '../src/music.js';
import {recommendTrack,prepareTrack} from '../src/music-resolver.js';
import {commands} from '../src/commands.js';
const saved={identifier:'a',title:'First',author:'Artist',url:'https://youtu.be/a',length:120000,requester:'u'};
const track=(id:string):Track=>({...restoredTrack({...saved,identifier:id,title:id}),encoded:id,info:{...restoredTrack(saved).info,identifier:id,title:id,sourceName:'youtube'}});
const player=()=>({volume:50,played:[] as string[],async playTrack(o:any){this.played.push(o.track.encoded);},async stopTrack(){},async setPaused(){}});
test('pending snapshot is isolated and survives close/reopen; panel survives DJ removal',()=>{
 const dir=mkdtempSync(join(tmpdir(),'review-')),path=join(dir,'state.sqlite');let db=new MusicPersistence(path);
 try{const state:SavedSession={queue:[saved],position:4000,loop:'queue',autoplay:true,volume:30};db.save('g',state);state.queue=[];assert.equal(db.load('g')!.queue.length,1);db.load('g')!.queue.pop();assert.equal(db.load('g')!.queue.length,1);db.setPanel('g','c','m');db.setDjRole('g','r');db.setDjRole('g',undefined);db.close();db=new MusicPersistence(path);assert.equal(db.load('g')!.volume,30);assert.equal(db.panel('g')!.messageId,'m');assert.equal(db.load('other'),undefined);db.clearSession('g');assert.equal(db.load('g'),undefined);}finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
test('autoplay excludes current and recent songs and falls back to SoundCloud',async()=>{
 const calls:string[]=[];const next=await recommendTrack(async q=>{calls.push(q);return {loadType:LoadType.SEARCH,data:q.startsWith('sc')?[track('new')]:[track('old'),track('current')]};},track('current'),['old']);assert.equal(next?.encoded,'new');assert.equal(calls.length,2);
});
test('restored queue resolves lazily and retains requester',async()=>{const result=await prepareTrack(async()=>({loadType:LoadType.SEARCH,data:[track('resolved')]}),restoredTrack(saved));assert.equal(result.encoded,'resolved');assert.equal((result.pluginInfo as any).requester,'u');});
test('watchdog completion respects song loop and creates distinct playback identity',async()=>{
 const p=player(),s=new MusicSession(p,'v');s.loop='song';s.add([track('a'),track('b')]);await s.next();s.start('a');s.progress(5000);const old=s.current;await (Music.prototype as any).finishTrack.call({},'g',s,true);assert.equal(s.current?.encoded,'a');assert.notEqual(s.current,old);assert.deepEqual(p.played,['a','a']);await s.stop();
});
test('completion starts autoplay only after queue empties',async()=>{
 const s=new MusicSession(player(),'v');s.autoplay=true;s.add([track('a')]);await s.next();s.start('a');s.progress(5000);const owner={shoukaku:{getIdealNode:()=>({rest:{resolve:async()=>({loadType:LoadType.SEARCH,data:[track('a'),track('b')]})}})},persistence:{history:()=>[]}};await (Music.prototype as any).finishTrack.call(owner,'g',s);assert.equal(s.current?.encoded,'b');await s.stop();
});
test('public panel edits same message across song changes and namespaces controls',async()=>{
 const s=new MusicSession(player(),'v');s.add([track('a'),track('b')]);await s.next();let sends=0,edits=0,payload:any;const message={id:'m',channelId:'c',async edit(p:any){edits++;payload=p;return this;}};
 const owner:any={publicBusy:new Set(),publicMessages:new Map(),notificationChannels:new WeakMap([[s,'c']]),sessions:new Map([['g',s]]),persistence:{panel:()=>undefined,setPanel(){}},client:{channels:{fetch:async()=>({isSendable:()=>true,send:async(p:any)=>{sends++;payload=p;return message;}})}},publicCard:(Music.prototype as any).publicCard};
 await (Music.prototype as any).refreshPublic.call(owner,'g',s);await s.skip();await (Music.prototype as any).refreshPublic.call(owner,'g',s);assert.equal(sends,1);assert.equal(edits,1);assert.match(JSON.stringify(payload),/public:music:skip/);assert.deepEqual(payload.allowedMentions.parse,[]);await s.stop();
});
test('all slash command builders validate and names are unique',()=>{const names=commands.map(c=>c.toJSON().name);assert.equal(new Set(names).size,names.length);assert.ok(names.includes('panel'));});

test('realistic Lavalink v4 state.connected snapshot recovers 3:29/3:33 stall and starts autoplay',async()=>{
 let now=1000;const p=player(),s=new MusicSession(p,'v',undefined,()=>now);const a=track('a');a.info.length=213000;s.autoplay=true;s.add([a]);await s.next();s.start('a');s.progress(209000);now+=16000;
 const owner:any={checking:new Set(),sessions:new Map([['g',s]]),serial:{run:async(_g:string,fn:()=>Promise<void>)=>fn()},onProgress:(Music.prototype as any).onProgress,save(){},announceTrack:async()=>{},persistence:{history:()=>[]},shoukaku:{getIdealNode:()=>({rest:{resolve:async()=>({loadType:LoadType.SEARCH,data:[a,track('b')]})}})},finishTrack:(Music.prototype as any).finishTrack,armIdle(){},refreshPanel:async()=>{}};
 const remote={track:a,paused:false,voice:{token:'test',endpoint:'test',sessionId:'test'},state:{connected:true,position:209000}};
 await (Music.prototype as any).checkQueue.call(owner,'g',s,{node:{rest:{getPlayer:async()=>remote}}});assert.equal(s.current?.encoded,'b');assert.deepEqual(p.played,['a','b']);assert.equal(owner.checking.size,0);await s.stop();
});
test('watchdog honors explicit disconnect and pause, but accepts omitted optional connectivity',async()=>{
 let now=0;const s=new MusicSession(player(),'v',undefined,()=>now);const a=track('a');a.info.length=213000;s.add([a,track('b')]);await s.next();s.start('a');s.progress(209000);now=16000;
 const owner:any={checking:new Set(),sessions:new Map([['g',s]]),serial:{run:async(_g:string,fn:()=>Promise<void>)=>fn()},onProgress:()=>{},finishTrack:(Music.prototype as any).finishTrack,armIdle(){},refreshPanel:async()=>{}};
 for(const response of [{paused:false,state:{connected:false}},{paused:true,state:{connected:true}}]){await (Music.prototype as any).checkQueue.call(owner,'g',s,{node:{rest:{getPlayer:async()=>({track:a,voice:{},...response})}}});assert.equal(s.current?.encoded,'a');}
 await (Music.prototype as any).checkQueue.call(owner,'g',s,{node:{rest:{getPlayer:async()=>({track:a,paused:false,voice:{}})}}});assert.equal(s.current?.encoded,'b');await s.stop();
});
