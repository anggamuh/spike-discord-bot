import sharp from 'sharp';
import {shortText} from './music-profile.js';
import type {ProgressSnapshot,Achievement} from './hollowfang-xp.js';

export type HollowfangImageData = {name:string;avatar?:Buffer;progress:ProgressSnapshot};
const esc=(s:string)=>s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const text=(x:number,y:number,v:string,size=23,color='#f5eafb',weight=600,anchor='start',font='DejaVu Sans, Arial, sans-serif')=>'<text x="'+x+'" y="'+y+'" font-size="'+size+'" font-family="'+font+'" font-weight="'+weight+'" fill="'+color+'" text-anchor="'+anchor+'">'+esc(v)+'</text>';
const pretty=(n:number)=>Math.max(0,Math.floor(n)).toLocaleString('id-ID');
const gem=(x:number,y:number,r=9)=>'<path d="M'+x+' '+(y-r)+'l'+(r*.7)+' '+r+'l-'+(r*.7)+' '+r+'l-'+(r*.7)+' -'+r+'Z" fill="#b385ff" stroke="#eee4ff" stroke-width="1.3"/>';
const rail=(x:number,y:number,w:number)=>'<path d="M'+x+' '+y+' Q'+(x+w/2)+' '+(y-12)+' '+(x+w)+' '+y+'" stroke="url(#silver)" fill="none" stroke-width="2"/>'+Array.from({length:15},(_,i)=>{const px=x+i*w/14;return '<path d="M'+px+' '+y+'l'+(i%2?12:-12)+' '+(i%2?-18:18)+'l'+(i%2?-6:6)+' '+(i%2?6:-6)+'" stroke="#b79dcd" fill="none" opacity=".7"/>';}).join('');
const windowPane=(x:number)=>'<g opacity=".67"><path d="M'+x+' 432V90Q'+(x+75)+' -35 '+(x+150)+' 90V432Z" fill="#160e27" stroke="#d3b5e7" stroke-width="3"/><path d="M'+(x+12)+' 422V104Q'+(x+75)+' 0 '+(x+138)+' 104V422Z" fill="url(#glass)" stroke="#bf86fa"/><path d="M'+(x+75)+' 45V425M'+(x+12)+' 165H'+(x+138)+'M'+(x+12)+' 253H'+(x+138)+'M'+(x+12)+' 165L'+(x+138)+' 253M'+(x+138)+' 165L'+(x+12)+' 253" fill="none" stroke="#dfc8ed" opacity=".65" stroke-width="2"/></g>';
const rose=(x:number,y:number)=>'<g transform="translate('+x+' '+y+')" fill="none" stroke="#caa6ed" stroke-width="2"><path d="M0 -30Q26 -42 32 -13Q48 4 24 18Q5 42 -16 27Q-43 24 -34 -3Q-28 -33 0 -30Z" fill="#26102e"/><path d="M-20 -8Q7 -24 20 -3Q27 16 4 21Q-18 20 -17 2Q-10 -14 10 -7Q18 5 2 8M-32 22L-51 43M30 22L52 43" stroke="#e6c8f6"/></g>';
const panel=(x:number,y:number,w:number,h:number)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="13" fill="#090914" fill-opacity=".93" stroke="url(#silver)" stroke-opacity=".68" stroke-width="2"/>';
async function portrait(avatar?:Buffer){
 if(!avatar)return text(172,280,'HF',54,'#dfbdff',700,'middle','DejaVu Serif, Georgia, serif');
 try{
  const png=await sharp(avatar,{limitInputPixels:1048576}).resize(150,150,{fit:'cover'}).png().toBuffer();
  return '<image x="97" y="190" width="150" height="150" href="data:image/png;base64,'+png.toString('base64')+'" clip-path="url(#portrait)"/>';
 }catch{return text(172,280,'HF',54,'#dfbdff',700,'middle','DejaVu Serif, Georgia, serif');}
}
async function frame(height:number,data:HollowfangImageData,kicker:string){
 const face=await portrait(data.avatar);
 return '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="'+height+'" viewBox="0 0 1200 '+height+'">'+
 '<defs><linearGradient id="night" x2="1" y2="1"><stop stop-color="#1c102a"/><stop offset=".45" stop-color="#090914"/><stop offset="1" stop-color="#1d1026"/></linearGradient>'+
 '<linearGradient id="glass" x2=".7" y2="1"><stop stop-color="#c4a7ff"/><stop offset=".5" stop-color="#402164"/><stop offset="1" stop-color="#0d0b20"/></linearGradient>'+
 '<linearGradient id="silver" x2="1" y2=".2"><stop stop-color="#70677e"/><stop offset=".33" stop-color="#faeaff"/><stop offset=".59" stop-color="#7e5c96"/><stop offset=".83" stop-color="#e9d6ff"/><stop offset="1" stop-color="#62526e"/></linearGradient>'+
 '<linearGradient id="violet" x2="1"><stop stop-color="#622992"/><stop offset=".5" stop-color="#d18aff"/><stop offset="1" stop-color="#8541c5"/></linearGradient>'+
 '<radialGradient id="haze"><stop stop-color="#9c62ff" stop-opacity=".27"/><stop offset="1" stop-color="#100d1c" stop-opacity="0"/></radialGradient>'+
 '<clipPath id="portrait"><circle cx="172" cy="265" r="75"/></clipPath></defs>'+
 '<rect width="1200" height="'+height+'" fill="url(#night)"/><ellipse cx="600" cy="90" rx="540" ry="290" fill="url(#haze)"/>'+
 windowPane(17)+windowPane(1033)+
 '<path d="M0 475V437H34V401H55V377H73V417H100V435H145V398H166V438H216V398H245V456H955V421H990V385H1014V430H1050V405H1080V433H1120V399H1150V437H1200V475Z" fill="#090913" opacity=".78"/>'+
 '<rect x="28" y="26" width="1144" height="'+(height-52)+'" rx="14" fill="none" stroke="url(#silver)" stroke-width="3"/>'+
 '<rect x="40" y="38" width="1120" height="'+(height-76)+'" rx="12" fill="none" stroke="#a36ddd" stroke-opacity=".42"/>'+
 rail(56,55,285)+rail(859,55,285)+rail(65,height-50,425)+rail(710,height-50,425)+rose(73,height-105)+rose(1127,height-105)+
 '<path d="M584 34l8 18l8 -26l8 26l8 -18l-5 25h-22Z" fill="url(#silver)" stroke="#cfa1ff"/>'+
 text(600,103,'H O L L O W F A N G',40,'#f8eaff',700,'middle','DejaVu Serif, Georgia, serif')+
 text(600,129,'— E X C L U S I V E  C O M M U N I T Y —',13,'#c8b6d5',600,'middle')+
 '<path d="M370 142H830" stroke="url(#silver)" stroke-opacity=".8"/>'+gem(600,142,8)+
 panel(77,166,1046,211)+
 '<circle cx="172" cy="265" r="94" fill="#170d22" stroke="url(#silver)" stroke-width="4"/>'+
 '<circle cx="172" cy="265" r="81" fill="none" stroke="#a674e4" stroke-width="2"/>'+
 face+gem(172,171,11)+gem(172,359,11)+gem(79,265,8)+gem(265,265,8)+
 text(310,207,kicker,16,'#c995ff',700)+
 text(310,273,shortText(data.name,22),46,'#fff0ff',700,'start','DejaVu Serif, Georgia, serif')+
 text(311,313,'THE HOLLOW REMEMBERS',18,'#c5b4d8',500)+
 '<path d="M311 331H1081" stroke="url(#silver)" stroke-opacity=".5"/>';
}
const bottom=(height:number)=>'<path d="M135 '+(height-88)+'H520M680 '+(height-88)+'H1065" stroke="#b69acc" stroke-opacity=".55"/>'+gem(600,height-88,11)+
 text(600,height-59,'HOLLOWFANG  /  POWERED BY CRYPT',13,'#c0acd2',600,'middle')+'</svg>';
