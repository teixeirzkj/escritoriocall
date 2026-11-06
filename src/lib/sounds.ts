/**
 * Sons curtos de aviso, gerados com Web Audio (sem arquivos).
 * A preferência (ligado/desligado) fica no navegador de cada pessoa.
 */
const KEY = "fredy:sons";
let ctx: AudioContext | null = null;
/** "Silenciar tudo" ligado: nenhum aviso toca. */
let deafened = false;
export function setSoundsDeafened(v: boolean) {
  deafened = v;
}

export function soundsEnabled(): boolean {
  try {
    return window.localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundsEnabled(on: boolean) {
  try {
    window.localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    /* sem armazenamento: fica só nesta sessão */
  }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  if (ctx.state === "suspended") void ctx.resume().catch(() => {});
  return ctx;
}

function note(ac: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, peak: number) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(peak, start + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(start);
  osc.stop(start + dur + 0.05);
}

/**
 * "office": alguém chegou na sede (2 notas). "room": alguém entrou na sua sala (3 notas).
 * "ring": alguém está te chamando (toca 2x). "knock": batida na porta da sala.
 */
export function playChime(kind: "office" | "room" | "ring" | "knock") {
  if (deafened || !soundsEnabled()) return;
  const ac = audio();
  if (!ac) return;
  const t = ac.currentTime + 0.01;
  if (kind === "ring") {
    for (const off of [0, 0.7]) {
      note(ac, 880, t + off, 0.18, "square", 0.07);
      note(ac, 1108.73, t + off + 0.18, 0.18, "square", 0.07);
      note(ac, 1318.51, t + off + 0.36, 0.3, "square", 0.07);
    }
    return;
  }
  if (kind === "knock") {
    // toc-toc: dois toques graves e curtos
    note(ac, 180, t, 0.08, "triangle", 0.5);
    note(ac, 180, t + 0.16, 0.08, "triangle", 0.5);
    note(ac, 160, t + 0.5, 0.08, "triangle", 0.45);
    note(ac, 160, t + 0.66, 0.08, "triangle", 0.45);
    return;
  }
  if (kind === "office") {
    note(ac, 659.25, t, 0.35, "sine", 0.18);
    note(ac, 880, t + 0.14, 0.5, "sine", 0.16);
  } else {
    note(ac, 523.25, t, 0.3, "triangle", 0.2);
    note(ac, 659.25, t + 0.11, 0.3, "triangle", 0.2);
    note(ac, 783.99, t + 0.22, 0.55, "triangle", 0.2);
  }
}
