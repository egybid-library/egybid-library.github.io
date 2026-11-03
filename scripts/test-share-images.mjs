import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {generateShareImages} from './build-share-images.mjs';
import {renderTitleImage,hash} from './share-image-renderer.mjs';

const output=fs.mkdtempSync(path.join(os.tmpdir(),'egybid-share-images-'));
const articles=[{id:'0000000000000001',title:'المكاسب غير الماليّة في البيزنس'},{id:'0000000000000002',title:'الجمع بين إنّك تشتغل في اللي بتفهم فيه وبين إنّك تحدّث شغلك'}];
const manifest=()=>JSON.parse(fs.readFileSync(path.join(output,'manifest.json')));
const mtimes=()=>Object.fromEntries(Object.values(manifest().articles).map(a=>[a.file,fs.statSync(path.join(output,a.file)).mtimeMs]));
try{
 assert.equal((await generateShareImages(articles,{output})).generated,2);
 const first=manifest(),times=mtimes();
 const repeated=await generateShareImages(articles,{output});assert.equal(repeated.generated,0);assert.equal(repeated.reused,2);assert.deepEqual(mtimes(),times);
 const changed=[{...articles[0],title:'عنوان جديد للمقال نفسه'},articles[1]];
 const result=await generateShareImages(changed,{output});assert.equal(result.generated,1);assert.equal(result.reused,1);
 let current=manifest();assert.notEqual(current.articles[articles[0].id].file,first.articles[articles[0].id].file);assert.ok(!fs.existsSync(path.join(output,first.articles[articles[0].id].file)));
 assert.equal(fs.statSync(path.join(output,first.articles[articles[1].id].file)).mtimeMs,times[first.articles[articles[1].id].file]);
 const added=[...changed,{id:'0000000000000003',title:'26 - 01 - 29 - الخام المكن المبنى'}];
 assert.equal((await generateShareImages(added,{output})).generated,1);
 current=manifest();const lost=path.join(output,current.articles[articles[1].id].file);fs.rmSync(lost);assert.equal((await generateShareImages(added,{output})).generated,1);
 fs.writeFileSync(lost,'CORRUPTED');assert.equal((await generateShareImages(added,{output})).generated,1);
 for(const article of added){
  const entry=manifest().articles[article.id],bytes=fs.readFileSync(path.join(output,entry.file));
  assert.equal(entry.title,article.title);assert.equal(entry.lines.join(' '),article.title);assert.equal(entry.sha256,hash(bytes));
  assert.deepEqual([...bytes.subarray(0,8)],[137,80,78,71,13,10,26,10]);assert.equal(bytes.readUInt32BE(16),1200);assert.equal(bytes.readUInt32BE(20),630);
  assert.equal(hash(renderTitleImage(article.title).bytes),entry.sha256,'The same title must render identically');
 }
 assert.equal((await generateShareImages([added[0]],{output})).reused,1);assert.equal(fs.readdirSync(output).filter(f=>f.endsWith('.png')).length,1);
 console.log('PASS: incremental title images; unchanged files untouched, one-title changes, new articles, missing/corrupted images, stale-image cleanup, deterministic pixels and complete long/numeric titles.');
}finally{fs.rmSync(output,{recursive:true,force:true});}
