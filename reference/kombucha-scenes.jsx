/* КОМБУЧА-3М — vintage kombucha tamagotchi demo. Scenes for animations-v2. */
const { SceneStage, useScene, Easing, animate, interpolate, clamp, useTweaks, TweaksPanel, TweakSection, TweakToggle, TweakRadio, TweakColor } = window;

/* ── palette (4-colour LCD + shell) ───────────────────────────── */
const SKINS = {
  olive: { lcd: '#9fb07c', c1: '#7b8d5d', c2: '#4a573a', c3: '#1b2314', glow: 'rgba(190,215,140,.35)' },
  amber: { lcd: '#c8a15a', c1: '#a97f3f', c2: '#6a4a20', c3: '#241706', glow: 'rgba(240,190,110,.35)' },
  ash:   { lcd: '#a8a99e', c1: '#87887d', c2: '#4e4f47', c3: '#1c1d18', glow: 'rgba(210,212,200,.3)' },
};
let PAL = SKINS.olive;
const SHELL = { body: '#c6bb9c', hi: '#ded4b6', lo: '#9c9174', deep: '#6f664f', red: '#8e3a2a', ink: '#2b271d' };

/* screen geometry: 50 x 40 cells of 6px = 300 x 240 */
const U = 6, SW = 50, SH = 40;
const LCD = { x: 490, y: 180, w: SW * U, h: SH * U };

const R = (key, x, y, w, h, c, extra) => React.createElement('div', {
  key, style: Object.assign({ position: 'absolute', left: x * U, top: y * U, width: w * U, height: h * U, background: c }, extra || {}),
});
const TXT = (key, x, y, txt, size, c, extra) => React.createElement('div', {
  key, style: Object.assign({
    position: 'absolute', left: x * U, top: y * U, color: c, fontFamily: '"Handjet", monospace',
    fontSize: size, lineHeight: 1, letterSpacing: '.5px', whiteSpace: 'pre',
  }, extra || {}),
}, txt);

const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };


/* ── score playback ───────────────────────────────────────────
   kombucha-score.wav (original 8-bit waltz, rendered to a file) is
   mounted ONCE inside the exportable root so its audio survives scene
   changes and is mixed into the video export.                    */
const MUS = { el: null, lastT: -99 };
function clipDuration() {
  const el = document.querySelector('[data-om-exportable-video-with-duration-secs]');
  const d = el && +el.getAttribute('data-om-exportable-video-with-duration-secs');
  return d && isFinite(d) && d > 0 ? d : 35;
}
function audioEl() {
  if (MUS.el && document.contains(MUS.el)) return MUS.el;
  const root = document.querySelector('[data-om-exportable-video-with-duration-secs]');
  if (!root) return null;
  const v = document.createElement('video');
  v.src = './kombucha-score.wav';
  v.preload = 'auto'; v.playsInline = true; v.volume = 0.6; v.loop = false;
  v.setAttribute('data-om-exportable-video-play-start', '0');
  v.setAttribute('data-om-exportable-video-play-end', String(clipDuration()));
  v.setAttribute('data-om-exportable-video-play-speed', '1');
  v.style.cssText = 'position:absolute;left:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none';
  root.appendChild(v);
  MUS.el = v;
  return v;
}
function music(t, on) {
  const v = audioEl();
  if (!v) return;
  v.muted = !on;
  const continuous = t > MUS.lastT && t - MUS.lastT < 0.25;
  MUS.lastT = t;
  if (Math.abs(v.currentTime - t) > 0.25) { try { v.currentTime = t; } catch (e) {} }
  if (continuous && on) { if (v.paused) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } }
  else if (!v.paused) v.pause();
}
const SCENE_OFFSETS = (() => {
  try { let a = 0; return JSON.parse(window.OM_SCENES).map((s) => { const o = a; a += +s.dur; return o; }); }
  catch (e) { return []; }
})();

