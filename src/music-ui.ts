import {
 ActionRowBuilder,ButtonBuilder,ButtonStyle,ContainerBuilder,MessageFlags,SectionBuilder,
 SeparatorBuilder,TextDisplayBuilder,ThumbnailBuilder,escapeMarkdown
} from 'discord.js';
import {duration,type MusicSession} from './music-core.js';

const purple=0x8b5cf6;
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
const addTrack=(container:ContainerBuilder,title:string,body:string,cover?:string)=>{
 if(cover&&/^https:\/\//i.test(cover))container.addSectionComponents(section(title,body,cover));
 else container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${safe(title)}\n${body}`));
 return container;
};
const base=(heading:string)=>new ContainerBuilder().setAccentColor(purple).addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# MANUK MUSIC  /  ${heading}`));
const rule=()=>new SeparatorBuilder().setDivider(true);
const footer=()=>new TextDisplayBuilder().setContent('-# Musik bareng, satu antrean.');

export function musicNotice(message:string){
 return base('PLAYER').addSeparatorComponents(rule()).addTextDisplayComponents(new TextDisplayBuilder().setContent(message)).addSeparatorComponents(rule()).addTextDisplayComponents(footer());
}

export function playerView(session:MusicSession,volume:number,disabled=false){
 const track=session.current,container=base('PEMUTAR');
 if(!track)return musicNotice(`${session.stay?'24/7 ON · Standby di voice.':'Tidak ada lagu yang sedang diputar.'} ${session.queue.length?`${session.queue.length} lagu tersimpan; gunakan /resume.`:'Gunakan /play untuk menambahkan musik.'}`+(session.lastError?'\n'+safe(session.lastError,300):''));
 const {info}=track,position=Math.max(session.position,info.position||0),length=info.length;
 const status=session.paused?'\u23f8 PAUSED':session.progressed?'\u25b6 PLAYING':'\u25f7 LOADING';
 const meta=`**${safe(info.author,100)}**\n${source(info.sourceName)}  |  ${duration(length,info.isStream)}  |  ${status}`;
 const next=session.queue[0];
 addTrack(container,info.title,meta,info.artworkUrl)
  .addTextDisplayComponents(new TextDisplayBuilder().setContent(`**${progress(position,length)}**\n${time(position)}  /  ${duration(length,info.isStream)}`))
  .addSeparatorComponents(rule())
  .addTextDisplayComponents(new TextDisplayBuilder().setContent(
   `**ANTREAN**  ${session.queue.length} ${session.queue.length===1?'track':'tracks'}    **VOLUME**  ${Math.round(volume)}%`+
   (next?`\n**BERIKUTNYA**  ${safe(next.info.title,90)} | ${safe(next.info.author,60)}`:'\n*Tambahkan lagu dengan `/play` untuk mengisi antrean.*')+
   `\n**LOOP** ${session.loop}  ·  **AUTOPLAY** ${session.autoplay?session.autoplayStyle.toUpperCase():'OFF'} · **ADIL** ${session.fair?'ON':'OFF'} · **24/7** ${session.stay?'ON':'OFF'}`+
   (session.lastError?'\n\n\u26a0 Sedang mencoba sumber cadangan.':'')
  ))
  .addSeparatorComponents(rule())
  .addActionRowComponents(row(
   button('music:pause',session.paused?'Resume':'Pause',session.paused?'\u25b6':'\u2016',ButtonStyle.Secondary,disabled),
   button('music:skip','Skip','\u23ed',ButtonStyle.Primary,disabled),
   button('music:shuffle','Shuffle','\u21c4',ButtonStyle.Secondary,disabled),
   button('music:stop','Stop','\u25a0',ButtonStyle.Danger,disabled)
  ))
  .addActionRowComponents(row(button('music:show_queue','Antrean','☷',ButtonStyle.Secondary,disabled),button('music:lyrics','Lirik','♫',ButtonStyle.Secondary,disabled),button('music:favorite','Favorit','♡',ButtonStyle.Secondary,disabled)))
  .addActionRowComponents(row(button('music:loop',`Loop: ${session.loop}`,'↻',ButtonStyle.Secondary,disabled),button('music:autoplay',`Autoplay: ${session.autoplay?'ON':'OFF'}`,'∞',ButtonStyle.Secondary,disabled),button('music:replay','Replay','↺',ButtonStyle.Secondary,disabled),button('music:savequeue','Simpan antrean','▣',ButtonStyle.Secondary,disabled)))
  .addActionRowComponents(row(button('music:volume_down','Volume −10','−',ButtonStyle.Secondary,disabled||volume<=0),button('music:volume_up','Volume +10','+',ButtonStyle.Secondary,disabled||volume>=100)))
  .addTextDisplayComponents(footer());
 return container;
}

export function queueView(session:MusicSession,page:number,pages:number,disabled=false){
 const container=base('QUEUE');
 if(session.current){
  const current=session.current;
  addTrack(container,`${'\u25b6'} ${current.info.title}`,`**${safe(current.info.author,100)}**\n${source(current.info.sourceName)}  |  ${duration(current.info.length,current.info.isStream)}  |  NOW PLAYING`,current.info.artworkUrl);
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
   button('music:show_player','Player','\u266b',ButtonStyle.Primary,disabled),button('music:savequeue','Simpan antrean','▣',ButtonStyle.Secondary,disabled)
  ))
  .addTextDisplayComponents(footer());
 return container;
}

export const musicV2Flags=MessageFlags.IsComponentsV2;

/** A new public card per audible track; controls stay in the private live panel. */
export function trackAnnouncement(session:MusicSession,volume:number){
 const track=session.current;
 if(!track)return musicNotice('Antrean selesai. Tambahkan musik dengan `/play`.');
 const {info}=track,next=session.queue[0];
 const card=base('SEDANG DIPUTAR');
 addTrack(card,info.title,`**${safe(info.author,100)}**\n${source(info.sourceName)}  ·  ${duration(info.length,info.isStream)}  ·  ♫ <#${session.channelId}>`,info.artworkUrl);
 card.addSeparatorComponents(rule()).addTextDisplayComponents(new TextDisplayBuilder().setContent(
  `**${session.queue.length}** lagu menunggu  ·  **${Math.round(volume)}%** volume`+
  (next?`\n-# Berikutnya · ${safe(next.info.title,100)} — ${safe(next.info.author,60)}`:'\n-# Lagu terakhir dalam antrean. Tambah lagi dengan /play.')
 )).addSeparatorComponents(rule()).addTextDisplayComponents(new TextDisplayBuilder().setContent('-# Kontrol pemutar: /nowplaying  ·  Lihat antrean: /queue'));
 return card;
}
