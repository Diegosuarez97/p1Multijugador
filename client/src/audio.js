// Music and sound effects. Everything is local to this browser: nothing goes over the network.
const KEY = "torneo-audio";
const DEFAULTS = { music: 0.4, effects: 0.7, muted: false, musicOn: true };
const FADE_STEP = 0.04; // volume change every 50 ms, roughly half a second for a full crossfade

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

function track(src) {
  const audio = new Audio(src);
  audio.loop = true;
  audio.preload = "none"; // several MB: only downloaded once it actually plays
  audio.volume = 0;
  return audio;
}

const settings = load();
const listeners = new Set();
// Menus get the fairy-tale theme; rooms and matches the darker one.
const tracks = { menu: track("/assets/audio/menu.mp3"), game: track("/assets/audio/game.mp3") };
const effects = {
  spell: new Audio("/assets/audio/spell.mp3"),
  win: new Audio("/assets/audio/win.mp3"),
  click: new Audio("/assets/audio/click.mp3"),
};
const EFFECT_GAIN = { click: 0.6 }; // the button sound sits a bit under spells and the win jingle

let scene = "menu";
let ducked = false;
let started = false;
let fadeTimer;
let waitingForGesture = false;

const musicAudible =() => started && settings.musicOn && !settings.muted && settings.music > 0;
const targetVolume = (name) => (name === scene && musicAudible() ? settings.music * (ducked ? 0.25 : 1) : 0);

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(settings)); } catch { /* not persisted */ }
}

// Browsers only allow audio after a user gesture, so the first attempt may be blocked.
function tryPlay(audio) {
  audio.play().catch(() => {
    if (waitingForGesture) return;
    waitingForGesture = true;
    const retry = () => {
      waitingForGesture = false;
      window.removeEventListener("pointerdown", retry);
      window.removeEventListener("keydown", retry);
      fade();
    };
    window.addEventListener("pointerdown", retry);
    window.addEventListener("keydown", retry);
  });
}

// Moves every track towards its target volume; silent tracks are paused (keeping their position).
function fade() {
  clearInterval(fadeTimer);
  const step = () => {
    let done = true;
    for (const [name, audio] of Object.entries(tracks)) {
      const target = targetVolume(name);
      if (target > 0 && audio.paused) tryPlay(audio);
      const diff = target - audio.volume;
      if (Math.abs(diff) > FADE_STEP) {
        audio.volume = Math.min(1, Math.max(0, audio.volume + Math.sign(diff) * FADE_STEP));
        done = false;
      } else {
        audio.volume = target;
        if (target === 0 && !audio.paused) audio.pause();
      }
    }
    if (done) clearInterval(fadeTimer);
  };
  step();
  fadeTimer = setInterval(step, 50);
}

function changed() {
  fade();
  listeners.forEach((listener) => listener({ ...settings }));
}

export const audio = {
  settings: () => ({ ...settings }),

  set(changes) {
    Object.assign(settings, changes);
    save();
    changed();
  },

  onChange(listener) {
    listeners.add(listener);
    listener({ ...settings });
  },

  // Called once at boot; the music really starts with the first click or key press.
  start() {
    started = true;
    fade();
  },

  // "menu" or "game": crossfades to that scene's theme.
  setScene(name) {
    if (scene === name) return;
    scene = name;
    if (name === "game") tracks.game.currentTime = 0; // every match starts its theme from the top
    fade();
  },

  play(name) {
    if (settings.muted || settings.effects <= 0) return;
    // A fresh clone lets several spells overlap.
    const sound = effects[name].cloneNode();
    sound.volume = settings.effects * (EFFECT_GAIN[name] ?? 1);
    sound.play().catch(() => {});
    // click.mp3 is 8 s long but only the first second is audible.
    if (name === "click") setTimeout(() => sound.pause(), 1200);
  },

  // Lower the music while the victory jingle plays, then bring it back.
  duckFor(ms) {
    ducked = true;
    fade();
    setTimeout(() => {
      ducked = false;
      fade();
    }, ms);
  },
};
