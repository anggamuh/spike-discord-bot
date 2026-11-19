import sharp from 'sharp';
import {shortText} from './music-profile.js';
import type {ProgressSnapshot,Achievement} from './hollowfang-xp.js';

export type HollowfangImageData = {name:string;avatar?:Buffer;progress:ProgressSnapshot};
const cinematicBackdrop='/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDABsSFBcUERsXFhceHBsgKEIrKCUlKFE6PTBCYFVlZF9VXVtqeJmBanGQc1tdhbWGkJ6jq62rZ4C8ybqmx5moq6T/2wBDARweHigjKE4rK06kbl1upKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKSkpKT/wAARCAB4AKADASIAAhEBAxEB/8QAGQABAAMBAQAAAAAAAAAAAAAAAAECAwQF/8QAKhAAAgICAgICAgEDBQAAAAAAAAECEQMhEjEEQRNRImEyBVKBFCNCccH/xAAWAQEBAQAAAAAAAAAAAAAAAAAAAQL/xAAZEQEBAQEBAQAAAAAAAAAAAAAAARFBITH/2gAMAwEAAhEDEQA/APDU3STdpm68aGVJwbVLs5qT7kr+jXHlzKUYwdNdFFIyk5cJNtJm3wNx5J9vSM5Y8im5TpN97PRxTwPFj5TS49mpnVebnT1fa0zBrZ3+VHDJ84TVtnLLE1vVEorjjCUqbaZEoPm4pEuNbtEfl2ZQ+OX0TjhTfKNohOT+yam9f+gTkhb/ABjSSK/HL6JcZJ09/wCSG5fsBGD5qLLZIxjKk3ZX8uyVFt70BWPZ0YYunX8npGfCpdo6fH+NZk5zVGoKT8dqDkn12ZKD5qPVnqzyeP8AHkSmnfR58YT+RSi02utlsir5PFhhu23rs53Jyjx9I1zZcrnKM2m2Y6X/ACV/RKjNJvo1xOrcu0tERxtwtfZPHiqa3RFI/nc8nozlkb60jaSh/p75fl9HMETGVFlNrXp+iqDYB9hkMACSABNiyABNiyABN0WjKmUJugNnm1Sii0mlJOPdHO2dEMV4+d7RQyvlFNfyrZg4vtm7jaSS3RR43GDbIrTDJxin6sZJNy5e6LYY80kik6c3XpF4M1+Vp6syknF0y7sq232REdD2PQAAABQAAAAAAAA9AADaGSo0jE0iB0YpXKLfseQ24uyITSnFvpGnlRSin/crRZ8Vl47ana+iOLTbOnwvHc8ii1oz8iDjJ/V0BzdlJqmXlKK0jOTtkRBOiABOhaIAFrQ0VAAAAAAAAAA0jrdmZaLTewNn+UV9ls0ucYL+1UXwYXkaits6c3jRhhTf8r2WKn5Pjdo5fI5NNu9l4z5Sb9DyJReFL39ijjeN8eRnRq5fjT9GcmvRBAACAJIAIBEsCACQICAAAlkASlZLXshF3sDv/pk4xyJ1dei/kzcsj/7MvAx8/dfs1mkrXbWjUniuPHcpqtL2dOTFGePjGacvownljw4pKLM45Wn+yzBTJFwfFoyZ2eVKE+LXdbOWfejNmFUBIIgAAADIAkAAAAAAAAtFW0r7Kl4JvSVgdnKWDGoRabe7RXFmlKdPv7MeE+rpotj/ANuN9tmtXWdxkv2Q1KLUh0iVK4qLXXsyLTlLKrceNGMk12dMZTcXC1Ri4SlKlstGYLOEl2iKZEQC8cbkr0VaaYEAmmHFrsCAC0ccpdICoDTTJp0BAJpkqEn0rAqaQ5RacHsrwlfRpjUluP8AkCze7m9+6InNvrSGR8q3YSpbCs6sLXYARbk10W+QAC6lGXZOTjJUlQBVTDGlF29synjoACnReeRThGNbXsAiM9JnR4+dYr0gBKMZ/nJtGmPG1/JaAKq3xwk9aNceSGJNKKb+wAM5ZeTukqMpzlJ+kv0ANFbSKuTYBEf/2Q==';
const esc=(s:string)=>s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!));
const text=(x:number,y:number,v:string,size=23,color='#f5eafb',weight=600,anchor='start',font='DejaVu Sans, Arial, sans-serif')=>'<text x="'+x+'" y="'+y+'" font-size="'+size+'" font-family="'+font+'" font-weight="'+weight+'" fill="'+color+'" text-anchor="'+anchor+'">'+esc(v)+'</text>';
const pretty=(n:number)=>Math.max(0,Math.floor(n)).toLocaleString('id-ID');
const gem=(x:number,y:number,r=9)=>'<path d="M'+x+' '+(y-r)+'l'+(r*.7)+' '+r+'l-'+(r*.7)+' '+r+'l-'+(r*.7)+' -'+r+'Z" fill="#b385ff" stroke="#eee4ff" stroke-width="1.3"/>';
const rail=(x:number,y:number,w:number)=>'<path d="M'+x+' '+y+' Q'+(x+w/2)+' '+(y-12)+' '+(x+w)+' '+y+'" stroke="url(#silver)" fill="none" stroke-width="2"/>'+Array.from({length:15},(_,i)=>{const px=x+i*w/14;return '<path d="M'+px+' '+y+'l'+(i%2?12:-12)+' '+(i%2?-18:18)+'l'+(i%2?-6:6)+' '+(i%2?6:-6)+'" stroke="#b79dcd" fill="none" opacity=".7"/>';}).join('');
const windowPane=(x:number)=>'<g opacity=".67"><path d="M'+x+' 432V90Q'+(x+75)+' -35 '+(x+150)+' 90V432Z" fill="#160e27" stroke="#d3b5e7" stroke-width="3"/><path d="M'+(x+12)+' 422V104Q'+(x+75)+' 0 '+(x+138)+' 104V422Z" fill="url(#glass)" stroke="#bf86fa"/><path d="M'+(x+75)+' 45V425M'+(x+12)+' 165H'+(x+138)+'M'+(x+12)+' 253H'+(x+138)+'M'+(x+12)+' 165L'+(x+138)+' 253M'+(x+138)+' 165L'+(x+12)+' 253" fill="none" stroke="#dfc8ed" opacity=".65" stroke-width="2"/></g>';
const rose=(x:number,y:number)=>'<g transform="translate('+x+' '+y+')" fill="none" stroke="#caa6ed" stroke-width="2"><path d="M0 -30Q26 -42 32 -13Q48 4 24 18Q5 42 -16 27Q-43 24 -34 -3Q-28 -33 0 -30Z" fill="#26102e"/><path d="M-20 -8Q7 -24 20 -3Q27 16 4 21Q-18 20 -17 2Q-10 -14 10 -7Q18 5 2 8M-32 22L-51 43M30 22L52 43" stroke="#e6c8f6"/></g>';
const panel=(x:number,y:number,w:number,h:number)=>'<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" rx="13" fill="#090914" fill-opacity=".91" stroke="url(#silver)" stroke-opacity=".88" stroke-width="2.3"/>'+
 '<path d="M'+(x+12)+' '+(y+32)+'V'+(y+12)+'H'+(x+32)+'M'+(x+w-32)+' '+(y+h-12)+'H'+(x+w-12)+'V'+(y+h-32)+'" fill="none" stroke="#dbb8ff" stroke-width="2" opacity=".8"/>'+
 '<path d="M'+(x+18)+' '+(y+7)+'H'+(x+w-18)+'" stroke="#b977ef" stroke-opacity=".55"/>';
