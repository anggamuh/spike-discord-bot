import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const project=fileURLToPath(new URL('../',import.meta.url));
const directory=resolve(project,process.env.YT_CIPHER_DIR||'./yt-cipher');
if(!existsSync(resolve(directory,'server.ts'))){
 console.error(`Source yt-cipher tidak ditemukan di ${directory}. Ikuti MUSIC_YOUTUBE.md untuk menyiapkan checkout lokal opsional.`);
 process.exit(1);
}
const password=process.env.YT_CIPHER_PASSWORD?.trim();
if(!password){console.error('Isi YT_CIPHER_PASSWORD di .env sebelum menjalankan yt-cipher.');process.exit(1);}
const host=(process.env.YT_CIPHER_HOST||'127.0.0.1').trim();
if(!['127.0.0.1','localhost','::1'].includes(host)){
 console.error('YT_CIPHER_HOST harus menunjuk ke loopback lokal.');process.exit(1);
}
const port=Number(process.env.YT_CIPHER_PORT||'8001');
if(!Number.isInteger(port)||port<1||port>65535){console.error('YT_CIPHER_PORT harus berupa port TCP yang valid.');process.exit(1);}

const inheritedKeys=['PATH','Path','PATHEXT','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','DENO_DIR'];
const childEnv=Object.fromEntries(inheritedKeys.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
const child=spawn('deno',['run','--allow-net','--allow-read','--allow-write','--allow-env','server.ts'],{
 cwd:directory,
 stdio:'inherit',
 env:{...childEnv,HOST:host,PORT:String(port),API_TOKEN:password,OVERRIDE_PLAYER_VARIANT:'IAS'}
});
child.on('error',error=>{
 console.error(error.code==='ENOENT'?'Deno tidak ditemukan. Install Deno lalu buka terminal baru.':'Gagal menjalankan yt-cipher lokal.');
 process.exitCode=1;
});
child.on('exit',code=>{process.exitCode=code??0;});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