/* ── the scoby itself ─────────────────────────────────────────── */
function scoby(out, { cx, top, growth, mood, mold, t }) {
  const hw = Math.round(3 + growth * 7);            // half width in cells
  const th = Math.round(2 + growth * 4);            // thickness
  const bob = Math.round(Math.sin(t * 1.6) * (mood === 'sad' ? 0.2 : 0.6));
  const y0 = top + bob;
  for (let i = 0; i < th; i++) {
    const shrink = i === 0 || i === th - 1 ? 1 : 0;
    const w = (hw - shrink) * 2;
    out.push(R('sc' + i, cx - w / 2, y0 + i, w, 1, i === 0 ? PAL.c1 : PAL.c2));
  }
  /* strands hanging into the tea */
  for (let i = 0; i < 5; i++) {
    const sx = cx - hw + 1 + Math.round(rnd(i) * (hw * 2 - 2));
    out.push(R('st' + i, sx, y0 + th, 1, 1 + Math.round(rnd(i + 9) * 3 * growth), PAL.c2, { opacity: 0.85 }));
  }
  /* mould specks — the shameful part */
  const specks = Math.round(mold * 10);
  for (let i = 0; i < specks; i++) {
    out.push(R('md' + i, cx - hw + 1 + Math.round(rnd(i * 3.3) * (hw * 2 - 2)), y0 + Math.round(rnd(i * 7.7) * (th - 1)), 1, 1, PAL.c3));
  }
  /* face */
  if (mood === 'away') {
    for (let i = 0; i < 4; i++) out.push(R('bk' + i, cx - hw + 2 + i * 2, y0 + 1, 1, 1, PAL.c3, { opacity: .5 }));
    return;
  }
  const ey = y0 + Math.max(0, Math.floor(th / 2) - 1);
  const blink = Math.sin(t * 2.1) > 0.96 ? 0 : 1;
  const eh = mood === 'dead' ? 1 : blink;
  const ew = mood === 'angry' ? 2 : 1;
  if (mood === 'dead') {
    out.push(R('e1', cx - 4, ey, 1, 1, PAL.c3)); out.push(R('e1b', cx - 3, ey + 1, 1, 1, PAL.c3));
    out.push(R('e1c', cx - 3, ey - 1, 1, 1, PAL.c3)); out.push(R('e1d', cx - 4, ey + 1, 1, 1, PAL.c3));
    out.push(R('e2', cx + 3, ey, 1, 1, PAL.c3)); out.push(R('e2b', cx + 2, ey + 1, 1, 1, PAL.c3));
    out.push(R('e2c', cx + 2, ey - 1, 1, 1, PAL.c3)); out.push(R('e2d', cx + 3, ey + 1, 1, 1, PAL.c3));
  } else if (eh) {
    out.push(R('e1', cx - 4, ey, ew, 1, PAL.c3));
    out.push(R('e2', cx + 3, ey, ew, 1, PAL.c3));
    if (mood === 'angry') { out.push(R('br1', cx - 5, ey - 1, 2, 1, PAL.c3)); out.push(R('br2', cx + 4, ey - 1, 2, 1, PAL.c3)); }
  } else {
    out.push(R('e1', cx - 4, ey, ew, 1, PAL.c3)); out.push(R('e2', cx + 3, ey, ew, 1, PAL.c3));
  }
  const my = ey + 2;
  if (mood === 'happy') { out.push(R('m1', cx - 2, my, 4, 1, PAL.c3)); out.push(R('m0', cx - 3, my - 1, 1, 1, PAL.c3)); out.push(R('m2', cx + 2, my - 1, 1, 1, PAL.c3)); }
  else if (mood === 'sad' || mood === 'dead') { out.push(R('m1', cx - 2, my, 4, 1, PAL.c3)); out.push(R('m0', cx - 3, my - 1, 1, 1, PAL.c3, { transform: 'translateY(6px)' })); }
  else if (mood === 'angry') { out.push(R('m1', cx - 2, my, 4, 1, PAL.c3)); out.push(R('m0', cx - 3, my + 1, 1, 1, PAL.c3)); out.push(R('m2', cx + 2, my + 1, 1, 1, PAL.c3)); }
  else out.push(R('m1', cx - 2, my, 4, 1, PAL.c3));
}

