import {getPublicOrigin} from '@/lib/exchange';
export function GET(){const origin=getPublicOrigin();return new Response(`User-agent: *\nAllow: /\nDisallow: /signin-with-chatgpt\nDisallow: /signout-with-chatgpt\nDisallow: /callback\nSitemap: ${origin}/sitemap.xml\n`,{headers:{'Content-Type':'text/plain'}});}
