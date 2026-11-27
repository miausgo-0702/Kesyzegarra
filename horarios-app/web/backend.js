// Acceso a datos: modo LOCAL (localStorage) o ONLINE (Firebase Auth + Firestore).
// Misma interfaz para los dos:
//   init(), onUser(cb), on(evento, cb)  eventos: datos | cambios | avisos | empleados
//   ingresar(dni, pin), registrar(dni, pin, persona), ingresarAdmin(usuario, clave), salir()
//   ocupadas() -> Set de personas ya registradas
//   guardarDatos(obj), borrarEmpleado(id), reasignarEmpleado(id, persona)
//   guardarCambio({persona, fecha, t, h, nota}), borrarCambio(id)
//   publicarAviso(texto), borrarAviso(id)
(function (G) {
  const subs = {};
  const emit = (ev, v) => (subs[ev] || []).forEach(cb => { try { cb(v); } catch (e) { console.error(e); } });
  const on = (ev, cb) => { (subs[ev] = subs[ev] || []).push(cb); };
  let userCb = () => {};
  const err = (codigo, msg) => { const e = new Error(msg); e.codigo = codigo; return e; };
  const dniOk = d => /^\d{7,9}$/.test(d);
  const pinOk = p => /^\d{4}$/.test(p);
  const keyPersona = n => G.L.norm(n).replace(/[^a-z0-9]+/g, "_");

  async function pbkdf2(pass, sal) {
    if (!(G.crypto && G.crypto.subtle)) throw err("crypto", "Este navegador no permite validar la clave. Abrí la app desde la dirección https.");
    const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pass), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: new TextEncoder().encode(sal), iterations: 150000 }, k, 256);
    return Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, "0")).join("");
  }
  const adminDe = usuario => G.ADMINS[String(usuario || "").trim().toLowerCase()] ? String(usuario).trim().toLowerCase() : null;

  /* =================== MODO LOCAL =================== */
  const Local = {
    online: false,
    _db() { try { return JSON.parse(localStorage.getItem("mh_db")) || {}; } catch (e) { return {}; } },
    _save(db) { localStorage.setItem("mh_db", JSON.stringify(db)); },
    _all(ev) {
      const db = this._db();
      if (ev === "datos") emit("datos", db.datos || null);
      if (ev === "cambios") emit("cambios", Object.entries(db.cambios || {}).map(([id, c]) => ({ id, ...c })));
      if (ev === "avisos") emit("avisos", Object.entries(db.avisos || {}).map(([id, c]) => ({ id, ...c })).sort((a, b) => b.creado - a.creado));
      if (ev === "ofertas") emit("ofertas", Object.entries(db.ofertas || {}).map(([id, o]) => ({ id, ...o })));
      if (ev === "empleados") emit("empleados", Object.entries(db.empleados || {}).map(([id, e]) => ({ id, dni: e.dni, persona: e.persona, creado: e.creado })));
    },
    _emitAll() { ["datos", "cambios", "avisos", "empleados", "ofertas"].forEach(e => this._all(e)); },
    async init() {
      let s = null; try { s = JSON.parse(localStorage.getItem("mh_sesion")); } catch (e) {}
      setTimeout(() => { this._emitAll(); this._sesion(s); }, 0);
    },
    _sesion(s) {
      if (s) localStorage.setItem("mh_sesion", JSON.stringify(s)); else localStorage.removeItem("mh_sesion");
      if (s && s.tipo === "empleado") {
        const e = (this._db().empleados || {})[s.id];
        if (!e) { localStorage.removeItem("mh_sesion"); return userCb(null); }
        return userCb({ tipo: "empleado", id: s.id, dni: e.dni, persona: e.persona });
      }
      userCb(s && s.tipo === "admin" ? { tipo: "admin", usuario: G.ADMINS[s.usuario].nombre, clave: s.usuario } : null);
    },
    async ingresar(dni, pin) {
      const db = this._db();
      const id = Object.keys(db.empleados || {}).find(k => db.empleados[k].dni === dni);
      if (!id) throw err("no-registrado", "Ese DNI no está registrado.");
      if (db.empleados[id].pin !== await pbkdf2(pin, "pin:" + dni)) throw err("pin", "PIN incorrecto.");
      this._sesion({ tipo: "empleado", id });
    },
    async registrar(dni, pin, persona) {
      if (!dniOk(dni)) throw err("dni", "Ingresá un DNI válido (solo números).");
      if (!pinOk(pin)) throw err("pin", "El PIN tiene que tener 4 números.");
      const db = this._db(); db.empleados = db.empleados || {};
      if (Object.values(db.empleados).some(e => e.dni === dni)) throw err("dni-usado", "Ese DNI ya está registrado. Ingresá con tu PIN.");
      if (Object.values(db.empleados).some(e => keyPersona(e.persona) === keyPersona(persona))) throw err("persona-usada", persona + " ya tiene una cuenta. Hablá con un administrador.");
      const id = "e" + Date.now().toString(36);
      db.empleados[id] = { dni, persona, pin: await pbkdf2(pin, "pin:" + dni), creado: Date.now() };
      this._save(db); this._all("empleados"); this._sesion({ tipo: "empleado", id });
    },
    async ingresarAdmin(usuario, clave) {
      const u = adminDe(usuario);
      const h = (G.ADMIN_HASHES || {})[u];
      if (!u || !h || h !== await pbkdf2(clave, "mishorarios:" + u)) throw err("admin", "Usuario o clave incorrectos.");
      this._sesion({ tipo: "admin", usuario: u });
    },
    async salir() { this._sesion(null); },
    sesionNativa() { return null; },
    async guardarOferta(o) { const db = this._db(); db.ofertas = db.ofertas || {}; const id = o.id || "o" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); const x = { ...o }; delete x.id; db.ofertas[id] = { ...(db.ofertas[id] || {}), ...x }; this._save(db); this._all("ofertas"); return id; },
    async borrarOferta(id) { const db = this._db(); delete (db.ofertas || {})[id]; this._save(db); this._all("ofertas"); },
    async ofertasIA() { const e = new Error("Cargar ofertas con IA necesita el modo online (Firebase)."); e.codigo = "local"; throw e; },
    async guardarClaveImagenes() { const e = new Error("Necesita el modo online."); e.codigo = "local"; throw e; },
    async leerPerfil(clave) { try { return JSON.parse(localStorage.getItem("mh_perfil_" + clave)) || {}; } catch (e) { return {}; } },
    async guardarPerfil(clave, perfil) { localStorage.setItem("mh_perfil_" + clave, JSON.stringify(perfil)); },
    async registrarToken() {}, async borrarToken() {},
    async asistente() { const e = new Error("El asistente de IA necesita el modo online (Firebase). Ver GUIA_FIREBASE.md."); e.codigo = "local"; throw e; },
    async ocupadas() { return new Set(Object.values(this._db().empleados || {}).map(e => keyPersona(e.persona))); },
    async guardarDatos(d) { const db = this._db(); db.datos = { ...d, actualizado: Date.now() }; this._save(db); this._all("datos"); },
    async borrarEmpleado(id) { const db = this._db(); delete (db.empleados || {})[id]; this._save(db); this._all("empleados"); },
    async reasignarEmpleado(id, persona) { const db = this._db(); db.empleados[id].persona = persona; this._save(db); this._all("empleados"); },
    async guardarCambio(c) { const db = this._db(); db.cambios = db.cambios || {}; db.cambios["c" + Date.now().toString(36)] = { ...c, creado: Date.now() }; this._save(db); this._all("cambios"); },
    async borrarCambio(id) { const db = this._db(); delete db.cambios[id]; this._save(db); this._all("cambios"); },
    async guardarCambios(lista) {
      const db = this._db(); db.cambios = db.cambios || {};
      lista.forEach((c, i) => { db.cambios["c" + Date.now().toString(36) + i] = { ...c, creado: Date.now() }; });
      this._save(db); this._all("cambios");
    },
    async responderCambio(ids, estado, respuesta) {
      const db = this._db();
      ids.forEach(id => { const c = (db.cambios || {})[id]; if (c && c.estado === "pendiente") Object.assign(c, { estado, respuesta: respuesta || "", respondido: Date.now() }); });
      this._save(db); this._all("cambios");
    },
    async publicarAviso(texto, por) { const db = this._db(); db.avisos = db.avisos || {}; db.avisos["a" + Date.now().toString(36)] = { texto, por, creado: Date.now() }; this._save(db); this._all("avisos"); },
    async borrarAviso(id) { const db = this._db(); delete db.avisos[id]; this._save(db); this._all("avisos"); },
  };

  /* =================== MODO ONLINE (Firebase) =================== */
  const Online = {
    online: true,
    _unsubs: [],
    async init() {
      const cfg = G.FIREBASE_CONFIG;
      firebase.initializeApp(cfg);
      this.auth = firebase.auth();
      this.db = firebase.firestore();
      if (cfg.emulador) { this.auth.useEmulator("http://" + cfg.emulador + ":9099", { disableWarnings: true }); this.db.useEmulator(cfg.emulador, 8080); }
      else { try { await this.db.enablePersistence({ synchronizeTabs: true }); } catch (e) {} }
      this.auth.onAuthStateChanged(u => { if (!this._ocupado) this._resolver(u); });
    },
    _esAdmin(u) { return u && Object.keys(G.ADMINS).find(k => G.ADMINS[k].email === u.email); },
    async _resolver(u) {
      this._unsubs.forEach(f => f()); this._unsubs = [];
      if (!u) { const m = this._aviso; this._aviso = null; return userCb(null, m); }
      const adm = this._esAdmin(u);
      let perfil;
      if (adm) perfil = { tipo: "admin", usuario: G.ADMINS[adm].nombre, clave: adm };
      else {
        const doc = await this.db.collection("empleados").doc(u.uid).get().catch(() => null);
        if (!doc || !doc.exists) { await this.auth.signOut(); return userCb(null, "Tu cuenta fue dada de baja. Registrate de nuevo o hablá con un administrador."); }
        perfil = { tipo: "empleado", id: u.uid, ...doc.data() };
        this._unsubs.push(this.db.collection("empleados").doc(u.uid).onSnapshot(d => {
          if (!d.exists) { this._aviso = "Tu cuenta fue dada de baja por un administrador."; this.auth.signOut(); return; }
          if (d.data().persona !== perfil.persona) { perfil = { ...perfil, persona: d.data().persona }; userCb(perfil); }
        }));
      }
      const S = this._unsubs, db = this.db;
      S.push(db.collection("config").doc("datos").onSnapshot(d => {
        if (!d.exists) return emit("datos", null);
        const x = d.data(); let datos = null; try { datos = JSON.parse(x.json); datos.actualizado = x.actualizado; } catch (e) {}
        emit("datos", datos);
      }, e => console.warn(e)));
      S.push(db.collection("cambios").onSnapshot(q => emit("cambios", q.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.warn(e)));
      S.push(db.collection("ofertas").onSnapshot(q => emit("ofertas", q.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.warn(e)));
      S.push(db.collection("avisos").orderBy("creado", "desc").limit(30).onSnapshot(q => emit("avisos", q.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.warn(e)));
      if (adm) S.push(db.collection("empleados").onSnapshot(q => emit("empleados", q.docs.map(d => ({ id: d.id, ...d.data() }))), e => console.warn(e)));
      userCb(perfil);
    },
    _email: dni => dni + "@" + G.DOMINIO_EMPLEADOS,
    _pass: (dni, pin) => "MH-" + pin + "-" + dni,
    _traducir(e) {
      const c = e && e.code || "";
      if (/wrong-password|invalid-credential|invalid-login/.test(c)) return err("pin", "DNI o PIN incorrecto.");
      if (/user-not-found/.test(c)) return err("no-registrado", "Ese DNI no está registrado.");
      if (/too-many-requests/.test(c)) return err("bloqueo", "Demasiados intentos. Esperá unos minutos.");
      if (/network/.test(c)) return err("red", "Sin conexión a internet.");
      return e.codigo ? e : err("otro", e.message || String(e));
    },
    async ingresar(dni, pin) {
      try { await this.auth.signInWithEmailAndPassword(this._email(dni), this._pass(dni, pin)); }
      catch (e) { throw this._traducir(e); }
    },
    async registrar(dni, pin, persona) {
      if (!dniOk(dni)) throw err("dni", "Ingresá un DNI válido (solo números).");
      if (!pinOk(pin)) throw err("pin", "El PIN tiene que tener 4 números.");
      this._ocupado = true;
      let cred, nuevo = true;
      try {
        try { cred = await this.auth.createUserWithEmailAndPassword(this._email(dni), this._pass(dni, pin)); }
        catch (e) {
          if (!/email-already-in-use/.test(e.code)) throw e;
          // cuenta existente (por ejemplo, dada de baja): se reactiva si el PIN coincide
          try { cred = await this.auth.signInWithEmailAndPassword(this._email(dni), this._pass(dni, pin)); nuevo = false; }
          catch (e2) { throw err("dni-usado", "Ese DNI ya está registrado. Ingresá con tu PIN."); }
          const ya = await this.db.collection("empleados").doc(cred.user.uid).get();
          if (ya.exists) { this._ocupado = false; return this._resolver(cred.user); }
        }
        const uid = cred.user.uid, ref = this.db.collection("personas").doc(keyPersona(persona));
        try {
          await this.db.runTransaction(async tx => {
            const p = await tx.get(ref);
            if (p.exists && p.data().uid !== uid) throw err("persona-usada", persona + " ya tiene una cuenta. Hablá con un administrador.");
            tx.set(ref, { uid, persona });
            tx.set(this.db.collection("empleados").doc(uid), { dni, persona, creado: Date.now() });
          });
        } catch (e) {
          if (nuevo) await cred.user.delete().catch(() => {}); else await this.auth.signOut();
          throw e;
        }
        this._ocupado = false;
        await this._resolver(cred.user);
      } catch (e) { this._ocupado = false; throw this._traducir(e); }
    },
    async ingresarAdmin(usuario, clave) {
      const u = adminDe(usuario);
      if (!u) throw err("admin", "Usuario o clave incorrectos.");
      try { await this.auth.signInWithEmailAndPassword(G.ADMINS[u].email, clave); }
      catch (e) { const t = this._traducir(e); throw t.codigo === "pin" || t.codigo === "no-registrado" ? err("admin", "Usuario o clave incorrectos.") : t; }
    },
    async salir() { await this.auth.signOut(); },
    async ocupadas() {
      // antes de registrarse no hay sesión: se valida al registrar (transacción)
      if (!this.auth.currentUser) return new Set();
      const q = await this.db.collection("personas").get();
      return new Set(q.docs.map(d => d.id));
    },
    async guardarDatos(d) {
      const datos = { ...d }; delete datos.actualizado;
      await this.db.collection("config").doc("datos").set({ json: JSON.stringify(datos), actualizado: Date.now() });
    },
    async borrarEmpleado(id) {
      const e = await this.db.collection("empleados").doc(id).get();
      const b = this.db.batch();
      if (e.exists) b.delete(this.db.collection("personas").doc(keyPersona(e.data().persona)));
      b.delete(this.db.collection("empleados").doc(id));
      await b.commit();
    },
    async reasignarEmpleado(id, persona) {
      const e = await this.db.collection("empleados").doc(id).get();
      const nueva = this.db.collection("personas").doc(keyPersona(persona));
      await this.db.runTransaction(async tx => {
        const p = await tx.get(nueva);
        if (p.exists && p.data().uid !== id) throw err("persona-usada", persona + " ya tiene una cuenta.");
        if (e.exists) tx.delete(this.db.collection("personas").doc(keyPersona(e.data().persona)));
        tx.set(nueva, { uid: id, persona });
        tx.update(this.db.collection("empleados").doc(id), { persona });
      });
    },
    async guardarCambio(c) { await this.db.collection("cambios").add({ ...c, creado: Date.now() }); },
    async borrarCambio(id) { await this.db.collection("cambios").doc(id).delete(); },
    // todos los días de un cambio en una sola escritura: el empleado recibe una sola notificación
    async guardarCambios(lista) {
      const b = this.db.batch(), ahora = Date.now();
      lista.forEach(c => b.set(this.db.collection("cambios").doc(), { ...c, creado: ahora }));
      await b.commit();
    },
    async responderCambio(ids, estado, respuesta) {
      const b = this.db.batch();
      ids.forEach(id => b.update(this.db.collection("cambios").doc(id), { estado, respuesta: respuesta || "", respondido: Date.now() }));
      await b.commit();
    },
    /** Asistente de IA (solo administradores): manda el mensaje y devuelve respuesta + propuestas. */
    async asistente(payload) {
      if (!this._fn) {
        this._fn = firebase.app().functions("southamerica-east1");
        if (G.FIREBASE_CONFIG.emulador) this._fn.useEmulator(G.FIREBASE_CONFIG.emulador, 5001);
      }
      try { return (await this._fn.httpsCallable("asistente", { timeout: 300000 })(payload)).data; }
      catch (e) {
        const m = e.code === "functions/unavailable" || /network|internal$/i.test(e.code || "") && !e.message ? "Sin conexión con el asistente." : (e.message || "El asistente no respondió.");
        throw err(e.code || "asistente", m);
      }
    },
    // ofertas (feed): las publican los administradores
    async guardarOferta(o) {
      const x = { ...o }; const id = x.id; delete x.id;
      if (id) { await this.db.collection("ofertas").doc(id).set(x, { merge: true }); return id; }
      return (await this.db.collection("ofertas").add(x)).id;
    },
    async borrarOferta(id) { await this.db.collection("ofertas").doc(id).delete(); },
    async ofertasIA(payload) {
      if (!this._fn) { this._fn = firebase.app().functions("southamerica-east1"); if (G.FIREBASE_CONFIG.emulador) this._fn.useEmulator(G.FIREBASE_CONFIG.emulador, 5001); }
      try { return (await this._fn.httpsCallable("ofertasIA", { timeout: 300000 })(payload)).data; }
      catch (e) { throw err(e.code || "ofertas", e.message || "No se pudo procesar."); }
    },
    // clave del buscador de imágenes: se escribe, pero ningún teléfono la puede leer (solo el servidor)
    async guardarClaveImagenes(cfg) { await this.db.collection("secretos").doc("imagenes").set(cfg); },
    // perfil del administrador (nombre y apellido para el saludo del asistente)
    async leerPerfil(clave) {
      const u = this.auth.currentUser; if (!u) return {};
      try { const d = await this.db.collection("perfiles").doc(u.uid).get(); return d.exists ? d.data() : {}; }
      catch (e) { try { return JSON.parse(localStorage.getItem("mh_perfil_" + clave)) || {}; } catch (er) { return {}; } }
    },
    async guardarPerfil(clave, perfil) {
      try { localStorage.setItem("mh_perfil_" + clave, JSON.stringify(perfil)); } catch (e) {}
      const u = this.auth.currentUser; if (!u) return;
      await this.db.collection("perfiles").doc(u.uid).set({ nombreCompleto: String(perfil.nombreCompleto || "").slice(0, 80) });
    },
    // dispositivo que recibe notificaciones push (lo usa el servidor)
    async registrarToken(token, plataforma) {
      const u = this.auth.currentUser; if (!u || !token) return;
      await this.db.collection("tokens").doc(token.replace(/\//g, "_").slice(0, 1400))
        .set({ uid: u.uid, token, plataforma, actualizado: Date.now() });
    },
    async borrarToken(token) {
      if (!token || !this.auth.currentUser) return;
      await this.db.collection("tokens").doc(token.replace(/\//g, "_").slice(0, 1400)).delete().catch(() => {});
    },
    // datos para que el teléfono revise cambios pendientes aunque la app esté cerrada
    sesionNativa(persona) {
      const u = this.auth.currentUser, c = G.FIREBASE_CONFIG;
      if (!u || c.emulador) return null;
      return { apiKey: c.apiKey, projectId: c.projectId, refreshToken: u.refreshToken, persona };
    },
    async publicarAviso(texto, por) { await this.db.collection("avisos").add({ texto, por, creado: Date.now() }); },
    async borrarAviso(id) { await this.db.collection("avisos").doc(id).delete(); },
  };

  const B = (G.FIREBASE_CONFIG && G.firebase) ? Online : Local;
  B.on = on;
  B.onUser = cb => { userCb = cb; };
  B.keyPersona = keyPersona;
  G.Backend = B;
})(window);