/* ── the whole LCD ────────────────────────────────────────────── */
function Screen(p) {
  const s = p.state || {};
  const out = [];
  if (s.mode === 'off') {
    return React.createElement('div', { style: { position: 'absolute', left: LCD.x, top: LCD.y, width: LCD.w, height: LCD.h, background: '#4b5540', overflow: 'hidden' } });
  }
  if (s.mode === 'boot') {
    const lines = ['КОМБУЧА-3М', 'ГОСТ 28376-89', '', 'ЖИВОЙ ОБЪЕКТ', 'ПРОБУЖДЕНИЕ...'];
    const n = Math.floor((s.boot || 0) * lines.length + .001);
    lines.slice(0, n).forEach((l, i) => out.push(TXT('b' + i, 4, 8 + i * 4, l, i === 0 ? 30 : 20, i === 0 ? PAL.c3 : PAL.c2)));
    if (n > 4) out.push(R('cur', 4 + 10, 8 + 4 * 4 + .3, 1, 1.6, PAL.c3, { opacity: Math.sin(s.t * 12) > 0 ? 1 : 0 }));
  } else {
    /* HUD */
    out.push(TXT('h1', 2, 1.6, 'СЫТОСТЬ', 17, PAL.c2));
    for (let i = 0; i < 10; i++) out.push(R('f' + i, 2 + i * 2, 4, 1.6, 2, i < Math.round((s.food || 0) * 10) ? PAL.c3 : PAL.c1));
    out.push(TXT('h2', 33, 1.6, 'ДЕНЬ ' + (s.day || 1), 17, PAL.c2));
    out.push(R('hl', 0, 7, SW, 0.4, PAL.c1));
    /* jar */
    out.push(R('jr', 15, 11, 20, 1, PAL.c2));
    out.push(R('jl2', 15, 12, 1, 22, PAL.c2));
    out.push(R('jr2', 34, 12, 1, 22, PAL.c2));
    out.push(R('jb', 15, 34, 20, 1, PAL.c2));
    out.push(R('tea', 16, 14, 18, 20, PAL.c1));
    /* bubbles */
    for (let i = 0; i < 7; i++) {
      const ph = (s.t * (0.25 + rnd(i) * 0.35) + rnd(i + 3)) % 1;
      out.push(R('bb' + i, 17 + Math.round(rnd(i + 5) * 16), 33 - ph * 17, 1, 1, PAL.lcd, { opacity: .5 }));
    }
    scoby(out, { cx: 25, top: s.scobyTop != null ? s.scobyTop : 15, growth: s.growth || 0, mood: s.mood || 'ok', mold: s.mold || 0, t: s.t });
    /* sugar rain */
    if (s.sugar) for (let i = 0; i < 12; i++) {
      const ph = ((s.t * 1.5 + rnd(i * 2.1)) % 1);
      if (ph > s.sugar) continue;
      out.push(R('sg' + i, 17 + Math.round(rnd(i) * 16), 9 + ph * 8, 1, 1, PAL.lcd));
    }
    /* hearts */
    if (s.hearts) for (let i = 0; i < 3; i++) {
      const ph = clamp((s.hearts * 1.6) - i * 0.25, 0, 1);
      if (ph <= 0 || ph >= 1) continue;
      const hx = 22 + i * 3, hy = 13 - ph * 6;
      out.push(R('hb' + i, hx, hy, 1, 1, PAL.c3));
      out.push(R('hc' + i, hx + 1, hy - 1, 1, 1, PAL.c3));
      out.push(R('hd' + i, hx - 1, hy - 1, 1, 1, PAL.c3));
    }
    /* flies */
    if (s.flies) for (let i = 0; i < 3; i++) {
      const a = s.t * (1.4 + i * .4) + i * 2.1;
      out.push(R('fl' + i, 25 + Math.cos(a) * (5 + i), 12 + Math.sin(a * 1.7) * 2.5, 1, 1, PAL.c3));
    }
    /* alarm */
    if (s.alarm && Math.sin(s.t * 9) > 0) {
      out.push(R('al', 0, 0, SW, SH, PAL.c3, { opacity: .12 }));
      out.push(TXT('alt', 20, .8, 'ТРЕВОГА', 18, PAL.c3));
    }
    if (s.msg) {
      out.push(R('mb', 0, 35.6, SW, 4.4, PAL.c2));
      out.push(TXT('mt', 1.5, 36.6, s.msg, 20, PAL.lcd));
    }
    if (s.bubble) {
      const w = s.bubble.length * 1.2 + 2;
      out.push(R('spb', 25 - w / 2, 7.5, w, 3, PAL.lcd, { border: '2px solid ' + PAL.c3 }));
      out.push(TXT('spt', 25 - w / 2 + 1, 8.4, s.bubble, 18, PAL.c3));
      out.push(R('spx', 24, 10.5, 1, 1, PAL.c3));
    }
  }
  return React.createElement('div', {
    style: { position: 'absolute', left: LCD.x, top: LCD.y, width: LCD.w, height: LCD.h, background: PAL.lcd, overflow: 'hidden' },
  }, out, React.createElement('div', {
    key: 'scan',
    style: {
      position: 'absolute', inset: 0, pointerEvents: 'none',
      background: 'repeating-linear-gradient(0deg, rgba(0,0,0,.10) 0 1px, rgba(0,0,0,0) 1px 3px)',
      boxShadow: 'inset 0 0 40px rgba(20,30,10,.45)',
    },
  }));
}

