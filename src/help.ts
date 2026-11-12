import {ActionRowBuilder,EmbedBuilder,StringSelectMenuBuilder} from 'discord.js';
import {commands} from './commands.js';

export const helpGroups:Record<string,{label:string;names:string[]}>= {
 music:{label:'Pemutar musik',names:['play','playnext','pause','resume','skip','voteskip','stop','nowplaying','volume','seek','replay','panel']},
 queue:{label:'Antrean & autoplay',names:['queue','remove','move','jump','shuffle','clear','loop','autoplay','fairqueue','savequeue']},
 collection:{label:'Playlist, favorit & riwayat',names:['playlist','favorite','history']},
 profile:{label:'Profil & statistik',names:['profile','profileset','top','wrapped']},
 admin:{label:'Pengaturan server',names:['247','musicsettings','dj','status']},
 other:{label:'Valorant & bantuan',names:['link','rank','stats','matches','unlink','help','ping']}
};
export function commandLines(names:string[]){return commands.filter(c=>names.includes(c.name)).flatMap(c=>{
 const data=c.toJSON(),subs=data.options?.filter(o=>o.type===1)??[];
 return subs.length?subs.map(s=>`\`/${data.name} ${s.name}\` — ${s.description}`):[`\`/${data.name}\` — ${data.description}`];
});}
export function helpView(category='music'){
 const key=category in helpGroups?category:'music',group=helpGroups[key]!;
 const embed=new EmbedBuilder().setColor(0x8b5cf6).setTitle(`MANUKAPP • ${group.label}`).setDescription(commandLines(group.names).join('\n')).setFooter({text:'Pilih kategori di bawah untuk semua slash command. Opsi command muncul saat diketik di Discord.'});
 if(key==='music')embed.addFields({name:'Mulai mendengarkan',value:'Masuk voice, lalu `/play query:judul atau link playlist`. Lirik tersedia lewat tombol Lirik pada panel pemutar.'});
 if(key==='admin')embed.addFields({name:'Izin',value:'Pengaturan server perlu admin/Manage Server; kontrol musik mengikuti role DJ dan voice channel. Mode 24/7 tetap membutuhkan host menyala.'});
 if(key==='other')embed.addFields({name:'Akun Riot',value:'`/link` menyimpan Riot ID, bukan login/verifikasi Riot. Mode live mengirim ID ke HenrikDev. `/unlink` menghapus ID tersimpan.'});
 const menu=new StringSelectMenuBuilder().setCustomId('help:category').setPlaceholder('Lihat kategori command lain').addOptions(Object.entries(helpGroups).map(([value,g])=>({label:g.label,value,default:value===key})));
 return {embeds:[embed],components:[new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)],allowedMentions:{parse:[] as never[]}};
}
