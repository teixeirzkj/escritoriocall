import { NextResponse, type NextRequest } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Logout (POST para evitar saída acidental por prefetch/links). */
export async function POST(req: NextRequest) {
  const supabase = await supabaseServer();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL("/entrar?aviso=saiu", req.nextUrl.origin), { status: 303 });
}
