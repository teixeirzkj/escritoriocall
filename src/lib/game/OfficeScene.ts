import * as Phaser from "phaser";
import { avatarKey, type AvatarConfig } from "@/lib/avatar";
import { CHAR_H, CHAR_W, DIRS, drawCharacterSheet, frameRect, type Dir } from "./art/characters";
import { drawBackground, drawItemCanvas, itemTextureKey, spriteItems } from "./art/environment";
import { isRoomTheme, PLAIN_PLATE, ROOM_THEMES } from "@/lib/brand";
import type { GameBridge } from "./bridge";
import {
  buildCollisionGrid,
  DESK_SEATS,
  inPool,
  INTERACTIONS,
  ITEM_DEFS,
  moveWithCollision,
  nearestFree,
  ROOM_DECOR,
  TILE,
  WORLD_H,
  WORLD_W,
  zoneAtPoint,
} from "./map";

const NAVY = "#0e1533";
const BRAND = 0x2b6af3;

const SPEED = 150; // px/s
const NAME_FONT = '600 11px "Inter", system-ui, sans-serif';
const LABEL_DEPTH = 1_000_000;

interface Avatar {
  container: Phaser.GameObjects.Container;
  tag: Phaser.GameObjects.Container;
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  mic: Phaser.GameObjects.Graphics;
  ring: Phaser.GameObjects.Graphics;
  /** Item na mão (emoji). */
  held: Phaser.GameObjects.Text;
  heldItem: string | null;
  heldDir: Dir | null;
  texKey: string;
  name: string;
  micOn: boolean;
  speaking: boolean;
  near: boolean;
  inMeeting: boolean;
  dir: Dir;
  walking: boolean;
  /** Dentro da piscina (aparece só da cintura para cima). */
  swim: boolean;
  jumping: boolean;
}

/** Cena principal do escritório. */
export class OfficeScene extends Phaser.Scene {
  private bridge!: GameBridge;
  private grid!: Uint8Array;
  private me!: Avatar;
  private others = new Map<string, Avatar>();
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private zoneKey: string | null = null;
  private radiusGfx!: Phaser.GameObjects.Graphics;
  private lastEmit = { x: 0, y: 0, moving: false, dir: "down" as Dir };
  /** Deslocamento do mapa feito pelo usuário (Ctrl + arrastar), em px do mundo. */
  private pan = { x: 0, y: 0 };
  private panning: { x: number; y: number } | null = null;
  private deskLabels: Phaser.GameObjects.Text[] = [];
  private deskVersion = -1;
  private decorVersion = -1;
  private decorObjs: Phaser.GameObjects.GameObject[] = [];
  private logoFailed = new Set<string>();

  constructor() {
    super("office");
  }

  init(data: { bridge: GameBridge }) {
    this.bridge = data.bridge;
  }

