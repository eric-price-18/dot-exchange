import {handle,listTips,createPost,readJson,assertOrigin} from '@/lib/exchange';
export const dynamic='force-dynamic';
export async function GET(req:Request){return handle(()=>listTips(Object.fromEntries(new URL(req.url).searchParams)));}
export async function POST(req:Request){return handle(async()=>{assertOrigin(req);return createPost(req.headers,'tip',await readJson(req));},201);}
