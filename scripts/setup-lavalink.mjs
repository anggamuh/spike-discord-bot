import {existsSync} from 'node:fs';
import {writeFile,rename,unlink,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const folder=new URL('../lavalink/',import.meta.url),target=new URL('Lavalink.jar',folder),temp=new URL('Lavalink.jar.part',folder);
try{
 await mkdir(folder,{recursive:true});
 if(existsSync(target)){console.log('Lavalink.jar sudah ada. Tidak ditimpa.');process.exit(0);}
 const release=await fetch('https://api.github.com/repos/lavalink-devs/Lavalink/releases/tags/4.2.2',{headers:{Accept:'application/vnd.github+json','User-Agent':'ManukAPP-setup'},signal:AbortSignal.timeout(30000)});
 if(!release.ok)throw new Error(`GitHub HTTP ${release.status}`);
 const json=await release.json(),asset=json.assets?.find(a=>a.name==='Lavalink.jar');
 if(!asset||!asset.browser_download_url.startsWith('https://github.com/lavalink-devs/Lavalink/releases/download/4.2.2/'))throw new Error('Aset resmi tidak ditemukan.');
 console.log('Mengunduh Lavalink 4.2.2 dari rilis resmi GitHub...');
 const response=await fetch(asset.browser_download_url,{signal:AbortSignal.timeout(180000)});
 if(!response.ok)throw new Error(`Download HTTP ${response.status}`);
 const bytes=Buffer.from(await response.arrayBuffer());
 if(asset.size&&bytes.length!==asset.size)throw new Error('Ukuran download tidak cocok.');
 if(asset.digest?.startsWith('sha256:')&&createHash('sha256').update(bytes).digest('hex')!==asset.digest.slice(7))throw new Error('Checksum tidak cocok.');
 await writeFile(temp,bytes);await rename(temp,target);console.log('Lavalink.jar siap. Jalankan npm run lavalink.');
}catch(error){await unlink(temp).catch(()=>{});console.error('Setup Lavalink gagal:',error.message);console.error('Alternatif: unduh Lavalink.jar dari https://github.com/lavalink-devs/Lavalink/releases/tag/4.2.2 lalu simpan di folder lavalink.');process.exitCode=1;}
