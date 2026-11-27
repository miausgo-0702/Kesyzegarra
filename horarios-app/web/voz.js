// Voz: dictado (voz a texto) y lectura de respuestas (texto a voz).
// En el APK usa el reconocimiento y la voz nativos de Android (window.AndroidApp);
// en navegadores, la Web Speech API (Chrome, Edge, Safari).
(function (G) {
  const A = G.AndroidApp;
  const nativo = !!(A && A.vozDisponible);
  const SR = G.SpeechRecognition || G.webkitSpeechRecognition;
  let actual = null;           // reconocimiento en curso
  let cbNativo = null;         // callbacks del reconocimiento nativo
  let finHabla = null;

  // El APK llama a window.__voz({tipo, texto}) y window.__vozFinHabla()
  G.__voz = ev => {
    if (!cbNativo) return;
    const c = cbNativo;
    if (ev.tipo === "parcial") c.onParcial && c.onParcial(ev.texto || "");
    else if (ev.tipo === "final") { cbNativo = null; c.onFinal && c.onFinal(ev.texto || ""); }
    else if (ev.tipo === "error") { cbNativo = null; c.onError && c.onError(ev.texto || "No te escuché."); }
    else if (ev.tipo === "nivel") c.onNivel && c.onNivel(+ev.texto || 0);
  };
  G.__vozFinHabla = () => { const f = finHabla; finHabla = null; f && f(); };

  // texto apto para leer en voz alta
  const limpiar = t => String(t || "")
    .replace(/```[\s\S]*?```/g, " ").replace(/[*_#>`|]/g, " ")
    .replace(/\p{Extended_Pictographic}/gu, " ")
    .replace(/(\d{1,2}) a (\d{1,2})/g, "$1 a $2").replace(/ · /g, ", ")
    .replace(/\s+/g, " ").trim();

  let vozEs = null;
  function elegirVoz() {
    if (!G.speechSynthesis) return null;
    const vs = speechSynthesis.getVoices();
    return vs.find(v => /es[-_]AR/i.test(v.lang)) || vs.find(v => /es[-_](419|US|MX)/i.test(v.lang)) || vs.find(v => /^es/i.test(v.lang)) || null;
  }
  if (G.speechSynthesis) { vozEs = elegirVoz(); speechSynthesis.onvoiceschanged = () => { vozEs = elegirVoz(); }; }

  const V = {
    puedeEscuchar: () => nativo ? !!A.vozDisponible() : !!SR,
    puedeHablar: () => nativo || !!G.speechSynthesis,
    escuchando: () => !!(actual || cbNativo),

    /** Escucha una frase. onParcial(texto) mientras habla, onFinal(texto) al terminar. */
    escuchar(cb) {
      V.detener();
      if (nativo) { cbNativo = cb; A.vozEscuchar(); return; }
      if (!SR) { cb.onError && cb.onError("Este navegador no permite dictar. Probá con Chrome."); return; }
      const r = new SR();
      r.lang = "es-AR"; r.interimResults = true; r.continuous = false; r.maxAlternatives = 1;
      let final = "", parcial = "", terminado = false;
      r.onresult = e => {
        parcial = "";
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (e.results[i].isFinal) final += t; else parcial += t;
        }
        cb.onParcial && cb.onParcial((final + " " + parcial).trim());
      };
      r.onerror = e => {
        terminado = true; actual = null;
        const m = { "not-allowed": "Permití el uso del micrófono para hablar con el asistente.", "no-speech": "No te escuché. Probá de nuevo.", "audio-capture": "No encuentro el micrófono.", "network": "Sin conexión para reconocer la voz." }[e.error] || "No pude escucharte.";
        if (e.error !== "aborted") cb.onError && cb.onError(m);
      };
      r.onend = () => {
        if (terminado) return; actual = null;
        const t = (final || parcial).trim();
        if (t) cb.onFinal && cb.onFinal(t); else cb.onError && cb.onError("No te escuché. Probá de nuevo.");
      };
      actual = r;
      try { r.start(); } catch (e) { actual = null; cb.onError && cb.onError("No pude usar el micrófono."); }
    },
    detener() {
      if (nativo && cbNativo) { cbNativo = null; try { A.vozDetener(); } catch (e) {} }
      if (actual) { const r = actual; actual = null; try { r.abort(); } catch (e) {} }
    },

    /** Lee un texto en voz alta; onFin() al terminar. */
    hablar(texto, onFin) {
      V.callar();
      const t = limpiar(texto);
      if (!t) { onFin && onFin(); return; }
      if (nativo) { finHabla = onFin || null; A.vozHablar(t); return; }
      if (!G.speechSynthesis) { onFin && onFin(); return; }
      const u = new SpeechSynthesisUtterance(t);
      u.lang = "es-AR"; if (vozEs) u.voice = vozEs; u.rate = 1.05;
      u.onend = u.onerror = () => { onFin && onFin(); };
      speechSynthesis.speak(u);
    },
    callar() {
      finHabla = null;
      if (nativo) { try { A.vozCallar(); } catch (e) {} return; }
      if (G.speechSynthesis) speechSynthesis.cancel();
    },
  };
  G.Voz = V;
})(window);
