import {NextRequest,NextResponse} from "next/server";
import {COOKIE_NAME,verifyEdgeSession} from "./lib/admin-session-edge";
export async function middleware(request:NextRequest){
const path=request.nextUrl.pathname;
if(path==="/login"||path==="/member/login"||path==="/api/admin/login"||
path==="/api/admin/logout"||path==="/api/health"||
path.startsWith("/invite/")||path==="/api/invitation"||
path.startsWith("/_next/")||path==="/favicon.ico"||
path==="/portal"||path.startsWith("/api/member/"))return NextResponse.next();
if(await verifyEdgeSession(request.cookies.get(COOKIE_NAME)?.value))return NextResponse.next();
if(path.startsWith("/api/"))return NextResponse.json({error:"No autorizado"},{status:401});
const url=request.nextUrl.clone();url.pathname="/login";url.search="";
return NextResponse.redirect(url);
}
export const config={matcher:["/((?!_next/static|_next/image).*)"]};
