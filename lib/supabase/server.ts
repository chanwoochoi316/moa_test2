import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
export async function serverSupabase(){
  const store=await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{
    cookies:{getAll(){return store.getAll();},setAll(items: { name: string; value: string; options: CookieOptions }[]){try{items.forEach(({name,value,options})=>store.set(name,value,options));}catch{/* Server Components are read-only */}}}
  });
}
export function adminSupabase(){
  const key=process.env.SUPABASE_SECRET_KEY;
  if(!key)throw Error("SUPABASE_SECRET_KEY 환경 변수가 없습니다.");
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
