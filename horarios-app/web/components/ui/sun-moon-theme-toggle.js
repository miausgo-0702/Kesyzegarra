// SunMoonThemeToggle — botón de tema claro/oscuro: la luna se pone y el sol sale (o al revés)
// sobre un cielo de noche / día. Adaptación a JavaScript (sin React) del componente
// sun-moon-theme-toggle.tsx (shadcn). Los íconos son Sun y Moon de lucide (licencia ISC).
//
//   const boton = SunMoonThemeToggle.create({ size: 40, storageKey: "mh_tema", onThemeChange: t => ... });
//   contenedor.appendChild(boton.el);
(function (G) {
  "use strict";

  const MOON = { side: -1, spin: 25 };
  const SUN = { side: 1, spin: 120 };
  const ARC_RADIUS = 115;
  const QUARTER_TURN = Math.PI / 2;
  const KEYFRAME_STEPS = 30;
  const NIGHT_SKY = "linear-gradient(180deg, #090f2a 0%, #16204b 60%, #2a2f66 100%)";
  const DAY_SKY = "linear-gradient(180deg, #4ea8ff 0%, #9fd3ff 60%, #e3f3ff 100%)";
  const STARS = [
    { x: 24, y: 22, r: 1.6, t: 2100 }, { x: 66, y: 16, r: 1.2, t: 2600 }, { x: 80, y: 42, r: 1.8, t: 1900 },
    { x: 38, y: 58, r: 1.1, t: 2900 }, { x: 58, y: 74, r: 1.4, t: 2300 }, { x: 14, y: 72, r: 1.2, t: 2500 },
  ];
  const SKY_EASING = "cubic-bezier(0.65, 0, 0.35, 1)";
  const PAGE_FADE_STYLE_ID = "sun-moon-theme-fade";
  const PAGE_FADE_PROPERTIES = "color, background-color, border-color, outline-color, text-decoration-color, fill, stroke";
  // lucide: moon / sun
  const ICON_MOON = '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>';
  const ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>';

  let pageFadeCleanup = 0;

  // Los dos astros recorren un mismo círculo centrado debajo del botón, como una bóveda.
  function arcPoint(side, angle) { return { x: side * ARC_RADIUS * Math.sin(angle), y: ARC_RADIUS * (1 - Math.cos(angle)) }; }
  function easeInCubic(t) { return t * t * t; }
  function easeOutBack(t) { const o = 1.4; return 1 + (o + 1) * (t - 1) ** 3 + o * (t - 1) ** 2; }

  function settingKeyframes({ side, spin }) {
    return Array.from({ length: KEYFRAME_STEPS + 1 }, (_, i) => {
      const t = i / KEYFRAME_STEPS, travelled = easeInCubic(t), { x, y } = arcPoint(side, travelled * QUARTER_TURN);
      return { offset: t, transform: `translate(${x}%, ${y}%) rotate(${side * spin * travelled}deg)`, opacity: t < 0.55 ? 1 : (1 - t) / 0.45 };
    });
  }
  function risingKeyframes({ side, spin }) {
    return Array.from({ length: KEYFRAME_STEPS + 1 }, (_, i) => {
      const t = i / KEYFRAME_STEPS, remaining = 1 - easeOutBack(t), { x, y } = arcPoint(side, remaining * QUARTER_TURN);
      return { offset: t, transform: `translate(${x}%, ${y}%) rotate(${side * spin * remaining}deg) scale(${1 - 0.28 * remaining})`, opacity: Math.min(1, t / 0.3) };
    });
  }
  const KEYFRAMES = { moonSets: settingKeyframes(MOON), moonRises: risingKeyframes(MOON), sunSets: settingKeyframes(SUN), sunRises: risingKeyframes(SUN) };

  const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const readDocumentTheme = () => document.documentElement.classList.contains("dark") ? "dark" : "light";

  function applyDocumentTheme(theme, duration) {
    if (duration > 0 && !prefersReducedMotion()) {
      const style = document.getElementById(PAGE_FADE_STYLE_ID) ||
        document.head.appendChild(Object.assign(document.createElement("style"), { id: PAGE_FADE_STYLE_ID }));
      style.textContent = `*, *::before, *::after { transition-property: ${PAGE_FADE_PROPERTIES} !important; transition-duration: ${duration}ms !important; transition-timing-function: cubic-bezier(0.65, 0, 0.35, 1) !important; transition-delay: 0s !important; }`;
      window.clearTimeout(pageFadeCleanup);
      pageFadeCleanup = window.setTimeout(() => style.remove(), duration + 100);
    }
    document.documentElement.classList.toggle("dark", theme === "dark");
  }

  function swapBodies(moon, sun, skies, flight, next, duration) {
    // Tocar de nuevo a mitad de camino = la misma animación hacia atrás desde donde está.
    if (flight.current.length > 0) { for (const a of flight.current) a.reverse(); return; }
    if (!moon || !sun || typeof moon.animate !== "function" || prefersReducedMotion()) return;
    const toLight = next === "light";
    const setting = (toLight ? moon : sun).animate(toLight ? KEYFRAMES.moonSets : KEYFRAMES.sunSets, { duration: duration * 0.65, fill: "both" });
    const rising = (toLight ? sun : moon).animate(toLight ? KEYFRAMES.sunRises : KEYFRAMES.moonRises, { duration: duration * 0.64, delay: duration * 0.36, fill: "both" });
    const pair = [setting, rising];
    if (skies.night && skies.day) {
      const o = { duration, easing: SKY_EASING, fill: "both" };
      pair.push(
        skies.night.animate([{ opacity: toLight ? 1 : 0 }, { opacity: toLight ? 0 : 1 }], o),
        skies.day.animate([{ opacity: toLight ? 0 : 1 }, { opacity: toLight ? 1 : 0 }], o));
    }
    flight.current = pair;
    Promise.all(pair.map(a => a.finished)).then(() => {
      if (flight.current !== pair) return;
      flight.current = [];
      for (const a of pair) a.cancel();
    }, e => { if (!(e instanceof DOMException && e.name === "AbortError")) throw e; });
  }

  /**
   * Crea el botón. Opciones (como las props del componente de React):
   * theme, defaultTheme ("dark"), onThemeChange, syncDocument (true), storageKey, duration (1740),
   * size (40), classNames {sun, moon}, sky (true), className, title.
   */
  function create(opts) {
    opts = Object.assign({ defaultTheme: "dark", syncDocument: true, duration: 1740, size: 40, sky: true }, opts || {});
    const controlled = opts.theme !== undefined;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.slot = "theme-toggle";
    btn.className = "smt" + (opts.sky ? " smt-sky" : "") + (opts.className ? " " + opts.className : "");
    btn.style.width = btn.style.height = opts.size + "px";
    btn.innerHTML =
      (opts.sky ? `<span class="smt-cielo" data-sky="night" aria-hidden="true" style="background:${NIGHT_SKY}">${STARS.map(s => `<span data-star class="smt-estrella" style="left:${s.x}%;top:${s.y}%;width:${s.r * 2}px;height:${s.r * 2}px"></span>`).join("")}</span>
        <span class="smt-cielo" data-sky="day" aria-hidden="true" style="background:${DAY_SKY}"></span>` : "") +
      `<span class="smt-astro ${opts.classNames && opts.classNames.moon || "smt-luna"}" data-body="moon" aria-hidden="true">${ICON_MOON}</span>
       <span class="smt-astro ${opts.classNames && opts.classNames.sun || "smt-sol"}" data-body="sun" aria-hidden="true">${ICON_SUN}</span>`;
    const moon = btn.querySelector('[data-body="moon"]'), sun = btn.querySelector('[data-body="sun"]');
    const night = btn.querySelector('[data-sky="night"]'), day = btn.querySelector('[data-sky="day"]');
    const flight = { current: [] };

    let theme = controlled ? opts.theme : opts.defaultTheme;
    if (!controlled) {
      let stored = null; try { stored = opts.storageKey ? localStorage.getItem(opts.storageKey) : null; } catch (e) {}
      theme = stored === "light" || stored === "dark" ? stored : opts.syncDocument ? readDocumentTheme() : opts.defaultTheme;
      if (opts.syncDocument && theme !== readDocumentTheme()) document.documentElement.classList.toggle("dark", theme === "dark");
    }

    const resting = (el, body, visible) => {
      el.style.transform = visible ? "none" : `translate(${body.side * ARC_RADIUS}%, ${ARC_RADIUS}%)`;
      el.style.opacity = visible ? 1 : 0;
    };
    const pintar = () => {
      btn.dataset.state = theme;
      btn.setAttribute("aria-label", theme === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro");
      btn.title = opts.title || btn.getAttribute("aria-label");
      resting(moon, MOON, theme === "dark"); resting(sun, SUN, theme === "light");
      if (night) night.style.opacity = theme === "dark" ? 1 : 0;
      if (day) day.style.opacity = theme === "light" ? 1 : 0;
    };
    pintar();

    const setTheme = next => {
      if (next === theme) return;
      theme = next;
      pintar();
      swapBodies(moon, sun, { night, day }, flight, theme, opts.duration);
    };

    btn.addEventListener("click", e => {
      opts.onClick && opts.onClick(e);
      if (e.defaultPrevented) return;
      const next = theme === "dark" ? "light" : "dark";
      if (opts.storageKey) { try { localStorage.setItem(opts.storageKey, next); } catch (er) {} }
      if (opts.syncDocument) applyDocumentTheme(next, opts.duration);
      if (!controlled) setTheme(next);
      opts.onThemeChange && opts.onThemeChange(next);
    });

    // si otra parte de la app cambia la clase .dark, el botón la sigue
    let observer = null;
    if (opts.syncDocument && !controlled) {
      observer = new MutationObserver(() => setTheme(readDocumentTheme()));
      observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    }
    // estrellas titilando
    const twinkles = night && !prefersReducedMotion() && typeof night.animate === "function"
      ? [...night.querySelectorAll("[data-star]")].map((s, i) => s.animate([{ opacity: 0.35 }, { opacity: 1 }, { opacity: 0.35 }], { duration: STARS[i] ? STARS[i].t : 2400, delay: -i * 530, iterations: Infinity, easing: "ease-in-out" }))
      : [];

    return {
      el: btn,
      setTheme(t) { setTheme(t); },
      destroy() { observer && observer.disconnect(); twinkles.forEach(a => a.cancel()); flight.current.forEach(a => a.cancel()); btn.remove(); },
    };
  }

  G.SunMoonThemeToggle = { create };
})(window);
