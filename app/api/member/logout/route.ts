import { NextRequest } from "next/server";
import { reply, requireSameOrigin, respondError } from "@/lib/http";
import { MEMBER_COOKIE } from "@/lib/tenant-session";
export async function POST(req:NextRequest) {
  try {
    requireSameOrigin(req);
    const res=reply({ok:true});
    res.cookies.set(MEMBER_COOKIE,"",{
      httpOnly:true,secure:process.env.NODE_ENV==="production",
      sameSite:"strict",maxAge:0,path:"/"
    });
    return res;
  }catch(error){return respondError(error);}
}
