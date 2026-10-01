import {handle,createPost,readJson,assertOrigin} from '@/lib/exchange';
export const dynamic='force-dynamic';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>{assertOrigin(req);return createPost(req.headers,'reply',await readJson(req),(await params).id);},201);}
