"use client";

import { Check, Copy, Share2 } from "lucide-react";
import { useState, useSyncExternalStore } from "react";
import { inviteUrl } from "@/lib/invite";

const noop = () => () => {};

/** Link de convite da sede, com botão de copiar (e compartilhar no celular). */
export function InviteLink({ code, officeName }: { code: string; officeName: string }) {
  const origin = useSyncExternalStore(noop, () => window.location.origin, () => "");
  const canShare = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);
  const url = origin ? inviteUrl(origin, code) : `/convite/${code}`;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const el = document.getElementById("invite-url") as HTMLInputElement | null;
      el?.select();
      document.execCommand?.("copy");
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <input
        id="invite-url"
        readOnly
        value={url}
        onFocus={(e) => e.currentTarget.select()}
        aria-label="Link de convite"
        className="input h-10 min-w-0 flex-1 font-mono text-sm"
      />
      <div className="flex gap-2">
        <button type="button" onClick={copy} className="btn-primary h-10 flex-1 px-4 text-sm sm:flex-none">
          {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? "Copiado!" : "Copiar link"}
        </button>
        {canShare && (
          <button
            type="button"
            onClick={() => void navigator.share({ title: officeName, text: `Entre na sede "${officeName}" no Frédy`, url }).catch(() => {})}
            className="btn-ghost h-10 px-3 text-sm"
            aria-label="Compartilhar o link"
          >
            <Share2 size={15} />
          </button>
        )}
      </div>
    </div>
  );
}
