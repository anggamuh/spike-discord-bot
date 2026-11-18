import test from 'node:test';import assert from 'node:assert/strict';
import {LoadType,type Track} from 'shoukaku';
import {MusicSession,Serial,identifier,tracksFrom,type AudioPlayer} from '../src/music-core.js';
import {Music} from '../src/music.js';
const track=(id:string):Track=>({encoded:id,info:{identifier:id,title:id,author:'test',length:10000,isStream:false,isSeekable:true,position:0,sourceName:'youtube'},pluginInfo:{}});
class Fake implements AudioPlayer {played:string[]=[];paused=false;stopped=0;fail=false;async playTrack(o:{track:{encoded:string}}){if(this.fail)throw Error('failed');this.played.push(o.track.encoded);}async stopTrack(){this.stopped++;}async setPaused(v:boolean){this.paused=v;}}
test('search and URL restrictions block arbitrary/internal sources',()=>{assert.equal(identifier('501','youtube'),'ytmsearch:501');assert.equal(identifier('song','soundcloud'),'scsearch:song');assert.equal(identifier('song','bandcamp'),'bcsearch:song');assert.equal(identifier('https://youtu.be/example','youtube'),'https://youtu.be/example');for(const s of ['http://127.0.0.1/a','https://localhost/a','https://youtube.com.attacker.test/a','file:///a','https://user:pass@youtube.com/a','ytsearch:a'])assert.throws(()=>identifier(s,'youtube'));});
test('resolve supports track/search/playlist and empty/error',()=>{const a=track('a'),b=track('b');assert.deepEqual(tracksFrom({loadType:LoadType.SEARCH,data:[a,b]}),[a]);assert.deepEqual(tracksFrom({loadType:LoadType.TRACK,data:a}),[a]);assert.deepEqual(tracksFrom({loadType:LoadType.PLAYLIST,data:{encoded:'p',info:{name:'p',selectedTrack:0},pluginInfo:{},tracks:[a,b]}}),[a,b]);assert.throws(()=>tracksFrom(undefined));assert.throws(()=>tracksFrom({loadType:LoadType.EMPTY,data:{}}));});
test('finish advances FIFO; replaced/stopped/stale events do not double skip',async()=>{const f=new Fake(),s=new MusicSession(f,'voice');s.add([track('a'),track('b'),track('c')]);await s.next();await s.end('replaced','a');assert.equal(s.current?.encoded,'a');s.start('a');s.progress(5);await s.end('finished','a');assert.equal(s.current?.encoded,'b');await s.end('finished','a');assert.equal(s.current?.encoded,'b');await s.skip();await s.end('stopped','b');assert.equal(s.current?.encoded,'c');assert.deepEqual(f.played,['a','b','c']);});
test('loop song replays only on natural finish and skip advances',async()=>{const f=new Fake(),s=new MusicSession(f,'v');s.loop='song';s.add([track('a'),track('b')]);await s.next();s.start('a');s.progress(100);await s.end('finished','a');assert.equal(s.current?.encoded,'a');assert.deepEqual(f.played,['a','a']);await s.skip();assert.equal(s.current?.encoded,'b');});
test('loop queue returns naturally finished track to queue tail',async()=>{const f=new Fake(),s=new MusicSession(f,'v');s.loop='queue';s.add([track('a'),track('b')]);await s.next();s.start('a');s.progress(100);await s.end('finished','a');assert.equal(s.current?.encoded,'b');assert.deepEqual(s.queue.map(t=>t.encoded),['a']);});
test('pause state reset on next and loadFailed advances',async()=>{const f=new Fake(),s=new MusicSession(f,'v');s.add([track('a'),track('b')]);await s.next();await f.setPaused(true);await s.end('loadFailed','a');assert.equal(f.paused,false);assert.equal(s.current?.encoded,'b');assert.equal(s.lastError,'');});
test('start event without audio progress is treated as playback failure',async()=>{let now=1000;let fallbacks=0;const f=new Fake(),s=new MusicSession(f,'v',async()=>{fallbacks++;return track('replacement');},()=>now);const short=track('short');short.info.length=1000;s.add([short,track('next')]);await s.next();s.start('short');now+=500;await s.end('finished','short');assert.equal(fallbacks,1);assert.equal(s.current?.encoded,'replacement');assert.match(s.lastError,/Mencoba hasil terdekat/);});
test('queue cap and stop cleanup',async()=>{const f=new Fake(),s=new MusicSession(f,'v');assert.equal(s.add(Array.from({length:110},(_,n)=>track(String(n)))),100);await s.next();assert.throws(()=>s.add([track('extra')]));await s.stop();assert.equal(s.queue.length,0);assert.equal(s.current,undefined);await s.end('finished','0');assert.equal(f.played.length,1);});
test('REST failure leaves honest error instead of fake playing state',async()=>{const f=new Fake();f.fail=true;const s=new MusicSession(f,'v');s.add([track('a')]);await s.next();assert.equal(s.current,undefined);assert.ok(s.lastError);});
test('per-guild serial lock preserves order after rejection',async()=>{const serial=new Serial(),seen:number[]=[];const first=serial.run('g',async()=>{await new Promise(r=>setTimeout(r,10));seen.push(1);throw Error('test');});const second=serial.run('g',async()=>{seen.push(2);});await Promise.allSettled([first,second]);assert.deepEqual(seen,[1,2]);await serial.run('g',async()=>{seen.push(3);});assert.deepEqual(seen,[1,2,3]);});
test('three failed playback requests do not stop queue advancement',async()=>{let attempts=0;const f:AudioPlayer={async playTrack(){attempts++;if(attempts<=3)throw Error('temporary failure');},async stopTrack(){},async setPaused(){}};const s=new MusicSession(f,'v');s.add(Array.from({length:5},(_,n)=>track(String(n))));await s.next();assert.equal(attempts,4);assert.equal(s.current?.encoded,'3');assert.equal(s.queue.length,1);});

