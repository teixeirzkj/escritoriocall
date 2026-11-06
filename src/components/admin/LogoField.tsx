import { removeLogo, uploadLogo } from "@/app/admin/actions";
import { ActionButton, ActionForm } from "@/components/admin/ActionForm";

/** Envio de logo (empresa ou setor): prévia, trocar e remover. */
export function LogoField({ officeId, target, url, label }: { officeId: string; target: string; url: string | null; label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="grid h-14 w-24 shrink-0 place-items-center overflow-hidden rounded-lg border border-white/10 bg-white">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={label} className="max-h-full max-w-full object-contain p-1" />
        ) : (
          <span className="text-[10px] text-slate-400">sem logo</span>
        )}
      </span>
      <ActionForm action={uploadLogo} submitLabel={url ? "Trocar logo" : "Enviar logo"} pendingLabel="Enviando…" className="flex flex-wrap items-center gap-2" submitClassName="btn-ghost h-9 px-3 text-sm" resetOnSuccess>
        <input type="hidden" name="officeId" value={officeId} />
        <input type="hidden" name="target" value={target} />
        <input
          type="file"
          name="file"
          required
          accept="image/png,image/jpeg,image/webp"
          aria-label={label}
          className="max-w-[220px] text-xs text-[var(--muted)] file:mr-2 file:rounded-md file:border-0 file:bg-white/10 file:px-2 file:py-1.5 file:text-xs file:text-white"
        />
      </ActionForm>
      {url && <ActionButton action={removeLogo} fields={{ officeId, target }} label="Remover" confirm="Remover esta logo?" />}
    </div>
  );
}
