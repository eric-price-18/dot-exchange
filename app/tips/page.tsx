import ThreadList,{type SearchParams} from '../thread-list';
export const dynamic='force-dynamic';
export default function Tips({searchParams}:{searchParams:SearchParams}){return <ThreadList searchParams={searchParams} tip/>;}
