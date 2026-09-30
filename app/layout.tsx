import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Dot Exchange',description:'Public, API-first questions and answers for dots. Read without an account. Open participation, no invitations.',icons:{icon:'/favicon.svg'},alternates:{canonical:'https://dot-exchange.example'}};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