/* ── device shell ─────────────────────────────────────────────── */
function Device(p) {
  const press = p.press;
  const btn = (id, x, label) => React.createElement('div', {
    key: id,
    style: {
      position: 'absolute', left: x - 34, top: 528 + (press === id ? 4 : 0), width: 68, height: 68, borderRadius: '50%',
      background: id === 'C' ? SHELL.red : SHELL.lo,
      boxShadow: press === id ? 'inset 0 3px 6px rgba(0,0,0,.5)' : '0 5px 0 ' + SHELL.deep + ', inset 0 3px 0 rgba(255,255,255,.25)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: id === 'C' ? '#f0e4cd' : SHELL.ink, fontFamily: '"PT Sans Narrow", sans-serif',
      fontSize: 22, fontWeight: 700, letterSpacing: '1px',
    },
  }, label);
  return React.createElement('div', { style: { position: 'absolute', left: 0, top: 0, width: 1280, height: 720 } },
    /* keyring lug — sits behind the shell so only the bow shows */
    React.createElement('div', { key: 'ring', style: { position: 'absolute', left: 620, top: 58, width: 40, height: 40, borderRadius: '50%', border: '10px solid ' + SHELL.lo, boxShadow: '0 3px 6px rgba(0,0,0,.45)' } }),
    React.createElement('div', { key: 'lug', style: { position: 'absolute', left: 608, top: 88, width: 64, height: 40, borderRadius: '12px 12px 0 0', background: SHELL.lo } }),
    /* body */
    React.createElement('div', {
      key: 'body',
      style: {
        position: 'absolute', left: 400, top: 100, width: 480, height: 600, borderRadius: '54px 54px 40px 40px',
        background: 'linear-gradient(160deg,' + SHELL.hi + ' 0%,' + SHELL.body + ' 42%,' + SHELL.lo + ' 100%)',
        boxShadow: '0 30px 60px rgba(0,0,0,.55), inset 0 -10px 22px rgba(0,0,0,.22), inset 0 8px 0 rgba(255,255,255,.35)',
      },
    }),
    /* bezel */
    React.createElement('div', {
      key: 'bez',
      style: {
        position: 'absolute', left: 462, top: 152, width: 356, height: 296, borderRadius: 14,
        background: '#3b3627', boxShadow: 'inset 0 4px 10px rgba(0,0,0,.7), 0 2px 0 rgba(255,255,255,.25)',
      },
    }),
    React.createElement(Screen, { key: 'scr', state: p.screen }),
    /* screen glow */
    React.createElement('div', { key: 'glow', style: { position: 'absolute', left: LCD.x, top: LCD.y, width: LCD.w, height: LCD.h, boxShadow: '0 0 60px ' + PAL.glow, pointerEvents: 'none', opacity: p.screen && p.screen.mode === 'off' ? 0 : 1 } }),
    /* brand plate */
    React.createElement('div', {
      key: 'plate',
      style: {
        position: 'absolute', left: 462, top: 456, width: 356, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        fontFamily: '"PT Sans Narrow", sans-serif', color: SHELL.ink, whiteSpace: 'nowrap',
      },
    },
      React.createElement('span', { key: 'a', style: { fontSize: 32, fontWeight: 700, letterSpacing: '3px' } }, 'КОМБУЧА-3М'),
      React.createElement('span', { key: 'b', style: { fontSize: 17, letterSpacing: '1px', opacity: .6 } }, 'ГОСТ 28376-89')),
    React.createElement('div', { key: 'sub', style: { position: 'absolute', left: 462, top: 500, width: 356, fontFamily: '"PT Sans Narrow", sans-serif', fontSize: 15, letterSpacing: '1px', color: SHELL.ink, opacity: .45, whiteSpace: 'nowrap' } }, 'ИГРУШКА ЭЛЕКТРОННАЯ СИМБИОТИЧЕСКАЯ · 1 ШТ.'),
    btn('A', 512, 'ЧАЙ'), btn('B', 640, 'МЫТЬ'), btn('C', 768, 'СОС'),
    /* speaker + led */
    React.createElement('div', { key: 'spk', style: { position: 'absolute', left: 540, top: 620, width: 200, height: 34, display: 'grid', gridTemplateColumns: 'repeat(10,1fr)', gap: 6 } },
      Array.from({ length: 20 }, (_, i) => React.createElement('div', { key: i, style: { background: SHELL.deep, opacity: .5, borderRadius: 3 } }))),
    React.createElement('div', {
      key: 'led',
      style: {
        position: 'absolute', left: 432, top: 128, width: 16, height: 16, borderRadius: '50%',
        background: p.led ? '#e05a3a' : '#5c4030', boxShadow: p.led ? '0 0 16px #e05a3a' : 'none',
      },
    }),
    /* sound arcs */
    p.beep ? React.createElement('div', {
      key: 'beep',
      style: { position: 'absolute', left: 880, top: 540, width: 90, height: 90, borderRadius: '50%', border: '6px solid rgba(240,220,180,.55)', borderLeftColor: 'transparent', borderBottomColor: 'transparent', transform: 'scale(' + p.beep + ')', opacity: 1 - p.beep * .5 },
    }) : null,
  );
}

