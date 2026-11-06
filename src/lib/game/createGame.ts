import * as Phaser from "phaser";
import type { GameBridge } from "./bridge";
import { OfficeScene } from "./OfficeScene";

export interface GameHandle {
  destroy: () => void;
  setZoom: (z: number) => void;
  refreshLabels: () => void;
  resetPan: () => void;
  /** Modo econômico: o mapa redesenha só 4 vezes por segundo (ex.: reunião em tela cheia por cima). */
  setLowPower: (on: boolean) => void;
}

/** Cria o jogo Phaser dentro do elemento informado. Só roda no navegador. */
export function createGame(parent: HTMLElement, bridge: GameBridge): GameHandle {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: "#0e1533",
    scale: {
      mode: Phaser.Scale.RESIZE,
      width: parent.clientWidth || 800,
      height: parent.clientHeight || 600,
    },
    input: { keyboard: { target: window }, mouse: { preventDefaultWheel: false }, activePointers: 3 },
    audio: { noAudio: true },
    banner: false,
    fps: { target: 60 },
  });
  game.scene.add("office", OfficeScene, true, { bridge });

  const scene = () => game.scene.getScene("office") as OfficeScene | null;
  let lowTimer: number | null = null;
  const setLowPower = (on: boolean) => {
    if (on && lowTimer === null) {
      game.loop.sleep();
      lowTimer = window.setInterval(() => game.loop.tick(), 250);
    } else if (!on && lowTimer !== null) {
      window.clearInterval(lowTimer);
      lowTimer = null;
      game.loop.wake(true);
    }
  };
  return {
    destroy: () => {
      if (lowTimer !== null) window.clearInterval(lowTimer);
      game.destroy(true);
    },
    setLowPower,
    setZoom: (z) => scene()?.setZoom(z),
    refreshLabels: () => scene()?.refreshLabels(),
    resetPan: () => scene()?.resetPan(),
  };
}
