import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';
// Bounded native PNG inspection, not a renderer or generated evidence. Only
// Chromium canvas RGB/RGBA, 8-bit noninterlaced PNGs are accepted.
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
export const crc32=bytes=>{let crc=0xffffffff;for(const b of bytes)crc=crcTable[(crc^b)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;};
export function decodeCourtyardPNG(bytes){
  assert(Buffer.isBuffer(bytes)&&bytes.length>=100&&bytes.length<=6000000,'PNG byte bound');
  assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  let p=8,header=null,end=false,started=false,closed=false;const chunks=[];
  while(p<bytes.length){
    assert(p+12<=bytes.length);const n=bytes.readUInt32BE(p),type=bytes.toString('ascii',p+4,p+8);assert(n<=6000000&&p+12+n<=bytes.length);
    const data=bytes.subarray(p+8,p+8+n);assert.equal(crc32(bytes.subarray(p+4,p+8+n)),bytes.readUInt32BE(p+8+n),'PNG CRC');
    if(type==='IHDR'){assert.equal(p,8);assert.equal(n,13);header={width:data.readUInt32BE(0),height:data.readUInt32BE(4),channels:data[9]===6?4:data[9]===2?3:0};assert(data[8]===8&&header.channels&&data[10]===0&&data[11]===0&&data[12]===0);assert(header.width>0&&header.height>0&&header.width<=2048&&header.height<=2048&&header.width*header.height<=2500000);}
    else if(type==='IDAT'){assert(header&&!closed);chunks.push(data);started=true;}
    else if(type==='IEND'){assert.equal(n,0);assert(started);assert.equal(p+12,bytes.length);end=true;}
    else{assert(header&&!end);if(started)closed=true;assert(type[0]===type[0].toLowerCase(),'Unsupported critical PNG chunk');}
    p+=n+12;
  }
  assert(header&&end&&chunks.length);const {width,height,channels}=header,stride=width*channels;
  const raw=inflateSync(Buffer.concat(chunks),{maxOutputLength:(stride+1)*height});assert.equal(raw.length,(stride+1)*height);
  const pixels=Buffer.alloc(stride*height);let at=0;
  const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};
  for(let y=0;y<height;y++){const filter=raw[at++];assert(filter<=4);for(let x=0;x<stride;x++){
    const left=x>=channels?pixels[y*stride+x-channels]:0,up=y?pixels[(y-1)*stride+x]:0,corner=y&&x>=channels?pixels[(y-1)*stride+x-channels]:0;
    const predict=[0,left,up,Math.floor((left+up)/2),paeth(left,up,corner)][filter];pixels[y*stride+x]=(raw[at++]+predict)&255;
  }}
  return {width,height,channels,pixel(x,y){assert(Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<width&&y<height);const i=(y*width+x)*channels;return [...pixels.subarray(i,i+3),channels===4?pixels[i+3]:255];}};
}