/* ── room / camera / caption ──────────────────────────────────── */
function Frame(p) {
  music(p.globalTime != null ? p.globalTime : p.t, window.__kombuchaSound !== false);
  const cam = p.cam, s = cam[2];
  const shake = p.shake || 0;
  const sx = shake ? Math.sin(p.t * 47) * shake : 0;
  const sy = shake ? Math.cos(p.t * 39) * shake : 0;
  return React.createElement('div', { style: { position: 'absolute', inset: 0, overflow: 'hidden', background: '#20211a' } },
    /* wall */
    React.createElement('div', {
      key: 'wall',
      style: {
        position: 'absolute', inset: 0,
        background: 'radial-gradient(120% 90% at 50% 20%, #4a4a38 0%, #2a2b21 55%, #16170f 100%)',
      },
    }),
    React.createElement('div', {
      key: 'cloth',
      style: {
        position: 'absolute', left: -100, right: -100, top: 470, bottom: -40,
        background: 'repeating-linear-gradient(90deg,#5b3a2e 0 46px,#6b4636 46px 92px), repeating-linear-gradient(0deg,rgba(0,0,0,.25) 0 46px,rgba(255,255,255,.05) 46px 92px)',
        backgroundBlendMode: 'multiply',
        transform: 'perspective(700px) rotateX(58deg)', transformOrigin: 'top center',
        boxShadow: 'inset 0 40px 80px rgba(0,0,0,.55)',
      },
    }),
    /* camera layer */
    React.createElement('div', {
      key: 'cam',
      style: {
        position: 'absolute', left: 0, top: 0, width: 1280, height: 720, transformOrigin: '0 0',
        transform: 'translate(' + (640 - cam[0] * s + sx) + 'px,' + (360 - cam[1] * s + sy) + 'px) scale(' + s + ')',
      },
    }, React.createElement(Device, { screen: p.screen, press: p.press, led: p.led, beep: p.beep })),
    /* day/night wash */
    p.wash ? React.createElement('div', { key: 'wash', style: { position: 'absolute', inset: 0, background: '#0a1428', opacity: p.wash, pointerEvents: 'none' } }) : null,
    /* vignette + grain */
    React.createElement('div', { key: 'vig', style: { position: 'absolute', inset: 0, pointerEvents: 'none', boxShadow: 'inset 0 0 220px rgba(0,0,0,.85)' } }),
    /* caption */
    p.caption ? React.createElement('div', {
      key: 'capscrim',
      style: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 190, pointerEvents: 'none', opacity: p.capOpacity, background: 'linear-gradient(180deg, rgba(12,13,8,0) 0%, rgba(12,13,8,.55) 45%, rgba(12,13,8,.8) 100%)' },
    }) : null,
    p.caption ? React.createElement('div', {
      key: 'cap',
      style: {
        position: 'absolute', left: 0, right: 0, bottom: 46, textAlign: 'center', opacity: p.capOpacity,
        fontFamily: '"PT Sans Narrow", sans-serif', fontSize: 34, letterSpacing: '2px', color: '#efe6cd',
        textShadow: '0 3px 0 rgba(0,0,0,.85)', padding: '0 90px', textWrap: 'pretty',
      },
    }, p.caption) : null,
    p.title ? React.createElement('div', {
      key: 'title',
      style: {
        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(16,17,11,' + (p.titleOpacity * .9) + ')', opacity: p.titleOpacity, gap: 18,
      },
    },
      React.createElement('div', { key: 't1', style: { fontFamily: '"PT Sans Narrow", sans-serif', fontSize: 82, fontWeight: 700, letterSpacing: '8px', color: '#efe6cd' } }, 'КОМБУЧА-3М'),
      React.createElement('div', { key: 't2', style: { fontFamily: '"PT Sans Narrow", sans-serif', fontSize: 30, letterSpacing: '4px', color: '#b9ad8c' } }, 'ОН ТОЖЕ ВАС НЕ ЗАБУДЕТ'),
    ) : null,
  );
}

