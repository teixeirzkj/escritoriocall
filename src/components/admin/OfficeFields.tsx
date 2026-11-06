import type { Office } from "@/lib/types";

/** Campos do formulário de escritório (criar/editar). */
export function OfficeFields({ office, isAdmin = true }: { office?: Office; isAdmin?: boolean }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Labeled label="Nome">
        <input name="name" required minLength={2} maxLength={60} defaultValue={office?.name} className="input h-10 text-sm" />
      </Labeled>
      <Labeled label="Endereço" hint="Aparece na URL: /escritorio/endereco">
        <input name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" defaultValue={office?.slug} className="input h-10 text-sm" placeholder="minha-equipe" />
      </Labeled>
      <Labeled label="Descrição" className="sm:col-span-2">
        <input name="description" maxLength={280} defaultValue={office?.description ?? ""} className="input h-10 text-sm" />
      </Labeled>
      <Labeled label="Raio de proximidade (px)" hint="Distância para começar a ouvir alguém. 32px = 1 tile.">
        <input name="proximity_radius" type="number" min={48} max={480} step={8} required defaultValue={office?.proximity_radius ?? 208} className="input h-10 text-sm" />
      </Labeled>
      <Labeled label="Ao se afastar">
        <select name="proximity_mode" defaultValue={office?.proximity_mode ?? "fade"} className="input h-10 text-sm">
          <option value="fade">Reduzir o volume aos poucos</option>
          <option value="cutoff">Encerrar ao sair do raio</option>
        </select>
      </Labeled>
      <Labeled label="Máximo de pessoas online">
        <input name="max_online" type="number" min={1} max={isAdmin ? 500 : 50} required defaultValue={Math.min(office?.max_online ?? 25, isAdmin ? 500 : 50)} className="input h-10 text-sm" />
      </Labeled>
    </div>
  );
}

export function Labeled({ label, hint, className = "", children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-medium text-[var(--muted)]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-[#6f758a]">{hint}</span>}
    </label>
  );
}
