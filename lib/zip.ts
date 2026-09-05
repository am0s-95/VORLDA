// Uncompressed ZIP (STORE): portable exports without a server or additional package.
export function zipFiles(files:{name:string;content:string}[]):Blob {
 const encoder=new TextEncoder(),parts:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
 const crc=(bytes:Uint8Array)=>{let n=0xffffffff;for(const byte of bytes){n^=byte;for(let j=0;j<8;j++)n=(n>>>1)^((n&1)?0xedb88320:0);}return(n^0xffffffff)>>>0;};
 for(const file of files){const name=encoder.encode(file.name.replace(/[/\\]/g,'_')),data=encoder.encode(file.content),sum=crc(data),header=new Uint8Array(30+name.length),v=new DataView(header.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint32(14,sum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);header.set(name,30);parts.push(header,data);
 const h=new Uint8Array(46+name.length),d=new DataView(h.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint32(16,sum,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,name.length,true);d.setUint32(42,offset,true);h.set(name,46);central.push(h);offset+=header.length+data.length;}
 const end=new Uint8Array(22),d=new DataView(end.buffer);d.setUint32(0,0x06054b50,true);d.setUint16(8,files.length,true);d.setUint16(10,files.length,true);d.setUint32(12,central.reduce((n,c)=>n+c.length,0),true);d.setUint32(16,offset,true);return new Blob([...parts,...central,end] as BlobPart[],{type:'application/zip'});
}