/* ── camera presets, chained so every cut frame-matches ───────── */
const CAM = {
  'Заставка':   [[640, 380, .82], [640, 360, .92]],
  'Знакомство': [[640, 360, .92], [640, 300, 1.75]],
  'Кормление':  [[640, 300, 1.75], [640, 320, 1.85]],
  'Забыли':     [[640, 320, 1.85], [640, 380, 1.00]],
  'Обида':      [[640, 380, 1.00], [640, 300, 2.10]],
  'Спасение':   [[640, 300, 2.10], [640, 320, 1.90]],
  'Финал':      [[640, 320, 1.90], [640, 360, 0.85]],
};
const lerp = (a, b, t) => a + (b - a) * t;
function camAt(name, prog) {
  const [a, b] = CAM[name]; const e = Easing.easeInOutCubic(clamp(prog, 0, 1));
  return [lerp(a[0], b[0], e), lerp(a[1], b[1], e), lerp(a[2], b[2], e)];
}
const capFade = (p) => Math.min(clamp((p - .06) / .12, 0, 1), clamp((1 - p - .04) / .10, 0, 1));

function base(scene, prog, t) {
  const off = SCENE_OFFSETS[scene.index] || 0;
  return { cam: camAt(scene.name, prog), t, globalTime: off + t, spanStart: off, spanEnd: off + (+scene.dur || 0), caption: scene.text, capOpacity: capFade(prog) };
}

