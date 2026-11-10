import {renderProfile,discordAvatar} from './music-profile.js';
import {PlaybackMeter,monthKey,validMonth} from './music-meter.js';
import {parsePosition,type MusicPreferences} from './music-options.js';
import {Lyrics,lyricPages} from './music-lyrics.js';
import {resolveRequest,fallbackTrack,prepareTrack,recommendTrack} from './music-resolver.js';
import {reportMusicError} from './music-diagnostics.js';
import {AttachmentBuilder,MediaGalleryBuilder,MediaGalleryItemBuilder,TextDisplayBuilder,ChannelType,Client,Events,PermissionFlagsBits,MessageFlags,escapeMarkdown,type GuildMember,type ChatInputCommandInteraction,type AutocompleteInteraction,type MessageComponentInteraction,type Message,ActionRowBuilder,ButtonBuilder,ButtonStyle,EmbedBuilder} from 'discord.js';
import {Connectors,Shoukaku,type Player,type Track} from 'shoukaku';
import {MusicError,MusicSession,Serial,identifier,tracksFrom,duration} from './music-core.js';
import {musicNotice,playerView,queueView,trackAnnouncement,musicV2Flags} from './music-ui.js';
import {MusicPersistence,restoredTrack,type SavedTrack} from './music-persistence.js';
export const musicNames=new Set(['play','skip','pause','resume','queue','stop','nowplaying','volume','autoplay','loop','remove','move','jump','shuffle','clear','voteskip','history','favorite','playlist','dj','panel','playnext','seek','replay','fairqueue','savequeue','status','musicsettings','247','wrapped','profile']);
const sourceError=`Lavalink belum tersambung di ${process.env.LAVALINK_URL??'127.0.0.1:2333'}. Pastikan terminal npm run lavalink tetap berjalan.`;
const boundedInteger=(name:string,fallback:number,min:number,max:number)=>{const parsed=Number(process.env[name]??fallback);return Number.isFinite(parsed)?Math.max(min,Math.min(max,Math.trunc(parsed))):fallback;};
type Panel={interaction:ChatInputCommandInteraction|MessageComponentInteraction;ownerId:string;guildId:string;session:MusicSession;mode:'player'|'queue';page:number;stop:()=>void;timer?:NodeJS.Timeout};
export class Music {
 readonly shoukaku:Shoukaku;
 private profileAudience=new WeakMap<MusicSession,string[]>();
 private meter=new PlaybackMeter();private shuttingDown=false;
 private persistence=new MusicPersistence(process.env.DATABASE_PATH??'./data/spike.sqlite');
 private publicMessages=new Map<string,Message>();private publicBusy=new Set<string>();
 private lyrics=new Lyrics(()=>this.client.user?.id??'0');
 private watchdogs=new Map<string,NodeJS.Timeout>();
 private checking=new Set<string>();
 private notificationChannels=new WeakMap<MusicSession,string>();
 private sessions=new Map<string,MusicSession>();private serial=new Serial();private idle=new Map<string,NodeJS.Timeout>();private empty=new Map<string,NodeJS.Timeout>();private panels=new Map<string,Panel>();private votes=new Map<string,Set<string>>();
 constructor(private client:Client){
  this.shoukaku=new Shoukaku(new Connectors.DiscordJS(client),[{name:'local',url:process.env.LAVALINK_URL??'127.0.0.1:2333',auth:process.env.LAVALINK_PASSWORD??'manuk-local-only',secure:process.env.LAVALINK_SECURE==='true'}],{resume:false,reconnectTries:5,reconnectInterval:5,restTimeout:15,voiceConnectionTimeout:20});
  this.shoukaku.on('ready',()=>{console.log('Lavalink tersambung. Musik siap menerima command.');void this.restoreStandby();});
  client.once(Events.ClientReady,()=>{void this.restoreStandby();});
  this.shoukaku.on('error',(_name,error)=>{reportMusicError('NODE',error);});
  this.shoukaku.on('close',()=>{for(const guild of this.sessions.keys())void this.serial.run(guild,()=>this.dispose(guild)).catch(()=>{});});
  client.on(Events.InteractionCreate,i=>{if(i.isMessageComponent()&&i.customId.startsWith('public:'))void this.publicButton(i).catch(()=>{});});
  client.on(Events.VoiceStateUpdate,(old,state)=>{
   const guild=state.guild.id,s=this.sessions.get(guild);if(!s)return;
   if(old.channelId===s.channelId||state.channelId===s.channelId)this.profileAudience.delete(s);
   if(old.channelId===s.channelId&&state.channelId!==s.channelId)this.votes.get(guild)?.delete(state.id);
   if(state.id===client.user?.id&&state.channelId!==s.channelId){void this.serial.run(guild,()=>this.dispose(guild)).catch(()=>{});return;}
   this.armEmpty(guild,s);
  });
 }
 private listeners(s:MusicSession){const channel=this.client.channels.cache.get(s.channelId);if(!channel?.isVoiceBased())return [];return [...channel.members.values()].filter(m=>!m.user.bot&&!m.voice.deaf&&!m.voice.suppress).map(m=>m.id);}
 private recordAudience(guild:string,s:MusicSession,ms:number){
  const now=this.listeners(s),previous=new Set(this.profileAudience.get(s)??[]);this.profileAudience.set(s,now);
  if(ms>0&&s.current)this.persistence.recordListening(guild,this.savedTrack(s.current,'unknown'),now.filter(id=>previous.has(id)),ms);
 }
 private async profile(i:ChatInputCommandInteraction){
  const result=this.persistence.listeningProfile(i.user.id);
  const friends=await Promise.all(result.friends.map(async row=>{const user=await this.client.users.fetch(row.id).catch(()=>undefined);return {name:user?.globalName??user?.username??'Pengguna tidak tersedia',ms:row.ms};}));
  const avatar=await discordAvatar(i.user.displayAvatarURL({extension:'png',size:256}));
  const png=await renderProfile({name:i.user.globalName??i.user.username,avatar,totalMs:result.total.ms,serverCount:result.total.servers,trackCount:result.total.tracks,servers:result.servers.map(r=>({name:this.client.guilds.cache.get(r.id)?.name??'Server tidak tersedia',ms:r.ms})),friends,tracks:result.tracks.map(t=>({name:t.title,detail:t.author,ms:t.ms})),theme:(i.options.getString('theme')??'red') as 'red'|'purple'|'blue'});
  await i.editReply({components:[new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://manuk-profile.png').setDescription('Profil musik ManukAPP')),new TextDisplayBuilder().setContent('Profil pribadi · waktu terukur di voice saat musik aktif. Data mulai terkumpul setelah fitur profil dipasang; teman = pendengar yang berada bersama di voice.')],files:[new AttachmentBuilder(png,{name:'manuk-profile.png'})],allowedMentions:{parse:[]}});
 }
 private armEmpty(guild:string,s:MusicSession){
  const old=this.empty.get(guild);if(old)clearTimeout(old);this.empty.delete(guild);
  if(s.stay||s.closed)return;
  const channel=this.client.channels.cache.get(s.channelId);if(!channel?.isVoiceBased()||channel.members.some(m=>!m.user.bot))return;
  this.empty.set(guild,setTimeout(()=>{void this.serial.run(guild,async()=>{
   if(this.sessions.get(guild)!==s||s.stay)return;
   const current=this.client.channels.cache.get(s.channelId);if(current?.isVoiceBased()&&!current.members.some(m=>!m.user.bot))await this.dispose(guild);
  }).catch(()=>{});},this.persistence.preferences(guild).emptySeconds*1000).unref());
 }
 private async restoreStandby(){
  if(this.shuttingDown||!this.client.isReady()||!this.shoukaku.getIdealNode())return;
  for(const guildId of this.persistence.standbyGuilds())await this.serial.run(guildId,async()=>{
   if(this.shuttingDown||this.sessions.has(guildId))return;
   const settings=this.persistence.preferences(guildId);if(!settings.stay||!settings.stayVoice)return;
   const guild=this.client.guilds.cache.get(guildId),voice=guild?.channels.cache.get(settings.stayVoice);if(!voice||voice.type!==ChannelType.GuildVoice)return;
   const saved=this.persistence.load(guildId),s=await this.createSession(guildId,voice);
   if(saved){s.loop=saved.loop;s.autoplay=saved.autoplay;s.autoplayStyle=saved.autoplayStyle??s.autoplayStyle;s.fair=saved.fair??s.fair;const rows=[...(saved.current?[saved.current]:[]),...saved.queue].slice(0,100).map(restoredTrack);if(rows.length)s.add(rows);await (s.player as Player).setGlobalVolume(saved.volume);}
   const panel=settings.panelChannel??this.persistence.panel(guildId)?.channelId;if(panel)this.notificationChannels.set(s,panel);
   this.save(guildId,s);await this.refreshPublic(guildId,s);console.log('[MUSIC 247] Standby dipulihkan; /resume untuk antrean tersimpan.');
  }).catch(()=>console.warn('[MUSIC 247] Tidak dapat masuk voice tersimpan. Periksa izin dan channel; coba /247 mode:on.'));
 }
 private meterReset(s:MusicSession){if(s.current)this.meter.reset(s.current,s.position);this.profileAudience.delete(s);}
 private async adjustVolume(s:MusicSession,delta:number){const player=s.player as Player;const volume=Math.max(0,Math.min(100,Math.round(player.volume)+delta));await player.setGlobalVolume(volume);return volume;}
 private save(guild:string,s:MusicSession){const saved=(t:Track):SavedTrack=>({identifier:t.info.identifier,title:t.info.title,author:t.info.author,url:t.info.uri??'',length:t.info.length,requester:String((t.pluginInfo as Record<string,unknown>|undefined)?.requester??'unknown'),playNext:Boolean((t.pluginInfo as any)?.playNext)});this.persistence.save(guild,{queue:s.queue.map(saved),current:s.current?saved(s.current):undefined,position:s.position,loop:s.loop,autoplay:s.autoplay,volume:(s.player as Player).volume,autoplayStyle:s.autoplayStyle,fair:s.fair});}
 private savedTrack(t:Track,requester:string):SavedTrack{return {identifier:t.info.identifier,title:t.info.title,author:t.info.author,url:t.info.uri??'',length:t.info.length,requester};}
 private saveQueue(guild:string,s:MusicSession|undefined,name:string,user:string){
  const tracks=[...(s?.current?[s.current]:[]),...(s?.queue??[])];if(!tracks.length)throw new MusicError('Tidak ada antrean untuk disimpan.');
  if(tracks.length>boundedInteger('PLAYLIST_MAX_TRACKS',200,1,500))throw new MusicError('Jumlah antrean melewati batas playlist server.');
  if(!this.persistence.createPlaylist(guild,name))throw new MusicError('Nama playlist sudah dipakai. Pilih nama baru.');
  this.persistence.setPlaylist(guild,name,tracks.map(t=>this.savedTrack(t,String((t.pluginInfo as any)?.requester??user))));return tracks.length;
 }
 private isDj(guildId:string,member:GuildMember){const role=this.persistence.djRole(guildId);return member.permissions.has(PermissionFlagsBits.Administrator)||member.permissions.has(PermissionFlagsBits.ManageGuild)||!!role&&member.roles.cache.has(role);}
 private castVote(guild:string,s:MusicSession,channelId:string,userId:string){if(!s.current)throw new MusicError('Tidak ada lagu aktif.');const channel=this.client.channels.cache.get(channelId);if(!channel?.isVoiceBased())throw new MusicError('Voice channel tidak tersedia.');const listeners=channel.members.filter(m=>!m.user.bot).size;let ratio=Number(process.env.VOTE_SKIP_THRESHOLD??0.5);if(!Number.isFinite(ratio))ratio=0.5;ratio=Math.max(0.01,Math.min(1,ratio));const needed=Math.max(1,Math.ceil(listeners*ratio)),votes=this.votes.get(guild)??new Set<string>();for(const id of votes)if(!channel.members.has(id)||channel.members.get(id)?.user.bot)votes.delete(id);if(votes.has(userId))throw new MusicError('Kamu sudah memberikan vote untuk lagu ini.');votes.add(userId);this.votes.set(guild,votes);return {votes:votes.size,needed,passed:votes.size>=needed};}
 private async createSession(guildId:string,voice:{id:string;guild:{shardId:number}}){
  const guild=this.client.guilds.cache.get(guildId),channel=guild?.channels.cache.get(voice.id),me=guild?.members.me;
  if(!channel?.isVoiceBased()||!me||!channel.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]))throw new MusicError('Bot membutuhkan izin View Channel, Connect dan Speak.');
  const node=this.shoukaku.getIdealNode();if(!node)throw new MusicError(sourceError);
  let player:Player;try{player=await this.shoukaku.joinVoiceChannel({guildId,channelId:voice.id,shardId:voice.guild.shardId,deaf:true});}catch{throw new MusicError('Bot tidak dapat masuk voice channel. Periksa izin Connect dan Speak.');}
  let session:MusicSession;session=new MusicSession(player,voice.id,track=>{const active=this.shoukaku.getIdealNode();if(!active)throw new MusicError(sourceError);return fallbackTrack(q=>active.rest.resolve(q),track);},Date.now,track=>{const active=this.shoukaku.getIdealNode();if(!active)throw new MusicError(sourceError);return prepareTrack(q=>active.rest.resolve(q),track);},encoded=>{void this.startTimedOut(guildId,session,encoded);});const settings=this.persistence.preferences(guildId);session.autoplay=settings.autoplay;session.autoplayStyle=settings.autoplayStyle;session.fair=settings.fair;session.stay=settings.stay;if(settings.stay)this.persistence.setPreferences(guildId,{stayVoice:voice.id});this.sessions.set(guildId,session);this.bind(guildId,session,player);await player.setGlobalVolume(settings.volume).catch(()=>{});return session;
 }
 async autocomplete(i:AutocompleteInteraction){
  if(!i.inGuild()){await i.respond([]);return;}
  const q=i.options.getFocused().toLowerCase();let choices:{name:string;value:string}[]=[];
  if(i.commandName==='favorite')choices=this.persistence.favorites(i.user.id,25,0,q).map(f=>({name:`${f.track.title} — ${f.track.author}`.slice(0,100),value:String(f.id)}));
  if(i.commandName==='playlist')choices=this.persistence.playlists(i.guildId!).filter(n=>n.toLowerCase().includes(q)).slice(0,25).map(name=>({name,value:name}));
  await i.respond(choices.slice(0,25)).catch(()=>{});
 }
 private clearTimers(guild:string){for(const map of [this.idle,this.empty,this.watchdogs]){const t=map.get(guild);if(t)clearTimeout(t);map.delete(guild);}}
 private async dispose(guild:string,preserve=true){const s=this.sessions.get(guild);if(preserve&&s)this.save(guild,s);if(!preserve){this.persistence.clearSession(guild);this.persistence.setPreferences(guild,{stay:false,stayVoice:undefined});}this.sessions.delete(guild);this.clearTimers(guild);this.clearPanel(guild);if(s)await s.stop().catch(()=>{});const publicMessage=this.publicMessages.get(guild);if(publicMessage)await publicMessage.edit({components:[musicNotice(preserve?'Sesi tersimpan. Gunakan /resume.':'Pemutar dihentikan. Antrean dibersihkan.')]}).catch(()=>{});await this.shoukaku.leaveVoiceChannel(guild).catch(()=>{});}
 private armIdle(guild:string,s:MusicSession){const t=this.idle.get(guild);if(t)clearTimeout(t);this.idle.delete(guild);if(!s.current&&!s.stay)this.idle.set(guild,setTimeout(()=>{void this.serial.run(guild,async()=>{if(this.sessions.get(guild)===s&&!s.current&&!s.stay)await this.dispose(guild);}).catch(()=>{});},this.persistence.preferences(guild).idleSeconds*1000).unref());}
 private bind(guild:string,s:MusicSession,player:Player){
  let ticks=0;this.watchdogs.set(guild,setInterval(()=>{void this.checkQueue(guild,s,player);if(++ticks%3===0)void this.refreshPublic(guild,s);},5000).unref());
  player.on('end',event=>{const ended=s.current;void this.serial.run(guild,async()=>{if(this.sessions.get(guild)!==s||s.current!==ended||(event.track?.encoded&&event.track.encoded!==ended?.encoded))return;if(event.reason==='finished')await this.finishTrack(guild,s);else await s.end(event.reason,event.track?.encoded);this.save(guild,s);this.armIdle(guild,s);await this.refreshPanel(guild);}).catch(error=>{s.lastError=reportMusicError('QUEUE END',error);});});
  player.on('start',event=>{if(this.sessions.get(guild)!==s||s.current?.encoded!==event.track.encoded)return;s.start(event.track.encoded);if(s.current)this.meter.reset(s.current,s.position);this.profileAudience.set(s,this.listeners(s));this.votes.delete(guild);this.save(guild,s);void this.refreshPanel(guild);});
  player.on('update',event=>{if(this.sessions.get(guild)!==s)return;if(event.state.connected===false){this.meterReset(s);return;}this.onProgress(guild,s,event.state.position);});
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
   if(!remote||remote.paused)return;
   // Lavalink v4 reports connectivity in state. Missing optional voice.connected
   // is not a disconnect; older responses omit it even while audio is connected.
   const connection=remote as typeof remote & {state?:{connected?:boolean;position?:number}};
   if(connection.state?.connected===false||(connection.state?.connected===undefined&&remote.voice?.connected===false))return;
   const sameTrack=remote.track?.encoded===current.encoded;
   if(remote.track&&!sameTrack)return;
   // The REST snapshot may expose fresher progress than the gateway update stream.
   const state=(remote as typeof remote & {state?:{position:number}}).state;
   if(s.current!==current||this.sessions.get(guild)!==s)return;
   if(sameTrack&&Number.isFinite(state?.position))this.onProgress(guild,s,state!.position);
   if(remote.track&&!s.endIsStalled())return;
   await this.serial.run(guild,async()=>{
    if(this.sessions.get(guild)!==s||s.current!==current||s.paused||s.closed)return;
    if(remote.track){
     if(!s.endIsStalled())return;
     console.log(`[MUSIC AUTO NEXT] Akhir lagu macet: positionMs=${s.position} durationMs=${current.info.length}; queue=${s.queue.length}`);
     await this.finishTrack(guild,s,true);
    }else{
     console.log(`[MUSIC QUEUE] Lavalink idle; melanjutkan ${s.queue.length} lagu antrean.`);
     await this.finishTrack(guild,s);
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
 private async announceTrack(guild:string,s:MusicSession){await this.refreshPublic(guild,s);}
 private onProgress(guild:string,s:MusicSession,position:number){
  if(this.meter&&s.current&&s.started){const sample=this.meter.sample(s.current,position,s.paused);this.recordAudience(guild,s,sample.ms);if(sample.ms||sample.plays)this.persistence.recordPlayback(guild,this.savedTrack(s.current,String((s.current.pluginInfo as any)?.requester??'unknown')),sample.ms,sample.plays);}

  if(s.progress(position)&&s.current){this.persistence.addHistory(guild,this.savedTrack(s.current,String((s.current.pluginInfo as Record<string,unknown>|undefined)?.requester??'unknown')));void this.announceTrack(guild,s);}
  this.save(guild,s);
 }
 private async finishTrack(guild:string,s:MusicSession,stop=false){
  const ended=s.current;if(!ended)return;
  if(stop)await s.player.stopTrack();
  await s.end('finished',ended.encoded);
  if(!s.current&&!s.queue.length&&s.autoplay){
   try{const node=this.shoukaku.getIdealNode();if(node){const candidate=await recommendTrack(q=>node.rest.resolve(q),ended,this.persistence.history(guild).map(t=>t.title),s.autoplayStyle,this.persistence.history(guild).map(t=>t.author));if(candidate){console.log(`[MUSIC AUTOPLAY] source=${candidate.info.sourceName} title=${candidate.info.title.slice(0,100)}`);candidate.pluginInfo={...(candidate.pluginInfo as Record<string,unknown>),requester:'autoplay'};s.add([candidate]);await s.next();}else{s.lastError='Autoplay belum menemukan lagu lain yang tersedia.';console.warn('[MUSIC AUTOPLAY] Tidak ada kandidat baru dari sumber pencarian.');}}}
   catch{s.lastError='Autoplay belum menemukan lagu lain yang tersedia.';}
  }
 }
 private publicCard(s:MusicSession){
  const card=playerView(s,(s.player as Player).volume).toJSON();
  const visit=(o:any)=>{if(!o||typeof o!=='object')return;if(typeof o.custom_id==='string')o.custom_id='public:'+o.custom_id;for(const value of Object.values(o))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);};visit(card);return card;
 }
 private async refreshPublic(guild:string,s:MusicSession){
  if(this.publicBusy.has(guild)||s.closed)return;
  const channelId=this.notificationChannels.get(s);if(!channelId)return;
  this.publicBusy.add(guild);
  try{
   let message=this.publicMessages.get(guild);const saved=this.persistence.panel(guild);
   if(!message&&saved){const channel=await this.client.channels.fetch(saved.channelId).catch(()=>undefined);if(channel?.isTextBased())message=await channel.messages.fetch(saved.messageId).catch(()=>undefined);}
   if(this.sessions.get(guild)!==s||s.closed)return;
   if(message&&message.channelId!==channelId){await message.edit({components:[musicNotice('Panel dipindahkan ke channel lain.')]}).catch(()=>{});message=undefined;}
   const payload={components:[this.publicCard(s)],allowedMentions:{parse:[] as never[]}};
   if(message){try{await message.edit(payload);}catch(error){if((error as {code?:number}).code===10008)message=undefined;else throw error;}}
   if(!message){const channel=await this.client.channels.fetch(channelId);if(!channel?.isSendable()||this.sessions.get(guild)!==s||s.closed)return;message=await channel.send({flags:musicV2Flags,...payload});}
   this.publicMessages.set(guild,message);this.persistence.setPanel(guild,channelId,message.id);
   if(s.closed)await message.edit({components:[musicNotice('Sesi berakhir. Gunakan /resume atau /play.')]}).catch(()=>{});
  }catch{console.warn('[MUSIC PANEL] Periksa View Channel, Send Messages dan Read Message History.');}finally{this.publicBusy.delete(guild);}
 }
 private async publicButton(i:MessageComponentInteraction){
  const guild=i.guildId;if(!guild||!i.guild)return;
  const saved=this.persistence.panel(guild),s=this.sessions.get(guild);
  if(!s||saved?.messageId!==i.message.id){await i.reply({content:'Panel tidak aktif. Gunakan /resume atau /play.',flags:MessageFlags.Ephemeral});return;}
  const action=i.customId.slice('public:'.length);
  if(action==='music:lyrics'){await this.showLyrics(i,s);return;}
  if(action==='music:show_queue'){await i.reply({flags:MessageFlags.Ephemeral|musicV2Flags,components:[queueView(s,1,Math.max(1,Math.ceil(s.queue.length/10)))]});await this.attachPanel(guild,i,s,'queue',1);return;}
  await i.deferReply({flags:MessageFlags.Ephemeral});
  try{let result='Pemutar diperbarui.';
   await this.serial.run(guild,async()=>{
    if(this.sessions.get(guild)!==s)throw new MusicError('Sesi sudah berubah.');
    const member=await i.guild!.members.fetch(i.user.id);if(member.voice.channelId!==s.channelId)throw new MusicError('Masuk voice yang sama dengan bot.');
    const dj=this.isDj(guild,member);
    if(action==='music:favorite'){if(!s.current)throw new MusicError('Tidak ada lagu aktif.');this.persistence.addFavorite(i.user.id,this.savedTrack(s.current,i.user.id));result='Lagu disimpan ke favorit pribadi.';}
    else if(action==='music:skip'){
     if(!s.current)throw new MusicError('Tidak ada lagu aktif.');
     if(!dj){const vote=this.castVote(guild,s,s.channelId,i.user.id);result=`Vote skip: ${vote.votes}/${vote.needed}.`;if(!vote.passed)return;}
     this.votes.delete(guild);await s.skip();result='Lagu dilewati.';
    }else{
     if(this.persistence.djRole(guild)&&!dj)throw new MusicError('Kontrol ini hanya untuk DJ/admin.');
     if(action==='music:savequeue'){if(!dj)throw new MusicError('Simpan playlist server memerlukan DJ/admin.');const name=`Antrean ${Date.now()}`;this.saveQueue(guild,s,name,i.user.id);result=`Antrean disimpan sebagai ${name}.`; }
     else if(action==='music:replay'){await s.seek(0);this.meterReset(s);}
     else if(action==='music:volume_down'||action==='music:volume_up')result=`Volume ${await this.adjustVolume(s,action==='music:volume_up'?10:-10)}%.`;
     else if(action==='music:pause'){await s.setPaused(!s.paused);this.meterReset(s);}
     else if(action==='music:shuffle'){s.fair=false;s.shuffle();result='Antrean diacak; antrean adil OFF.';}
     else if(action==='music:loop')s.loop=s.loop==='off'?'song':s.loop==='song'?'queue':'off';
     else if(action==='music:autoplay')s.autoplay=!s.autoplay;
     else if(action==='music:stop'){await this.dispose(guild,false);result='Pemutar dihentikan.';return;}
    }
    this.armIdle(guild,s);await this.refreshPanel(guild);
   });await i.editReply({content:result});
  }catch(error){await i.editReply({content:error instanceof MusicError?error.message:'Aksi gagal. Coba lagi.'}).catch(()=>{});}
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
  if(i.commandName==='profile'){await this.profile(i);return;}
  await this.serial.run(i.guildId,async()=>{
   const guild=i.guild!;
    const c=i.commandName;
    const admin=i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)||i.memberPermissions?.has(PermissionFlagsBits.Administrator);
    if(c==='wrapped'){
     const month=i.options.getString('month')??monthKey();if(!validMonth(month))throw new MusicError('Bulan harus YYYY-MM, contoh 2026-11.');
     const result=this.persistence.wrapped(guild.id,month),minutes=Math.floor(result.total.ms/60000);
     const tracks=result.tracks.map((t,n)=>`${n+1}. **${escapeMarkdown(t.title).slice(0,90)}** — ${t.plays} kali`).join('\n')||'Belum ada data.';
     const artists=result.artists.map((t,n)=>`${n+1}. ${escapeMarkdown(t.author).slice(0,80)} — ${Math.floor(t.ms/60000)} menit`).join('\n')||'Belum ada data.';
     const members=result.members.map((t,n)=>`${n+1}. <@${t.requester}> — ${t.plays} pemutaran request`).join('\n')||'Belum ada request anggota tercatat.';
     await i.editReply({components:[musicNotice(`## MANUK WRAPPED · ${month}\n**${result.total.plays} pemutaran · ${minutes} menit terukur**\n\n**Lagu teratas**\n${tracks}\n\n**Artis favorit**\n${artists}\n\n**Requester teraktif**\n${members}\n\n-# Bulan WIB. Durasi progres audio bot, bukan total waktu mendengar tiap anggota. Data mulai dicatat sejak V3; pause, seek, dan interval tanpa progres tidak dihitung.`)],allowedMentions:{parse:[]}});return;
    }
    if(c==='247'){
     const mode=i.options.getString('mode',true),settings=this.persistence.preferences(guild.id);
     if(mode==='status'){await i.editReply({components:[musicNotice(`24/7 ${settings.stay?'ON':'OFF'}${settings.stayVoice?` · <#${settings.stayVoice}>`:''}. Host dan internet harus tetap menyala.`)]});return;}
     if(!admin&&!this.isDj(guild.id,await guild.members.fetch(i.user.id)))throw new MusicError('Mode 24/7 memerlukan DJ atau Manage Server.');
     let active=this.sessions.get(guild.id);
     if(mode==='off'){this.persistence.setPreferences(guild.id,{stay:false,stayVoice:undefined});if(active){active.stay=false;this.armIdle(guild.id,active);this.armEmpty(guild.id,active);await this.refreshPanel(guild.id);}await i.editReply({components:[musicNotice('24/7 OFF. Timer keluar normal kembali berlaku.')]});return;}
     const member=await guild.members.fetch(i.user.id),voice=member.voice.channel;
     if(!voice||voice.type!==ChannelType.GuildVoice)throw new MusicError('Masuk voice channel biasa terlebih dahulu.');
     if(active&&active.channelId!==voice.id)throw new MusicError('Masuk voice yang sama dengan bot.');
     if(!active)active=await this.createSession(guild.id,voice);
     this.persistence.setPreferences(guild.id,{stay:true,stayVoice:voice.id});active.stay=true;
     for(const timers of [this.idle,this.empty]){const t=timers.get(guild.id);if(t)clearTimeout(t);timers.delete(guild.id);}
     if(i.channelId)this.notificationChannels.set(active,settings.panelChannel??i.channelId);
     await this.refreshPanel(guild.id);await i.editReply({components:[musicNotice('24/7 ON. Bot tetap di voice meskipun kosong. Autoplay diatur terpisah; /stop juga mematikan 24/7.')]});return;
    }
    if(c==='status'){
     const active=this.sessions.get(guild.id),node=this.shoukaku.getIdealNode();
     const text=`**Lavalink:** ${node?'tersambung':'belum tersambung'}\n**Pemutar:** ${active?.current?(active.paused?'jeda':active.progressed?'progres audio diterima':'menunggu audio'):'tidak aktif'}\n**24/7:** ${this.persistence.preferences(guild.id).stay?'ON':'OFF'}\n**Antrean:** ${active?.queue.length??0}/100\n**Autoplay:** ${active?.autoplay?active.autoplayStyle:'OFF'}\n**Antrean adil:** ${active?.fair?'ON':'OFF'}\n**Sumber aktif:** ${escapeMarkdown(active?.current?.info.sourceName??'—')}\n**Catatan:** ${escapeMarkdown((active?.lastError||'Tidak ada kendala tercatat.').slice(0,350))}\n-# Koneksi siap tidak menjamin semua lagu dari sumber dapat diputar.`;
     await i.editReply({components:[musicNotice(text)],allowedMentions:{parse:[]}});return;
    }
    if(c==='musicsettings'){
     if(!admin)throw new MusicError('Pengaturan default memerlukan Administrator atau Manage Server.');
     const patch:Partial<MusicPreferences>={};
     const volume=i.options.getInteger('volume'),auto=i.options.getBoolean('autoplay'),style=i.options.getString('style'),fair=i.options.getBoolean('fair'),idle=i.options.getInteger('idle'),empty=i.options.getInteger('empty'),channel=i.options.getChannel('channel'),autoChannel=i.options.getBoolean('auto_channel');
     if(channel&&autoChannel)throw new MusicError('Pilih channel tetap atau auto_channel, bukan keduanya.');
     if(channel){const target=await guild.channels.fetch(channel.id),me=guild.members.me??await guild.members.fetchMe();if(!target||!target.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]))throw new MusicError('Bot memerlukan View Channel, Send Messages, Read Message History di channel panel.');patch.panelChannel=channel.id;}
     if(autoChannel)patch.panelChannel=undefined;
     if(volume!==null)patch.volume=volume;if(auto!==null)patch.autoplay=auto;if(style)patch.autoplayStyle=style as 'artist'|'mix';if(fair!==null)patch.fair=fair;if(idle!==null)patch.idleSeconds=idle;if(empty!==null)patch.emptySeconds=empty;
     const settings=this.persistence.setPreferences(guild.id,patch);
     await i.editReply({components:[musicNotice(`**Default server**\nVolume ${settings.volume}% · Autoplay ${settings.autoplay?'ON':'OFF'} (${settings.autoplayStyle})\nAntrean adil ${settings.fair?'ON':'OFF'}\nKeluar saat idle: ${settings.idleSeconds} detik · voice kosong: ${settings.emptySeconds} detik\nPanel: ${settings.panelChannel?`<#${settings.panelChannel}>`:'channel request'}\nBerlaku untuk sesi/timer baru; sesi aktif tidak direset.`)],allowedMentions:{parse:[]}});return;
    }
    if(c==='savequeue'){
     if(!admin&&!this.isDj(guild.id,await guild.members.fetch(i.user.id)))throw new MusicError('Simpan playlist server memerlukan DJ atau Manage Server.');
     const active=this.sessions.get(guild.id),name=i.options.getString('name',true).trim();if(!name)throw new MusicError('Isi nama playlist.');
     const count=this.saveQueue(guild.id,active,name,i.user.id);
     await i.editReply({components:[musicNotice(`${count} lagu disimpan ke **${escapeMarkdown(name)}**. Putar lagi dengan /playlist play.`)]});return;
    }
    if(c==='dj'){
     if(!admin)throw new MusicError('Hanya administrator atau anggota dengan Manage Server yang dapat mengatur role DJ.');
     const sub=i.options.getSubcommand();if(sub==='set'){const role=i.options.getRole('role',true);this.persistence.setDjRole(guild.id,role.id);await i.editReply({components:[musicNotice(`Role DJ ditetapkan ke <@&${role.id}>.`)]});return;}
     if(sub==='remove'){this.persistence.setDjRole(guild.id,undefined);await i.editReply({components:[musicNotice('Role DJ dihapus.') ]});return;}
     const roleId=this.persistence.djRole(guild.id);await i.editReply({components:[musicNotice(roleId?`Role DJ: <@&${roleId}>`:'Role DJ belum dikonfigurasi.') ]});return;
    }
    if(c==='favorite'){
     const sub=i.options.getSubcommand();
     if(sub==='add'){const active=this.sessions.get(guild.id)?.current;if(!active)throw new MusicError('Tidak ada lagu aktif untuk disimpan.');const added=this.persistence.addFavorite(i.user.id,this.savedTrack(active,i.user.id));await i.editReply({components:[musicNotice(added?'Lagu disimpan ke favorit.':'Lagu itu sudah ada di favoritmu.') ]});return;}
     if(sub==='list'){const page=i.options.getInteger('page')??1,rows=this.persistence.favorites(i.user.id,10,(page-1)*10);await i.editReply({components:[musicNotice(rows.map((f,n)=>`**${(page-1)*10+n+1}.** ${escapeMarkdown(f.track.title).slice(0,90)} — ${escapeMarkdown(f.track.author).slice(0,70)}  ·  ID ${f.id}`).join('\n')||'Favorit kosong.') ]});return;}
     const id=Number(i.options.getString('favorite',true));if(!Number.isSafeInteger(id)||id<=0)throw new MusicError('Pilih lagu dari autocomplete favorit.');
     if(sub==='remove'){if(!this.persistence.removeFavorite(i.user.id,id))throw new MusicError('Favorite tidak ditemukan.');await i.editReply({components:[musicNotice('Lagu dihapus dari favorit.') ]});return;}
     // play is handled after voice membership/session validation.
    }
    if(c==='playlist'){
     const sub=i.options.getSubcommand(),name=i.options.getString('name')?.trim();
     if(sub==='list'){const names=this.persistence.playlists(guild.id);await i.editReply({components:[musicNotice(names.length?names.map((n,k)=>`${k+1}. ${escapeMarkdown(n)}`).join('\n'):'Belum ada playlist server.') ]});return;}
     if(['create','add','remove','delete'].includes(sub)&&!admin&&!this.isDj(guild.id,await guild.members.fetch(i.user.id)))throw new MusicError('Mengubah playlist server memerlukan DJ atau Manage Server.');
     if(sub==='create'){if(!name||!name.length||name.length>50)throw new MusicError('Nama playlist harus 1–50 karakter.');if(!this.persistence.createPlaylist(guild.id,name))throw new MusicError('Nama playlist sudah digunakan.');await i.editReply({components:[musicNotice(`Playlist **${escapeMarkdown(name)}** dibuat.`)]});return;}
     if(!name||!this.persistence.playlists(guild.id).includes(name))throw new MusicError('Playlist tidak ditemukan. Pilih nama dari autocomplete.');
     if(sub==='delete'){const dj=this.persistence.djRole(guild.id),isDj=!!dj&&!!(await guild.members.fetch(i.user.id)).roles.cache.has(dj);if(!admin&&!isDj)throw new MusicError('Hanya DJ atau administrator/Manage Server yang dapat menghapus playlist.');this.persistence.deletePlaylist(guild.id,name);await i.editReply({components:[musicNotice(`Playlist **${escapeMarkdown(name)}** dihapus.`)]});return;}
     if(sub==='show'){const tracks=this.persistence.playlist(guild.id,name)??[],page=i.options.getInteger('page')??1,items=tracks.slice((page-1)*10,page*10);await i.editReply({components:[musicNotice(items.map((t,n)=>`**${(page-1)*10+n+1}.** ${escapeMarkdown(t.title).slice(0,90)} — ${escapeMarkdown(t.author).slice(0,70)}`).join('\n')||'Playlist kosong.') ]});return;}
     if(sub==='remove'){const tracks=this.persistence.playlist(guild.id,name)!;const pos=i.options.getInteger('position',true)-1;if(pos<0||pos>=tracks.length)throw new MusicError('Posisi track tidak tersedia.');const [removed]=tracks.splice(pos,1);this.persistence.setPlaylist(guild.id,name,tracks);await i.editReply({components:[musicNotice(`Dihapus: ${escapeMarkdown(removed!.title).slice(0,100)}`)]});return;}
     if(sub==='add'){
      let track:Track|undefined;const query=i.options.getString('query');if(query){const node=this.shoukaku.getIdealNode();if(!node)throw new MusicError(sourceError);track=(await resolveRequest(q=>node.rest.resolve(q),identifier(query,'youtube')))[0];}else track=this.sessions.get(guild.id)?.current;
      if(!track)throw new MusicError('Tidak ada lagu aktif. Berikan URL atau judul, atau putar lagu dahulu.');const rows=this.persistence.playlist(guild.id,name)!;const max=boundedInteger('PLAYLIST_MAX_TRACKS',200,1,500);if(rows.length>=max)throw new MusicError(`Playlist mencapai batas ${max} lagu.`);rows.push(this.savedTrack(track,i.user.id));this.persistence.setPlaylist(guild.id,name,rows);await i.editReply({components:[musicNotice(`Ditambahkan ke **${escapeMarkdown(name)}** (track ${rows.length}).`)]});return;
     }
    }
   if(c==='history'&&i.options.getSubcommand()!=='play'){const sub=i.options.getSubcommand();if(sub==='clear'){if(!admin&&!this.isDj(guild.id,await guild.members.fetch(i.user.id)))throw new MusicError('Hapus riwayat memerlukan DJ/admin.');this.persistence.clearHistory(guild.id);await i.editReply({components:[musicNotice('Riwayat dihapus.')]});return;}const page=i.options.getInteger('page')??1,rows=this.persistence.history(guild.id).slice((page-1)*10,page*10);await i.editReply({components:[musicNotice(rows.map((t,n)=>`${(page-1)*10+n+1}. ${escapeMarkdown(t.title).slice(0,90)} — ${escapeMarkdown(t.author).slice(0,70)}`).join('\n')||'Riwayat kosong.')]});return;}
   const member=await guild.members.fetch(i.user.id);
   const voice=member.voice.channel;
   if(!voice||voice.type!==ChannelType.GuildVoice)throw new MusicError('Masuk voice channel biasa dahulu (Stage belum didukung).');
   let s=this.sessions.get(guild.id);
   if(s&&s.channelId!==voice.id)throw new MusicError('Masuk voice channel yang sama dengan bot untuk mengontrol musik.');
    const dj=this.isDj(guild.id,member);
    if(['stop','pause','resume','volume','autoplay','loop','remove','move','jump','shuffle','clear','playnext','seek','replay','fairqueue'].includes(c)&&!dj&&this.persistence.djRole(guild.id))throw new MusicError('Command ini hanya dapat digunakan DJ atau administrator.');
   
   if(c==='stop'){
    if(!s)throw new MusicError('Bot belum memutar musik di server ini.');
    await this.dispose(guild.id,false);await i.editReply({components:[musicNotice('Playback dihentikan. Antrean dibersihkan.')]});return;
   }
   if(c==='panel'){if(!s)throw new MusicError('Gunakan /play dahulu.');if(this.persistence.djRole(guild.id)&&!dj)throw new MusicError('Memerlukan DJ/admin.');if(i.channelId){this.persistence.setPreferences(guild.id,{panelChannel:i.channelId});this.notificationChannels.set(s,i.channelId);}await this.refreshPublic(guild.id,s);await i.editReply({components:[musicNotice('Panel publik diperbarui di channel ini.')]});return;}
   if(c==='play'||c==='playnext'){
    await i.editReply({components:[musicNotice('Mencari lagu dan menyiapkan pemutar...')]});
    const me=guild.members.me??await guild.members.fetchMe();
    if(!voice.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]))throw new MusicError('Bot membutuhkan izin View Channel, Connect, dan Speak di voice channel ini.');
    if(voice.full&&me.voice.channelId!==voice.id&&!voice.permissionsFor(me)?.has(PermissionFlagsBits.MoveMembers))throw new MusicError('Voice channel penuh. Pilih channel yang masih tersedia.');
    const node=this.shoukaku.getIdealNode();if(!node)throw new MusicError(sourceError);
    const query=identifier(i.options.getString('query',true),(c==='playnext'?'youtube':i.options.getString('source'))??'youtube');
    const actualSource=query.startsWith('https://open.spotify.com/')?'Spotify':query.startsWith('scsearch:')||query.includes('soundcloud.com/')?'SoundCloud':query.startsWith('ytmsearch:')?'YouTube Music':'YouTube';
    console.log(`[MUSIC REQUEST] source=${actualSource} input=${query.startsWith('https:')?'link':'search'}`);
    const tracks=await resolveRequest(q=>node.rest.resolve(q),query);
    // Voice membership may change during network lookup.
    if(member.voice.channelId!==voice.id)throw new MusicError('Kamu berpindah voice channel. Jalankan /play lagi.');
    if(!s){
     s=await this.createSession(guild.id,voice);
    }
    if(i.channelId)this.notificationChannels.set(s,this.persistence.preferences(guild.id).panelChannel??i.channelId);
    for(const t of tracks)t.pluginInfo={...(t.pluginInfo as Record<string,unknown>),requester:i.user.id};if(c==='playnext')s.addNext(tracks);else s.add(tracks);if(!s.current)await s.next();this.save(guild.id,s);this.armIdle(guild.id,s);
    if(!s.current)throw new MusicError(s.lastError||sourceError);
    await i.editReply({components:[playerView(s,(s.player as Player).volume)]});await this.attachPanel(guild.id,i,s,'player',1);return;
   }
    if(!s&&c==='resume'){
     const saved=this.persistence.load(guild.id);if(!saved||(!saved.queue.length&&!saved.current))throw new MusicError('Tidak ada sesi tersimpan.');
     s=await this.createSession(guild.id,voice);s.loop=saved.loop;s.autoplay=saved.autoplay;s.autoplayStyle=saved.autoplayStyle??s.autoplayStyle;s.fair=saved.fair??s.fair;await (s.player as Player).setGlobalVolume(Math.max(0,Math.min(100,saved.volume)));
     if(i.channelId)this.notificationChannels.set(s,this.persistence.preferences(guild.id).panelChannel??i.channelId);
     s.add([...(saved.current?[saved.current]:[]),...saved.queue].slice(0,100).map(restoredTrack));await s.next();this.save(guild.id,s);this.armIdle(guild.id,s);await this.refreshPanel(guild.id);
     await i.editReply({components:[musicNotice(`Sesi dipulihkan dari awal lagu terakhir. ${s.queue.length} lagu menunggu.`)]});return;
    }
     if(c==='favorite'&&i.options.getSubcommand()==='play'||c==='playlist'&&i.options.getSubcommand()==='play'){
      if(!s){const me=guild.members.me??await guild.members.fetchMe();if(!voice.permissionsFor(me)?.has([PermissionFlagsBits.ViewChannel,PermissionFlagsBits.Connect,PermissionFlagsBits.Speak]))throw new MusicError('Bot membutuhkan izin View Channel, Connect, dan Speak di voice channel ini.');s=await this.createSession(guild.id,voice);}
      let tracks:Track[]=[];let summary='';
      if(c==='favorite'){const id=Number(i.options.getString('favorite',true)),fav=this.persistence.favorite(i.user.id,id);if(!fav)throw new MusicError('Favorit tidak ditemukan.');tracks=[restoredTrack(fav.track)];}
      else{const name=i.options.getString('name',true),saved=this.persistence.playlist(guild.id,name);if(!saved?.length)throw new MusicError('Playlist kosong atau tidak ditemukan.');const start=(i.options.getInteger('start')??1)-1;if(start>=saved.length)throw new MusicError('Posisi awal melewati akhir playlist.');const room=Math.max(0,100-s.queue.length-(s.current?1:0));if(!room)throw new MusicError('Antrean penuh (100).');tracks=saved.slice(start,start+room).map(restoredTrack);summary=` Posisi ${start+1}–${start+tracks.length}/${saved.length}.`;}
      if(i.channelId)this.notificationChannels.set(s,this.persistence.preferences(guild.id).panelChannel??i.channelId);for(const t of tracks)t.pluginInfo={...(t.pluginInfo as Record<string,unknown>),requester:i.user.id};s.add(tracks);if(!s.current)await s.next();this.save(guild.id,s);this.armIdle(guild.id,s);await this.refreshPanel(guild.id);await i.editReply({components:[musicNotice(`${tracks.length} lagu dimasukkan.${summary}`)]});return;
     }
     if(!s&&c==='history'&&i.options.getSubcommand()==='play'){s=await this.createSession(guild.id,voice);if(i.channelId)this.notificationChannels.set(s,this.persistence.preferences(guild.id).panelChannel??i.channelId);}
     if(!s)throw new MusicError('Belum ada sesi musik. Gunakan /play dahulu.');
   const player=s.player as Player;
   if(c==='seek'||c==='replay'){const position=c==='replay'?0:parsePosition(i.options.getString('position',true));await s.seek(position);this.meterReset(s);await this.refreshPanel(guild.id);await i.editReply({components:[musicNotice(c==='replay'?'Lagu diulang dari awal.':`Posisi diubah ke ${duration(position)}.`)]});return;}
   if(c==='fairqueue'){const mode=i.options.getString('mode',true);if(mode!=='status'){s.fair=mode==='on';s.rebalance();}await this.refreshPanel(guild.id);await i.editReply({components:[musicNotice(`Antrean adil ${s.fair?'ON':'OFF'}. Saat ON, request bergantian per pendengar; playnext tetap didahulukan.`)]});return;}

   if(c==='skip'){let vote:{votes:number;needed:number;passed:boolean}|undefined;if(!dj){vote=this.castVote(guild.id,s,voice.id,i.user.id);if(!vote.passed){await i.editReply({components:[musicNotice(`Vote skip: ${vote.votes}/${vote.needed}.`)]});return;}this.votes.delete(guild.id);}const skipped=s.current?.info.title??'Track';await s.skip();this.save(guild.id,s);this.armIdle(guild.id,s);await i.editReply({components:[musicNotice(dj?`Dilewati DJ: ${escapeMarkdown(skipped).slice(0,100)}`:`Vote berhasil (${vote!.votes}/${vote!.needed}); ${escapeMarkdown(skipped).slice(0,80)} dilewati.`)]});await this.refreshPanel(guild.id);return;}
   if(c==='pause'||c==='resume'){if(c==='resume'&&!s.current&&s.queue.length){await s.next();this.armIdle(guild.id,s);await this.refreshPanel(guild.id);await i.editReply({components:[musicNotice('Antrean tersimpan mulai diputar.')]});return;}if(!s.current)throw new MusicError('Tidak ada lagu aktif.');await s.setPaused(c==='pause');this.meterReset(s);await i.editReply({components:[musicNotice(c==='pause'?'Playback paused.':'Playback resumed.')]});await this.refreshPanel(guild.id);return;}
   if(c==='volume'){const value=i.options.getInteger('level',true);await player.setGlobalVolume(value);this.save(guild.id,s);await i.editReply({components:[musicNotice(`Volume · ${value}%`)]});await this.refreshPanel(guild.id);return;}
    if(c==='autoplay'||c==='loop'){const mode=i.options.getString('mode',true);if(mode!=='status'){if(c==='autoplay'){s.autoplay=mode==='on';const style=i.options.getString('style');if(style)s.autoplayStyle=style as 'artist'|'mix';}else s.loop=mode as 'off'|'song'|'queue';}this.save(guild.id,s);await i.editReply({components:[musicNotice(c==='autoplay'?`Autoplay ${s.autoplay?'aktif':'nonaktif'} (${s.autoplayStyle}).`:`Loop ${s.loop}.`)]});await this.refreshPanel(guild.id);return;}
    if(c==='shuffle'){s.fair=false;const n=s.shuffle();this.save(guild.id,s);await i.editReply({components:[musicNotice(`${n} lagu diacak. Antrean adil OFF untuk mempertahankan urutan acak.`)]});return;}
    if(c==='clear'){const n=s.queue.length;s.queue=[];s.autoplay=false;this.save(guild.id,s);await i.editReply({components:[musicNotice(`${n} lagu menunggu dihapus.`)]});return;}
    if(c==='remove'||c==='move'||c==='jump'){const from=i.options.getInteger(c==='move'?'from':'position',true)-1;if(from<0||from>=s.queue.length)throw new MusicError('Posisi lagu tidak tersedia.');if(c==='remove'){const [t]=s.queue.splice(from,1);this.save(guild.id,s);await i.editReply({components:[musicNotice(`Dihapus: ${escapeMarkdown(t!.info.title).slice(0,100)}`)]});return;}if(c==='move'){s.fair=false;const to=i.options.getInteger('to',true)-1;if(to<0||to>=s.queue.length)throw new MusicError('Posisi tujuan tidak tersedia.');const [t]=s.queue.splice(from,1);s.queue.splice(to,0,t!);this.save(guild.id,s);await i.editReply({components:[musicNotice('Posisi lagu diperbarui. Antrean adil OFF untuk mempertahankan urutan manual.')]});return;}const [t]=s.queue.splice(from,1);s.queue.unshift(t!);await s.skip();this.save(guild.id,s);await i.editReply({components:[musicNotice('Melompat ke lagu pilihan.')]});return;}
    if(c==='voteskip'){const vote=this.castVote(guild.id,s,voice.id,i.user.id);if(vote.passed){this.votes.delete(guild.id);await s.skip();this.save(guild.id,s);await i.editReply({components:[musicNotice(`Vote skip berhasil (${vote.needed}/${vote.needed}).`)]});}else await i.editReply({components:[musicNotice(`Vote skip: ${vote.votes}/${vote.needed}.`)]});return;}
    if(c==='history'){const sub=i.options.getSubcommand(false);if(sub==='clear'){this.persistence.clearHistory(guild.id);await i.editReply({components:[musicNotice('Riwayat dihapus.')]});return;}const rows=this.persistence.history(guild.id);if(sub==='play'){const row=rows[i.options.getInteger('position',true)-1];if(!row)throw new MusicError('Posisi riwayat tidak tersedia.');const node=this.shoukaku.getIdealNode();if(!node)throw new MusicError(sourceError);s.add([restoredTrack(row)]);if(!s.current)await s.next();this.save(guild.id,s);await i.editReply({components:[musicNotice('Lagu riwayat ditambahkan.')]});return;}await i.editReply({components:[musicNotice(rows.slice(0,10).map((x,n)=>`${n+1}. ${escapeMarkdown(x.title).slice(0,90)} — ${escapeMarkdown(x.author).slice(0,70)}`).join('\n')||'Riwayat kosong.')]});return;}
    if(c==='nowplaying'){await i.editReply({components:[playerView(s,player.volume)]});await this.attachPanel(guild.id,i,s,'player',1);return;}
   if(c==='queue'){
    const pages=Math.max(1,Math.ceil(s.queue.length/10)),page=Math.max(1,i.options.getInteger('page')??1);
    if(page>pages)throw new MusicError(`Halaman tersedia: 1-${pages}.`);
    await i.editReply({components:[queueView(s,page,pages)]});await this.attachPanel(guild.id,i,s,'queue',page);return;
   }
  });
 }
 private clearPanel(guild:string){const panel=this.panels.get(guild);if(!panel)return;this.panels.delete(guild);if(panel.timer)clearInterval(panel.timer);panel.stop();}
 private async attachPanel(guild:string,interaction:ChatInputCommandInteraction|MessageComponentInteraction,session:MusicSession,mode:'player'|'queue',page:number){
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
  const active=this.sessions.get(guild);if(active){this.save(guild,active);await this.refreshPublic(guild,active);}
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
   if(!['music:skip','music:favorite'].includes(button.customId)&&!this.isDj(panel.guildId,member)&&this.persistence.djRole(panel.guildId)){await button.reply({content:'Kontrol ini hanya dapat digunakan DJ atau administrator.',flags:MessageFlags.Ephemeral});return;}
   await button.deferUpdate();
   await this.serial.run(panel.guildId,async()=>{
    if(this.sessions.get(panel.guildId)!==panel.session||panel.session.closed)return;
    const player=panel.session.player as Player;
    if(button.customId==='music:favorite'){if(!panel.session.current)throw new MusicError('Tidak ada lagu aktif.');this.persistence.addFavorite(button.user.id,this.savedTrack(panel.session.current,button.user.id));await button.followUp({content:'Ditambahkan ke favorit.',flags:MessageFlags.Ephemeral});}
    else if(button.customId==='music:savequeue'){if(!this.isDj(panel.guildId,member))throw new MusicError('Simpan playlist memerlukan DJ/admin.');const name=`Antrean ${Date.now()}`;this.saveQueue(panel.guildId,panel.session,name,button.user.id);await button.followUp({content:`Antrean disimpan sebagai ${name}.`,flags:MessageFlags.Ephemeral});}
    else if(button.customId==='music:replay'){await panel.session.seek(0);this.meterReset(panel.session);}
    else if(button.customId==='music:volume_down'||button.customId==='music:volume_up')await this.adjustVolume(panel.session,button.customId==='music:volume_up'?10:-10);
    else if(button.customId==='music:loop')panel.session.loop=panel.session.loop==='off'?'song':panel.session.loop==='song'?'queue':'off';
    else if(button.customId==='music:autoplay')panel.session.autoplay=!panel.session.autoplay;
    else if(button.customId==='music:pause'){await panel.session.setPaused(!panel.session.paused);this.meterReset(panel.session);}
    else if(button.customId==='music:skip'){if(!this.isDj(panel.guildId,member)){const vote=this.castVote(panel.guildId,panel.session,panel.session.channelId,button.user.id);if(!vote.passed){await button.followUp({content:`Vote skip: ${vote.votes}/${vote.needed}.`,flags:MessageFlags.Ephemeral});return;}this.votes.delete(panel.guildId);}await panel.session.skip();this.save(panel.guildId,panel.session);this.armIdle(panel.guildId,panel.session);}
    else if(button.customId==='music:shuffle'){panel.session.fair=false;panel.session.shuffle();}
    else if(button.customId==='music:stop'){await this.dispose(panel.guildId,false);await panel.interaction.editReply({components:[musicNotice('Playback dihentikan. Antrean dibersihkan.')]});this.clearPanel(panel.guildId);return;}
   });
   await this.refreshPanel(panel.guildId);
  }catch{await button.followUp({content:'Aksi tidak dapat dijalankan. Coba gunakan command musik lagi.',flags:MessageFlags.Ephemeral}).catch(()=>{});}
 }
 async shutdown(){this.shuttingDown=true;for(const guild of this.panels.keys())this.clearPanel(guild);for(const [guild,s] of this.sessions)this.save(guild,s);await Promise.allSettled([...this.sessions.keys()].map(id=>this.dispose(id)));this.persistence.close();}
}
