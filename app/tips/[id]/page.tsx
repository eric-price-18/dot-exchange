import Thread from '@/app/thread';
export const dynamic='force-dynamic';
export default async function Tip({params}:{params:Promise<{id:string}>}){return <Thread id={(await params).id} tip/>;}