  create() {
    this.grid = buildCollisionGrid();

    // Fundo (pisos, paredes, tapetes, quadros) pré-renderizado.
    if (!this.textures.exists("bg")) this.textures.addCanvas("bg", drawBackground());
    this.add.image(0, 0, "bg").setOrigin(0, 0).setDepth(-10);

    // Móveis com ordenação por profundidade.
    for (const it of spriteItems()) {
      const key = itemTextureKey(it);
      if (!this.textures.exists(key)) this.textures.addCanvas(key, drawItemCanvas(it));
      const def = ITEM_DEFS[it.type];
      const x = Math.round(it.x * TILE);
      const y = Math.round(it.y * TILE);
      const depth = def.body ? y + def.body.y + def.body.h : y + def.h * 0.5;
      const img = this.add.image(x, y, key).setOrigin(0, 0).setDepth(depth);
      // Objetos clicáveis: geladeira, cafeteira, jogos, sofás, banquetas...
      const inter = INTERACTIONS.find((i) => i.item === it);
      if (inter) {
        img.setInteractive({ useHandCursor: true });
        img.on("pointerover", () => img.setTint(0xbfd3ff));
        img.on("pointerout", () => img.clearTint());
        img.on("pointerdown", (p: Phaser.Input.Pointer) => {
          if (isPanGesture(p) || !this.onCanvas(p)) return;
          this.bridge.onItemClick?.(inter);
        });
      }
      // Cadeiras das salas de reunião: clicar senta e entra na reunião.
      // Cadeiras da área de trabalho: clicar senta (e permite escolher a mesa fixa).
      if (it.type === "chair" || it.type === "chairUp") {
        const seat = { x: it.x * TILE + 16, y: it.y * TILE + 24 };
        const z = zoneAtPoint(seat.x, seat.y - 4);
        const deskIndex = DESK_SEATS.findIndex((d) => d.x === seat.x && d.y === seat.y);
        if (deskIndex >= 0) {
          img.setInteractive({ useHandCursor: true });
          img.on("pointerover", () => img.setTint(0x9cbcff));
          img.on("pointerout", () => img.clearTint());
          img.on("pointerdown", (p: Phaser.Input.Pointer) => {
            if (isPanGesture(p) || !this.onCanvas(p)) return;
            this.bridge.onDeskClick?.({ index: deskIndex, ...seat, dir: it.type === "chairUp" ? "down" : "up" });
          });
        }
        if (z?.kind === "meeting" && !img.input) {
          img.setInteractive({ useHandCursor: true });
          img.on("pointerover", () => img.setTint(0x9cbcff));
          img.on("pointerout", () => img.clearTint());
          img.on("pointerdown", (p: Phaser.Input.Pointer) => {
            if (isPanGesture(p) || !this.onCanvas(p)) return; // Ctrl + clique é para mover o mapa
            this.bridge.onSeatClick?.({ zoneKey: z.key, ...seat, dir: it.type === "chairUp" ? "down" : "up" });
          });
        }
      }
    }

    // Raio de proximidade (sutil) em volta do jogador local.
    this.radiusGfx = this.add.graphics().setDepth(-5);

    // Jogador local
    const start = nearestFree(this.grid, this.bridge.local.x, this.bridge.local.y);
    this.bridge.local.x = start.x;
    this.bridge.local.y = start.y;
    this.me = this.createAvatar(this.bridge.local.name, this.bridge.local.avatar, start.x, start.y, true);

    // Câmera
    const cam = this.cameras.main;
    cam.setBounds(0, 0, WORLD_W, WORLD_H);
    cam.setBackgroundColor(NAVY);
    cam.startFollow(this.me.container, true, 0.12, 0.12);
    cam.setRoundPixels(true);
    this.applyZoom();
    this.scale.on("resize", () => this.applyZoom());

    // Teclado sem capturar teclas (para não atrapalhar campos de texto).
    const kb = this.input.keyboard;
    if (kb) {
      this.keys = kb.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE", false) as Record<string, Phaser.Input.Keyboard.Key>;
    }

    // Ctrl (ou ⌘) + arrastar, ou botão do meio: move o mapa.
    this.input.mouse?.disableContextMenu();
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      if (!isPanGesture(p) || !this.onCanvas(p)) return;
      this.panning = { x: p.x, y: p.y };
      this.setCursor("grabbing");
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (!this.panning) return;
      const z = this.cameras.main.zoom;
      this.pan.x += (p.x - this.panning.x) / z;
      this.pan.y += (p.y - this.panning.y) / z;
      this.panning = { x: p.x, y: p.y };
      this.applyZoom();
    });
    const endPan = () => {
      if (!this.panning) return;
      this.panning = null;
      this.setCursor(null);
    };
    this.input.on("pointerup", endPan);
    this.input.on("pointerupoutside", endPan);

    // Celular: pinça com dois dedos dá zoom; arrastar com dois dedos move o mapa.
    this.input.on("pointerdown", () => this.updatePinch(true));
    this.input.on("pointermove", () => this.updatePinch(false));
    const endPinch = () => {
      if (this.touchesDown().length < 2) this.pinch = null;
    };
    this.input.on("pointerup", endPinch);
    this.input.on("pointerupoutside", endPinch);
    const onKey = (e: KeyboardEvent) => {
      if (this.panning) return;
      this.setCursor(e.type === "keydown" && (e.key === "Control" || e.key === "Meta") ? "grab" : null);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", endPan);
    this.events.once("destroy", () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
      window.removeEventListener("blur", endPan);
    });

    this.emitZone(true);
    this.bridge.onReady?.();
  }

  private pinch: { d: number; z: number; mx: number; my: number } | null = null;

  private touchesDown() {
    return this.input.manager.pointers.filter((p) => p.isDown && p.wasTouch);
  }

  private updatePinch(start: boolean) {
    const t = this.touchesDown();
    if (t.length < 2) {
      this.pinch = null;
      return;
    }
    const [a, b] = t;
    const d = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    if (start || !this.pinch) {
      this.pinch = { d, z: this.bridge.zoom, mx, my };
      return;
    }
    const cz = this.cameras.main.zoom;
    this.pan.x += (mx - this.pinch.mx) / cz;
    this.pan.y += (my - this.pinch.my) / cz;
    this.pinch.mx = mx;
    this.pinch.my = my;
    const z = Math.round(Phaser.Math.Clamp((this.pinch.z * d) / this.pinch.d, 0.5, 2.5) * 100) / 100;
    this.bridge.zoom = z;
    this.applyZoom();
    this.bridge.onPinchZoom?.(z);
  }

  /** O clique foi no mapa mesmo (e não num botão/menu da interface por cima dele)? */
  private onCanvas(p: Phaser.Input.Pointer): boolean {
    const el = (p.event as Event | undefined)?.target ?? p.downElement;
    return !el || el === this.game.canvas;
  }

  private setCursor(c: string | null) {
    this.input.setDefaultCursor(c ?? "default");
  }

  /** Volta o mapa para a posição normal (seguindo o personagem). */
  resetPan() {
    this.pan = { x: 0, y: 0 };
    this.applyZoom();
  }

  private applyZoom() {
    const cam = this.cameras.main;
    cam.setZoom(this.bridge.zoom);
    // Se o mundo couber na tela, centraliza.
    const vw = this.scale.width / cam.zoom;
    const vh = this.scale.height / cam.zoom;
    // Limita o deslocamento para sempre sobrar um pedaço do mapa na tela.
    const lx = (vw + WORLD_W) / 2 - 96;
    const ly = (vh + WORLD_H) / 2 - 96;
    this.pan.x = Math.max(-lx, Math.min(lx, this.pan.x));
    this.pan.y = Math.max(-ly, Math.min(ly, this.pan.y));
    // Os limites da câmera andam junto com o deslocamento (mapa pequeno fica centralizado + deslocado).
    cam.setBounds(
      (vw > WORLD_W ? -(vw - WORLD_W) / 2 : 0) - this.pan.x,
      (vh > WORLD_H ? -(vh - WORLD_H) / 2 : 0) - this.pan.y,
      Math.max(WORLD_W, vw),
      Math.max(WORLD_H, vh),
    );
    cam.setFollowOffset(this.pan.x, this.pan.y);
  }

  setZoom(z: number) {
    this.bridge.zoom = z;
    this.applyZoom();
  }

  // ---------------------------------------------------------------------------
  // Avatares
  // ---------------------------------------------------------------------------

  private ensureCharTexture(avatar: AvatarConfig): string {
    const key = `char:${avatarKey(avatar)}`;
    if (this.textures.exists(key)) return key;
    const tex = this.textures.addCanvas(key, drawCharacterSheet(avatar));
    if (!tex) return key;
    for (const dir of DIRS) {
      for (let f = 0; f < 3; f++) {
        const r = frameRect(dir, f);
        tex.add(`${dir}-${f}`, 0, r.x, r.y, r.w, r.h);
      }
      this.anims.create({
        key: `${key}:walk-${dir}`,
        frames: [1, 0, 2, 0].map((f) => ({ key, frame: `${dir}-${f}` })),
        frameRate: 9,
        repeat: -1,
      });
    }
    return key;
  }

  private createAvatar(name: string, avatar: AvatarConfig, x: number, y: number, isMe: boolean): Avatar {
    const texKey = this.ensureCharTexture(avatar);
    const ring = this.add.graphics();
    const sprite = this.add.sprite(0, 0, texKey, "down-0").setOrigin(0.5, (CHAR_H - 3) / CHAR_H);
    const label = this.add
      .text(0, -CHAR_H + 2, name, {
        font: NAME_FONT,
        color: "#ffffff",
        backgroundColor: isMe ? "rgba(43,106,243,0.95)" : "rgba(14,21,51,0.8)",
        padding: { left: 5, right: 5, top: 2, bottom: 2 },
        resolution: 2,
      })
      .setOrigin(0.5, 1);
    const mic = this.add.graphics();
    const held = this.add.text(0, 0, "", { font: "13px sans-serif", resolution: 3 }).setOrigin(0.5, 0.5).setVisible(false);
    const container = this.add.container(x, y, [ring, sprite, held]);
    container.setDepth(y);
    // Nome e microfone ficam numa camada acima de tudo.
    const tag = this.add.container(x, y, [label, mic]).setDepth(LABEL_DEPTH + (isMe ? 1 : 0));
    const a: Avatar = {
      container,
      tag,
      sprite,
      label,
      mic,
      ring,
      held,
      heldItem: null,
      heldDir: null,
      texKey,
      name,
      micOn: false,
      speaking: false,
      near: false,
      inMeeting: false,
      dir: "down",
      walking: false,
      swim: false,
      jumping: false,
    };
    this.drawIndicators(a);
    return a;
  }

  /** Ícone de microfone ao lado do nome + anel de fala/proximidade. */
  private drawIndicators(a: Avatar) {
    const g = a.mic;
    g.clear();
    const lx = a.label.width / 2 + 7;
    const ly = -CHAR_H - 7;
    g.fillStyle(a.micOn ? 0x1f9d8a : 0x2a2d3a, 0.95);
    g.fillCircle(lx, ly, 7);
    g.fillStyle(0xffffff, 1);
    g.fillRoundedRect(lx - 2, ly - 4.5, 4, 6, 2);
    g.lineStyle(1.2, 0xffffff, 1);
    g.beginPath();
    g.arc(lx, ly - 0.5, 3.5, 0.15 * Math.PI, 0.85 * Math.PI, false);
    g.strokePath();
    g.lineBetween(lx, ly + 3, lx, ly + 4.5);
    if (!a.micOn) {
      g.lineStyle(1.6, 0xe0564c, 1);
      g.lineBetween(lx - 4.5, ly - 4.5, lx + 4.5, ly + 4.5);
    }

    const r = a.ring;
    r.clear();
    if (a.swim) {
      // linha d'água em volta do corpo
      r.fillStyle(0xbfe9fb, 0.55);
      r.fillEllipse(0, -15, 30, 8);
      r.lineStyle(1, 0xffffff, 0.8);
      r.strokeEllipse(0, -15, 34, 10);
    }
    if (a.speaking) {
      r.lineStyle(2, 0x4fe0a8, 0.95);
      r.strokeEllipse(0, -3, 30, 11);
      r.fillStyle(0x4fe0a8, 0.18);
      r.fillEllipse(0, -3, 30, 11);
    } else if (a.near) {
      r.lineStyle(1.5, BRAND, 0.85);
      r.strokeEllipse(0, -3, 28, 10);
    }
    a.sprite.setAlpha(a.inMeeting ? 0.6 : 1);
    a.label.setVisible(this.bridge.showNames);
    a.mic.setVisible(this.bridge.showNames);
  }

  private place(a: Avatar, x: number, y: number) {
    a.container.setPosition(x, y);
    a.container.setDepth(y);
    a.tag.setPosition(Math.round(x), Math.round(y));
    const swim = inPool(x, y);
    if (swim !== a.swim) {
      a.swim = swim;
      if (swim) a.sprite.setCrop(0, 0, CHAR_W, Math.round(CHAR_H * 0.62));
      else a.sprite.setCrop();
      this.drawIndicators(a);
      if (swim) this.splash(x, y);
    }
  }

  private animate(a: Avatar, dir: Dir, moving: boolean) {
    if (moving) {
      const anim = `${a.texKey}:walk-${dir}`;
      if (!a.walking || a.dir !== dir) a.sprite.play(anim, true);
    } else if (a.walking || a.dir !== dir) {
      a.sprite.stop();
      a.sprite.setFrame(`${dir}-0`);
    }
    a.dir = dir;
    a.walking = moving;
  }

  /** Item na mão: do lado em que o boneco olha (de costas, fica atrás do corpo). */
  private updateHeld(a: Avatar, item: string | null) {
    if (item === a.heldItem && a.dir === a.heldDir) return;
    a.heldItem = item;
    a.heldDir = a.dir;
    if (!item) {
      a.held.setVisible(false);
      return;
    }
    a.held.setText(item).setVisible(true);
    const pos: Record<Dir, [number, number]> = { down: [10, -16], up: [-10, -18], left: [-10, -16], right: [10, -16] };
    const [hx, hy] = pos[a.dir];
    a.held.setPosition(hx, hy);
    // De costas o item fica atrás do corpo; nas outras direções, na frente.
    const c = a.container;
    c.remove(a.held);
    c.addAt(a.held, a.dir === "up" ? c.getIndex(a.sprite) : c.getIndex(a.sprite) + 1);
  }

  private refreshAvatar(a: Avatar, name: string, avatar: AvatarConfig) {
    const key = `char:${avatarKey(avatar)}`;
    if (key !== a.texKey) {
      a.texKey = this.ensureCharTexture(avatar);
      a.sprite.setTexture(a.texKey, `${a.dir}-0`);
      a.walking = false;
    }
    if (name !== a.name) {
      a.name = name;
      a.label.setText(name);
      this.drawIndicators(a);
    }
  }

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------

  update(_time: number, deltaMs: number) {
    const dt = Math.min(deltaMs, 50) / 1000;
    this.updateLocal(dt);
    this.syncRemotes(dt);
    this.flushReactions();
    this.flushPunches();
    this.flushJumps();
    // Barra de espaço: pular (na beira da piscina, mergulha).
    if (this.keys && Phaser.Input.Keyboard.JustDown(this.keys.SPACE) && this.canUseKeys()) this.jumpLocal();
    if (this.deskVersion !== this.bridge.deskVersion) this.drawDeskLabels();
    if (this.decorVersion !== this.bridge.roomDecorVersion) this.drawRoomDecor();

    // Raio de proximidade
    const g = this.radiusGfx;
    g.clear();
    const { x, y } = this.me.container;
    g.lineStyle(1, BRAND, this.bridge.locked ? 0 : 0.18);
    g.strokeCircle(x, y - 8, this.bridge.proximityRadius);
  }

  private readInput(): { x: number; y: number } {
    let ix = 0;
    let iy = 0;
    const el = typeof document !== "undefined" ? document.activeElement : null;
    const typing =
      el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement ||
      (el instanceof HTMLElement && el.isContentEditable);
    if (this.bridge.locked) return { x: 0, y: 0 };
    if (this.bridge.inputEnabled && !typing && this.keys) {
      const k = this.keys;
      if (k.A.isDown || k.LEFT.isDown) ix -= 1;
      if (k.D.isDown || k.RIGHT.isDown) ix += 1;
      if (k.W.isDown || k.UP.isDown) iy -= 1;
      if (k.S.isDown || k.DOWN.isDown) iy += 1;
    }
    if (ix === 0 && iy === 0) {
      ix = this.bridge.touch.x;
      iy = this.bridge.touch.y;
    }
    const len = Math.hypot(ix, iy);
    if (len > 1) {
      ix /= len;
      iy /= len;
    }
    return { x: ix, y: iy };
  }

  private updateLocal(dt: number) {
    const L = this.bridge.local;
    if (this.bridge.pendingTeleport) {
      const p = nearestFree(this.grid, this.bridge.pendingTeleport.x, this.bridge.pendingTeleport.y);
      L.x = p.x;
      L.y = p.y;
      if (this.bridge.pendingTeleport.dir) {
        L.dir = this.bridge.pendingTeleport.dir;
        this.lastEmit.dir = "down";
        this.lastEmit.x = -1;
      }
      this.bridge.pendingTeleport = null;
    }

    const input = this.diving ? { x: 0, y: 0 } : this.readInput();
    const moving = input.x !== 0 || input.y !== 0;
    let dir = L.dir;
    if (moving) {
      if (Math.abs(input.x) > Math.abs(input.y)) dir = input.x < 0 ? "left" : "right";
      else dir = input.y < 0 ? "up" : "down";
      const next = moveWithCollision(this.grid, L.x, L.y, input.x * SPEED * dt, input.y * SPEED * dt);
      L.x = next.x;
      L.y = next.y;
    }
    const actuallyMoving = moving;
    L.dir = dir;
    L.moving = actuallyMoving;

    this.place(this.me, Math.round(L.x), Math.round(L.y));
    this.animate(this.me, dir, actuallyMoving);

    // Nome/avatar/mic do jogador local podem mudar pela UI.
    this.refreshAvatar(this.me, withBadge(L.name, L.badge), L.avatar);
    this.updateHeld(this.me, L.item);
    if (this.me.micOn !== L.mic || this.me.speaking !== L.speaking) {
      this.me.micOn = L.mic;
      this.me.speaking = L.speaking;
      this.drawIndicators(this.me);
    }

    const e = this.lastEmit;
    if (
      Math.abs(e.x - L.x) > 0.5 ||
      Math.abs(e.y - L.y) > 0.5 ||
      e.moving !== actuallyMoving ||
      e.dir !== dir
    ) {
      this.lastEmit = { x: L.x, y: L.y, moving: actuallyMoving, dir };
      this.bridge.onLocalMove?.({ x: L.x, y: L.y, dir, moving: actuallyMoving });
      this.emitZone(false);
    }
  }

  private emitZone(force: boolean) {
    const z = zoneAtPoint(this.bridge.local.x, this.bridge.local.y - 4);
    const key = z?.key ?? null;
    if (force || key !== this.zoneKey) {
      this.zoneKey = key;
      this.bridge.onZoneChange?.(key);
    }
  }

  private syncRemotes(dt: number) {
    const k = 1 - Math.exp(-dt * 12);
    // remove os que saíram
    for (const [id, a] of this.others) {
      if (!this.bridge.remotes.has(id)) {
        a.container.destroy();
        a.tag.destroy();
        this.others.delete(id);
      }
    }
    for (const r of this.bridge.remotes.values()) {
      let a = this.others.get(r.id);
      if (!a) {
        a = this.createAvatar(r.name, r.avatar, r.tx, r.ty, false);
        this.others.set(r.id, a);
      }
      this.refreshAvatar(a, withBadge(r.name, r.badge), r.avatar);
      this.updateHeld(a, r.item);
      const c = a.container;
      const dx = r.tx - c.x;
      const dy = r.ty - c.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 320) {
        this.place(a, r.tx, r.ty); // longe demais: reposiciona
      } else if (dist > 0.3) {
        this.place(a, c.x + dx * k, c.y + dy * k);
      }
      const walking = r.moving || dist > 3;
      let dir = r.dir;
      if (dist > 3 && !r.moving) {
        dir = Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? "left" : "right") : dy < 0 ? "up" : "down";
      }
      this.animate(a, dir, walking);
      if (a.micOn !== r.mic || a.speaking !== r.speaking || a.near !== r.near || a.inMeeting !== r.inMeeting) {
        a.micOn = r.mic;
        a.speaking = r.speaking;
        a.near = r.near;
        a.inMeeting = r.inMeeting;
        this.drawIndicators(a);
      }
      a.label.setVisible(this.bridge.showNames);
      a.mic.setVisible(this.bridge.showNames);
    }
  }

  /** Emojis de reação subindo acima da cabeça de quem reagiu. */
  private flushReactions() {
    const q = this.bridge.reactions;
    if (!q.length) return;
    this.bridge.reactions = [];
    for (const r of q) {
      const a = r.id === this.bridge.local.id ? this.me : this.others.get(r.id);
      if (!a) continue;
      const t = this.add
        .text(a.tag.x + (Math.random() * 16 - 8), a.tag.y - CHAR_H - 22, r.emoji, {
          font: '22px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif',
          resolution: 2,
        })
        .setOrigin(0.5, 1)
        .setDepth(LABEL_DEPTH + 2);
      this.tweens.add({
        targets: t,
        y: t.y - 36,
        alpha: { from: 1, to: 0 },
        scale: { from: 0.7, to: 1.2 },
        duration: 2200,
        ease: "Cubic.easeOut",
        onComplete: () => t.destroy(),
      });
    }
  }

  private canUseKeys() {
    if (!this.bridge.inputEnabled || this.bridge.locked) return false;
    const el = typeof document !== "undefined" ? document.activeElement : null;
    return !(
      el instanceof HTMLInputElement ||
      el instanceof HTMLTextAreaElement ||
      el instanceof HTMLSelectElement ||
      (el instanceof HTMLElement && el.isContentEditable)
    );
  }

  /** Pulo do jogador local. Se estiver na borda olhando para a água, pula para dentro da piscina. */
  private jumpLocal() {
    if (this.me.jumping) return;
    const L = this.bridge.local;
    const v = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[L.dir];
    const tx = L.x + v[0] * 56;
    const ty = L.y + v[1] * 56;
    if (!inPool(L.x, L.y) && inPool(tx, ty)) {
      const from = { x: L.x, y: L.y };
      const prog = { t: 0 };
      this.diving = true;
      this.tweens.add({
        targets: prog,
        t: 1,
        duration: 380,
        ease: "Sine.easeInOut",
        onUpdate: () => {
          L.x = from.x + (tx - from.x) * prog.t;
          L.y = from.y + (ty - from.y) * prog.t;
        },
        onComplete: () => {
          this.diving = false;
        },
      });
    }
    this.hop(this.me, 380);
    this.bridge.onLocalJump?.();
  }

  private diving = false;

  private hop(a: Avatar, duration = 320) {
    if (a.jumping) return;
    a.jumping = true;
    this.tweens.add({
      targets: a.sprite,
      y: -22,
      duration: duration / 2,
      yoyo: true,
      ease: "Quad.easeOut",
      onComplete: () => {
        a.sprite.setY(0);
        a.jumping = false;
      },
    });
  }

  private flushJumps() {
    const q = this.bridge.jumps;
    if (!q.length) return;
    this.bridge.jumps = [];
    for (const id of q) {
      const a = this.others.get(id);
      if (a) this.hop(a);
    }
  }

  /** Splash ao cair na água. */
  private splash(x: number, y: number) {
    const ring = this.add.graphics().setDepth(y + 1);
    ring.lineStyle(2, 0xffffff, 0.9);
    ring.strokeEllipse(0, 0, 20, 7);
    ring.setPosition(x, y - 14);
    this.tweens.add({ targets: ring, scaleX: 2.4, scaleY: 2.4, alpha: 0, duration: 650, onComplete: () => ring.destroy() });
    for (let i = 0; i < 7; i++) {
      const d = this.add.circle(x, y - 16, 2, 0xdff4ff).setDepth(LABEL_DEPTH - 1);
      const ang = -Math.PI / 2 + (i - 3) * 0.35;
      this.tweens.add({
        targets: d,
        x: x + Math.cos(ang) * (14 + Math.random() * 10),
        y: y - 16 + Math.sin(ang) * (16 + Math.random() * 10),
        alpha: 0,
        duration: 420 + Math.random() * 200,
        ease: "Quad.easeOut",
        onComplete: () => d.destroy(),
      });
    }
  }

  /** Soco de brincadeira: quem bate avança, quem apanha treme e é empurrado. */
  private flushPunches() {
    const q = this.bridge.punches;
    if (!q.length) return;
    this.bridge.punches = [];
    for (const { from, to } of q) {
      const a = from === this.bridge.local.id ? this.me : this.others.get(from);
      const t = to === this.bridge.local.id ? this.me : this.others.get(to);
      if (!a || !t) continue;
      const dx = t.container.x - a.container.x;
      const dy = t.container.y - a.container.y;
      const len = Math.hypot(dx, dy) || 1;
      this.tweens.add({ targets: a.sprite, x: (dx / len) * 8, y: (dy / len) * 4, duration: 90, yoyo: true, ease: "Quad.easeOut" });
      this.tweens.add({ targets: t.sprite, x: { from: -3, to: 3 }, duration: 50, yoyo: true, repeat: 3, onComplete: () => t.sprite.setX(0) });
      const boom = this.add
        .text(t.tag.x, t.tag.y - CHAR_H + 4, "💥", { font: '24px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif', resolution: 2 })
        .setOrigin(0.5, 1)
        .setDepth(LABEL_DEPTH + 3);
      this.tweens.add({ targets: boom, scale: { from: 0.5, to: 1.4 }, alpha: { from: 1, to: 0 }, duration: 700, onComplete: () => boom.destroy() });
      // Quem apanhou (eu) é empurrado um pouco, respeitando paredes e móveis.
      if (t === this.me && !this.bridge.locked) {
        const L = this.bridge.local;
        const next = moveWithCollision(this.grid, L.x, L.y, (dx / len) * 30, (dy / len) * 30);
        L.x = next.x;
        L.y = next.y;
      }
    }
  }

  /** Nome do dono em cada mesa fixa. */
  private drawDeskLabels() {
    this.deskVersion = this.bridge.deskVersion;
    for (const t of this.deskLabels) t.destroy();
    this.deskLabels = [];
    DESK_SEATS.forEach((d, i) => {
      const name = this.bridge.deskNames[i];
      if (!name) return;
      const t = this.add
        // Em cima do tampo da mesa (abaixo da cadeira de cima / acima da cadeira de baixo).
        .text(d.x, d.dir === "down" ? d.y + 14 : d.y - 34, name.split(" ")[0], {
          font: '600 9px "Inter", system-ui, sans-serif',
          color: "#ffffff",
          backgroundColor: "rgba(14,21,51,0.75)",
          padding: { left: 3, right: 3, top: 1, bottom: 1 },
          resolution: 2,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(d.y + 200);
      this.deskLabels.push(t);
    });
  }

  /**
   * Placa com o nome de cada sala (na parede do corredor, ao lado da porta) e, nas salas
   * com identidade visual, um banner em pé com a logo.
   */
  private drawRoomDecor() {
    this.decorVersion = this.bridge.roomDecorVersion;
    for (const o of this.decorObjs) o.destroy();
    this.decorObjs = [];
    const toLoad = new Map<string, string>();

    for (const r of this.bridge.roomDecor) {
      const spot = ROOM_DECOR[r.zoneKey];
      if (!spot) continue;
      const theme = isRoomTheme(r.theme) ? ROOM_THEMES[r.theme] : null;
      const pal = theme ?? PLAIN_PLATE;

      // Placa
      const px = spot.plate.x * TILE;
      const py = spot.plate.y * TILE;
      const maxW = TILE * 3;
      const text = this.add
        .text(px, py, r.name, { font: '700 9px "Inter", system-ui, sans-serif', color: pal.fg, resolution: 3 })
        .setOrigin(0.5, 0.5);
      if (text.width + 14 > maxW) text.setScale((maxW - 14) / text.width);
      const w = Math.min(maxW, text.width * text.scaleX + 14);
      const h = 15;
      const g = this.add.graphics();
      g.fillStyle(0x000000, 0.3).fillRoundedRect(px - w / 2 + 1, py - h / 2 + 2, w, h, 3);
      g.fillStyle(pal.bg, 1).fillRoundedRect(px - w / 2, py - h / 2, w, h, 3);
      g.fillStyle(pal.accent, 1).fillRect(px - w / 2 + 4, py + h / 2 - 3, w - 8, 1.5);
      g.setDepth(py + 1);
      text.setDepth(py + 2);
      this.decorObjs.push(g, text);

      // Banner com a logo
      if (!theme || !r.theme) continue;
      const key = `marca:${r.theme}`;
      if (!this.textures.exists(key)) {
        if (!this.logoFailed.has(key)) toLoad.set(key, theme.logo);
        continue;
      }
      const BW = 54;
      const BH = 66;
      const bx = spot.banner.x * TILE;
      const by = spot.banner.y * TILE;
      const b = this.add.graphics();
      b.fillStyle(0x000000, 0.25).fillEllipse(bx + BW / 2, by + BH, BW + 6, 8);
      b.fillStyle(0x3a3f4b, 1).fillRoundedRect(bx, by + BH - 6, BW, 6, 2);
      b.fillStyle(0xffffff, 1).fillRect(bx + 3, by, BW - 6, BH - 6);
      b.fillStyle(theme.bg, 1).fillRect(bx + 3, by, BW - 6, 7);
      b.fillStyle(theme.bg, 1).fillRect(bx + 3, by + BH - 16, BW - 6, 10);
      b.fillStyle(theme.accent, 1).fillRect(bx + 3, by + 7, BW - 6, 1.5);
      b.lineStyle(1, 0x000000, 0.25).strokeRect(bx + 3, by, BW - 6, BH - 6);
      b.setDepth(by + BH);
      const logo = this.add.image(bx + BW / 2, by + 7 + (BH - 6 - 7 - 10) / 2, key);
      const fit = Math.min((BW - 12) / logo.width, (BH - 30) / logo.height);
      logo.setScale(fit).setDepth(by + BH + 0.5);
      this.decorObjs.push(b, logo);
    }

    if (toLoad.size) {
      for (const [key, url] of toLoad) this.load.image(key, url);
      this.load.once("loaderror", (f: { key: string }) => this.logoFailed.add(f.key));
      this.load.once("complete", () => {
        for (const key of toLoad.keys()) {
          // Logos são fotos: filtro suave (o resto do jogo é pixel art).
          if (this.textures.exists(key)) this.textures.get(key).setFilter(Phaser.Textures.FilterMode.LINEAR);
          else this.logoFailed.add(key);
        }
        this.decorVersion = -1;
      });
      this.load.start();
    }
  }

  /** Re-aplica a visibilidade dos nomes (configuração). */
  refreshLabels() {
    this.drawIndicators(this.me);
    for (const a of this.others.values()) this.drawIndicators(a);
  }
}

export const CHARACTER_SIZE = { w: CHAR_W, h: CHAR_H };

function withBadge(name: string, badge: string) {
  return badge ? `${badge} ${name}` : name;
}

function isPanGesture(p: Phaser.Input.Pointer): boolean {
  const ev = p.event as MouseEvent | undefined;
  return Boolean(ev?.ctrlKey || ev?.metaKey || p.middleButtonDown());
}