test('skip with autoplay ON and empty queue searches and plays a similar song',async()=>{
 const f=new Fake(),s=new MusicSession(f,'v');
 s.autoplay=true;
 const first=track('first'),similar=track('similar');
 first.info.length=120000;similar.info.length=120000;
 let searches=0;
 const owner:any={
  sessions:new Map([['g',s]]),
  shoukaku:{getIdealNode:()=>({rest:{resolve:async()=>{searches++;return {loadType:LoadType.SEARCH,data:[similar]};}}})},
  persistence:{history:()=>[]}
 };
 s.add([first]);await s.next();s.start('first');
 await (Music.prototype as any).skipWithAutoplay.call(owner,'g',s);
 assert.ok(searches>0,'recommendation source must be queried');
 assert.equal(s.current?.encoded,'similar');
 assert.equal((s.current?.pluginInfo as any)?.requester,'autoplay');
 assert.deepEqual(f.played,['first','similar']);
});

test('skip respects manually queued tracks and autoplay OFF',async()=>{
 const f=new Fake(),s=new MusicSession(f,'v');
 const owner:any={sessions:new Map([['g',s]]),shoukaku:{getIdealNode:()=>{throw Error('must not search');}},persistence:{history:()=>[]}};
 s.autoplay=true;s.add([track('first'),track('queued')]);await s.next();
 await (Music.prototype as any).skipWithAutoplay.call(owner,'g',s);
 assert.equal(s.current?.encoded,'queued');
 s.autoplay=false;
 await (Music.prototype as any).skipWithAutoplay.call(owner,'g',s);
 assert.equal(s.current,undefined);
 assert.deepEqual(f.played,['first','queued']);
});

test('late autoplay result cannot interrupt a newly queued track',async()=>{
 const f=new Fake(),s=new MusicSession(f,'v');
 let release!:()=>void;
 const waiting=new Promise<void>(resolve=>{release=resolve;});
 const candidate=track('recommendation');candidate.info.length=120000;
 let started!:()=>void;
 const searching=new Promise<void>(resolve=>{started=resolve;});
 const owner:any={sessions:new Map([['g',s]]),shoukaku:{getIdealNode:()=>({rest:{resolve:async()=>{started();await waiting;return {loadType:LoadType.SEARCH,data:[candidate]};}}})},persistence:{history:()=>[]}};
 s.autoplay=true;s.add([track('first')]);await s.next();
 const skip=(Music.prototype as any).skipWithAutoplay.call(owner,'g',s);
 await searching;
 s.add([track('queued')]);await s.next();
 release();await skip;
 assert.equal(s.current?.encoded,'queued');
 assert.deepEqual(f.played,['first','queued']);
});
