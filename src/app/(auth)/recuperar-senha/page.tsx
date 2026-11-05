import type { Metadata } from "next";
import { ForgotForm } from "@/components/auth/AuthForms";

export const metadata: Metadata = { title: "Recuperar senha" };

export default function Page() {
  return <ForgotForm />;
}