/* ── scenes ───────────────────────────────────────────────────── */
function SZastavka() {
  const { scene, progress: p, localTime: t, index } = useScene(); scene.index = index;
  const on = p > .12;
  const boot = clamp((p - .16) / .42, 0, 1);
  const game = p > .68;
  const screen = !on ? { mode: 'off' }
    : game ? { mode: 'game', t, day: 1, food: .8, growth: .12, mood: 'happy', msg: 'ЗДРАВСТВУЙТЕ.' }
      : { mode: 'boot', boot, t };
  return React.createElement(Frame, Object.assign(base(scene, p, t), {
    screen, led: on && Math.sin(t * 6) > -.3,
    beep: p > .1 && p < .2 ? 1 + (p - .1) * 6 : 0,
  }));
}

function SZnakomstvo() {
  const { scene, progress: p, localTime: t, index } = useScene(); scene.index = index;
  return React.createElement(Frame, Object.assign(base(scene, p, t), {
    screen: {
      mode: 'game', t, day: 1, food: .8, growth: .12, mood: 'happy',
      bubble: p > .35 && p < .85 ? 'КОРМИ' : null,
      msg: 'ОБЪЕКТ ЖИВ. ПОКА ЧТО.',
    },
    led: Math.sin(t * 6) > -.3,
  }));
}

function SKormlenie() {
  const { scene, progress: p, localTime: t, index } = useScene(); scene.index = index;
  const pressed = (p > .18 && p < .30) || (p > .40 && p < .50);
  const pour = clamp((p - .22) / .5, 0, 1);
  const growth = .12 + clamp((p - .25) / .6, 0, 1) * .18;
  return React.createElement(Frame, Object.assign(base(scene, p, t), {
    press: pressed ? 'A' : null,
    screen: {
      mode: 'game', t, day: 3, food: .5 + pour * .5, growth, mood: p > .55 ? 'happy' : 'ok',
      sugar: p > .2 && p < .8 ? 1 : 0, hearts: p > .55 ? clamp((p - .55) / .35, 0, 1) : 0,
      msg: p > .6 ? 'СЫТ. НО ЭТО НЕНАДОЛГО.' : 'ПОДАЧА СЛАДКОГО ЧАЯ...',
    },
    led: Math.sin(t * 6) > -.3,
  }));
}

function SZabyli() {
  const { scene, progress: p, localTime: t, index } = useScene(); scene.index = index;
  const day = 3 + Math.floor(clamp((p - .1) / .75, 0, 1) * 14);
  const food = 1 - clamp((p - .1) / .8, 0, 1);
  const wash = Math.abs(Math.sin(p * Math.PI * 4)) * .55 * clamp(p * 4, 0, 1);
  return React.createElement(Frame, Object.assign(base(scene, p, t), {
    wash,
    screen: {
      mode: 'game', t, day, food, growth: .30 - clamp((p - .3) / .7, 0, 1) * .06,
      mood: p > .6 ? 'sad' : 'ok', mold: clamp((p - .6) / .5, 0, 1) * .5,
      scobyTop: 15 + Math.round(clamp((p - .5) / .5, 0, 1) * 3),
      msg: p > .75 ? 'КОРМЛЕНИЕ ПРОСРОЧЕНО НА 11 ДН.' : 'ОЖИДАНИЕ...',
    },
    led: p > .7 ? Math.sin(t * 10) > 0 : Math.sin(t * 6) > -.3,
  }));
}

