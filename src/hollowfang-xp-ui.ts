import {
 ContainerBuilder,SectionBuilder,SeparatorBuilder,TextDisplayBuilder,
 ThumbnailBuilder,escapeMarkdown
} from 'discord.js';
import type {Achievement,ProgressSnapshot} from './hollowfang-xp.js';

// These are Discord Components V2, not the generic music player notices.
// Never fabricate progress: every number and badge comes from the persisted snapshot.
const violet=0x8b5cf6;
const silver=0xc8b9df;
const safe=(value:string,max=70)=>escapeMarkdown(value.replace(/[\r\n\t]/g,' ').trim()).slice(0,max);
const displayXP=(value:number)=>Math.max(0,Math.floor(value)).toLocaleString('id-ID');
const txt=(value:string)=>new TextDisplayBuilder().setContent(value);
const rule=()=>new SeparatorBuilder().setDivider(true);
const meter=(current:number,total:number,width=18)=>{
 const ratio=total>0?Math.max(0,Math.min(1,current/total)):0;
 const fill=Math.round(ratio*width);
 return '▰'.repeat(fill)+'▱'.repeat(width-fill);
};
const caption=(title:string,subtitle:string)=>`-# ✦ H O L L O W F A N G   /   ${title}\n-# ${subtitle}`;

function shell(title:string,subtitle:string,name:string,avatar?:string){
 const card=new ContainerBuilder().setAccentColor(violet)
  .addTextDisplayComponents(txt(caption(title,subtitle)));
 card.addSeparatorComponents(rule());
 const identity=`# ${safe(name,36)}\n-# MEMBER OF THE HOLLOW  ·  EXCLUSIVE COMMUNITY`;
 if(avatar&&/^https:\/\/(?:cdn|media)\.discordapp\.com\//i.test(avatar)){
  card.addSectionComponents(
   new SectionBuilder()
    .addTextDisplayComponents(txt(identity))
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatar).setDescription('Avatar member Hollowfang'))
  );
 }else{
  // SectionBuilder requires an accessory; use text display when avatar is unavailable.
  card.addTextDisplayComponents(txt(identity));
 }
 card.addSeparatorComponents(rule());
 return card;
}

export function levelCard(name:string,p:ProgressSnapshot,avatar?:string){
 const unlocked=p.achievements.filter(a=>a.unlocked);
 const ratio=p.nextLevelXp?Math.floor(p.currentLevelXp/p.nextLevelXp*100):100;
 const card=shell('THE ASCENSION','LEVEL & REPUTATION',name,avatar);
 card.addTextDisplayComponents(txt(
  `## LEVEL ${p.level}  ·  ${p.rank}\n`+
  `**${displayXP(p.xp)} XP**  total accumulated\n`+
  `${meter(p.currentLevelXp,p.nextLevelXp)}\n`+
  `-# ${displayXP(p.currentLevelXp)} / ${displayXP(p.nextLevelXp)} XP to next level   ·   ${ratio}%`
 )).addSeparatorComponents(rule());
 card.addTextDisplayComponents(txt(
  `### YOUR LEGACY\n`+
  `♫  **${displayXP(Math.floor(p.listeningMs/60_000))} XP**  ·  Music listening\n`+
  `✎  **${displayXP(p.chatXp)} XP**  ·  Community chat\n`+
  `✧  **${unlocked.length} / ${p.achievements.length}**  ·  Achievements unlocked`
 ));
 if(unlocked.length){
  card.addSeparatorComponents(rule()).addTextDisplayComponents(txt(
   `### EARNED HONORS\n`+
   unlocked.slice(0,3).map(a=>`✦  **${safe(a.name,28)}**`).join('   ·   ')
  ));
 }
 card.addSeparatorComponents(rule()).addTextDisplayComponents(txt(
  '-# THE HOLLOW REMEMBERS  ·  /achievements to view your collection'
 ));
 return card;
}

function achievementLine(a:Achievement){
 return `${a.unlocked?'✦':'◇'}  **${safe(a.name,30)}**\n-# ${safe(a.description,110)}`;
}
export function achievementsCard(name:string,p:ProgressSnapshot,avatar?:string){
 const earned=p.achievements.filter(a=>a.unlocked);
 const locked=p.achievements.filter(a=>!a.unlocked);
 const card=shell('THE RELIQUARY','ACHIEVEMENT COLLECTION',name,avatar);
 card.addTextDisplayComponents(txt(
  `## ${earned.length} / ${p.achievements.length} HONORS CLAIMED\n`+
  `${meter(earned.length,p.achievements.length,18)}\n`+
  '-# Your collection grows with genuine music and community activity'
 )).addSeparatorComponents(rule());
 if(earned.length){
  card.addTextDisplayComponents(txt(
   '### ✦  UNLOCKED RELICS\n'+earned.map(achievementLine).join('\n\n')
  ));
 }else{
  card.addTextDisplayComponents(txt('### ✦  UNLOCKED RELICS\n-# No honors claimed yet. Your story starts here.'));
 }
 if(locked.length){
  card.addSeparatorComponents(rule()).addTextDisplayComponents(txt(
   '### ◇  YET TO BE DISCOVERED\n'+locked.map(achievementLine).join('\n\n')
  ));
 }
 card.addSeparatorComponents(rule()).addTextDisplayComponents(txt(
  '-# HOLLOWFANG  ·  EARNED, NEVER GIVEN  ·  /level to see your progress'
 ));
 return card;
}

export function xpTopCard(rows:Array<{name:string;xp:number}>){
 const card=new ContainerBuilder().setAccentColor(silver)
  .addTextDisplayComponents(txt(caption('THE HALL OF FAME','COMMUNITY LEADERBOARD')))
  .addSeparatorComponents(rule())
  .addTextDisplayComponents(txt('## THE HOLLOW ELITE\n-# The ten highest XP totals in Hollowfang'))
  .addSeparatorComponents(rule());
 if(!rows.length)card.addTextDisplayComponents(txt('-# No XP recorded yet. Play music or participate in the community.'));
 else card.addTextDisplayComponents(txt(rows.map((r,i)=>{
  const medal=['Ⅰ','Ⅱ','Ⅲ'][i]??`${i+1}.`;
  return `${medal}  **${safe(r.name,55)}**   ·   ${displayXP(r.xp)} XP`;
 }).join('\n\n')));
 return card.addSeparatorComponents(rule()).addTextDisplayComponents(txt(
  '-# THE HOLLOW REMEMBERS  ·  XP is based on actual listening and chat activity'
 ));
}
