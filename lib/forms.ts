import { descendants,effectivePiece,type Graph,type Piece } from './world.ts';

export function formIsVisible(graph:Graph,pieceId:string){let current=graph.pieces.find(p=>p.id===pieceId);if(!current)return false;while(current){if(effectivePiece(graph,current).hidden)return false;current=graph.pieces.find(p=>p.id===current?.parentId);}return true;}

export function formFields(graph:Graph,pieceId:string){
    const form=graph.pieces.find(p=>p.id===pieceId&&p.type==='form');
    if(!form || !formIsVisible(graph,pieceId))throw Error('Form not found.');
    const visible=(p:Piece):boolean=>{let current:Piece|undefined=p;while(current){if(effectivePiece(graph,current).hidden)return false;if(current.id!==pieceId&&current.type==='form')throw Error('Nested forms are not supported.');current=graph.pieces.find(x=>x.id===current?.parentId);}return true;};
    if(!visible(form))throw Error('Form not found.');
    const fields=descendants(graph,pieceId,false).filter(p=>p.type==='input'&&visible(p)).map(p=>effectivePiece(graph,p));
    const seen=new Set<string>();
    return fields.filter(p=>!p.hidden).map(p=>{
        const key=String(p.props.field||p.id),type=String(p.props.inputType||'text');
        if(!key.length||key.length>100||/[\u0000-\u001f]/.test(key)||['__proto__','constructor','prototype'].includes(key)||seen.has(key))throw Error('Invalid or duplicate form field.');
        if(type==='password')throw Error('Generic forms must not collect passwords. Configure a dedicated authentication service.');
        seen.add(key);return {key,type,name:p.name,required:!!p.props.required};
    });
}
export function validateFormResponse(graph:Graph,pieceId:string,input:unknown):Record<string,string>{
    if(!input || typeof input!=='object' || Array.isArray(input))throw Error('Invalid form response.');
    const fields=formFields(graph,pieceId),source=input as Record<string,unknown>,out:Record<string,string>={};
    for(const key of Object.keys(source))if(!fields.some(f=>f.key===key))throw Error('Unknown form field.');
    for(const field of fields){
        const raw=Object.hasOwn(source,field.key)?source[field.key]??'':'';
        if(!['string','number','boolean'].includes(typeof raw))throw Error('Form values must be text.');
        const value=String(raw);if(value.length>4000)throw Error(field.name+' is too long.');
        if(field.required&&!value.trim())throw Error(field.name+' is required.');
        if(value&&field.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error(field.name+' requires an email address.');
        if(value&&field.type==='number'&&!Number.isFinite(Number(value)))throw Error(field.name+' requires a number.');
        out[field.key]=value;
    }
    return out;
}
