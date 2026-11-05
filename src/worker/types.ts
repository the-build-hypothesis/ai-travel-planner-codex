export interface Env {
 DB: D1Database; ASSETS: Fetcher;
 LLM_PROVIDER?: string; LLM_MODEL?: string; OPENAI_API_KEY?: string; GOOGLE_MAPS_API_KEY?: string;
 EMAIL_FROM?: string; EMAIL?: {send(message:{from:string;to:string;subject:string;text:string;html?:string}):Promise<{messageId:string}>};
 APP_PUBLIC_URL: string; PRICING_JSON?: string;
}
export type Row = Record<string, any>;
export type Identity = {user:Row|null;guestId:string|null;sessionHash:string};
export class HttpError extends Error {constructor(public status:number,message:string){super(message)}}
export const now=()=>new Date().toISOString();
export const id=()=>crypto.randomUUID();
export const json=(data:unknown,status=200)=>Response.json(data,{status});
export async function body(req:Request) {if(Number(req.headers.get('content-length'))>32768)throw new HttpError(413,'Request too large');const raw=await req.text();if(raw.length>32768)throw new HttpError(413,'Request too large');try{return JSON.parse(raw)}catch{throw new HttpError(400,'Invalid JSON')}}
export const all=async(db:D1Database,sql:string,...args:unknown[])=>(await db.prepare(sql).bind(...args).all<Row>()).results;
