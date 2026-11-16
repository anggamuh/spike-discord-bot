import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {VoiceStatusManager,musicVoiceStatus} from '../src/voice-status.js';
import {MusicSession} from '../src/music-core.js';
import {Music} from '../src/music.js';
import {LoadType,type Track} from 'shoukaku';

function fixture(options: Partial<ConstructorParameters<typeof VoiceStatusManager>[0]> = {}) {
 const calls: Array<[string,string|null]> = [], errors: unknown[] = [];
 const manager = new VoiceStatusManager({debounceMs:1,put:async(c,s)=>{calls.push([c,s]);},canWrite:()=>true,onError:e=>errors.push(e),...options});
 manager.observe('v',null);manager.observe('w',null);
 return {manager,calls,errors};
}
const track=(id:string):Track=>({encoded:id,info:{identifier:id,title:id,author:'Artist',length:10000,isStream:false,isSeekable:true,position:0,sourceName:'youtube'},pluginInfo:{}});

test('play → skip → pause → resume → natural end → stop uses actual session notifications',async()=>{
 const f=fixture(),s=new MusicSession({async playTrack(){},async stopTrack(){},async setPaused(){}},'v');
 let pending=Promise.resolve();
 s.onPlaybackChange=()=>{pending=s.current?f.manager.update('g','v',musicVoiceStatus(s.current,s.paused)):f.manager.clear('g','v');};
 s.add([track('a'),track('b')]);await s.next();s.start('a');await pending;
 await s.skip();s.start('b');await pending;
 await s.setPaused(true);await pending;await s.setPaused(false);await pending;
 s.progress(100);await s.end('finished','b');await pending;await s.stop();await pending;
 assert.deepEqual(f.calls.map(x=>x[1]),[' a — Artist',' b — Artist','⏸️ b — Artist',' b — Artist',null]);
 await f.manager.shutdown();
});
test('autoplay completion publishes the next track through the existing finishTrack path',async()=>{
 const f=fixture(),s=new MusicSession({async playTrack(){},async stopTrack(){},async setPaused(){}},'v');
 let pending=Promise.resolve();s.onPlaybackChange=()=>{pending=s.current?f.manager.update('g','v',musicVoiceStatus(s.current,s.paused)):f.manager.clear('g','v');};
 s.autoplay=true;s.add([track('a')]);await s.next();s.start('a');s.progress(100);await pending;
 const owner={shoukaku:{getIdealNode:()=>({rest:{resolve:async()=>({loadType:LoadType.SEARCH,data:[track('b')]})}})},persistence:{history:()=>[]}};
 await (Music.prototype as any).finishTrack.call(owner,'g',s);s.start('b');await pending;
 assert.equal(f.calls.at(-1)?.[1],' b — Artist');await s.stop();await pending;await f.manager.shutdown();
});
test('unchanged status is deduplicated and simultaneous guilds are independent',async()=>{
 const f=fixture();await Promise.all([f.manager.update('g','v','a'),f.manager.update('h','w','b')]);
 await f.manager.update('g','v','a');await f.manager.clear('g','v');
 assert.deepEqual(f.calls,[['v','a'],['w','b'],['v',null]]);await f.manager.shutdown();
});
test('unknown and manual statuses are never overwritten or cleared',async()=>{
 const f=fixture();await f.manager.update('g','unknown','a');await f.manager.clear('g','unknown');
 f.manager.observe('v','manual');await f.manager.update('g','v','a');await f.manager.clear('g','v');assert.equal(f.calls.length,0);
 f.manager.observe('v',null);await f.manager.update('g','v','a');f.manager.observe('v','new manual');await f.manager.clear('g','v');assert.deepEqual(f.calls,[['v','a']]);await f.manager.shutdown();
});
test('rapid skips are serialized and coalesced; cleanup wins over an in-flight write',async()=>{
 let release!:()=>void,started!:()=>void;const block=new Promise<void>(r=>release=r),start=new Promise<void>(r=>started=r);
 const calls: Array<string|null>=[];
 const f=fixture({put:async(_c,s)=>{calls.push(s);if(s==='a'){started();await block;}}});
 const a=f.manager.update('g','v','a');await start;
 const b=f.manager.update('g','v','b'),c=f.manager.update('g','v','c');release();await Promise.all([a,b,c]);
 assert.deepEqual(calls,['a','c']);await f.manager.clear('g','v');assert.equal(calls.at(-1),null);await f.manager.shutdown();
});
test('gateway acknowledgement before HTTP response preserves ownership; manual edit in flight wins',async()=>{
 let manager!:VoiceStatusManager;
 const f=fixture({put:async(c,s)=>{manager.observe(c,s);}});manager=f.manager;
 await manager.update('g','v','a');await manager.update('g','v','b');await manager.clear('g','v');await manager.shutdown();
 const calls: Array<string|null>=[];
 const other=fixture({put:async(c,s)=>{calls.push(s);other.manager.observe(c,'manual');}});
 await other.manager.update('g','v','a');await other.manager.clear('g','v');assert.deepEqual(calls,['a']);await other.manager.shutdown();
});
test('move clears owned old channel and publishes new channel; disconnected writes are guarded at commit',async()=>{
 let connected='v';const f=fixture({canWrite:(_g,c,clear)=>clear||connected===c});
 await f.manager.update('g','v','a');connected='w';
 await Promise.all([f.manager.clear('g','v'),f.manager.update('g','w','a')]);
 assert.deepEqual(f.calls,[['v','a'],['v',null],['w','a']]);
 connected='';await f.manager.update('g','w','b');assert.equal(f.calls.length,3);assert.equal(f.errors.length,1);await f.manager.shutdown();
});
test('API failure retries with backoff and latest desired state, without flooding',async()=>{
 let attempts=0;const calls:Array<string|null>=[];
 const f=fixture({retryMs:15,put:async(_c,s)=>{attempts++;if(attempts===1)throw {status:429,retry_after:0.01};calls.push(s);}});
 await f.manager.update('g','v','a');await f.manager.update('g','v','b');assert.equal(attempts,1);
 await delay(40);assert.deepEqual(calls,['b']);assert.equal(f.errors.length,1);await f.manager.shutdown();
});
test('disabled module performs no writes including cleanup; shutdown cancels pending retry',async()=>{
 const f=fixture({enabled:false});await f.manager.update('g','v','a');await f.manager.clear('g','v');assert.equal(f.calls.length,0);await f.manager.shutdown();
 let attempts=0;const g=fixture({retryMs:15,put:async()=>{attempts++;throw Error('forbidden');}});
 await g.manager.update('g','v','a');await g.manager.shutdown();await delay(30);assert.equal(attempts,1);
});
test('Unicode formatting is bounded to 500 code points without cutting surrogate pairs',()=>{
 assert.equal(musicVoiceStatus(track('a'),false),' a — Artist');assert.equal(musicVoiceStatus(track('a'),true),'⏸️ a — Artist');
 assert.equal(Array.from(musicVoiceStatus(track('🎵'.repeat(600)),false)).length,500);
});
