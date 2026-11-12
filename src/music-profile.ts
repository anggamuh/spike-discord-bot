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
 const palettes={red:['#b65b69','#4b1e30','#f49aa5'],purple:['#8860ba','#2c1749','#c8a4ff'],blue:['#4c83ae','#142d48','#9bd5ff']};
 const [light,dark,defaultAccent]=palettes[data.theme??'red'];const accent=data.accent&&/^#[0-9a-f]{6}$/i.test(data.accent)?data.accent:defaultAccent;let avatar='';
 if(data.avatar){try{const png=await sharp(data.avatar,{limitInputPixels:1048576}).resize(132,132,{fit:'cover'}).png().toBuffer();avatar=`<image x="46" y="55" width="132" height="132" href="data:image/png;base64,${png.toString('base64')}" clip-path="url(#avatar)"/>`;}catch{}}
 const text=(x:number,y:number,value:string,size=22,color='#fff',weight=500)=>`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}">${xml(value)}</text>`;
 const panel=(x:number,y:number,w:number,h:number,label:string,rows:ProfileRow[],wide=false)=>{
  let body=`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="18" fill="#160e1c" fill-opacity=".64" stroke="#ffffff" stroke-opacity=".10"/>${text(x+24,y+35,label,16,'#f6dfe8',700)}`;
  for(let i=0;i<3;i++){const row=rows[i],cy=y+72+i*(wide?48:43);body+=`<rect x="${x+24}" y="${cy-19}" width="26" height="26" rx="6" fill="${i===0?accent:'#ffffff'}" fill-opacity="${i===0?'.8':'.09'}"/>${text(x+32,cy,String(i+1),15,i===0?dark:'#c7bacb',700)}`;
   body+=text(x+64,cy,row?shortText(row.name,wide?57:22):'Belum ada data',wide?21:20,row?'#fff':'#c2aebd',600);
   if(row){body+=`<text x="${x+w-24}" y="${cy}" text-anchor="end" font-size="${wide?20:17}" fill="${accent}" font-weight="600">${xml(listeningTime(row.ms))}</text>`;if(wide&&row.detail)body+=text(x+64,cy+18,shortText(row.detail,75),12,'#c7afc2');}
  }return body;
 };
 const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="710" viewBox="0 0 1000 710">
 <defs><linearGradient id="bg" x2=".7" y2="1"><stop stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></linearGradient><clipPath id="edge"><rect width="1000" height="710" rx="28"/></clipPath><clipPath id="avatar"><circle cx="112" cy="121" r="66"/></clipPath></defs>
 <g clip-path="url(#edge)" font-family="DejaVu Sans, Segoe UI, Arial, sans-serif"><rect width="1000" height="710" fill="url(#bg)"/>
 <g visibility="${data.background==='plain'?'hidden':'visible'}" fill="none" stroke="#180c22" stroke-opacity=".17" stroke-width="10"><circle visibility="${data.background==='waves'?'hidden':'visible'}" cx="855" cy="280" r="235"/><circle visibility="${data.background==='waves'?'hidden':'visible'}" cx="855" cy="280" r="180"/><circle visibility="${data.background==='waves'?'hidden':'visible'}" cx="855" cy="280" r="120"/><circle visibility="${data.background==='waves'?'hidden':'visible'}" cx="855" cy="280" r="34"/><path d="M-100 465Q330 70 1080 620M-100 495Q330 100 1080 650M-100 525Q330 130 1080 680M-100 555Q330 160 1080 710"/><path d="M550 80v105m0-80 85-30v100"/><ellipse cx="530" cy="188" rx="22" ry="14"/><ellipse cx="615" cy="178" rx="22" ry="14"/></g>
 <rect x="793" y="0" width="175" height="40" rx="8" fill="#180e21" fill-opacity=".40"/>${text(813,27,'MANUK MUSIC',16,'#fff',800)}
 <circle cx="112" cy="121" r="72" fill="${dark}" stroke="${accent}" stroke-opacity=".5" stroke-width="3"/>${avatar||text(83,137,shortText(data.name,2).replace('…','').toUpperCase(),42,accent,700)}
 ${text(208,99,'LISTENING PROFILE',13,'#f4c7d6',700)}${text(206,140,shortText(data.name,24),34,'#fff',750)}
 ${text(208,178,`${listeningTime(data.totalMs)} didengarkan  ·  ${data.serverCount} server  ·  ${data.trackCount} lagu`,16,'#f4dce7')}
 ${data.bio?text(208,207,shortText(data.bio,64),14,'#f4dce7'):''}
 ${panel(32,223,460,203,'TOP SERVERS',data.servers)}${panel(508,223,460,203,'TEMAN DENGAR BARENG',data.friends)}
 ${panel(32,442,936,213,'TOP TRACKS',data.tracks,true)}
 ${text(34,684,data.demo?'CONTOH TAMPILAN · DATA DEMO':'MANUKAPP  /  Waktu terukur saat musik aktif di voice',12,'#dac3d2',600)}<text x="966" y="684" text-anchor="end" fill="#dac3d2" font-size="12">${data.demo?'BUKAN STATISTIK ASLI':'SEJAK FITUR PROFIL AKTIF'}</text>
 </g></svg>`;
 return sharp(Buffer.from(svg)).png().toBuffer();
}
