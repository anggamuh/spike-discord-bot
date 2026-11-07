import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {MusicPersistence,type SavedTrack} from '../src/music-persistence.js';

const item=(id:string):SavedTrack=>({identifier:id,title:`Title ${id}`,author:'Artist',url:`https://youtu.be/${id}`,length:1000,requester:'user'});
test('favorites are unique per user and playlists/settings are isolated by guild',()=>{
 const dir=mkdtempSync(join(tmpdir(),'manuk-music-'));const db=new MusicPersistence(join(dir,'music.sqlite'));
 try{
  assert.equal(db.addFavorite('u1',item('a')),true);assert.equal(db.addFavorite('u1',item('a')),false);assert.equal(db.favorites('u1').length,1);assert.equal(db.favorites('u1',25,0,'title a').length,1);assert.equal(db.favorites('u2').length,0);
  assert.equal(db.createPlaylist('g1','Road Trip'),true);assert.equal(db.createPlaylist('g1','Road Trip'),false);assert.equal(db.createPlaylist('g2','Road Trip'),true);
  db.setPlaylist('g1','Road Trip',[item('a'),item('b')]);assert.deepEqual(db.playlist('g1','Road Trip')?.map(x=>x.identifier),['a','b']);assert.deepEqual(db.playlist('g2','Road Trip'),[]);
  db.setDjRole('g1','role1');assert.equal(db.djRole('g1'),'role1');assert.equal(db.djRole('g2'),undefined);
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
