import {helpView} from './help.js';
import {DatabaseBackups} from './database-backup.js';
import {reportMusicError} from './music-diagnostics.js';
import {Music,musicNames} from './music.js';
import {MusicError} from './music-core.js';
import {musicNotice,musicV2Flags} from './music-ui.js';
import {Client,Events,GatewayIntentBits,EmbedBuilder,MessageFlags,escapeMarkdown} from 'discord.js';
import {Provider} from './provider.js';import {Store} from './store.js';import {summarize} from './domain.js';import {required,mode} from './config.js';
import { startMonitoringApi } from './api/server.js';
const dataMode=mode();
const provider=new Provider(dataMode,process.env.HENRIK_API_KEY);
const store=new Store(process.env.DATABASE_PATH??'./data/spike.sqlite');
const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildVoiceStates],allowedMentions:{parse:[]}});
const music=process.env.MUSIC_ENABLED==='false'?undefined:new Music(client);
const backups=new DatabaseBackups(process.env.DATABASE_PATH??'./data/spike.sqlite');
backups.start();
const cooldown=new Map<string,number>(),busy=new Set<string>();
const clean=(s:string)=>escapeMarkdown(s).slice(0,150);
const base=()=>new EmbedBuilder().setColor(0xff4655).setFooter({text:dataMode==='demo'?'SPIKE • DATA DEMO, bukan statistik asli':'SPIKE • HenrikDev (tidak resmi) • cache maks. 60 detik'}).setTimestamp();
// Monitoring API is started once per process, after the Discord gateway is ready.
let monitoringServer: import('node:http').Server | undefined;
client.once(Events.ClientReady, () => {
    console.log(`ManukAPP v3.2.0 online • mode ${dataMode}. Gunakan /help.`);
    try {
        monitoringServer = startMonitoringApi(client, music);
    } catch (error) {
        // Do not take down the music bot when monitoring is misconfigured.
        console.error('[ManukAPI] Gagal memulai monitoring:', error);
    }
});
client.on(Events.InteractionCreate,async i=>{
 if(i.isStringSelectMenu()&&i.customId==='help:category'){await i.update(helpView(i.values[0])).catch(()=>{});return;}
 if(i.isAutocomplete()){if(music&&musicNames.has(i.commandName))await music.autocomplete(i);else await i.respond([]).catch(()=>{});return;}
 if(!i.isChatInputCommand())return;
 const uid=i.user.id;
 if(busy.has(uid)||(cooldown.get(uid)??0)>Date.now()){await i.reply({content:'Tunggu beberapa detik sebelum command berikutnya.',flags:MessageFlags.Ephemeral}).catch(()=>{});return;}
 busy.add(uid);cooldown.set(uid,Date.now()+5000);
 try{
 const c=i.commandName;
 if(musicNames.has(c)){
  await i.reply({flags:MessageFlags.Ephemeral|musicV2Flags,components:[musicNotice('Menyiapkan pemutar...')]});
  if(!music)throw new MusicError('Musik dinonaktifkan. Set MUSIC_ENABLED=true di .env.');
  await music.handle(i);return;
 }
 await i.deferReply({flags:MessageFlags.Ephemeral});
 if(c==='ping'){await i.editReply(`Pong! Gateway ${Math.max(0,client.ws.ping)} ms • ${dataMode}`);return;}
 if(c==='help'){await i.editReply(helpView(i.options.getString('category')??'music'));return;}
 if(c==='unlink'){store.remove(uid);await i.editReply('Riot ID tersimpan dihapus dari semua mode. Cache statistik provider kedaluwarsa maksimal 60 detik.');return;}
 if(c==='link'){
 if(!i.options.getBoolean('setuju',true))throw new Error('Penyimpanan dibatalkan. Persetujuan diperlukan untuk mengambil statistik dan menyimpan Riot ID.');
 const p=await provider.account(i.options.getString('riot_id',true),i.options.getString('region')??'ap');store.set(uid,dataMode,p);
 await i.editReply({embeds:[base().setTitle('Riot ID tersimpan').setDescription(`**${clean(p.name)}#${clean(p.tag)}** · ${p.region.toUpperCase()}\nCoba /rank atau /stats.\nIni penyimpanan ID, bukan verifikasi kepemilikan Riot.`)]});return;}
 const p=store.get(uid,dataMode);if(!p)throw new Error('Simpan akun dahulu dengan /link. Mode demo: Angga#IDN.');
 const embed=base().setTitle(`${clean(p.name)}#${clean(p.tag)}`);
 if(c==='rank'){const r=await provider.rank(p);embed.setDescription(`**${clean(r.tier)}** · ${r.rr} RR`).addFields({name:'Perubahan terakhir',value:`${r.change>=0?'+':''}${r.change} RR`,inline:true},{name:'Peak rank',value:clean(r.peak),inline:true});}
 else if(c==='stats'){const rows=await provider.matches(p),s=summarize(rows);embed.setDescription(`Sampel ${s.count} pertandingan Competitive terakhir yang tersedia.`).addFields({name:'Win rate',value:`${(100*s.wins/s.count).toFixed(1)}%`,inline:true},{name:'K/D',value:s.kd,inline:true},{name:'Headshot',value:s.hs,inline:true},{name:'ACS',value:s.acs,inline:true},{name:'Hasil',value:`${s.wins} menang • ${s.count-s.wins-s.draws} kalah • ${s.draws} seri`});}
 else if(c==='matches'){const rows=(await provider.matches(p)).slice(0,5);if(!rows.length)throw new Error('Belum ada pertandingan Competitive yang tersedia.');embed.setDescription('Pertandingan Competitive terakhir').addFields(rows.map(m=>({name:`${m.result} • ${clean(m.map)} • ${m.scoreline}`,value:`${clean(m.agent)} | K/D/A ${m.kills}/${m.deaths}/${m.assists} | ACS ${m.rounds?Math.round(m.score/m.rounds):'—'}`})));}
 else throw new Error('Command tidak dikenal. Gunakan /help.');
 await i.editReply({embeds:[embed]});
 }catch(error){let message:string;if(musicNames.has(i.commandName)){if(error instanceof MusicError)message=error.message;else{reportMusicError('COMMAND',error);message='Musik belum dapat diproses. Coba lagi sebentar.';}const payload={components:[musicNotice(message.slice(0,1200))],allowedMentions:{parse:[]}};if(i.deferred||i.replied)await i.editReply(payload).catch(()=>{});else await i.reply({flags:MessageFlags.Ephemeral|musicV2Flags,...payload}).catch(()=>{});}else{message=error instanceof Error?error.message:'Terjadi kesalahan.';await i.editReply({content:message.slice(0,1500),embeds:[],allowedMentions:{parse:[]}}).catch(()=>{});}}
 finally{busy.delete(uid);}
});
const timer=setInterval(()=>{for(const [key,until]of cooldown)if(until<Date.now())cooldown.delete(key);},60000);timer.unref();
let isShuttingDown = false;
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, async () => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        try {
            if (monitoringServer) {
                await new Promise<void>((resolve) => {
                    monitoringServer!.close(() => resolve());
                });
            }
            await backups.stop();
            await music?.shutdown();
        } catch (error) {
            console.error('Gagal menghentikan ManukAPP dengan bersih:', error);
            process.exitCode = 1;
        } finally {
            client.destroy();
            store.close();
            process.exit();
        }
    });
}
client.on(Events.Error,()=>console.error('Koneksi Discord bermasalah. Periksa jaringan.'));
client.login(required('DISCORD_TOKEN')).catch(async()=>{await backups.stop();console.error('Login bot gagal. Periksa DISCORD_TOKEN dan jaringan.');store.close();process.exitCode=1;client.destroy();});
