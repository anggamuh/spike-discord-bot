import test from 'node:test';
import assert from 'node:assert/strict';
import {VoiceStatusManager} from '../src/voice-status.js';

function fixture(put:(channel:string,status:string|null)=>Promise<unknown>=async()=>undefined){
 const calls:Array<[string,string|null]>=[],owned=new Map<string,{channelId:string;status:string}>(),errors:unknown[]=[];
 const manager=new VoiceStatusManager({put:async(c,s)=>{calls.push([c,s]);return put(c,s);},loadOwned:g=>owned.get(g),saveOwned:(g,c,s)=>owned.set(g,{channelId:c,status:s}),clearOwned:g=>owned.delete(g),onError:e=>errors.push(e),debounceMs:1});
 return {manager,calls,owned,errors};
}
test('track changes and pause/resume replace current status; clear removes only Manuk status',async()=>{
 const f=fixture();await f.manager.update('g1','v1',' Song One - Artist',true);await f.manager.update('g1','v1',' Song One - Artist',true);await f.manager.update('g1','v1','⏸️ Song One - Artist',true);await f.manager.update('g1','v1',' Song Two - Artist',true);await f.manager.clear('g1','v1');
 assert.deepEqual(f.calls,[['v1',' Song One - Artist'],['v1','⏸️ Song One - Artist'],['v1',' Song Two - Artist'],['v1',null]]);assert.equal(f.owned.size,0);
});
test('status state is isolated for simultaneous guilds',async()=>{
 const f=fixture();await Promise.all([f.manager.update('g1','v1',' One',true),f.manager.update('g2','v2',' Two',true)]);await f.manager.clear('g1','v1');
 assert.deepEqual(f.calls,[['v1',' One'],['v2',' Two'],['v1',null]]);assert.equal(f.owned.get('g2')?.status,' Two');
});
test('a known manual status is never replaced or cleared',async()=>{
 const f=fixture();f.manager.observe('v1','Manual status');await f.manager.update('g1','v1',' Manuk track',true);await f.manager.clear('g1','v1');assert.deepEqual(f.calls,[]);
});
test('permission denial makes no REST request and REST errors are contained',async()=>{
 const f=fixture(async()=>{throw Object.assign(new Error('forbidden'),{status:403});});await f.manager.update('g1','v1',' Song',false);await f.manager.update('g1','v1',' Song',true);assert.equal(f.calls.length,1);assert.equal(f.errors.length,1);
});
test('rapid successive tracks serialize requests and leave the newest status last',async()=>{
 let release!:()=>void,started!:()=>void;const didStart=new Promise<void>(r=>started=r),block=new Promise<void>(r=>release=r);
 const f=fixture(async(_c,status)=>{if(status===' First'){started();await block;}});const first=f.manager.update('g','v',' First',true);await didStart;const second=f.manager.update('g','v',' Second',true);release();await Promise.all([first,second]);assert.deepEqual(f.calls,[['v',' First'],['v',' Second']]);assert.equal(f.owned.get('g')?.status,' Second');
});
test('status length is limited to 500 Unicode code points',async()=>{const f=fixture();const long='🎵'.repeat(600);await f.manager.update('g','v',long,true);assert.equal(Array.from(f.calls[0]![1]!).length,500);});