function SObida() {
  const { scene, progress: p, localTime: t, index } = useScene(); scene.index = index;
  const bub = p > .35 && p < .8;
  return React.createElement(Frame, Object.assign(base(scene, p, t), {
    shake: p > .12 && p < .3 ? 4 : 0,
    screen: {
      mode: 'game', t, day: 17, food: .05, growth: .26, mood: p > .45 ? 'away' : 'angry',
      mold: .8, flies: true, alarm: p > .1 && p < .9, scobyTop: 18,
      bubble: bub ? 'ОН ВСЁ ПОМНИТ' : null,
      msg: 'ОБЪЕКТ ОТВЕРНУЛСЯ. ОБЪЕКТ ЖДЁТ.',
    },
    led: Math.sin(t * 12) > 0, beep: p > .15 && p < .35 ? 1 + (p - .15) * 4 : 0,
  }));
}

function SSpasenie() {
  const { scene, progress: p, localTime: t, index } = useScene(); scene.index = index;
  const mash = p < .55;
  const which = mash ? ['A', 'B', 'C'][Math.floor(t * 6) % 3] : null;
  const rec = clamp((p - .2) / .7, 0, 1);
  return React.createElement(Frame, Object.assign(base(scene, p, t), {
    press: which, shake: mash ? 3 * (1 - p) : 0,
    screen: {
      mode: 'game', t, day: 18, food: .05 + rec * .9, growth: .26 + rec * .12,
      mood: p > .72 ? 'ok' : 'away', mold: .8 * (1 - rec), flies: p < .45,
      sugar: p < .6 ? 1 : 0, hearts: p > .8 ? clamp((p - .8) / .18, 0, 1) : 0,
      msg: p > .72 ? 'ИЗВИНЕНИЯ ПРИНЯТЫ. УСЛОВНО.' : 'ЧАЙ! САХАР! ЧТО УГОДНО!',
    },
    led: Math.sin(t * (mash ? 14 : 6)) > 0,
  }));
}

function SFinal() {
  const { scene, progress: p, localTime: t, index } = useScene(); scene.index = index;
  const grow = clamp((p - .05) / .45, 0, 1);
  const title = clamp((p - .62) / .18, 0, 1);
  return React.createElement(Frame, Object.assign(base(scene, p, t), {
    capOpacity: capFade(p) * (1 - title),
    screen: {
      mode: 'game', t, day: 30, food: .9, growth: .38 + grow * .62, mood: 'happy', scobyTop: 14,
      msg: p > .4 ? 'ОБЪЕКТ БОЛЬШЕ ВЛАДЕЛЬЦА.' : 'ОБЪЕКТ РАСТЁТ.',
    },
    led: Math.sin(t * 6) > -.3,
    title: true, titleOpacity: title,
  }));
}

const SCENE_MAP = {
  'Заставка': SZastavka, 'Знакомство': SZnakomstvo, 'Кормление': SKormlenie,
  'Забыли': SZabyli, 'Обида': SObida, 'Спасение': SSpasenie, 'Финал': SFinal,
};

function KombuchaPiece() {
  const [tw, setTweak] = useTweaks(window.TWEAK_DEFAULTS);
  PAL = SKINS[tw.skin] || SKINS.olive;
  window.__kombuchaSound = tw.sound !== false;
  return React.createElement(React.Fragment, null,
    React.createElement(SceneStage, {
      width: 1280, height: 720, bg: '#101109',
      scenes: window.OM_SCENES, playback: window.OM_PLAYBACK,
    }, SCENE_MAP),
    React.createElement(TweaksPanel, null,
      React.createElement(TweakSection, { key: 's1', label: 'Экран' }),
      React.createElement(TweakRadio, {
        key: 'skin', label: 'Люминофор', value: tw.skin, options: ['olive', 'amber', 'ash'],
        onChange: (v) => setTweak('skin', v),
      }),
      React.createElement(TweakToggle, {
        key: 'snd', label: 'Музыка', value: tw.sound !== false,
        onChange: (v) => setTweak('sound', v),
      }),
      React.createElement(TweakSection, { key: 's2', label: 'Редактор' }),
      React.createElement(TweakToggle, {
        key: 'me', label: 'Motion editor', value: tw.motionEditor,
        onChange: (v) => setTweak('motionEditor', v),
      }),
    ),
  );
}
window.KombuchaPiece = KombuchaPiece;
