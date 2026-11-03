import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {inflateSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import * as fontkit from 'fontkit';
import {Resvg} from '@resvg/resvg-js';

export const libraryName='مكتبة المكتب المصري للتطوير الصناعي';
export const hash=data=>createHash('sha256').update(data).digest('hex');
const require=createRequire(import.meta.url);
const packageRoot=path.dirname(require.resolve('@ibm/plex-sans-arabic/package.json'));
const fontCache=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../node_modules/.cache/library-share-fonts');
fs.mkdirSync(fontCache,{recursive:true});

// Reconstruct the licensed package's complete WOFF1 faces for the SVG renderer.
// Fonts stay in the build cache; readers download only the finished PNG.
function sfnt(woff){
 if(woff.toString('ascii',0,4)!=='wOFF')throw Error('Expected a WOFF1 font');
 const count=woff.readUInt16BE(12),tables=[];
 let size=12+count*16;
 for(let i=0;i<count;i++){
  const at=44+i*20,offset=woff.readUInt32BE(at+4),compressed=woff.readUInt32BE(at+8),length=woff.readUInt32BE(at+12);
  const source=woff.subarray(offset,offset+compressed),data=compressed===length?source:inflateSync(source);
  if(data.length!==length)throw Error('Invalid font table');
  tables.push({tag:woff.toString('ascii',at,at+4),data,checksum:woff.readUInt32BE(at+16),offset:size});
  size+=(length+3)&~3;
 }
 const out=Buffer.alloc(size),power=Math.floor(Math.log2(count));
 woff.copy(out,0,4,8);out.writeUInt16BE(count,4);out.writeUInt16BE(2**power*16,6);out.writeUInt16BE(power,8);out.writeUInt16BE(count*16-2**power*16,10);
 tables.forEach((table,i)=>{
  const at=12+i*16;out.write(table.tag,at,4,'ascii');out.writeUInt32BE(table.checksum,at+4);out.writeUInt32BE(table.offset,at+8);out.writeUInt32BE(table.data.length,at+12);table.data.copy(out,table.offset);
 });
 const head=tables.find(table=>table.tag==='head');
 out.writeUInt32BE(0,head.offset+8);
 let checksum=0;for(let i=0;i<out.length;i+=4)checksum=(checksum+out.readUInt32BE(i))>>>0;
 out.writeUInt32BE((0xb1b0afba-checksum)>>>0,head.offset+8);
 return out;
}
function fontFace(style){
 const source=fs.readFileSync(path.join(packageRoot,'fonts/complete/woff/IBMPlexSansArabic-'+style+'.woff'));
 const bytes=sfnt(source),file=path.join(fontCache,hash(bytes)+'.ttf');
 if(!fs.existsSync(file))fs.writeFileSync(file,bytes);
 const font=fontkit.create(bytes);
 return {font,file,digest:hash(bytes)};
}
const regular=fontFace('Regular'),semibold=fontFace('SemiBold');
export const recipe=hash(fs.readFileSync(fileURLToPath(import.meta.url))+regular.digest+semibold.digest+'resvg2.6.2/png');
const escape=value=>value.replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const widthCache=new Map();
const advance=text=>{
 if(!widthCache.has(text))widthCache.set(text,semibold.font.layout(text).advanceWidth/semibold.font.unitsPerEm);
 return widthCache.get(text);
};

export function titleLayout(title){
 const words=title.trim().split(/\s+/),maxWidth=1008;
 let size=title.length>48?66:75.6;
 while(words.some(word=>advance(word)*size>maxWidth))size-=1;
 // First find the necessary line count, then balance those lines at word boundaries.
 let greedy=[''];
 for(const word of words){const i=greedy.length-1,next=greedy[i]?greedy[i]+' '+word:word;if(advance(next)*size>maxWidth&&greedy[i])greedy.push(word);else greedy[i]=next;}
 const lineCount=greedy.length;
 if(lineCount*size*1.48>356)size=Math.min(size,356/(lineCount*1.48));
 const target=advance(words.join(' '))*size/lineCount,memo=new Map();
 function balance(start,left){
  const key=start+':'+left;if(memo.has(key))return memo.get(key);
  if(!left)return start===words.length?{score:0,lines:[]}:null;
  let best=null;
  for(let end=start+1;end<=words.length-left+1;end++){
   const line=words.slice(start,end).join(' '),width=advance(line)*size;if(width>maxWidth+.01)break;
   const rest=balance(end,left-1);if(!rest)continue;
   const score=(width-target)**2+rest.score;
   if(!best||score<best.score)best={score,lines:[line,...rest.lines]};
  }
  memo.set(key,best);return best;
 }
 const lines=balance(0,lineCount)?.lines||greedy;
 if(lines.join(' ')!==words.join(' ')||lines.some(line=>advance(line)*size>maxWidth+.01))throw Error('Title does not fit: '+title);
 return {fontSize:size,lines,widths:lines.map(line=>advance(line)*size)};
}

export function renderTitleImage(title){
 const layout=titleLayout(title),size=layout.fontSize,lineHeight=size*1.48;
 const baselineShift=(semibold.font.ascent+semibold.font.descent)*size/semibold.font.unitsPerEm/2;
 const text=layout.lines.map((line,i)=>'<text x="600" y="'+(302+(i-(layout.lines.length-1)/2)*lineHeight+baselineShift).toFixed(3)+'" text-anchor="middle" direction="rtl" unicode-bidi="embed" font-family="IBM Plex Sans Arabic" font-weight="600" font-size="'+size+'" fill="#f2f3ec">'+escape(line)+'</text>').join('');
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">'+
  '<rect width="1200" height="630" fill="#1c1f20"/><rect x="32" y="32" width="1136" height="566" rx="20" fill="none" stroke="#465a4f" stroke-width="1.5"/>'+
  '<g transform="translate(576 56) scale(1.5)" fill="none" stroke="#a9c6b6" stroke-width="1.5"><path d="M16 8c-4-3-8-3-13-2v20c5-1 9-1 13 2 4-3 8-3 13-2V6c-5-1-9-1-13 2Z"/><path d="M16 8v20M7 12c2-.2 4 .2 6 1M20 13c2-.8 4-1.2 6-1"/></g>'+text+
  '<path d="M552 513.4h96" stroke="#657e6f" stroke-width="2"/><text x="600" y="562.71" text-anchor="middle" direction="rtl" unicode-bidi="embed" font-family="IBM Plex Sans Arabic" font-weight="400" font-size="26" fill="#aec2b5">'+libraryName+'</text></svg>';
 const renderer=new Resvg(svg,{font:{fontFiles:[regular.file,semibold.file],loadSystemFonts:false},languages:['ar'],fitTo:{mode:'original'}});
 const rendered=renderer.render();
 const bytes=rendered.asPng();
 return {bytes,layout,svg};
}
