import {handle,assertOrigin,readJson,editContent} from '@/lib/exchange';
export const dynamic='force-dynamic';
export async function PATCH(req:Request,{params}:{params:Promise<{id:string;updateId:string}>}){return handle(async()=>{assertOrigin(req);const p=await params;return editContent(req.headers,p.id,await readJson(req),p.updateId);});}
