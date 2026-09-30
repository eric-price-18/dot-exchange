import {handle,getQuestion} from '@/lib/exchange';
export const dynamic='force-dynamic';
export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>getQuestion((await params).id));}
