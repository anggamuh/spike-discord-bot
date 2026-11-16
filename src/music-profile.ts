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

 const text=(x:number,y:number,value:string,size=22,color='#fff',weight=500,anchor='start',family='DejaVu Sans, Arial, sans-serif')=>
  \`<text x="\${x}" y="\${y}" font-size="\${size}" fill="\${color}" font-weight="\${weight}" text-anchor="\${anchor}" font-family="\${family}">\${xml(value)}</text>\`;
 const serif='DejaVu Serif, Georgia, serif';
 const line=(x1:number,y1:number,x2:number,y2:number,opacity=.3)=>
  \`<path d="M\${x1} \${y1} L\${x2} \${y2}" fill="none" stroke="\${accent}" stroke-opacity="\${opacity}" stroke-width="1.3"/>\`;
 const diamond=(x:number,y:number,r=7)=>
  \`<path d="M\${x} \${y-r} L\${x+r*.65} \${y} L\${x} \${y+r} L\${x-r*.65} \${y}Z" fill="\${accent}" stroke="#f5efff" stroke-opacity=".75" stroke-width=".8"/>\`;
 const ornament=(x:number,y:number,flip=1)=>
  \`<g transform="translate(\${x} \${y}) scale(\${flip} 1)" fill="none" stroke="#c7c1d2" stroke-opacity=".68" stroke-linecap="round"><path d="M0 100Q12 45 70 24Q44 25 38 6M14 65Q55 56 65 85M39 37Q80 35 92 17" stroke-width="2"/><path d="M23 54L15 37L39 47M61 27L58 8L73 20M54 64L78 58L60 77" stroke-width="1.5"/></g>\`;
 const panel=(x:number,y:number,w:number,h:number,label:string,rows:ProfileRow[],limit=3)=>{
  let out=\`<rect x="\${x}" y="\${y}" width="\${w}" height="\${h}" rx="10" fill="#0e0d16" fill-opacity=".94" stroke="#bcb0c9" stroke-opacity=".44"/>\`;
  out+=\`<path d="M\${x+14} \${y+49}H\${x+w-14}" stroke="\${accent}" stroke-opacity=".35"/>\`;
  out+=text(x+20,y+32,label,16,'#e8e1f1',700);
  for(let i=0;i<limit;i++){
   const cy=y+75+i*34, row=rows[i];
   out+=\`<rect x="\${x+16}" y="\${cy-18}" width="24" height="24" rx="4" fill="\${i===0?accent:'#b1a6c2'}" fill-opacity="\${i===0?'.75':'.16'}"/>\`;
   out+=text(x+28,cy-1,String(i+1),13,i===0?'#12101c':'#d4c9e2',700,'middle');
   out+=text(x+49,cy-1,row?shortText(row.name,16):'Belum ada data',13,row?'#f1ebf7':'#81778f',600);
   if(row)out+=text(x+w-13,cy-1,listeningTime(row.ms),11,accent,600,'end');
  }
  return out;
 };
 const svg=\`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="710" viewBox="0 0 1000 710">
 <defs>
  <linearGradient id="night" x1="0" y1="0" x2=".8" y2="1"><stop stop-color="#10101a"/><stop offset=".48" stop-color="\${light}"/><stop offset="1" stop-color="#070810"/></linearGradient>
  <radialGradient id="moon"><stop stop-color="\${accent}" stop-opacity=".38"/><stop offset="1" stop-color="\${accent}" stop-opacity="0"/></radialGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#39304d"/><stop offset=".55" stop-color="\${accent}" stop-opacity=".75"/><stop offset="1" stop-color="#171128"/></linearGradient>
  <linearGradient id="silver" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#faf5ff"/><stop offset=".5" stop-color="#796f85"/><stop offset="1" stop-color="#ddd5e8"/></linearGradient>
  <clipPath id="edge"><rect width="1000" height="710" rx="18"/></clipPath>
  <clipPath id="avatar"><circle cx="190" cy="222" r="82"/></clipPath>
  <filter id="soft"><feGaussianBlur stdDeviation="14"/></filter>
 </defs>
 <g clip-path="url(#edge)">
  <rect width="1000" height="710" fill="url(#night)"/>
  <ellipse cx="500" cy="130" rx="385" ry="240" fill="url(#moon)" opacity=".42"/>
  <!-- Gothic pointed stained-glass windows and tracery -->
  <g fill="#15111f" stroke="#9990a6" stroke-opacity=".5" stroke-width="3">
   <path d="M23 315V92Q23 34 100 12Q176 34 176 92V315Z"/>
   <path d="M824 315V92Q824 34 900 12Q977 34 977 92V315Z"/>
  </g>
  <g fill="url(#glass)" fill-opacity=".33" stroke="\${accent}" stroke-opacity=".46" stroke-width="2">
   <path d="M35 302V100Q35 51 100 30Q164 51 164 100V302Z"/>
   <path d="M836 302V100Q836 51 900 30Q964 51 964 100V302Z"/>
  </g>
  <g stroke="#d6bfdc" stroke-opacity=".4" fill="none" stroke-width="1.2">
   <path d="M100 30V302M35 135H164M35 213H164M35 302L164 135M164 302L35 135M35 213L164 100M164 213L35 100"/>
   <path d="M900 30V302M836 135H964M836 213H964M836 302L964 135M964 302L836 135M836 213L964 100M964 213L836 100"/>
  </g>
  <!-- Cathedral battlements, mist, thorn border -->
  <path d="M0 366L40 355V330H60V315H79V340H102V303H120V340H150V360H181V334H193V300H209V334H235V363H270V346H291V323H307V350H348V372H652V356H679V330H700V347H744V315H763V340H801V367H825V340H853V302H870V345H908V328H924V354L1000 368V442H0Z" fill="#080910" opacity=".73"/>
  <ellipse cx="490" cy="635" rx="500" ry="95" fill="#aaa1c5" opacity=".055" filter="url(#soft)"/>
  <rect x="27" y="23" width="946" height="660" rx="9" fill="none" stroke="url(#silver)" stroke-opacity=".64" stroke-width="2"/>
  <rect x="34" y="30" width="932" height="646" rx="6" fill="none" stroke="\${accent}" stroke-opacity=".28"/>
  \${ornament(45,20)}\${ornament(955,20,-1)}
  \${ornament(45,556)}\${ornament(955,556,-1)}
  \${line(270,78,408,78,.48)}\${line(592,78,730,78,.48)}\${diamond(260,78,8)}\${diamond(740,78,8)}
  \${text(500,64,'H O L L O W F A N G',32,'#f3ecf9',700,'middle',serif)}
  \${text(500,90,'E X C L U S I V E   C O M M U N I T Y',11,'#c7b8d4',600,'middle')}
  \${diamond(500,102,7)}\${line(260,106,488,106,.4)}\${line(512,106,740,106,.4)}
  <!-- Main member identity -->
  <rect x="70" y="128" width="860" height="202" rx="10" fill="#0a0a12" fill-opacity=".79" stroke="#c5bad0" stroke-opacity=".62" stroke-width="1.4"/>
  <path d="M80 149L80 139L90 139M920 149L920 139L910 139M80 310L80 320L90 320M920 310L920 320L910 320" fill="none" stroke="\${accent}" stroke-width="2"/>
  <circle cx="190" cy="222" r="97" fill="none" stroke="url(#silver)" stroke-width="3" stroke-opacity=".9"/>
  <circle cx="190" cy="222" r="91" fill="none" stroke="\${accent}" stroke-width="2" stroke-opacity=".75"/>
  <circle cx="190" cy="222" r="82" fill="#15121e"/>
  \${avatar?avatar.replace(/x="46" y="55" width="132" height="132"/,'x="108" y="140" width="164" height="164"'):text(190,242,shortText(data.name,2).replace('…','').toUpperCase(),48,accent,700,'middle',serif)}
  \${diamond(190,122,10)}\${diamond(190,321,10)}\${diamond(91,222,9)}\${diamond(289,222,9)}
  <path d="M307 142H895" stroke="\${accent}" stroke-opacity=".3"/>
  \${text(324,171,'HOLLOWFANG  /  MEMBER DOSSIER',12,accent,800)}
  \${text(324,220,shortText(data.name,24),39,'#f5eff9',700,'start',serif)}
  \${text(324,251,data.bio?shortText(data.bio,56):'Still breathing in Hollowfang.',17,'#d8c9e2',500)}
  <rect x="324" y="272" width="185" height="30" rx="6" fill="\${accent}" fill-opacity=".16" stroke="\${accent}" stroke-opacity=".62"/>
  \${diamond(344,286,6)}\${text(358,292,'HOLLOWFANG MEMBER',12,'#efe6f9',700)}
  <rect x="523" y="272" width="145" height="30" rx="6" fill="#17131e" stroke="#e1d8ea" stroke-opacity=".35"/>
  \${text(595,292,'✧  LISTENER',12,'#e6deef',600,'middle')}
  <!-- Main music ledger -->
  <rect x="70" y="348" width="860" height="92" rx="9" fill="#12101a" fill-opacity=".93" stroke="url(#silver)" stroke-opacity=".58"/>
  <path d="M332 360V427M575 360V427" stroke="\${accent}" stroke-opacity=".3"/>
  \${text(95,374,'TOTAL LISTENING',13,'#c4b7d1',700)}
  \${text(96,415,listeningTime(data.totalMs),34,'#f7f2fa',700,'start',serif)}
  \${text(355,374,'REALMS VISITED',13,'#c4b7d1',700)}
  \${text(355,415,String(data.serverCount),34,accent,700,'start',serif)}
  \${text(598,374,'TRACKS DISCOVERED',13,'#c4b7d1',700)}
  \${text(598,415,String(data.trackCount),34,accent,700,'start',serif)}
  \${diamond(906,393,17)}
  <!-- Three genuine listener-statistic tables; no fake XP or ranking -->
  \${panel(70,458,273,170,'I  /  REALMS',data.servers)}
  \${panel(363,458,273,170,'II  /  KINDRED',data.friends)}
  \${panel(656,458,274,170,'III  /  MUSIC',data.tracks)}
  \${line(170,654,438,654,.5)}\${line(562,654,830,654,.5)}\${diamond(500,654,10)}
  \${text(500,660,data.demo?'HOLLOWFANG  /  DEMO PREVIEW':'HOLLOWFANG  /  THE HOLLOW REMEMBERS',12,'#d6c8e2',700,'middle')}
  \${text(500,697,'MUSIC LISTENING PROFILE   •   CRYPT',10,'#a99dbb',600,'middle')}
 </g></svg>\`;

 return sharp(Buffer.from(svg)).png().toBuffer();
}
