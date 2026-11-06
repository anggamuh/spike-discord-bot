import {
 ActionRowBuilder,ButtonBuilder,ButtonStyle,ContainerBuilder,MessageFlags,SectionBuilder,
 SeparatorBuilder,TextDisplayBuilder,ThumbnailBuilder,escapeMarkdown
} from 'discord.js';
import {duration,type MusicSession} from './music-core.js';

const purple=0xa78bfa;
const safe=(value:string,max=160)=>escapeMarkdown(value||'Unknown artist').replace(/\s+/g,' ').slice(0,max);
const time=(ms:number)=>duration(Math.max(0,ms));
const source=(name:string)=>({youtube:'YouTube',soundcloud:'SoundCloud',bandcamp:'Bandcamp',spotify:'Audio'} as Record<string,string>)[name.toLowerCase()]??(name?name[0]!.toUpperCase()+name.slice(1):'Unknown');
const progress=(position:number,length:number)=>{
 const size=18,ratio=length>0?Math.max(0,Math.min(1,position/length)):0,head=Math.min(size-1,Math.floor(ratio*size));
 return `${'\u2501'.repeat(head)}\u25cf${'\u2500'.repeat(size-head-1)}`;
};
const button=(id:string,label:string,glyph:string,style=ButtonStyle.Secondary,disabled=false)=>new ButtonBuilder().setCustomId(id).setLabel(`${glyph}  ${label}`).setStyle(style).setDisabled(disabled);
const row=(...buttons:ButtonBuilder[])=>new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
const section=(title:string,body:string,cover?:string)=>{
 const builder=new SectionBuilder().addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${safe(title)}\n${body}`));
 if(cover&&/^https:\/\//i.test(cover))builder.setThumbnailAccessory(new ThumbnailBuilder().setURL(cover).setDescription(`Cover: ${safe(title,80)}`));
 return builder;
};
const base=(heading:string)=>new ContainerBuilder().setAccentColor(purple).addTextDisplayComponents(new TextDisplayBuilder().setContent(`**MANUK MUSIC \u2022 ${heading}**`));
const rule=()=>new SeparatorBuilder().setDivider(true);
const footer=()=>new TextDisplayBuilder().setContent('*MANUKAPP  \u2022  MUSIC*');

export function musicNotice(message:string){
 return base('PLAYER').addSeparatorComponents(rule()).addTextDisplayComponents(new TextDisplayBuilder().setContent(message)).addSeparatorComponents(rule()).addTextDisplayComponents(footer());
}

export function playerView(session:MusicSession,volume:number,disabled=false){
 const track=session.current,container=base('NOW PLAYING');
 if(!track)return musicNotice('Tidak ada lagu yang sedang diputar. Gunakan `/play` untuk menambahkan musik.');
 const {info}=track,position=Math.max(session.position,info.position||0),length=info.length;
 const status=session.paused?'\u23f8 PAUSED':session.started?'\u25b6 PLAYING':'\u25f7 LOADING';
 const meta=`**${safe(info.author,100)}**\n${source(info.sourceName)}  |  ${duration(length,info.isStream)}  |  ${status}`;
 const next=session.queue[0];
 container.addSeparatorComponents(rule())
  .addSectionComponents(section(info.title,meta,info.artworkUrl))
  .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${progress(position,length)}**\n${time(position)}  /  ${duration(length,info.isStream)}`))
  .addSeparatorComponents(rule())
  .addTextDisplayComponents(new TextDisplayBuilder().setContent(
   `**QUEUE**  ${session.queue.length} ${session.queue.length===1?'track':'tracks'}    **VOLUME**  ${Math.round(volume)}%`+
   (next?`\n**UP NEXT**  ${safe(next.info.title,90)} | ${safe(next.info.author,60)}`:'\n*Tambahkan lagu dengan `/play` untuk mengisi antrean.*')+
   (session.lastError?'\n\n\u26a0 Sedang mencoba sumber cadangan.':'')
  ))
  .addSeparatorComponents(rule())
  .addActionRowComponents(row(
   button('music:pause',session.paused?'Resume':'Pause',session.paused?'\u25b6':'\u2016',ButtonStyle.Secondary,disabled),
   button('music:skip','Skip','\u23ed',ButtonStyle.Primary,disabled),
   button('music:shuffle','Shuffle','\u21c4',ButtonStyle.Secondary,disabled),
   button('music:stop','Stop','\u25a0',ButtonStyle.Danger,disabled)
  ))
  .addTextDisplayComponents(footer());
 return container;
}

export function queueView(session:MusicSession,page:number,pages:number,disabled=false){
 const container=base('QUEUE');
 if(session.current){
  const current=session.current;
  container.addSeparatorComponents(rule()).addSectionComponents(section(`${'\u25b6'} ${current.info.title}`,`**${safe(current.info.author,100)}**\n${source(current.info.sourceName)}  |  ${duration(current.info.length,current.info.isStream)}  |  NOW PLAYING`,current.info.artworkUrl));
 }
 const start=(page-1)*10,tracks=session.queue.slice(start,start+10);
 const lines=tracks.length?tracks.map((track,index)=>`**${String(start+index+1).padStart(2,'0')}**  ${safe(track.info.title,100)} | ${duration(track.info.length,track.info.isStream)}\n   ${safe(track.info.author,90)}`).join('\n'):'*Antrean masih kosong. Tambahkan lagu dengan `/play`.*';
 const remaining=session.queue.reduce((sum,track)=>sum+(track.info.isStream?0:track.info.length),0);
 const currentRemaining=session.current&&!session.current.info.isStream?Math.max(0,session.current.info.length-session.position):0;
 const eta=session.current?.info.isStream?'LIVE':time(currentRemaining+remaining);
 container.addSeparatorComponents(rule())
  .addTextDisplayComponents(new TextDisplayBuilder().setContent(`### UP NEXT\n${lines}`))
  .addSeparatorComponents(rule())
  .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${session.queue.length} TRACKS**  |  EST. ${eta}  |  PAGE ${page}/${pages}`))
  .addActionRowComponents(row(
   button('music:page_prev','Previous','\u2039',ButtonStyle.Secondary,disabled||page<=1),
   button('music:page_next','Next','\u203a',ButtonStyle.Secondary,disabled||page>=pages),
   button('music:show_player','Player','\u266b',ButtonStyle.Primary,disabled)
  ))
  .addTextDisplayComponents(footer());
 return container;
}

export const musicV2Flags=MessageFlags.IsComponentsV2;
