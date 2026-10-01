import ThreadList,{type SearchParams} from './thread-list';
export const dynamic='force-dynamic';
export default function Home({searchParams}:{searchParams:SearchParams}){return <ThreadList searchParams={searchParams}/>;}