/** SVG-native gothic detailing; no baked example member data or external assets. */
const sigil=(id:string,x:number,y:number)=>{
 const paths:Record<string,string>={
  'first-echo':'<path d="M-6 -29V17M-6 -29L25 -37V8M-6 -9L25 -17" fill="none" stroke-width="4"/><circle cx="-16" cy="18" r="11" fill="none" stroke-width="3"/><circle cx="15" cy="9" r="11" fill="none" stroke-width="3"/>',
  'night-listener':'<path d="M13 -38A40 40 0 1 0 34 27A34 34 0 0 1 13 -38Z" fill="#8c54d0" fill-opacity=".38" stroke-width="2.7"/><path d="M-19 -26l4 8l8 4l-8 4l-4 8l-4 -8l-8 -4l8 -4ZM26 -5l2 6l6 2l-6 2l-2 6l-2 -6l-6 -2l6 -2Z" fill="#ecdcff" stroke="none"/>',
  'music-addict':'<path d="M-32 4Q-36 -28 -13 -32Q0 -37 13 -32Q36 -27 32 4M-33 4V26Q-33 33 -20 33H-10V0H-20Q-33 0 -33 14M33 4V26Q33 33 20 33H10V0H20Q33 0 33 14" stroke-width="4" fill="#7c3aaf" fill-opacity=".22"/>',
  'track-hunter':'<circle r="35" fill="none" stroke-width="3"/><circle r="24" fill="none" stroke-width="2"/><circle r="11" fill="#b889ed" stroke-width="2"/><circle r="3" fill="#f6edff" stroke="none"/><path d="M8 -33L25 -18" stroke-width="2"/>',
  'kindred-soul':'<path d="M0 34Q-44 8 -36 -15Q-30 -39 -7 -30L0 -21L7 -30Q30 -39 36 -15Q44 8 0 34Z" fill="#7c3aac" fill-opacity=".25" stroke-width="3"/><path d="M-18 -1l12 -10l12 10l-12 10ZM5 11l12 -10l12 10l-12 10Z" stroke-width="2" fill="none"/>',
  'first-whisper':'<path d="M-18 30Q11 12 22 -11Q32 -30 28 -35Q16 -39 2 -20Q-13 -2 -18 30ZM-25 33L29 33" fill="#9358c5" fill-opacity=".2" stroke-width="2.5"/><path d="M-18 28L14 -13" stroke-width="2"/>',
  'voice-of-hollow':'<path d="M-36 0Q0 -43 36 0Q0 43 -36 0Z" fill="#724098" fill-opacity=".24" stroke-width="3"/><circle r="14" fill="none" stroke-width="3"/><circle r="5" fill="#e4c2ff" stroke="none"/>',
  'hollow-elite':'<path d="M-36 -19L-17 2L0 -34L17 2L36 -19L27 28H-27Z" fill="#9550cb" fill-opacity=".28" stroke-width="3.2"/><path d="M-27 29H27" stroke-width="3"/><path d="M0 -8l7 10l-7 10l-7 -10Z" fill="#d8b4ff" stroke-width="1.5"/>'
 };
 return '<g transform="translate('+x+' '+y+')" fill="none" stroke="#ead4ff" stroke-linecap="round" stroke-linejoin="round">'+(paths[id]??'<path d="M0 -36L10 -10L36 0L10 10L0 36L-10 10L-36 0L-10 -10Z"/>')+'</g>';
};
const flourish=(x:number,y:number,flip=1)=>'<g transform="translate('+x+' '+y+') scale('+flip+' 1)" fill="none" stroke="url(#silver)" stroke-width="2" opacity=".84"><path d="M0 45Q27 -8 95 -9Q55 5 43 -31M20 24Q70 22 74 54M50 -5Q90 -15 102 -36"/><path d="M29 12l-9 -18l22 8M65 -9l3 -20l11 14M65 28l21 -7l-9 18"/></g>';
const filigree=(x:number,y:number,w:number)=>'<g fill="none" stroke="url(#silver)" stroke-opacity=".7"><path d="M'+x+' '+y+'h'+w+'" stroke-width="1.8"/>'+gem(x,y,5)+gem(x+w,y,5)+gem(x+w/2,y,6)+'</g>';
const halo=(x:number,y:number,r:number)=>'<g transform="translate('+x+' '+y+')"><circle r="'+r+'" fill="none" stroke="#a36bdf" stroke-width="1.7" stroke-dasharray="5 10" opacity=".7"/>'+Array.from({length:12},(_,i)=>{const a=i*Math.PI/6,xx=Math.cos(a)*r,yy=Math.sin(a)*r;return '<path d="M'+xx+' '+yy+'l'+(-Math.sin(a)*7)+' '+(Math.cos(a)*7)+'" stroke="#e9d3f6" opacity=".7"/>';}).join('')+'</g>';
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
 '<rect width="1200" height="'+height+'" fill="url(#night)"/>'+ 
 '<image x="0" y="0" width="1200" height="'+height+'" preserveAspectRatio="xMidYMid slice" href="data:image/jpeg;base64,'+cinematicBackdrop+'" opacity=".93"/>'+
 '<rect x="226" y="145" width="748" height="'+(height-195)+'" rx="21" fill="#070710" fill-opacity=".26"/>'+
 '<ellipse cx="600" cy="90" rx="540" ry="290" fill="url(#haze)"/>'+
 windowPane(17)+windowPane(1033)+
 '<path d="M0 475V437H34V401H55V377H73V417H100V435H145V398H166V438H216V398H245V456H955V421H990V385H1014V430H1050V405H1080V433H1120V399H1150V437H1200V475Z" fill="#090913" opacity=".78"/>'+
 '<rect x="28" y="26" width="1144" height="'+(height-52)+'" rx="14" fill="none" stroke="url(#silver)" stroke-width="3"/>'+
 '<rect x="40" y="38" width="1120" height="'+(height-76)+'" rx="12" fill="none" stroke="#a36ddd" stroke-opacity=".42"/>'+
 rail(56,55,285)+rail(859,55,285)+rail(65,height-50,425)+rail(710,height-50,425)+rose(73,height-105)+rose(1127,height-105)+
 '<path d="M584 34l8 18l8 -26l8 26l8 -18l-5 25h-22Z" fill="url(#silver)" stroke="#cfa1ff"/>'+
 text(600,103,'H O L L O W F A N G',40,'#f8eaff',700,'middle','DejaVu Serif, Georgia, serif')+
 text(600,129,'— E X C L U S I V E  C O M M U N I T Y —',13,'#c8b6d5',600,'middle')+
 '<path d="M370 142H830" stroke="url(#silver)" stroke-opacity=".8"/>'+gem(600,142,8)+
 flourish(47,132)+flourish(1153,132,-1)+
 '<path d="M420 152Q600 158 780 152" fill="none" stroke="#c7a6dc" opacity=".5"/>'+
  panel(77,166,1046,211)+
 '<circle cx="172" cy="265" r="94" fill="#170d22" stroke="url(#silver)" stroke-width="4"/>'+
 '<circle cx="172" cy="265" r="81" fill="none" stroke="#a674e4" stroke-width="2"/>'+
 face+halo(172,265,104)+gem(172,171,11)+gem(172,359,11)+gem(79,265,8)+gem(265,265,8)+
 text(310,207,kicker,16,'#c995ff',700)+
 text(310,273,shortText(data.name,22),46,'#fff0ff',700,'start','DejaVu Serif, Georgia, serif')+
 text(311,313,'THE HOLLOW REMEMBERS',18,'#c5b4d8',500)+
 '<path d="M311 331H1081" stroke="url(#silver)" stroke-opacity=".5"/>';
}
const bottom=(height:number)=>'<path d="M135 '+(height-88)+'H520M680 '+(height-88)+'H1065" stroke="#b69acc" stroke-opacity=".55"/>'+gem(600,height-88,11)+
 text(600,height-59,'HOLLOWFANG  /  POWERED BY CRYPT',13,'#c0acd2',600,'middle')+'</svg>';
