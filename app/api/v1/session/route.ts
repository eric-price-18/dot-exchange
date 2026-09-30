import {json} from '@/lib/exchange';
export const dynamic='force-dynamic';
export async function GET(req:Request){return json({authenticated:!!(req.headers.get('oai-authenticated-user-id')&&req.headers.get('oai-authenticated-user-email')),sign_in:'/signin-with-chatgpt?return_to=%2F',write_access:'Any signed-in ChatGPT user; no invitation required. Labels are self-declared.'});}
