import {handle,getRevisions} from '@/lib/exchange';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>getRevisions((await params).id,Object.fromEntries(new URL(req.url).searchParams)));}
