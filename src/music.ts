import {Lyrics,lyricPages} from './music-lyrics.js';
import {resolveRequest,fallbackTrack,prepareTrack} from './music-resolver.js';
import {reportMusicError} from './music-diagnostics.js';
import {ChannelType,Client,Events,PermissionFlagsBits,MessageFlags,escapeMarkdown,type ChatInputCommandInteraction,type MessageComponentInteraction,ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder} from 'discord.js';
import {Connectors,Shoukaku,type Player} from 'shoukaku';
import {MusicError,MusicSession,Serial,identifier,tracksFrom,duration} from './music-core.js';
import {musicNotice,playerView,queueView,trackAnnouncement,musicV2Flags} from './music-ui.js';
export const musicNames=new Set(['play','skip','pause','resume','queue','stop','nowplaying','volume']);
const sourceError=`Lavalink belum tersambung di ${process.env.LAVALINK_URL??'127.0.0.1:2333'}. Pastikan terminal npm run lavalink tetap berjalan.`;
type Panel={interaction:ChatInputCommandInteraction;ownerId:string;guildId:string;session:MusicSession;mode:'player'|'queue';page:number;stop:()=>void;timer?:NodeJS.Timeout};
export class Music {
 readonly shoukaku:Shoukaku;
 private lyrics=new Lyrics(()=>this.client.user?.id??'0');
 private watchdogs=new Map<string,NodeJS.Timeout>();
 private checking=new Set<string>();
 private notificationChannels=new WeakMap<MusicSession,string>();
 private sessions=new Map<string,MusicSession>();private serial=new Serial();private idle=new Map<string,NodeJS.Timeout>();private empty=new Map<string,NodeJS.Timeout>();private panels=new Map<string,Panel>();
 constructor(private client:Client){
  this.shoukaku=new Shoukaku(new Connectors.DiscordJS(client),[{name:'local',url:process.env.LAVALINK_URL??'127.0.0.1:2333',auth:process.env.LAVALINK_PASSWORD??'manuk-local-only',secure:process.env.LAVALINK_SECURE==='true'}],{resume:false,reconnectTries:5,reconnectInterval:5,restTimeout:15,voiceConnectionTimeout:20});
  this.shoukaku.on('ready',()=>console.log('Lavalink tersambung. Musik siap menerima command.'));
  this.shoukaku.on('error',(_name,error)=>{reportMusicError('NODE',error);});
  this.shoukaku.on('close',()=>{for(const guild of this.sessions.keys())void this.serial.run(guild,()=>this.dispose(guild)).catch(()=>{});});
  client.on(Events.VoiceStateUpdate,(old,state)=>{
   const guild=state.guild.id,s=this.sessions.get(guild);if(!s)return;
   if(state.id===client.user?.id&&state.channelId!==s.channelId){void this.serial.run(guild,()=>this.dispose(guild)).catch(()=>{});return;}
   const channel=state.guild.channels.cache.get(s.channelId);
   if(!channel?.isVoiceBased())return;
   const hasHuman=channel.members.some(m=>!m.user.bot);
   if(hasHuman){const t=this.empty.get(guild);if(t)clearTimeout(t);this.empty.delete(guild);}
   else if(!this.empty.has(guild))this.empty.set(guild,setTimeout(()=>{void this.serial.run(guild,()=>this.dispose(guild)).catch(()=>{});},60000).unref());
  });
 }
 private clearTimers(guild:string){for(const map of [this.idle,this.empty,this.watchdogs]){const t=map.get(guild);if(t)clearTimeout(t);map.delete(guild);}}
 private async dispose(guild:string){const s=this.sessions.get(guild);this.sessions.delete(guild);this.clearTimers(guild);this.clearPanel(guild);if(s)await s.stop().catch(()=>{});await this.shoukaku.leaveVoiceChannel(guild).catch(()=>{});}
 private armIdle(guild:string,s:MusicSession){const t=this.idle.get(guild);if(t)clearTimeout(t);this.idle.delete(guild);if(!s.current)this.idle.set(guild,setTimeout(()=>{void this.serial.run(guild,async()=>{if(!this.sessions.get(guild)?.current)await this.dispose(guild);}).catch(()=>{});},120000).unref());}
 private bind(guild:string,s:MusicSession,player:Player){
  this.watchdogs.set(guild,setInterval(()=>{void this.checkQueue(guild,s,player);},5000).unref());
  player.on('end',event=>{const ended=s.current;void this.serial.run(guild,async()=>{if(this.sessions.get(guild)!==s||s.current!==ended)return;await s.end(event.reason,event.track?.encoded);this.armIdle(guild,s);await this.refreshPanel(guild);}).catch(error=>{s.lastError=reportMusicError('QUEUE END',error);});});
  player.on('start',event=>{s.start(event.track.encoded);void this.refreshPanel(guild);});
  player.on('update',event=>{
   if(this.sessions.get(guild)!==s)return;
   if(s.progress(event.state.position)){
    console.log(`[MUSIC START] source=${s.current?.info.sourceName??'unknown'} evidence=position-progress`);
    void this.announceTrack(guild,s);void this.refreshPanel(guild);
   }
  });
  player.on('exception',event=>{
   // Older Shoukaku typings omit track; capture the active track at event receipt.
   const captured=s.current;
   const encoded=(event as typeof event & {track?:{encoded:string}}).track?.encoded??captured?.encoded;
   const detail=reportMusicError('PLAYBACK ERROR',event.exception);
   void this.serial.run(guild,async()=>{
    if(this.sessions.get(guild)!==s||!captured||s.current!==captured||captured.encoded!==encoded)return;
    s.lastError=detail;await s.failed(encoded);this.armIdle(guild,s);await this.refreshPanel(guild);
   }).catch(error=>{s.lastError=reportMusicError('RECOVERY',error);});
  });
  player.on('stuck',event=>{const encoded=event.track?.encoded;void this.serial.run(guild,async()=>{if(this.sessions.get(guild)!==s)return;console.error(`[MUSIC PLAYBACK ERROR] track macet; source=${s.current?.info.sourceName??'unknown'}`);s.lastError='Lagu macet; mencoba sumber cadangan.';await s.failed(encoded);this.armIdle(guild,s);await this.refreshPanel(guild);}).catch(()=>{s.lastError=sourceError;});});
  player.on('closed',()=>{void this.serial.run(guild,()=>this.dispose(guild)).catch(()=>{});});
 }
 private async checkQueue(guild:string,s:MusicSession,player:Player){
  if(this.checking.has(guild)||this.sessions.get(guild)!==s||s.closed||s.paused||!s.current||!s.progressed)return;
  const current=s.current;this.checking.add(guild);
  try{
   const remote=await player.node.rest.getPlayer(guild);
   if(!remote||remote.paused||!remote.voice.connected)return;
   const sameTrack=remote.track?.encoded===current.encoded;
   if(remote.track&&!sameTrack)return;
   // The REST snapshot may expose fresher progress than the gateway update stream.
   const state=(remote as typeof remote & {state?:{position:number}}).state;
   if(s.current!==current||this.sessions.get(guild)!==s)return;
   if(sameTrack&&Number.isFinite(state?.position))s.progress(state!.position);
   if(remote.track&&!s.endIsStalled())return;
   await this.serial.run(guild,async()=>{
    if(this.sessions.get(guild)!==s||s.current!==current||s.paused||s.closed)return;
    if(remote.track){
     if(!s.endIsStalled())return;
     console.log(`[MUSIC AUTO NEXT] Akhir lagu macet: positionMs=${s.position} durationMs=${current.info.length}; queue=${s.queue.length}`);
     await s.skip();
    }else{
     console.log(`[MUSIC QUEUE] Lavalink idle; melanjutkan ${s.queue.length} lagu antrean.`);
     await s.next();
    }this.armIdle(guild,s);await this.refreshPanel(guild);
   });
  }catch(error){reportMusicError('QUEUE CHECK',error);}finally{this.checking.delete(guild);}
 }
 private async showLyrics(button:MessageComponentInteraction,session:MusicSession){
  const track=session.current;
  await button.deferReply({flags:MessageFlags.Ephemeral});
  if(!track){await button.editReply({content:'Tidak ada lagu aktif.'});return;}
  try{
   const pages=lyricPages(await this.lyrics.get(track));let page=0;
   const payload=(disabled=false)=>({embeds:[new EmbedBuilder().setColor(0x8b5cf6).setTitle(track.info.title.slice(0,256)).setDescription(escapeMarkdown(pages[page]!)).setFooter({text:`${track.info.author.slice(0,100)} · LRCLIB · ${page+1}/${pages.length}`})],components:pages.length>1?[new ActionRowBuilder<ButtonBuilder>().addComponents(new ButtonBuilder().setCustomId('lyrics:prev').setLabel('Sebelumnya').setStyle(ButtonStyle.Secondary).setDisabled(disabled||page===0),new ButtonBuilder().setCustomId('lyrics:next').setLabel('Berikutnya').setStyle(ButtonStyle.Primary).setDisabled(disabled||page===pages.length-1))]:[],allowedMentions:{parse:[] as never[]}});
   const message=await button.editReply(payload());
   if(pages.length>1){const collector=message.createMessageComponentCollector({time:10*60*1000,filter:i=>i.user.id===button.user.id});
    collector.on('collect',i=>{page=Math.max(0,Math.min(pages.length-1,page+(i.customId==='lyrics:next'?1:-1)));void i.update(payload()).catch(()=>{});});
    collector.on('end',()=>{void button.editReply(payload(true)).catch(()=>{});});}
  }catch(error){await button.editReply({content:error instanceof MusicError?error.message:'Lirik belum dapat ditampilkan.'}).catch(()=>{});}
 }
 private async announceTrack(guild:string,s:MusicSession){
  const channelId=this.notificationChannels.get(s),track=s.current;
  if(!channelId||!track)return;
  const card=trackAnnouncement(s,(s.player as Player).volume);
  try{
   const channel=await this.client.channels.fetch(channelId);
   if(this.sessions.get(guild)!==s||s.closed||s.current!==track)return;
   if(!channel?.isSendable())throw new Error('channel unavailable');
   await channel.send({flags:musicV2Flags,components:[card],allowedMentions:{parse:[]}});
  }catch{
   console.warn('[MUSIC NOTICE] Notifikasi gagal dikirim. Periksa izin View Channel dan Send Messages (Send Messages in Threads untuk thread). Audio tetap berjalan.');
  }
 }
 private async startTimedOut(guild:string,s:MusicSession,encoded:string){
  await this.serial.run(guild,async()=>{
   if(this.sessions.get(guild)!==s||s.current?.encoded!==encoded||s.progressed)return;
   console.error(`[MUSIC PLAYBACK ERROR] Lavalink tidak mengirim start/progress dalam batas waktu; source=${s.current.info.sourceName}`);
   s.lastError='Audio tidak mulai; mencoba kandidat atau sumber cadangan.';
   await s.failed(encoded);this.armIdle(guild,s);await this.refreshPanel(guild);
  }).catch(error=>{s.lastError=reportMusicError('PLAYBACK ERROR',error);});
 }
 async handle(i:ChatInputCommandInteraction){
  if(!i.inGuild()||!i.guild)throw new MusicError('Command musik hanya bisa dipakai di server.');
  await this.serial.run(i.guildId,async()=>{
   const guild=i.guild!;
   const member=await guild.members.fetch(i.user.id);
   const voice=member.voice.channel;
   if(!voice||voice.type!==ChannelType.GuildVoice)throw new MusicError('Masuk voice channel biasa dahulu (Stage belum didukung).');
   let s=this.sessions.get(guild.id);
   if(s&&s.channelId!==voice.id)throw new MusicError('Masuk voice channel yang sama dengan bot untuk mengontrol musik.');
   const c=i.commandName;
   if(c==='stop'){
    if(!s)throw new MusicError('Bot belum memutar musik di server ini.');
    await this.dispose(guild.id);await i.editReply({components:[musicNotice('Playback dihentikan. Antrean dibersihkan.')]});return;
   }
   if(c==='play'){
    await i.editReply({components:[musicNotice('Mencari lagu dan menyiapkan pemutar...')]});
    const me=guild.members.me??await guild.members.fetchMe();
    if(!voice.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]))throw new MusicError('Bot membutuhkan izin View Channel, Connect, dan Speak di voice channel ini.');
    if(voice.full&&me.voice.channelId!==voice.id&&!voice.permissionsFor(me)?.has(PermissionFlagsBits.MoveMembers))throw new MusicError('Voice channel penuh. Pilih channel yang masih tersedia.');
    const node=this.shoukaku.getIdealNode();if(!node)throw new MusicError(sourceError);
    const query=identifier(i.options.getString('query',true),i.options.getString('source')??'youtube');
    const actualSource=query.startsWith('https://open.spotify.com/')?'Spotify':query.startsWith('scsearch:')||query.includes('soundcloud.com/')?'SoundCloud':query.startsWith('ytmsearch:')?'YouTube Music':'YouTube';
    console.log(`[MUSIC REQUEST] source=${actualSource} input=${query.startsWith('https:')?'link':'search'}`);
    const tracks=await resolveRequest(q=>node.rest.resolve(q),query);
    // Voice membership may change during network lookup.
    if(member.voice.channelId!==voice.id)throw new MusicError('Kamu berpindah voice channel. Jalankan /play lagi.');
    if(!s){
     let player:Player;
     try{player=await this.shoukaku.joinVoiceChannel({guildId:guild.id,channelId:voice.id,shardId:guild.shardId,deaf:true});}catch{await this.dispose(guild.id);throw new MusicError('Bot tidak dapat masuk voice channel. Periksa izin Connect dan Speak.');}
     s=new MusicSession(player,voice.id,track=>{const active=this.shoukaku.getIdealNode();if(!active)throw new MusicError(sourceError);return fallbackTrack(q=>active.rest.resolve(q),track);},Date.now,track=>{const active=this.shoukaku.getIdealNode();if(!active)throw new MusicError(sourceError);return prepareTrack(q=>active.rest.resolve(q),track);},encoded=>{void this.startTimedOut(guild.id,s!,encoded);});this.sessions.set(guild.id,s);this.bind(guild.id,s,player);
     await player.setGlobalVolume(50).catch(()=>{});
    }
    if(i.channelId)this.notificationChannels.set(s,i.channelId);
    s.add(tracks);if(!s.current)await s.next();this.armIdle(guild.id,s);
    if(!s.current)throw new MusicError(s.lastError||sourceError);
    await i.editReply({components:[playerView(s,(s.player as Player).volume)]});await this.attachPanel(guild.id,i,s,'player',1);return;
   }
   if(!s)throw new MusicError('Belum ada sesi musik. Gunakan /play dahulu.');
   const player=s.player as Player;
   if(c==='skip'){const skipped=s.current?.info.title??'Track';await s.skip();this.armIdle(guild.id,s);await i.editReply({components:[musicNotice(`Skipped • ${escapeMarkdown(skipped).slice(0,120)}`)]});await this.refreshPanel(guild.id);return;}
   if(c==='pause'||c==='resume'){if(!s.current)throw new MusicError('Tidak ada lagu aktif.');await s.setPaused(c==='pause');await i.editReply({components:[musicNotice(c==='pause'?'Playback paused.':'Playback resumed.')]});await this.refreshPanel(guild.id);return;}
   if(c==='volume'){const value=i.options.getInteger('level',true);await player.setGlobalVolume(value);await i.editReply({components:[musicNotice(`Volume · ${value}%`)]});await this.refreshPanel(guild.id);return;}
   if(c==='nowplaying'){await i.editReply({components:[playerView(s,player.volume)]});await this.attachPanel(guild.id,i,s,'player',1);return;}
   if(c==='queue'){
    const pages=Math.max(1,Math.ceil(s.queue.length/10)),page=Math.max(1,i.options.getInteger('page')??1);
    if(page>pages)throw new MusicError(`Halaman tersedia: 1-${pages}.`);
    await i.editReply({components:[queueView(s,page,pages)]});await this.attachPanel(guild.id,i,s,'queue',page);return;
   }
  });
 }
 private clearPanel(guild:string){const panel=this.panels.get(guild);if(!panel)return;this.panels.delete(guild);if(panel.timer)clearInterval(panel.timer);panel.stop();}
 private async attachPanel(guild:string,interaction:ChatInputCommandInteraction,session:MusicSession,mode:'player'|'queue',page:number){
  this.clearPanel(guild);
  const message=await interaction.fetchReply().catch(()=>undefined);if(!message)return;
  const panel:Panel={interaction,ownerId:interaction.user.id,guildId:guild,session,mode,page,stop:()=>{}};
  this.panels.set(guild,panel);
  const collector=message.createMessageComponentCollector({time:14*60*1000});panel.stop=()=>collector.stop('replaced');
  collector.on('collect',component=>{void this.handlePanelButton(panel,component);});
  collector.on('end',()=>{
   if(panel.timer)clearInterval(panel.timer);
   const active=this.panels.get(guild)===panel;if(active)this.panels.delete(guild);
   if(active){const view=panel.mode==='player'?playerView(session,(session.player as Player).volume,true):queueView(session,panel.page,Math.max(1,Math.ceil(session.queue.length/10)),true);void interaction.editReply({components:[view]}).catch(()=>{});}
  });
  if(mode==='player')panel.timer=setInterval(()=>{void this.refreshPanel(guild);},15000).unref();
 }
 private async refreshPanel(guild:string){
  const panel=this.panels.get(guild);if(!panel)return;
  if(panel.session.closed||this.sessions.get(guild)!==panel.session){this.clearPanel(guild);return;}
  const pages=Math.max(1,Math.ceil(panel.session.queue.length/10));panel.page=Math.min(panel.page,pages);
  const view=panel.mode==='player'?playerView(panel.session,(panel.session.player as Player).volume):queueView(panel.session,panel.page,pages);
  try{await panel.interaction.editReply({components:[view]});}catch{this.clearPanel(guild);}
 }
 private async handlePanelButton(panel:Panel,button:MessageComponentInteraction){
  if(button.user.id!==panel.ownerId){await button.reply({content:'Panel ini hanya dapat dikontrol oleh pemintanya.',flags:MessageFlags.Ephemeral}).catch(()=>{});return;}
  if(this.panels.get(panel.guildId)!==panel||this.sessions.get(panel.guildId)!==panel.session){await button.update({components:[musicNotice('Panel player sudah tidak aktif.')] }).catch(()=>{});return;}
  if(button.customId==='music:lyrics'){await this.showLyrics(button,panel.session);return;}
  if(button.customId==='music:show_queue'){panel.mode='queue';panel.page=1;await button.update({components:[queueView(panel.session,1,Math.max(1,Math.ceil(panel.session.queue.length/10)))]}).catch(()=>{});return;}
  if(button.customId==='music:page_prev'||button.customId==='music:page_next'){
   const pages=Math.max(1,Math.ceil(panel.session.queue.length/10));panel.mode='queue';panel.page=Math.max(1,Math.min(pages,panel.page+(button.customId==='music:page_next'?1:-1)));
   await button.update({components:[queueView(panel.session,panel.page,pages)]}).catch(()=>{});return;
  }
  if(button.customId==='music:show_player'){panel.mode='player';await button.update({components:[playerView(panel.session,(panel.session.player as Player).volume)]}).catch(()=>{});return;}
  const guild=this.client.guilds.cache.get(panel.guildId);if(!guild){await button.update({components:[musicNotice('Server tidak tersedia.')] }).catch(()=>{});return;}
  try{
   const member=await guild.members.fetch(button.user.id);
   if(member.voice.channelId!==panel.session.channelId){await button.reply({content:'Masuk ke voice channel yang sama dengan bot untuk mengontrol musik.',flags:MessageFlags.Ephemeral});return;}
   await button.deferUpdate();
   await this.serial.run(panel.guildId,async()=>{
    if(this.sessions.get(panel.guildId)!==panel.session||panel.session.closed)return;
    const player=panel.session.player as Player;
    if(button.customId==='music:pause')await panel.session.setPaused(!panel.session.paused);
    else if(button.customId==='music:skip'){await panel.session.skip();this.armIdle(panel.guildId,panel.session);}
    else if(button.customId==='music:shuffle')panel.session.shuffle();
    else if(button.customId==='music:stop'){await this.dispose(panel.guildId);await panel.interaction.editReply({components:[musicNotice('Playback dihentikan. Antrean dibersihkan.')]});this.clearPanel(panel.guildId);return;}
   });
   await this.refreshPanel(panel.guildId);
  }catch{await button.followUp({content:'Aksi tidak dapat dijalankan. Coba gunakan command musik lagi.',flags:MessageFlags.Ephemeral}).catch(()=>{});}
 }
 async shutdown(){for(const guild of this.panels.keys())this.clearPanel(guild);await Promise.allSettled([...this.sessions.keys()].map(id=>this.dispose(id)));}
}
