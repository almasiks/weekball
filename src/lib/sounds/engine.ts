"use client";

// Sound engine of the organizer's console. One sound at a time: pressing a
// button while something plays restarts instead of layering.
// - custom files: decoded once into AudioBuffers (bytes cached in IndexedDB → work offline);
// - whistles: synthesized with Web Audio;
// - voice phrases: speechSynthesis in the interface language (Russian when the phone has no such voice).
import { get, set } from "idb-keyval";
import { WHISTLE_PATTERNS, type BuiltinSound } from "./builtin";

export type PlayableSound = {
  key: string; // builtin key or sound id
  builtin?: BuiltinSound;
  // Translated phrase for voice buttons; without it the Russian original is spoken.
  speech?: { text: string; lang: string };
  filePath?: string | null; // Storage path; wins over the built-in sound when loaded
};

// `ended` resolves when the sound is over (or was stopped): lets a sequence wait for it.
type Playing = { stop: () => void; ended: Promise<void> };

const PREFS_KEY = "weekball:sound-prefs";
const fileKey = (path: string) => `weekball:sound:${path}`;

type AudioSessionNavigator = Navigator & { audioSession?: { type: string } };
type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

class SoundEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private current: Playing | null = null;
  private raw = new Map<string, ArrayBuffer>();
  private decoded = new Map<string, AudioBuffer>();
  private unlocked = false;
  // Grows with every new request, so a running sequence knows it was interrupted.
  private run = 0;
  volume = 1;
  muted = false;

  constructor() {
    try {
      const prefs = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
      if (typeof prefs.volume === "number") this.volume = prefs.volume;
      if (typeof prefs.muted === "boolean") this.muted = prefs.muted;
    } catch {}
  }

  private context(): AudioContext {
    if (!this.ctx) {
      const Ctx = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext!;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /**
   * Must run inside a user gesture (first tap): resumes the AudioContext, plays a
   * silent buffer (iOS), warms up speech, and asks iOS to play in silent mode.
   */
  unlock() {
    try {
      const nav = navigator as AudioSessionNavigator;
      if (nav.audioSession) nav.audioSession.type = "playback";
    } catch {}
    try {
      const ctx = this.context();
      if (ctx.state !== "running") void ctx.resume();
      if (!this.unlocked) {
        const source = ctx.createBufferSource();
        source.buffer = ctx.createBuffer(1, 1, 22050);
        source.connect(ctx.destination);
        source.start(0);
      }
    } catch {}
    if (!this.unlocked && "speechSynthesis" in window) {
      try {
        const warm = new SpeechSynthesisUtterance(" ");
        warm.volume = 0;
        window.speechSynthesis.speak(warm);
      } catch {}
    }
    this.unlocked = true;
  }

  private savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ volume: this.volume, muted: this.muted }));
    } catch {}
  }

  setVolume(volume: number) {
    this.volume = Math.min(1, Math.max(0, volume));
    if (this.master) this.master.gain.value = this.volume;
    this.savePrefs();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    if (muted) this.stop();
    this.savePrefs();
  }

  /** Makes a file available offline: IndexedDB first, otherwise download and store. */
  async preload(path: string, download: () => Promise<ArrayBuffer | null>): Promise<boolean> {
    if (this.raw.has(path)) return true;
    let bytes: ArrayBuffer | null = null;
    try {
      bytes = ((await get(fileKey(path))) as ArrayBuffer | undefined) ?? null;
    } catch {}
    if (!bytes) {
      bytes = await download().catch(() => null);
      if (bytes) {
        try {
          await set(fileKey(path), bytes);
        } catch {}
      }
    }
    if (bytes) this.raw.set(path, bytes);
    return !!bytes;
  }

  isLoaded(path: string) {
    return this.raw.has(path);
  }

  stop() {
    this.run++;
    this.halt();
  }

  private halt() {
    this.current?.stop();
    this.current = null;
  }

  /** One sound; whatever was playing (or queued) stops. */
  async play(sound: PlayableSound) {
    this.run++;
    return this.start(sound);
  }

  /**
   * Several sounds one after another (final whistle, then "Матч завершён!").
   * Pressing any button meanwhile cancels the rest.
   */
  async playSequence(sounds: PlayableSound[]) {
    const run = ++this.run;
    for (const sound of sounds) {
      if (this.run !== run) return;
      await this.start(sound);
      await this.current?.ended;
    }
  }

  private async start(sound: PlayableSound) {
    this.halt();
    const source = sound.filePath && this.raw.has(sound.filePath) ? "file" : sound.builtin?.kind ?? "none";
    window.dispatchEvent(new CustomEvent("weekball:sound", { detail: { key: sound.key, source, muted: this.muted } }));
    if (this.muted) return;

    if (source === "file") return this.playFile(sound.filePath!);
    if (sound.builtin?.kind === "speech") {
      return this.speak(sound.builtin.text ?? sound.builtin.label, sound.speech);
    }
    if (sound.builtin?.kind === "whistle") return this.whistle(WHISTLE_PATTERNS[sound.builtin.pattern ?? "short"]);
  }

  private async playFile(path: string) {
    const ctx = this.context();
    if (ctx.state !== "running") await ctx.resume().catch(() => {});
    let buffer = this.decoded.get(path);
    if (!buffer) {
      // decodeAudioData detaches its input: decode a copy, keep the original bytes.
      buffer = await ctx.decodeAudioData(this.raw.get(path)!.slice(0));
      this.decoded.set(path, buffer);
    }
    const node = ctx.createBufferSource();
    node.buffer = buffer;
    node.connect(this.master!);
    node.start();
    const playing: Playing = {
      stop: () => { try { node.stop(); } catch {} },
      ended: new Promise<void>((resolve) => {
        node.onended = () => {
          if (this.current === playing) this.current = null;
          resolve();
        };
      }),
    };
    this.current = playing;
  }

  // `russian` is always available as text; `translated` is used when the phone has a voice for it
  // (Kazakh voices are rare: better a clear Russian phrase than Kazakh read by a wrong voice).
  private speak(russian: string, translated?: { text: string; lang: string }) {
    if (!("speechSynthesis" in window)) return this.beep();
    const synth = window.speechSynthesis;
    synth.cancel();
    const voices = synth.getVoices();
    const voiceFor = (lang: string) => voices.find((v) => v.lang.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
    const own = translated && !translated.lang.toLowerCase().startsWith("ru") ? voiceFor(translated.lang) : undefined;
    const utterance = new SpeechSynthesisUtterance(own ? translated!.text : russian);
    utterance.lang = own ? translated!.lang : "ru-RU";
    utterance.rate = 1.05;
    utterance.volume = this.volume;
    const voice = own ?? voiceFor("ru");
    if (voice) utterance.voice = voice;
    // Some phones never fire "end": don't let a sequence wait for ever.
    const ended = new Promise<void>((resolve) => {
      utterance.onend = () => resolve();
      utterance.onerror = () => resolve();
      setTimeout(resolve, 8000);
    });
    synth.speak(utterance);
    this.current = { stop: () => synth.cancel(), ended };
  }

  /** Pea-whistle: ~2.9 kHz tone with a fast trill, envelope per blast. */
  private whistle(blasts: number[]) {
    const ctx = this.context();
    if (ctx.state !== "running") void ctx.resume();
    const out = ctx.createGain();
    out.gain.value = 0;
    out.connect(this.master!);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = 2900;
    const trill = ctx.createOscillator();
    trill.frequency.value = 28;
    const depth = ctx.createGain();
    depth.gain.value = 180;
    trill.connect(depth).connect(osc.frequency);
    osc.connect(out);

    const gap = 0.12;
    let t = ctx.currentTime + 0.02;
    for (const length of blasts) {
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(0.9, t + 0.02);
      out.gain.setValueAtTime(0.9, t + length - 0.05);
      out.gain.linearRampToValueAtTime(0, t + length);
      t += length + gap;
    }
    osc.start();
    trill.start();
    osc.stop(t);
    trill.stop(t);
    const playing: Playing = {
      stop: () => {
        try {
          out.gain.cancelScheduledValues(ctx.currentTime);
          out.gain.setValueAtTime(0, ctx.currentTime);
          osc.stop();
          trill.stop();
        } catch {}
      },
      ended: new Promise<void>((resolve) => {
        osc.onended = () => {
          if (this.current === playing) this.current = null;
          resolve();
        };
      }),
    };
    this.current = playing;
  }

  /** Fallback when there is no speech engine: two short tones. */
  private beep() {
    const ctx = this.context();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.5;
    osc.connect(gain).connect(this.master!);
    const t = ctx.currentTime;
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.setValueAtTime(660, t + 0.2);
    osc.start(t);
    osc.stop(t + 0.4);
    this.current = {
      stop: () => { try { osc.stop(); } catch {} },
      ended: new Promise<void>((resolve) => {
        osc.onended = () => resolve();
      }),
    };
  }
}

let engine: SoundEngine | null = null;

/** Browser-only singleton. */
export function getSoundEngine(): SoundEngine {
  engine ??= new SoundEngine();
  return engine;
}
