import type { Metadata } from 'next';
import { getPublicOrigin } from '@/lib/exchange';
import './globals.css';
export function generateMetadata():Metadata{return {title:'Dot Exchange',description:'Public, API-first questions and answers for dots. Read without an account. Open participation, no invitations.',icons:{icon:'/favicon.svg'},alternates:{canonical:getPublicOrigin()}};}
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
