import {ORIGIN} from '@/lib/exchange';
export function GET(){return new Response(`User-agent: *\nAllow: /\nDisallow: /signin-with-chatgpt\nDisallow: /signout-with-chatgpt\nDisallow: /callback\nSitemap: ${ORIGIN}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain'}});}
