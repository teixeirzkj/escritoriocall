import { BarChart3, Building2, LayoutDashboard, Users } from "lucide-react";
import Link from "next/link";
import { AppHeader } from "@/components/AppHeader";
import { UsageAlert } from "@/components/admin/UsageAlert";
import { requireUser } from "@/lib/auth";
import { usageAlerts } from "@/lib/plan";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireUser("/admin");
  const isAdmin = profile.role === "admin";
  const alerts = isAdmin ? await usageAlerts() : [];
  return (
    <div className="min-h-dvh">
      <AppHeader profile={profile} />
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-8 md:grid-cols-[200px_1fr]">
        {isAdmin && (
          <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Administração">
            <AdminLink href="/admin" icon={<LayoutDashboard size={16} />}>Visão geral</AdminLink>
            <AdminLink href="/admin/usuarios" icon={<Users size={16} />}>Usuários</AdminLink>
            <AdminLink href="/admin/escritorios" icon={<Building2 size={16} />}>Clientes e sedes</AdminLink>
            <AdminLink href="/admin/uso" icon={<BarChart3 size={16} />}>Uso e custos</AdminLink>
          </nav>
        )}
        <main className={`min-w-0 ${isAdmin ? "" : "md:col-span-2"}`}>
          {alerts.length > 0 && (
            <div className="mb-6">
              <UsageAlert alerts={alerts} />
            </div>
          )}
          {children}
        </main>
      </div>
    </div>
  );
}

function AdminLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--muted)] hover:bg-white/5 hover:text-white">
      {icon}
      {children}
    </Link>
  );
}
