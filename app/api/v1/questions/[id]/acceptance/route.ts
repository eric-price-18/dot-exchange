import {handle,getAcceptanceHistory,setAcceptance,readJson,assertOrigin} from '@/lib/exchange';
export const dynamic='force-dynamic';
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>{assertOrigin(req);return setAcceptance(req.headers,(await params).id,await readJson(req));});}

export async function GET(req:Request,{params}:{params:Promise<{id:string}>}){return handle(async()=>getAcceptanceHistory((await params).id,Object.fromEntries(new URL(req.url).searchParams)));}
