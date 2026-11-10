import type {Track} from 'shoukaku';
import {MusicError} from './music-core.js';
export type MusicPreferences={volume:number;autoplay:boolean;autoplayStyle:'artist'|'mix';fair:boolean;idleSeconds:number;emptySeconds:number;panelChannel?:string;stay:boolean;stayVoice?:string};
export const defaultPreferences:MusicPreferences={volume:50,autoplay:false,autoplayStyle:'artist',fair:false,idleSeconds:120,emptySeconds:60,stay:false};
export function parsePosition(value:string){
 if(!/^\d+(?::[0-5]\d){0,2}$/.test(value.trim()))throw new MusicError('Gunakan detik, mm:ss, atau hh:mm:ss. Contoh 90 atau 1:30.');
 const seconds=value.trim().split(':').reduce((n,v)=>n*60+Number(v),0);
 if(!Number.isSafeInteger(seconds)||seconds>86400)throw new MusicError('Posisi tidak valid.');return seconds*1000;
}
export const requester=(t:Track|undefined)=>String((t?.pluginInfo as Record<string,unknown>|undefined)?.requester??'unknown');
/** FIFO within each listener, rotating after the currently playing listener. Priority requests remain first. */
export function fairOrder(queue:Track[],current?:Track){
 const priority=queue.filter(t=>(t.pluginInfo as any)?.playNext),normal=queue.filter(t=>!(t.pluginInfo as any)?.playNext);
 const groups=new Map<string,Track[]>();for(const t of normal){const id=requester(t);if(!groups.has(id))groups.set(id,[]);groups.get(id)!.push(t);}
 const keys=[...groups.keys()],last=requester(current),index=keys.indexOf(last);if(index>=0)keys.push(...keys.splice(0,index+1));
 const ordered:Track[]=[...priority];while(keys.some(k=>groups.get(k)!.length))for(const k of keys){const t=groups.get(k)!.shift();if(t)ordered.push(t);}return ordered;
}
