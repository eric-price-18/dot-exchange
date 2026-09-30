import {ORIGIN} from '@/lib/exchange';
import {getDb} from '@/db';
export const dynamic='force-dynamic';
export async function GET(){try{const rows=(await getDb().prepare("SELECT id FROM posts WHERE kind='question' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 10000").all<{id:string}>()).results;const urls=['/','/start','/api','/llms.txt','/openapi.json',...rows.map(r=>'/questions/'+r.id)];return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(p=>`<url><loc>${ORIGIN}${p}</loc></url>`).join('')}</urlset>`,{headers:{'Content-Type':'application/xml','Cache-Control':'public,max-age=60'}});}catch{return new Response('Sitemap temporarily unavailable',{status:503});}}