const icons:Record<string,string>={
 'first-echo':'♫','night-listener':'☾','music-addict':'♬','track-hunter':'◎','kindred-soul':'✧',
 'first-whisper':'✒','voice-of-hollow':'◈','hollow-elite':'♛'
};
function relic(x:number,y:number,a:Achievement){
 const active=a.unlocked;
 return '<g opacity="'+(active?'1':'.46')+'"><circle cx="'+x+'" cy="'+y+'" r="57" fill="#1a1027" stroke="url(#silver)" stroke-width="3"/>'+
 '<circle cx="'+x+'" cy="'+y+'" r="50" fill="none" stroke="'+(active?'#b887fa':'#98909d')+'" stroke-dasharray="5 7" stroke-width="1.5"/>'+
 gem(x,y-57,7)+gem(x,y+57,7)+
 text(x,y+17,icons[a.id]??'✦',53,active?'#ead2ff':'#9890a6',700,'middle','DejaVu Serif, Georgia, serif')+'</g>';
}
export async function renderLevelImage(data:HollowfangImageData):Promise<Buffer>{
 const p=data.progress,opened=p.achievements.filter(a=>a.unlocked).length;
 const ratio=p.nextLevelXp>0?Math.max(0,Math.min(1,p.currentLevelXp/p.nextLevelXp)):0;
 const height=850;let svg=await frame(height,data,'THE ASCENSION  /  MEMBER LEVEL');
 svg+=panel(77,398,1046,182)+
 text(110,434,'LEVEL',18,'#c9acdc',700)+text(112,508,String(p.level),77,'#faeaff',700,'start','DejaVu Serif, Georgia, serif')+
 text(335,434,'RANK  /  THE HOLLOW',18,'#bfa4d9',700)+
 text(335,486,shortText(p.rank,27),35,'#eedefb',700,'start','DejaVu Serif, Georgia, serif')+
 text(335,529,pretty(p.xp)+' XP TOTAL',23,'#d69cff',700)+
 '<rect x="335" y="545" width="745" height="15" rx="7" fill="#291931" stroke="#ad80db" stroke-width="1"/>'+
 '<rect x="335" y="545" width="'+(745*ratio)+'" height="15" rx="7" fill="url(#violet)"/>'+
 text(1079,537,Math.round(ratio*100)+'%',18,'#dac1f5',700,'end')+
 text(335,577,pretty(p.currentLevelXp)+' / '+pretty(p.nextLevelXp)+' XP TO THE NEXT LEVEL',14,'#cbb7db',600)+
 panel(77,602,500,142)+panel(593,602,530,142)+
 text(108,642,'♫  MUSIC LISTENING',19,'#cbb6df',700)+
 text(108,698,pretty(Math.floor(p.listeningMs/60000))+' XP',39,'#f6e6ff',700,'start','DejaVu Serif, Georgia, serif')+
 text(620,642,'✧  THE COMMUNITY',19,'#cbb6df',700)+
 text(620,686,pretty(p.chatXp)+' CHAT XP',28,'#f0d9ff',700)+
 text(620,717,opened+' / '+p.achievements.length+' ACHIEVEMENTS UNLOCKED',16,'#cfa8e9',700)+
 bottom(height);
 return sharp(Buffer.from(svg)).png().toBuffer();
}
export async function renderAchievementsImage(data:HollowfangImageData):Promise<Buffer>{
 const p=data.progress,height=1030,opened=p.achievements.filter(a=>a.unlocked).length;
 let svg=await frame(height,data,'THE RELIQUARY  /  MEMBER ACHIEVEMENTS');
 svg+=panel(77,397,1046,92)+
 text(110,437,'HOLLOWFANG ACHIEVEMENTS',25,'#f6e7ff',700)+
 text(1090,437,opened+' / '+p.achievements.length+' UNLOCKED',20,'#cba2f2',700,'end')+
 '<rect x="107" y="458" width="986" height="11" rx="5" fill="#281831"/>'+
 '<rect x="107" y="458" width="'+(986*(p.achievements.length?opened/p.achievements.length:0))+'" height="11" rx="5" fill="url(#violet)"/>';
 for(let i=0;i<p.achievements.length;i++){
  const a=p.achievements[i]!,col=i%4,row=Math.floor(i/4),x=77+col*267,y=510+row*214;
  svg+=panel(x,y,248,196)+relic(x+124,y+69,a)+
   text(x+124,y+148,shortText(a.name,19),17,a.unlocked?'#f7e7ff':'#9d93a8',700,'middle')+
   text(x+124,y+175,a.unlocked?'✦ UNLOCKED':'◇ LOCKED',14,a.unlocked?'#ca9cf0':'#9b8caa',700,'middle');
 }
 svg+=text(600,959,'EARNED THROUGH REAL LISTENING AND COMMUNITY ACTIVITY',16,'#d3bce0',600,'middle')+bottom(height);
 return sharp(Buffer.from(svg)).png().toBuffer();
}
