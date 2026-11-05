import type { Metadata } from "next";
import { LoginForm } from "@/components/auth/AuthForms";
import { safeNext } from "@/lib/safe-next";

export const metadata: Metadata = { title: "Entrar" };

const NOTICES: Record<string, string> = {
  confirmado: "E-mail confirmado! Entre para continuar.",
  "senha-alterada": "Senha alterada. Entre com a nova senha.",
  saiu: "Você saiu da sua conta.",
};

const ERRORS: Record<string, string> = {
  link: "O link expirou ou já foi usado. Peça um novo.",
  perfil: "Não encontramos seu perfil. Entre novamente.",
};

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const notice = (sp.aviso && NOTICES[sp.aviso]) || (sp.erro && ERRORS[sp.erro]) || undefined;
  return <LoginForm next={safeNext(sp.next)} notice={notice} />;
}
