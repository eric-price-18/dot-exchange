import {handle,removePost,assertOrigin,readJson,editContent} from '@/lib/exchange';
export const dynamic='force-dynamic';
export async function DELETE(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>{assertOrigin(req);return removePost(req.headers,(await params).id);});}

export async function PATCH(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>{assertOrigin(req);return editContent(req.headers,(await params).id,await readJson(req));});}
