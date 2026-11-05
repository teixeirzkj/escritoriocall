"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

function Field({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-[var(--text)]">{label}</span>
      <input {...props} className="input h-11" />
    </label>
  );
}

function Alert({ tone, children }: { tone: "error" | "ok"; children: React.ReactNode }) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-xl border px-3 py-2.5 text-sm ${tone === "error" ? "border-[var(--coral)]/40 bg-[var(--coral)]/10 text-[#ffb4ad]" : "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"}`}
    >
      {children}
    </div>
  );
}

function client() {
  try {
    return { sb: supabaseBrowser(), error: null as string | null };
  } catch (e) {
    return { sb: null, error: e instanceof Error ? e.message : "Supabase não configurado" };
  }
}

function translate(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "E-mail ou senha incorretos.";
  if (m.includes("email not confirmed")) return "Confirme seu e-mail antes de entrar (veja sua caixa de entrada).";
  if (m.includes("user already registered")) return "Já existe uma conta com este e-mail.";
  if (m.includes("password should be")) return "A senha precisa ter pelo menos 8 caracteres.";
  if (m.includes("rate limit") || m.includes("too many")) return "Muitas tentativas. Aguarde um pouco e tente de novo.";
  if (m.includes("same password")) return "A nova senha precisa ser diferente da atual.";
  return msg;
}

export function LoginForm({ next, notice }: { next: string; notice?: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const { sb, error: cfg } = client();
        if (!sb) return setError(cfg);
        setBusy(true);
        setError(null);
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
        if (error) {
          setBusy(false);
          return setError(translate(error.message));
        }
        router.replace(next);
        router.refresh();
      }}
    >
      <div>
        <h1 className="font-pixel text-2xl text-white">Bem-vindo de volta</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Entre para voltar ao escritório.</p>
      </div>
      {notice && <Alert tone="ok">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field label="Senha" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      <div className="flex justify-end">
        <Link href="/recuperar-senha" className="text-sm text-[var(--amber)] hover:underline">Esqueci minha senha</Link>
      </div>
      <button type="submit" disabled={busy} className="btn-primary h-11 w-full">{busy ? "Entrando…" : "Entrar"}</button>
      <p className="text-center text-sm text-[var(--muted)]">
        Não tem conta? <Link href={`/cadastro${next !== "/escritorio" ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-[var(--amber)] hover:underline">Criar conta</Link>
      </p>
    </form>
  );
}

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  if (sent) {
    return (
      <div className="space-y-4 text-center">
        <h1 className="font-pixel text-2xl text-white">Confira seu e-mail</h1>
        <p className="text-sm text-[var(--muted)]">
          Enviamos um link de confirmação para <strong className="text-white">{email}</strong>. Depois de confirmar, você
          monta seu personagem e entra no escritório.
        </p>
        <Link href="/entrar" className="btn-ghost h-11 w-full">Ir para o login</Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const display = name.trim();
        if (display.length < 2 || display.length > 32) return setError("O nome deve ter entre 2 e 32 caracteres.");
        if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
        const { sb, error: cfg } = client();
        if (!sb) return setError(cfg);
        setBusy(true);
        setError(null);
        const personagem = `/personagem?next=${encodeURIComponent(next)}`;
        const { data, error } = await sb.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { display_name: display },
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(personagem)}`,
          },
        });
        setBusy(false);
        if (error) return setError(translate(error.message));
        if (data.session) {
          router.replace(personagem);
          router.refresh();
        } else {
          setSent(true);
        }
      }}
    >
      <div>
        <h1 className="font-pixel text-2xl text-white">Crie sua conta</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Em seguida você monta seu personagem.</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Nome" autoComplete="name" required minLength={2} maxLength={32} value={name} onChange={(e) => setName(e.target.value)} />
      <Field label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
      <Field label="Senha" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      <p className="-mt-2 text-xs text-[var(--muted)]">Mínimo de 8 caracteres.</p>
      <button type="submit" disabled={busy} className="btn-primary h-11 w-full">{busy ? "Criando…" : "Criar conta"}</button>
      <p className="text-center text-sm text-[var(--muted)]">
        Já tem conta? <Link href="/entrar" className="text-[var(--amber)] hover:underline">Entrar</Link>
      </p>
    </form>
  );
}

export function ForgotForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const { sb, error: cfg } = client();
        if (!sb) return setError(cfg);
        setBusy(true);
        setError(null);
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/nova-senha`,
        });
        setBusy(false);
        if (error) return setError(translate(error.message));
        setSent(true);
      }}
    >
      <div>
        <h1 className="font-pixel text-2xl text-white">Recuperar senha</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Enviaremos um link para você criar uma nova senha.</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      {sent ? (
        <Alert tone="ok">Se existir uma conta com este e-mail, o link chega em instantes. Confira também o spam.</Alert>
      ) : (
        <>
          <Field label="E-mail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" disabled={busy} className="btn-primary h-11 w-full">{busy ? "Enviando…" : "Enviar link"}</button>
        </>
      )}
      <p className="text-center text-sm text-[var(--muted)]">
        <Link href="/entrar" className="text-[var(--amber)] hover:underline">Voltar ao login</Link>
      </p>
    </form>
  );
}

export function NewPasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        if (password.length < 8) return setError("A senha precisa ter pelo menos 8 caracteres.");
        if (password !== confirm) return setError("As senhas não coincidem.");
        const { sb, error: cfg } = client();
        if (!sb) return setError(cfg);
        setBusy(true);
        setError(null);
        const { error } = await sb.auth.updateUser({ password });
        setBusy(false);
        if (error) return setError(translate(error.message));
        router.replace("/escritorio");
        router.refresh();
      }}
    >
      <div>
        <h1 className="font-pixel text-2xl text-white">Nova senha</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Escolha uma nova senha para sua conta.</p>
      </div>
      {error && <Alert tone="error">{error}</Alert>}
      <Field label="Nova senha" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
      <Field label="Confirmar senha" type="password" autoComplete="new-password" required minLength={8} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <button type="submit" disabled={busy} className="btn-primary h-11 w-full">{busy ? "Salvando…" : "Salvar nova senha"}</button>
    </form>
  );
}
