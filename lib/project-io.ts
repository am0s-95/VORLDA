import {validateGraph,type Graph} from './world.ts';
export const BUNDLE_ASSET_BYTES=16*1024*1024;
export type EmbeddedAsset={path:string;name:string;type:string;data:string};
export type ProjectBundle={format:'vorlda-project';version:1;name:string;graph:Graph;assets:EmbeddedAsset[];revision?:number;entry?:string;runtime?:{admin:boolean}};
export function validateProjectBundle(value:unknown):ProjectBundle{
 if(!value||typeof value!=='object')throw Error('Invalid project file.');
 const v=value as Record<string,any>;
 if(v.format!==undefined&&v.format!=='vorlda-project'||v.version!==undefined&&v.version!==1)throw Error('Unsupported project format or version.');
 const graph=validateGraph(v.graph||v),assets=v.assets||[];
 if(!Array.isArray(assets)||assets.length>1000)throw Error('Invalid asset list.');
 let total=0;const paths=new Set<string>();
 for(const a of assets){
  if(!a||typeof a.path!=='string'||!/^\/api\/assets\/[\w-]+$/.test(a.path)||paths.has(a.path)||typeof a.name!=='string'||!a.name.length||a.name.length>240||typeof a.type!=='string'||typeof a.data!=='string')throw Error('Invalid or duplicate embedded asset.');
  const m=a.data.match(/^data:([\w.+-]+\/[\w.+-]+);base64,([A-Za-z0-9+/]*={0,2})$/);
  if(!m||m[1]!==a.type||m[2].length%4||! /^(image\/(png|jpeg|webp|gif)|video\/(mp4|webm)|audio\/(mpeg|mp4|wav|ogg|webm|flac)|application\/(pdf|json)|text\/csv)$/.test(a.type))throw Error('Invalid embedded asset type or encoding.');
  total+=m[2].length/4*3-(m[2].endsWith('==')?2:m[2].endsWith('=')?1:0);paths.add(a.path);
  if(total>BUNDLE_ASSET_BYTES)throw Error('This browser export/import supports up to 16 MiB of embedded assets. Split large media projects first.');
 }
 if(v.entry!==undefined&&!graph.pieces.some(p=>p.id===v.entry&&p.type==='page'&&!p.hidden))throw Error('Invalid entry page.');
 if(v.runtime!==undefined&&(!v.runtime||typeof v.runtime!=='object'||typeof v.runtime.admin!=='boolean'))throw Error('Invalid runtime capabilities.');
 // Only non-secret capability metadata crosses the source/import boundary.
 return {format:'vorlda-project',version:1,name:String(v.name||'VORLDA app').slice(0,160),graph,assets,revision:Number.isSafeInteger(v.revision)?v.revision:undefined,entry:v.entry,...(v.runtime?{runtime:{admin:v.runtime.admin}}:{})};
}
