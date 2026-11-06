import {createServer} from 'node:http';
import {loginRequest,callbackCode,SpotifyUser} from './spotify-user.js';
async function main(){
 const clientId=process.env.SPOTIFY_CLIENT_ID??'';
 const auth=loginRequest(clientId),spotify=new SpotifyUser(clientId);
 let busy=false;
 const server=createServer(async(req,res)=>{
  const u=new URL(req.url??'/','http://127.0.0.1:8888');
  res.setHeader('Content-Type','text/plain; charset=utf-8');res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');
  if(req.method!=='GET'||u.pathname!=='/callback'){res.writeHead(404);res.end('Not found');return;}
  let code:string;
  try{code=callbackCode(u.toString(),auth.state);}catch{res.writeHead(400);res.end('Login dibatalkan atau state tidak cocok. Gunakan link dari terminal.');return;}
  if(busy){res.writeHead(409);res.end('Login sedang diproses.');return;}busy=true;
  try{await spotify.exchange(code,auth.verifier);res.end('Spotify terhubung. Kembali ke terminal dan jalankan npm start.');console.log('Spotify terhubung. Token disimpan lokal; tidak perlu disalin.');}
  catch{res.writeHead(400);res.end('Login gagal. Periksa Client ID dan Redirect URI lalu jalankan ulang spotify:login.');console.error('Login Spotify gagal; periksa Client ID dan Redirect URI.');process.exitCode=1;}
  finally{clearTimeout(timer);server.close();}
 });
 const timer=setTimeout(()=>{console.error('Login kedaluwarsa setelah 5 menit. Jalankan ulang spotify:login.');server.close();process.exitCode=1;},300000);
 server.on('error',()=>{clearTimeout(timer);console.error('Port lokal 8888 tidak tersedia. Tutup proses login sebelumnya, lalu coba lagi.');process.exitCode=1;});
 server.listen(8888,'127.0.0.1',()=>{console.log('Buka link ini di browser komputer yang sama, login ke akun Spotify pemilik/kolaborator playlist:');console.log(auth.url);});
}
main().catch(()=>{console.error('Isi SPOTIFY_CLIENT_ID di .env terlebih dahulu.');process.exitCode=1;});
