import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { NewPasswordForm } from "@/components/auth/AuthForms";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Nova senha" };

export default async function Page() {
  // O link de recuperação cria uma sessão temporária; sem ela, não há o que alterar.
  const { user } = await getSessionUser();
  if (!user) redirect("/entrar?erro=link");
  return <NewPasswordForm />;
}
