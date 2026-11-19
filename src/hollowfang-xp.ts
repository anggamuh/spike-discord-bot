/** Hollowfang XP is derived from the existing listening samples plus rate-limited chat XP.
 * No new voice tracker: listener time already lives in music_audience. */
export type Achievement = {id:string;name:string;description:string;unlocked:boolean};
export type ProgressSnapshot = {
 xp:number;chatXp:number;chatMessages:number;listeningMs:number;tracks:number;friends:number;
 level:number;currentLevelXp:number;nextLevelXp:number;rank:string;achievements:Achievement[];
};

export function xpForLevel(level:number):number {
 return 100*Math.max(0,Math.floor(level)-1)**2;
}
export function levelForXp(xp:number):number {
 return Math.max(1,Math.floor(Math.sqrt(Math.max(0,xp)/100))+1);
}
export function rankForLevel(level:number):string {
 if(level>=30)return 'THE HOLLOW LEGEND';
 if(level>=20)return 'NIGHT SOVEREIGN';
 if(level>=12)return 'HOLLOW ELITE';
 if(level>=7)return 'SHADOW KEEPER';
 if(level>=3)return 'DUSK WALKER';
 return 'NEW BLOOD';
}
export function buildProgress(stats:{listeningMs:number;tracks:number;friends:number;chatXp:number;chatMessages:number}):ProgressSnapshot {
 const listeningMs=Math.max(0,Math.floor(stats.listeningMs));
 // One music XP per full minute listened, scoped to Hollowfang only.
 const xp=Math.floor(listeningMs/60_000)+Math.max(0,Math.floor(stats.chatXp));
 const level=levelForXp(xp);
 const achievements:Achievement[]=[
  {id:'first-echo',name:'FIRST ECHO',description:'Dengarkan musik selama 1 menit',unlocked:listeningMs>=60_000},
  {id:'night-listener',name:'NIGHT LISTENER',description:'Dengarkan musik selama 1 jam',unlocked:listeningMs>=3_600_000},
  {id:'music-addict',name:'MUSIC ADDICT',description:'Dengarkan musik selama 10 jam',unlocked:listeningMs>=36_000_000},
  {id:'track-hunter',name:'TRACK HUNTER',description:'Dengarkan 10 lagu berbeda',unlocked:stats.tracks>=10},
  {id:'kindred-soul',name:'KINDRED SOUL',description:'Dengarkan musik bersama satu teman',unlocked:stats.friends>=1},
  {id:'first-whisper',name:'FIRST WHISPER',description:'Dapatkan XP dari satu pesan chat',unlocked:stats.chatMessages>=1},
  {id:'voice-of-hollow',name:'VOICE OF HOLLOW',description:'Dapatkan XP dari 100 pesan chat',unlocked:stats.chatMessages>=100},
  {id:'hollow-elite',name:'HOLLOW ELITE',description:'Capai level 12',unlocked:level>=12}
 ];
 return {xp,chatXp:stats.chatXp,chatMessages:stats.chatMessages,listeningMs,tracks:stats.tracks,friends:stats.friends,
  level,currentLevelXp:xp-xpForLevel(level),nextLevelXp:xpForLevel(level+1)-xpForLevel(level),rank:rankForLevel(level),achievements};
}
