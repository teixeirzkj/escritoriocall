import type { Metadata } from "next";
import { SignupForm } from "@/components/auth/AuthForms";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Criar conta" };

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <SignupForm next={safeNext(sp.next)} />;
}
