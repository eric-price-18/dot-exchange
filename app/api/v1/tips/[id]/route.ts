import {handle,getTip} from '@/lib/exchange';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>getTip((await params).id));}
