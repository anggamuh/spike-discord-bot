import {REST,Routes} from 'discord.js';import {commands} from './commands.js';import {required} from './config.js';
try{
 const rest=new REST({version:'10'}).setToken(required('DISCORD_TOKEN'));
 const app=required('DISCORD_CLIENT_ID'),guild=required('DISCORD_GUILD_ID');
 // Upsert command satu per satu: tidak menghapus command lain di aplikasi.
 for(const command of commands)await rest.post(Routes.applicationGuildCommands(app,guild),{body:command.toJSON()});
 console.log(`${commands.length} slash command ManukAPP terdaftar di server.`);
 }catch(error:unknown){
 const e=error as {name?:string;code?:string|number;status?:number};
 console.error('Registrasi gagal:',{jenis:e.name,kode:e.code,statusHTTP:e.status});
 for(const key of ['DISCORD_TOKEN','DISCORD_CLIENT_ID','DISCORD_GUILD_ID'])console.log(`${key}: ${process.env[key]?.trim()?'TERISI':'KOSONG'}`);
 process.exitCode=1;
}
