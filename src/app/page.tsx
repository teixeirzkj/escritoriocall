import {
  ArrowRight,
  Headphones,
  Lock,
  MessagesSquare,
  MonitorUp,
  Palette,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { MapPreview } from "@/components/MapPreview";

const FEATURES = [
  {
    icon: Headphones,
    color: "#2b6af3",
    title: "Áudio por proximidade",
    text: "Chegue perto de alguém e a conversa começa sozinha. Afaste-se e o som diminui até sumir, como num corredor de verdade.",
  },
  {
    icon: Lock,
    color: "#e0564c",
    title: "Salas que isolam o som",
    text: "Clique numa cadeira e a reunião abre em tela cheia, com câmeras grandes. Quem está fora não escuta nada, e quem está dentro só ouve a sala.",
  },
  {
    icon: MonitorUp,
    color: "#5b8def",
    title: "Vídeo e tela compartilhada",
    text: "Câmera, microfone e compartilhamento de tela em tempo real via WebRTC, direto no navegador. Nada para instalar.",
  },
  {
    icon: MessagesSquare,
    color: "#4fc3a1",
    title: "Chat que não se perde",
    text: "Conversa geral do escritório, chat por sala e mensagens privadas, com histórico salvo e horário de cada mensagem.",
  },
  {
    icon: Palette,
    color: "#c792ea",
    title: "Um personagem com a sua cara",
    text: "Escolha estilo, cabelo, tom de pele, roupa e acessórios. Seu nome aparece acima da cabeça para todo mundo te achar.",
  },
  {
    icon: ShieldCheck,
    color: "#9aa0b4",
    title: "Sua sede, só para quem você convidar",
    text: "Crie a sua sede, renomeie as salas e mande o link de convite. Ninguém mais vê: cada time tem a sua, como servidores.",
  },
];

const ZONES = [
  { name: "Área de trabalho", hint: "12 estações em duas ilhas", color: "#d8c3a2" },
  { name: "Sala Principal", hint: "até 12 pessoas", color: "#4b5d7a" },
  { name: "Sala de Reunião 01", hint: "até 6 pessoas", color: "#5d7a63" },
  { name: "Sala de Reunião 02", hint: "até 4 pessoas", color: "#6b5a7a" },
  { name: "Sala de Reunião 03", hint: "até 2 pessoas", color: "#4f7c7a" },
  { name: "Copa", hint: "café e conversa", color: "#ece8df" },
];

export default function Home() {
  return (
    <div className="relative overflow-x-hidden">
      <div className="pixel-grid pointer-events-none absolute inset-x-0 top-0 h-[900px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-5 py-5">
        <Logo />
        <nav className="flex items-center gap-1 text-sm sm:gap-2">
          <a href="#recursos" className="hidden rounded-lg px-3 py-2 text-[var(--muted)] hover:text-white md:block">Recursos</a>
          <a href="#como-funciona" className="hidden rounded-lg px-3 py-2 text-[var(--muted)] hover:text-white md:block">Como funciona</a>
          <Link href="/entrar" className="rounded-lg px-3 py-2 text-[var(--text)] hover:bg-white/5">Entrar</Link>
          <Link href="/escritorio" className="btn-primary h-10 px-4 text-sm">Meu escritório</Link>
        </nav>
      </header>

      <main className="relative z-10">
        {/* Hero */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-5 pb-16 pt-8 lg:grid-cols-[1fr_1.15fr] lg:pt-14">
          <div>
            <span className="mb-5 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-[var(--muted)]">
              <span className="h-2 w-2 bg-[var(--teal)]" /> escritório virtual · pixel art · tempo real
            </span>
            <h1 className="font-pixel text-5xl leading-[1.02] text-white sm:text-6xl">
              O corredor do escritório,{" "}
              <span className="text-[var(--amber)]">de volta.</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-[var(--muted)]">
              O escritório virtual da Frédy: a equipe caminha, se esbarra e conversa por voz e vídeo só de
              chegar perto. Para reunião, é só clicar numa cadeira da sala.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/escritorio" className="btn-primary h-12 px-6">
                Entrar no escritório <ArrowRight size={18} />
              </Link>
            </div>
            <p className="mt-5 text-xs text-[var(--muted)]">
              Funciona no navegador do computador. No celular, você anda com um joystick na tela.
            </p>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-[radial-gradient(closest-side,rgba(43,106,243,0.22),transparent)]" />
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0e1533] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)]">
              <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#131c42] px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-[#e0564c]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#f0a83a]" />
                <span className="h-2.5 w-2.5 rounded-full bg-[#4fc3a1]" />
                <span className="ml-3 truncate font-pixel text-xs text-[var(--muted)]">frédy / sede</span>
              </div>
              <div className="aspect-[4/3] w-full sm:aspect-[16/11]">
                <MapPreview />
              </div>
            </div>
            <p className="mt-3 text-center text-xs text-[var(--muted)]">
              Prévia do mapa real da plataforma.
            </p>
          </div>
        </section>

        {/* Recursos */}
        <section id="recursos" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-16">
          <div className="mb-10 max-w-2xl">
            <h2 className="font-pixel text-3xl text-white sm:text-4xl">Tudo o que um escritório tem.</h2>
            <p className="mt-3 text-[var(--muted)]">Menos o trânsito e o café frio.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <article key={f.title} className="card group p-6 transition hover:-translate-y-0.5 hover:border-white/15">
                <div
                  className="mb-4 grid h-11 w-11 place-items-center rounded-lg"
                  style={{ background: `${f.color}22`, color: f.color, boxShadow: `inset 0 -3px 0 ${f.color}33` }}
                >
                  <f.icon size={20} />
                </div>
                <h3 className="mb-2 font-semibold text-white">{f.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--muted)]">{f.text}</p>
              </article>
            ))}
          </div>
        </section>

        {/* Como funciona */}
        <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-16">
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <h2 className="font-pixel text-3xl text-white sm:text-4xl">Três passos até a primeira conversa.</h2>
              <ol className="mt-8 space-y-6">
                {[
                  ["Crie sua conta", "Nome, e-mail e senha. Leva menos de um minuto."],
                  ["Monte seu personagem", "Escolha um estilo e ajuste aparência e cores. Dá para mudar depois."],
                  ["Ande até alguém", "Use WASD ou as setas. Chegou perto, já está conversando. Quer reunião? Clique numa cadeira da sala."],
                ].map(([t, d], i) => (
                  <li key={t} className="flex gap-4">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[var(--amber)] font-pixel text-lg text-white">
                      {i + 1}
                    </span>
                    <div>
                      <h3 className="font-semibold text-white">{t}</h3>
                      <p className="text-sm text-[var(--muted)]">{d}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
            <div className="card p-6">
              <h3 className="mb-1 font-semibold text-white">Um escritório inteiro para a sua equipe</h3>
              <p className="mb-5 text-sm text-[var(--muted)]">Cada área tem seu clima, e as salas têm capacidade configurável.</p>
              <ul className="divide-y divide-white/5">
                {ZONES.map((z) => (
                  <li key={z.name} className="flex items-center justify-between py-3 text-sm">
                    <span className="flex items-center gap-3 text-white">
                      <span className="h-3.5 w-3.5 rounded-[3px] border border-black/30" style={{ background: z.color }} />
                      {z.name}
                    </span>
                    <span className="text-[var(--muted)]">{z.hint}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* CTA final */}
        <section className="mx-auto max-w-6xl px-5 pb-20 pt-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[linear-gradient(120deg,#1a2552,#1a2552_60%,#1f2e66)] px-6 py-12 text-center sm:px-12">
            <div className="pixel-grid absolute inset-0 opacity-60" />
            <div className="relative">
              <h2 className="font-pixel text-3xl text-white sm:text-4xl">A porta está aberta.</h2>
              <p className="mx-auto mt-3 max-w-md text-[var(--muted)]">
                Entre, dê uma volta e chame alguém para um café na copa.
              </p>
              <div className="mt-7 flex flex-wrap justify-center gap-3">
                <Link href="/entrar" className="btn-primary h-12 px-6">Entrar</Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-5 py-6 text-xs text-[var(--muted)] sm:flex-row">
          <Logo />
          <p>Escritório virtual com áudio por proximidade, salas privadas e chat.</p>
        </div>
      </footer>
    </div>
  );
}