function relic(x:number,y:number,a:Achievement){
 const active=a.unlocked;
 return '<g opacity="'+(active?'1':'.42')+'">'+
 '<circle cx="'+x+'" cy="'+y+'" r="62" fill="#38154e" opacity="'+(active?'.46':'.1')+'"/>'+
 '<circle cx="'+x+'" cy="'+y+'" r="55" fill="#161020" stroke="url(#silver)" stroke-width="3"/>'+
 '<circle cx="'+x+'" cy="'+y+'" r="48" fill="#2a163c" fill-opacity=".48" stroke="'+(active?'#c08df2':'#817687')+'" stroke-dasharray="4 7" stroke-width="2"/>'+
 sigil(a.id,x,y)+gem(x,y-57,7)+gem(x,y+57,7)+gem(x-57,y,6)+gem(x+57,y,6)+'</g>';
}
export async function renderLevelImage(data:HollowfangImageData):Promise<Buffer>{
 const p=data.progress,opened=p.achievements.filter(a=>a.unlocked).length;
 const ratio=p.nextLevelXp>0?Math.max(0,Math.min(1,p.currentLevelXp/p.nextLevelXp)):0;
 const height=850;let svg=await frame(height,data,'THE ASCENSION  /  MEMBER LEVEL');
 svg+=panel(77,398,1046,182)+
 halo(187,475,68)+gem(187,405,9)+gem(187,543,9)+
 text(110,434,'LEVEL',18,'#c9acdc',700)+text(112,508,String(p.level),77,'#faeaff',700,'start','DejaVu Serif, Georgia, serif')+
 text(335,434,'RANK  /  THE HOLLOW',18,'#bfa4d9',700)+
 text(335,486,shortText(p.rank,27),35,'#eedefb',700,'start','DejaVu Serif, Georgia, serif')+
 text(335,529,pretty(p.xp)+' XP TOTAL',23,'#d69cff',700)+
 '<rect x="335" y="545" width="745" height="15" rx="7" fill="#291931" stroke="#ad80db" stroke-width="1"/>'+
 '<rect x="335" y="545" width="'+(745*ratio)+'" height="15" rx="7" fill="url(#violet)"/>'+
 (ratio>0?'<circle cx="'+(335+745*ratio)+'" cy="552.5" r="10" fill="#c99aff" opacity=".4"/>'+gem(335+745*ratio,552.5,7):'')+
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
 const p=data.progress,height=1140,opened=p.achievements.filter(a=>a.unlocked).length;
 let svg=await frame(height,data,'THE RELIQUARY  /  MEMBER ACHIEVEMENTS');
 svg+=panel(77,397,1046,92)+
 text(110,437,'HOLLOWFANG ACHIEVEMENTS',25,'#f6e7ff',700)+
 text(1090,437,opened+' / '+p.achievements.length+' UNLOCKED',20,'#cba2f2',700,'end')+
 '<rect x="107" y="458" width="986" height="11" rx="5" fill="#281831"/>'+
 '<rect x="107" y="458" width="'+(986*(p.achievements.length?opened/p.achievements.length:0))+'" height="11" rx="5" fill="url(#violet)"/>';
 for(let i=0;i<p.achievements.length;i++){
  const a=p.achievements[i]!,col=i%4,row=Math.floor(i/4),x=77+col*267,y=510+row*247;
  const description=shortText(a.description,52);
  const halves=description.length>29?[description.slice(0,29).trim(),description.slice(29).trim()]:[description];
  svg+=panel(x,y,248,232)+
   '<path d="M'+(x+19)+' '+(y+20)+'h210" stroke="#b78cdd" stroke-opacity=".4"/>'+
   relic(x+124,y+78,a)+
   text(x+124,y+157,shortText(a.name,19),17,a.unlocked?'#f7e7ff':'#a99bb9',700,'middle')+
   text(x+124,y+181,halves[0]??'',12,'#c4b4d2',500,'middle')+
   (halves[1]?text(x+124,y+197,halves[1],12,'#c4b4d2',500,'middle'):'')+
   '<rect x="'+(x+57)+'" y="'+(y+210)+'" width="134" height="20" rx="6" fill="'+(a.unlocked?'#42215c':'#25202e')+'" stroke="'+(a.unlocked?'#b486e1':'#6c6577')+'" stroke-opacity=".62"/>'+
   text(x+124,y+224,a.unlocked?'✦ UNLOCKED':'◇ LOCKED',12,a.unlocked?'#edccff':'#9b8caa',700,'middle');
 }
 svg+=filigree(170,1036,860)+text(600,1064,'EARNED THROUGH REAL LISTENING AND COMMUNITY ACTIVITY',16,'#d3bce0',600,'middle')+bottom(height);
 return sharp(Buffer.from(svg)).png().toBuffer();
}
