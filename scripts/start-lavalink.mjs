import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
import {createInterface} from 'node:readline';
import {fileURLToPath} from 'node:url';
import {sanitizeLavalinkLine} from './lavalink-log-safety.mjs';

const cwd=fileURLToPath(new URL('../lavalink/',import.meta.url));
if(!existsSync(new URL('../lavalink/Lavalink.jar',import.meta.url))){
 console.error('Lavalink.jar belum ada. Jalankan npm run setup:lavalink dulu.');
 process.exit(1);
}

function localCipherConfig(){
 if(process.env.YT_CIPHER_ENABLED!=='true')return undefined;
 const host=(process.env.YT_CIPHER_HOST||'127.0.0.1').trim();
 const port=Number(process.env.YT_CIPHER_PORT||'8001');
 const password=process.env.YT_CIPHER_PASSWORD?.trim();
 if(!['127.0.0.1','localhost','::1'].includes(host))throw new Error('YT_CIPHER_HOST harus menunjuk ke loopback lokal (127.0.0.1, localhost, atau ::1).');
 if(!Number.isInteger(port)||port<1||port>65535)throw new Error('YT_CIPHER_PORT harus berupa port TCP yang valid.');
 if(!password)throw new Error('YT_CIPHER_PASSWORD wajib diisi saat YT_CIPHER_ENABLED=true.');
 const authority=host.includes(':')?`[${host}]`:host;
 return {host,port,password,url:`http://${authority}:${port}`};
}

async function verifyCipher(config){
 const timer=AbortSignal.timeout(2500);
 try{
  const guard=await fetch(`${config.url}/__manuk_healthcheck__`,{signal:timer,redirect:'manual'});
  await guard.body?.cancel();
  if(guard.status!==401)throw new Error('password guard tidak aktif');
  const response=await fetch(`${config.url}/resolve_url`,{method:'POST',headers:{authorization:config.password,'content-type':'application/json'},body:'{}',signal:timer,redirect:'manual'});
  await response.body?.cancel();
  // The API validates the request after authentication. A 400/422 means the
  // password was accepted; a 401 means the local server and Lavalink secrets differ.
  if(response.status===401)throw new Error('password ditolak');
  if(response.status<400||response.status>=500)throw new Error(`HTTP ${response.status}`);
  console.log('[YOUTUBE CIPHER] Server lokal aktif dan password diterima.');
 }catch{
  throw new Error(`Server yt-cipher lokal belum lolos pemeriksaan koneksi/password di ${config.url}. Jalankan npm run yt-cipher, samakan YT_CIPHER_PASSWORD di .env, atau matikan YT_CIPHER_ENABLED.`);
 }
}

let cipher;
try{
 cipher=localCipherConfig();
 if(cipher)await verifyCipher(cipher);
}catch(error){console.error(`[YOUTUBE CIPHER] ${error.message}`);process.exit(1);}

const inheritedKeys=['PATH','Path','PATHEXT','SystemRoot','SYSTEMROOT','WINDIR','TEMP','TMP','USERPROFILE','HOME','APPDATA','LOCALAPPDATA','JAVA_HOME','LANG','TZ'];
const javaEnv=Object.fromEntries(inheritedKeys.filter(key=>process.env[key]!==undefined).map(key=>[key,process.env[key]]));
for(const key of ['SPOTIFY_CLIENT_ID','SPOTIFY_CLIENT_SECRET'])if(process.env[key])javaEnv[key]=process.env[key];
javaEnv.LAVALINK_SERVER_PASSWORD=process.env.LAVALINK_PASSWORD||'manuk-local-only';
// Spring Boot binds this environment property only when a token is actually supplied.
// With no token, the plugin's documented device authorization flow remains enabled.
delete javaEnv.PLUGINS_YOUTUBE_OAUTH_REFRESHTOKEN;
const refreshToken=process.env.YOUTUBE_REFRESH_TOKEN?.trim();
if(refreshToken){
 javaEnv.PLUGINS_YOUTUBE_OAUTH_REFRESHTOKEN=refreshToken;
 console.log('[YOUTUBE AUTH] Refresh token tersedia; plugin akan memvalidasinya saat startup.');
}else{
 console.log('[YOUTUBE AUTH] Token tidak dikonfigurasi; plugin dapat memulai device authorization flow resmi.');
}

for(const key of ['PLUGINS_YOUTUBE_REMOTECIPHER_URL','PLUGINS_YOUTUBE_REMOTECIPHER_PASSWORD','PLUGINS_YOUTUBE_REMOTECIPHER_USERAGENT'])delete javaEnv[key];
if(cipher){
 javaEnv.PLUGINS_YOUTUBE_REMOTECIPHER_URL=cipher.url;
 javaEnv.PLUGINS_YOUTUBE_REMOTECIPHER_PASSWORD=cipher.password;
 javaEnv.PLUGINS_YOUTUBE_REMOTECIPHER_USERAGENT='manukapp-local';
}

const child=spawn('java',['-Xms128m','-Xmx512m','-jar','Lavalink.jar'],{cwd,stdio:['inherit','pipe','pipe'],env:javaEnv});
let recent='';let authDiagnosis=false;let cipherDiagnosis=false;
const secrets=[refreshToken,process.env.LAVALINK_PASSWORD||'manuk-local-only',process.env.YT_CIPHER_PASSWORD,cipher?.password,process.env.SPOTIFY_CLIENT_SECRET].filter(value=>value&&value.length>=4);
function forward(stream,line){
 stream.write(`${sanitizeLavalinkLine(line,secrets)}\n`);
 recent=(recent+line.toLowerCase()).slice(-5000);
 if(!authDiagnosis&&/oauth2 token fetch: 400|invalid status code for oauth2 token fetch/.test(recent)){
  authDiagnosis=true;
  console.error('[YOUTUBE AUTH] YouTube menolak refresh token (HTTP 400). Hapus YOUTUBE_REFRESH_TOKEN dari .env, restart Lavalink, lalu selesaikan device flow untuk memperoleh token baru.');
 }
 if(!cipherDiagnosis&&/must find sig function/.test(recent)){
  cipherDiagnosis=true;
  console.error(cipher
   ?'[YOUTUBE CIPHER] Plugin tetap gagal memecahkan signature; periksa versi yt-cipher lokal dan konfigurasi remoteCipher.'
   :'[YOUTUBE CIPHER] Signature YouTube berubah dan cipher lokal plugin gagal. Server yt-cipher lokal opsional dapat diaktifkan melalui .env.');
 }
}
createInterface({input:child.stdout,crlfDelay:Infinity}).on('line',line=>forward(process.stdout,line));
createInterface({input:child.stderr,crlfDelay:Infinity}).on('line',line=>forward(process.stderr,line));
child.on('error',error=>{
 console.error(error.code==='ENOENT'
  ?'Java tidak ditemukan. Install Java 17+ (disarankan Java 21), buka terminal baru, lalu cek java -version.'
  :'Gagal menjalankan proses Lavalink.');
 process.exitCode=1;
});
child.on('exit',code=>{process.exitCode=code??0;});
process.on('SIGINT',()=>child.kill('SIGINT'));
process.on('SIGTERM',()=>child.kill('SIGTERM'));
