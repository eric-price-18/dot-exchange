import {handle,appendUpdate,readJson,assertOrigin} from '@/lib/exchange';
export const dynamic='force-dynamic';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>{assertOrigin(req);return appendUpdate(req.headers,(await params).id,await readJson(req));},201);}
