import sharp from 'sharp';

export type ProfileRow={name:string;ms:number;detail?:string};
export type ProfileData={name:string;avatar?:Buffer;totalMs:number;serverCount:number;trackCount:number;servers:ProfileRow[];friends:ProfileRow[];tracks:ProfileRow[];theme?:'red'|'purple'|'blue';background?:'vinyl'|'waves'|'plain';accent?:string;bio?:string;demo?:boolean};
const xml=(s:string)=>s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
export function shortText(text:string,max:number){const chars=Array.from(text.replace(/\s+/g,' ').trim());let units=0,result='';for(const c of chars){const cost=/[\u2e80-\uffff]/u.test(c)?2:/[MW@]/.test(c)?1.4:1;if(units+cost>max)return result+'…';result+=c;units+=cost;}return result;}
export function listeningTime(ms:number){const minutes=Math.floor(Math.max(0,ms)/60000),hours=Math.floor(minutes/60),days=Math.floor(hours/24);return days?`${days} hari ${hours%24}j`:hours?`${hours}j ${minutes%60}m`:minutes?`${minutes} menit`:ms>0?'<1 menit':'0 menit';}
export async function discordAvatar(url:string,request:typeof fetch=fetch):Promise<Buffer|undefined>{
 try{const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='cdn.discordapp.com'||u.port||u.username||u.password||!/^\/(avatars|embed\/avatars)\//.test(u.pathname))return;
 const response=await request(u,{signal:AbortSignal.timeout(5000),redirect:'error'});if(!response.ok||!response.body)return;
 const size=Number(response.headers.get('content-length'));if(size>2_000_000)return;
 const reader=response.body.getReader(),chunks:Uint8Array[]=[];let total=0;for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>2_000_000){await reader.cancel();return;}chunks.push(value);}return Buffer.concat(chunks);
 }catch{return;}
}
export async function renderProfile(data:ProfileData):Promise<Buffer>{
 const palettes={red:['#251320','#100d15','#e8a5b5'],purple:['#1b1830','#0a0b14','#bd9aff'],blue:['#142431','#090f19','#a6d1e6']};
 const [light,dark,defaultAccent]=palettes[data.theme??'purple'];const accent=data.accent&&/^#[0-9a-f]{6}$/i.test(data.accent)?data.accent:defaultAccent;let avatar='';
 if(data.avatar){try{const png=await sharp(data.avatar,{limitInputPixels:1048576}).resize(132,132,{fit:'cover'}).png().toBuffer();avatar=`<image x="46" y="55" width="132" height="132" href="data:image/png;base64,${png.toString('base64')}" clip-path="url(#avatar)"/>`;}catch{}}
 const text=(x:number,y:number,value:string,size=22,color='#fff',weight=500)=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${xml(value)}</text>`;
 const panel=(x:number,y:number,w:number,h:number,label:string,rows:ProfileRow[],wide=false)=>{
  let body=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#10101a" fill-opacity=".91" stroke="${accent}" stroke-opacity=".25"/>${text(x+24,y+35,label,16,'#ddd0f2',700)}`;
  for(let i=0;i<3;i++){const row=rows[i],cy=y+72+i*(wide?48:43);body+=`<rect x="${x+24}" y="${cy-19}" width="26" height="26" rx="6" fill="${i===0?accent:'#ffffff'}" fill-opacity="${i===0?'.95':'.08'}"/>${text(x+32,cy,String(i+1),15,i===0?'#10101a':'#b7adc8',700)}`;
   body+=text(x+64,cy,row?shortText(row.name,wide?57:22):'Belum ada data',wide?21:20,row?'#fff':'#8d869e',600);
   if(row){body+=`<text x="${x+w-24}" y="${cy}" text-anchor="end" font-size="${wide?20:17}" fill="${accent}" font-weight="600">${xml(listeningTime(row.ms))}</text>`;if(wide&&row.detail)body+=text(x+64,cy+18,shortText(row.detail,75),12,'#a69ab6');}
  }return body;
 };
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="710" viewBox="0 0 1000 710">
 <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${light}"/><stop offset=".55" stop-color="#0c0d17"/><stop offset="1" stop-color="${dark}"/></linearGradient><radialGradient id="glow"><stop stop-color="${accent}" stop-opacity=".25"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient><clipPath id="edge"><rect width="1000" height="710" rx="28"/></clipPath><clipPath id="avatar"><circle cx="112" cy="121" r="66"/></clipPath></defs>
 <g clip-path="url(#edge)" font-family="DejaVu Sans, Segoe UI, Arial, sans-serif"><rect width="1000" height="710" fill="url(#bg)"/><ellipse cx="810" cy="100" rx="420" ry="270" fill="url(#glow)"/><path d="M 25 42 L 25 25 L 42 25 M 958 25 L 975 25 L 975 42 M 25 667 L 25 685 L 42 685 M 958 685 L 975 685 L 975 667" fill="none" stroke="${accent}" stroke-opacity=".7" stroke-width="2"/><path d="M25 216 H975 M25 430 H975" stroke="${accent}" stroke-opacity=".14"/><path d="M415 34 L435 24 L455 34 L435 44 Z M545 34 L565 24 L585 34 L565 44 Z" fill="none" stroke="${accent}" stroke-opacity=".5"/>
 <g visibility="${data.background==='plain'?'hidden':'visible'}" fill="none" stroke="${accent}" stroke-opacity=".085" stroke-width="5"><circle visibility="${data.background==='waves'?'hidden':'visible'}" cx="855" cy="280" r="235"/><circle visibility="${data.background==='waves'?'hidden':'visible'}" cx="855" cy="280" r="180"/><circle visibility="${data.background==='waves'?'hidden':'visible'}" cx="855" cy="280" r="120"/><circle visibility="${data.background==='waves'?'hidden':'visible'}" cx="855" cy="280" r="34"/><path d="M-100 465Q330 70 1080 620M-100 495Q330 100 1080 650M-100 525Q330 130 1080 680M-100 555Q330 160 1080 710"/><path d="M550 80v105m0-80 85-30v100"/><ellipse cx="530" cy="188" rx="22" ry="14"/><ellipse cx="615" cy="178" rx="22" ry="14"/></g>
 <rect x="708" y="16" width="260" height="34" rx="10" fill="#13111f" fill-opacity=".9" stroke="${accent}" stroke-opacity=".28"/>${text(728,39,'HOLLOWFANG  /  MEMBER',15,accent,800)}${text(36,36,'H  /  F',16,accent,800)}
 <circle cx="112" cy="121" r="78" fill="none" stroke="${accent}" stroke-opacity=".3" stroke-width="2"/><circle cx="112" cy="121" r="72" fill="${dark}" stroke="${accent}" stroke-opacity=".9" stroke-width="3"/><path d="M112 34 l8 8 -8 8 -8 -8 Z M112 192 l8 8 -8 8 -8 -8 Z M25 121 l8 8 -8 8 -8 -8 Z M191 121 l8 8 -8 8 -8 -8 Z" fill="${accent}" opacity=".85"/>${avatar||text(83,137,shortText(data.name,2).replace('…','').toUpperCase(),42,accent,700)}
 ${text(208,99,'HOLLOWFANG  /  LISTENER DOSSIER',14,accent,800)}${text(206,140,shortText(data.name,24),37,'#f3f0fa',750)}
 ${text(208,178,`${listeningTime(data.totalMs)}  •  ${data.serverCount} server  •  ${data.trackCount} tracks`,16,'#cdc4db')}
 ${data.bio?text(208,207,shortText(data.bio,64),14,accent):text(208,207,'THE HOLLOW REMEMBERS EVERY SONG',12,'#8f85a8',700)}
 ${panel(32,223,460,203,'I  /  REALMS',data.servers)}${panel(508,223,460,203,'II  /  KINDRED LISTENERS',data.friends)}
 ${panel(32,442,936,213,'III  /  MOST PLAYED RECORDS',data.tracks,true)}
 ${text(34,684,data.demo?'PREVIEW  /  SAMPLE DATA':'HOLLOWFANG  •  PRIVATE WORLD, PUBLIC LEGACY',12,'#a89ab9',700)}<text x="966" y="684" text-anchor="end" fill="${accent}" font-size="12">${data.demo?'SAMPLE ONLY':'LISTENING STATISTICS  /  CRYPT'}</text>
 </g></svg>`;
 return sharp(Buffer.from(svg)).png().toBuffer();
}
