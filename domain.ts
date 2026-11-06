export type Profile = { name: string; tag: string; region: string; puuid: string };
export type Rank = { tier: string; rr: number; change: number; peak: string };
export type Match = { map: string; agent: string; kills: number; deaths: number; assists: number; headshots: number; bodyshots: number; legshots: number; score: number; rounds: number; result: 'MENANG'|'KALAH'|'SERI'; scoreline: string };
export function parseId(input: string) {
 const parts=input.trim().split('#');
 if(parts.length!==2 || !parts[0].trim() || !parts[1].trim() || parts[0].trim().length>32 || parts[1].trim().length>16) throw new Error('Gunakan Riot ID lengkap, contoh: Angga#IDN.');
 return {name:parts[0].trim(),tag:parts[1].trim()};
}
export function summarize(rows:Match[]) {
 if(!rows.length) throw new Error('Belum ada pertandingan Competitive yang tersedia.');
 const sum=(key:'kills'|'deaths'|'headshots'|'bodyshots'|'legshots'|'score'|'rounds')=>rows.reduce((n,m)=>n+m[key],0);
 const k=sum('kills'),d=sum('deaths'),hits=sum('headshots')+sum('bodyshots')+sum('legshots'),rounds=sum('rounds');
 return {count:rows.length,wins:rows.filter(m=>m.result==='MENANG').length,draws:rows.filter(m=>m.result==='SERI').length,kd:d?(k/d).toFixed(2):k?'∞':'—',hs:hits?(100*sum('headshots')/hits).toFixed(1)+'%':'—',acs:rounds?String(Math.round(sum('score')/rounds)):'—'};
}
export function normalizeMatches(raw:unknown,puuid:string):Match[]{
 if(!Array.isArray(raw)) throw new Error('Format riwayat dari API tidak dikenali.');
 return raw.flatMap((m:any)=>{
 if(!m?.metadata?.is_completed) return [];
 if(!Array.isArray(m.players)||!Array.isArray(m.teams)) throw new Error('Format pertandingan dari API tidak lengkap.');
 const p=m.players.find((p:any)=>p.puuid===puuid);if(!p)return [];
 const team=m.teams.find((t:any)=>t.team_id===p.team_id);
 const s=p.stats;
 if(!team||!s||!['kills','deaths','assists','headshots','bodyshots','legshots','score'].every(k=>Number.isFinite(s[k]))||!Number.isFinite(team.rounds?.won)||!Number.isFinite(team.rounds?.lost)) throw new Error('Statistik dari API tidak lengkap.');
 const w=team.rounds.won,l=team.rounds.lost;
 return [{map:String(m.metadata.map?.name??'Unknown'),agent:String(p.agent?.name??'Unknown'),kills:s.kills,deaths:s.deaths,assists:s.assists,headshots:s.headshots,bodyshots:s.bodyshots,legshots:s.legshots,score:s.score,rounds:w+l,result:w===l?'SERI':team.won?'MENANG':'KALAH',scoreline:`${w}–${l}`} satisfies Match];
 });
}
