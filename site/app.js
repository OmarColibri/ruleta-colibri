/* =========================================================
   Colibrí Lucky Shot — configuración
   ========================================================= */
const CONFIG = {
  // URL de la implementación del Apps Script (apps-script/Codigo.gs).
  // Vacío = modo demo local (el navegador simula el servidor; no guarda nada).
  ENDPOINT: "https://script.google.com/macros/s/AKfycbwmuBsTovZyn1o7LkdUKm4hipgjx5_NWli7v3ZOlRls6hbUU9q4zcZLT8EuFpVic8TK/exec",
  WHATSAPP: "17874942330",
  CHANCES: 3,
  // Segmentos de la ruleta en orden horario empezando arriba.
  // El "id" debe existir en RESULTADOS del Apps Script. Quien decide el resultado es el servidor.
  SEGMENTS: [
    { id: "desc10",  label: ["10% de", "descuento"], color: "#d6e6fb" },
    { id: "video",   label: ["Video", "promocional"], color: "#ffffff" },
    { id: "desc15",  label: ["15% de", "descuento"], color: "#d6e6fb" },
    { id: "lose",    label: ["Sigue", "intentando"], color: "#ffffff" },
    { id: "bono100", label: ["$100", "de bono"], color: "#d6e6fb" },
    { id: "lose",    label: ["Sigue", "intentando"], color: "#ffffff" },
    { id: "bono50",  label: ["$50", "de bono"], color: "#d6e6fb" },
    { id: "retry",   label: ["Gira de", "nuevo"], color: "#f7d987" },
  ],
  PRIZES: {
    video:   { name: "un Video promocional", desc: "Edición de un video promocional de hasta 45 segundos." },
    desc15:  { name: "15% de descuento", desc: "En uno de nuestros servicios seleccionados.", tipo: "descuento", pct: 15 },
    bono100: { name: "$100 de bono", desc: "Como bono inicial en la contratación de uno de nuestros servicios.", tipo: "credito" },
    bono50:  { name: "$50 de bono", desc: "Como bono inicial en la contratación de uno de nuestros servicios.", tipo: "credito" },
    desc10:  { name: "10% de descuento", desc: "En uno de nuestros servicios.", tipo: "descuento", pct: 10 },
  },
  // Deben ser IGUALES a las listas del Apps Script
  SERVICIOS: ["Branding", "SEO", "Redes sociales", "Edición audiovisual"],
  PLANES: [
    { s: "SEO", c: "Silver", p: 580 }, { s: "SEO", c: "Gold", p: 780 }, { s: "SEO", c: "Platinum", p: 980 },
    { s: "Redes sociales", c: "Silver", p: 580 }, { s: "Redes sociales", c: "Gold", p: 780 }, { s: "Redes sociales", c: "Platinum", p: 1080 },
    { s: "Edición audiovisual", c: "Silver", p: 499 }, { s: "Edición audiovisual", c: "Gold", p: 799 }, { s: "Edición audiovisual", c: "Platinum", p: 1199 },
  ],
  A_COTIZAR: "Cotización",
};

/* ========================================================= */
const $ = (s) => document.querySelector(s);
const SEG = 360 / CONFIG.SEGMENTS.length;
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

/* ---------- identidad del navegador (igual que la ruleta anterior) ---------- */
function getDeviceId() {
  const c = document.cookie.split("; ").find((x) => x.startsWith("cs_device="));
  let id = c ? c.slice(10) : store.get("cs_device_ls");
  if (!id) id = crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2);
  store.set("cs_device_ls", id);
  document.cookie = `cs_device=${id}; Max-Age=31536000; Path=/; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
  return id;
}

// Huella del dispositivo (funciona también en modo incógnito)
function getFingerprint() {
  let canvasData = "";
  try {
    const c = document.createElement("canvas"); c.width = 220; c.height = 40;
    const x = c.getContext("2d");
    x.textBaseline = "top"; x.font = "16px Arial"; x.fillStyle = "#f60"; x.fillRect(10, 5, 100, 25);
    x.fillStyle = "#069"; x.fillText("Colibrí Searcher", 4, 8);
    canvasData = c.toDataURL();
  } catch {}
  const s = [navigator.userAgent, navigator.language, navigator.platform, screen.width + "x" + screen.height, screen.colorDepth,
    navigator.hardwareConcurrency || "", Intl.DateTimeFormat().resolvedOptions().timeZone, canvasData].join("||");
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const ch = s.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

const deviceId = getDeviceId();

/* ---------- servidor ---------- */
// POST con text/plain: no requiere preflight CORS y los datos no viajan en la URL.
async function api(body) {
  if (!CONFIG.ENDPOINT) return demoApi(body);
  const r = await fetch(CONFIG.ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ ...body, deviceId }),
  });
  return r.json();
}

// Modo demo: imita al Apps Script dentro del navegador (solo para probar en local)
function demoApi(body) {
  const st = store.get("ls_demo") || { usados: 0, premio: null };
  const pesos = { video: 8, desc15: 12, bono100: 5, bono50: 10, desc10: 20, lose: 36, retry: 9 };
  if (body.action === "status") return { ok: true, restantes: st.premio ? 0 : CONFIG.CHANCES - st.usados, premio: st.premio };
  if (body.action === "spin") {
    if (st.premio) return { ok: false, error: "already", premio: st.premio };
    if (st.usados >= CONFIG.CHANCES) return { ok: false, error: "no_chances", message: "Ya usaste tus 3 oportunidades. ¡Gracias por participar!" };
    const ks = Object.keys(pesos), total = ks.reduce((a, k) => a + pesos[k], 0);
    let n = Math.random() * total, result = "lose";
    for (const k of ks) { n -= pesos[k]; if (n < 0) { result = k; break; } }
    if (result !== "retry") st.usados++;
    let code;
    if (CONFIG.PRIZES[result]) {
      code = "COLIBRI-" + Math.random().toString(36).slice(2, 8).toUpperCase();
      st.premio = { prizeId: result, code, claimed: false };
    }
    store.set("ls_demo", st);
    return { ok: true, result, code, restantes: st.premio ? 0 : CONFIG.CHANCES - st.usados };
  }
  if (body.action === "claim") { st.premio.claimed = true; store.set("ls_demo", st); return { ok: true }; }
}

/* ---------- dibujar ruleta ---------- */
function drawWheel() {
  const svg = $("#wheel");
  const ns = "http://www.w3.org/2000/svg";
  const cx = 200, cy = 200, r = 172;
  const el = (tag, attrs, parent = svg) => {
    const n = document.createElementNS(ns, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    parent.appendChild(n);
    return n;
  };
  const pt = (deg, rad) => {
    const a = (deg - 90) * Math.PI / 180;
    return [cx + rad * Math.cos(a), cy + rad * Math.sin(a)];
  };

  el("circle", { cx, cy, r: 196, fill: "#2a46cc" });
  el("circle", { cx, cy, r: 186, fill: "#3554dd" });

  CONFIG.SEGMENTS.forEach((s, i) => {
    const a0 = i * SEG, a1 = (i + 1) * SEG;
    const [x0, y0] = pt(a0, r), [x1, y1] = pt(a1, r);
    el("path", { d: `M${cx},${cy} L${x0},${y0} A${r},${r} 0 0 1 ${x1},${y1} Z`, fill: s.color, stroke: "#c3d5f4", "stroke-width": 1 });
    const mid = a0 + SEG / 2;
    const g = el("g", { transform: `rotate(${mid} ${cx} ${cy})` });
    // texto radial (de afuera hacia el centro), como en el diseño
    const ty = cy - 118;
    const t = el("text", {
      x: cx, y: ty - 3, "text-anchor": "middle", fill: "#0d2a8a", transform: `rotate(90 ${cx} ${ty})`,
      "font-family": "Poppins, sans-serif", "font-weight": 700, "font-size": 15,
    }, g);
    s.label.forEach((line, j) => {
      const ts = el("tspan", { x: cx, dy: j === 0 ? 0 : 16, "font-size": j === 0 ? 16 : 12.5, "font-weight": j === 0 ? 800 : 600 }, t);
      ts.textContent = line;
    });
  });

  for (let i = 0; i < 16; i++) {
    const [x, y] = pt(i * 22.5 + 11.25, 186);
    el("circle", { cx: x, cy: y, r: 5.5, fill: "#ffc93c" });
  }
  el("circle", { cx, cy, r: 62, fill: "#fff" });
}

/* ---------- estado y UI ---------- */
const state = { restantes: CONFIG.CHANCES, premio: null, bloqueado: "" };
let spinning = false, rotation = 0;

function renderUI(msg) {
  const btn = $("#spinBtn");
  $("#chancesNum").textContent = state.restantes;
  $("#chancesLabel").innerHTML = state.restantes === 1 ? "Oportunidad<br>restante" : "Oportunidades<br>restantes";

  let status = msg || "";
  let disabled = spinning;
  if (state.premio) {
    disabled = true;
    const p = CONFIG.PRIZES[state.premio.prizeId];
    status = state.premio.claimed
      ? `Ya registraste tu premio: ${p.name}. Tu código: ${state.premio.code}`
      : `Ganaste ${p.name}. Registra tu premio →`;
  } else if (state.bloqueado) {
    disabled = true; status = state.bloqueado;
  } else if (state.restantes <= 0) {
    disabled = true; status = status || "Se acabaron tus oportunidades. ¡Gracias por participar!";
  }
  btn.disabled = disabled;
  btn.classList.toggle("pulse", !disabled);
  const st = $("#gameStatus");
  st.innerHTML = "";
  st.append(status);
  if (state.bloqueado && /dispositivo/.test(state.bloqueado)) {
    const a = document.createElement("a");
    a.href = `https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent("Hola, no pude girar la ruleta de Lucky Shot")}`;
    a.target = "_blank"; a.rel = "noopener"; a.textContent = " Escríbenos por WhatsApp.";
    st.append(a);
  }
  st.style.cursor = state.premio && !state.premio.claimed ? "pointer" : "";
}

function segmentIndexFor(result) {
  const idx = CONFIG.SEGMENTS.map((s, i) => (s.id === result ? i : -1)).filter((i) => i >= 0);
  return idx[Math.floor(Math.random() * idx.length)] ?? 0;
}

function animateTo(idx) {
  return new Promise((resolve) => {
    const jitter = (Math.random() - 0.5) * (SEG * 0.7);
    const target = 360 - (idx * SEG + SEG / 2) + jitter;
    const current = ((rotation % 360) + 360) % 360;
    rotation += 360 * 6 + ((target - current + 360) % 360);
    const wheel = $("#wheel");
    wheel.style.transform = `rotate(${rotation}deg)`;
    const done = () => { wheel.removeEventListener("transitionend", done); clearTimeout(t); resolve(); };
    wheel.addEventListener("transitionend", done);
    const t = setTimeout(done, 6000);
  });
}

async function spin() {
  if (spinning || state.premio || state.restantes <= 0 || state.bloqueado) return;
  spinning = true;
  renderUI("Girando…");

  let res;
  try {
    res = await api({ action: "spin", fp: getFingerprint() });
  } catch {
    spinning = false; renderUI("No pudimos conectar. Revisa tu internet e intenta de nuevo."); return;
  }

  if (!res.ok) {
    spinning = false;
    if (res.error === "already") { state.premio = res.premio; state.restantes = 0; renderUI(); openPrize(); }
    else if (res.error === "no_chances") { state.restantes = 0; renderUI(res.message); }
    else if (res.error === "limit" || res.error === "closed") { state.bloqueado = res.message; renderUI(); }
    else renderUI(res.message || "La ruleta no está disponible en este momento.");
    return;
  }

  await animateTo(segmentIndexFor(res.result));
  spinning = false;
  state.restantes = res.restantes;

  if (CONFIG.PRIZES[res.result]) {
    state.premio = { prizeId: res.result, code: res.code, claimed: false };
    renderUI(); confetti(); openPrize();
  } else if (res.result === "retry") {
    renderUI("¡Gira de nuevo! Esta no cuenta como oportunidad.");
  } else {
    renderUI(state.restantes > 0
      ? `Sigue intentando. Te ${state.restantes === 1 ? "queda 1 oportunidad" : `quedan ${state.restantes} oportunidades`}.`
      : "Se acabaron tus oportunidades. ¡Gracias por participar!");
  }
}

/* ---------- modal premio + formulario ---------- */
function fillServicios(pr) {
  const wrap = $("#servicioWrap"), sel = $("#servicio");
  sel.innerHTML = "";
  if (!pr.tipo) { wrap.hidden = true; return; }
  wrap.hidden = false;
  $("#servicioLbl").textContent = pr.tipo === "descuento"
    ? `Servicio y plan para tu ${pr.pct}% de descuento`
    : "Servicio donde usarás tu bono";
  sel.append(new Option("Selecciona una opción", ""));
  if (pr.tipo === "descuento") {
    CONFIG.SERVICIOS.forEach((s) => {
      const g = document.createElement("optgroup"); g.label = s;
      const planes = CONFIG.PLANES.filter((pl) => pl.s === s);
      if (!planes.length) g.append(new Option(`${s} — precio a cotizar con ${pr.pct}% de descuento`, `${s}|${CONFIG.A_COTIZAR}`));
      planes.forEach((pl) => g.append(new Option(`${pl.c} — $${pl.p} → $${Math.round(pl.p * (100 - pr.pct) / 100)}`, `${pl.s}|${pl.c}`)));
      sel.append(g);
    });
  } else {
    CONFIG.SERVICIOS.forEach((s) => sel.append(new Option(s, s)));
  }
}

function openPrize() {
  const p = CONFIG.PRIZES[state.premio.prizeId];
  $("#prizeName").textContent = p.name;
  $("#prizeDesc").textContent = p.desc;
  $("#prizeCode").textContent = state.premio.code;
  $("#doneCode").textContent = state.premio.code;
  $("#doneTxt").textContent = "Ya registraste este premio. Revisa tu correo (también la carpeta de spam).";
  $("#prizeView").hidden = state.premio.claimed;
  $("#doneView").hidden = !state.premio.claimed;
  if (!state.premio.claimed) fillServicios(p);
  $("#prizeModal").showModal();
}

async function submitClaim(e) {
  e.preventDefault();
  const form = e.target;
  const f = Object.fromEntries(new FormData(form));
  const err = $("#formError");
  if (!f.nombre?.trim() || !/^\S+@\S+\.\S+$/.test(f.email || "") || (f.telefono || "").trim().length < 7 || !f.empresa?.trim()) {
    err.textContent = "Revisa tu nombre, un correo válido, tu teléfono y el nombre de tu negocio."; return;
  }
  if (!$("#servicioWrap").hidden && !f.servicio) { err.textContent = "Selecciona un servicio de la lista."; return; }
  if (!f.acepta) { err.textContent = "Debes aceptar los términos y condiciones."; return; }

  err.textContent = "";
  const btn = $("#sendBtn");
  btn.disabled = true;
  try {
    const res = await api({
      action: "claim", code: state.premio.code,
      nombre: f.nombre.trim(), email: f.email.trim(), telefono: f.telefono.trim(), empresa: f.empresa.trim(), servicio: f.servicio || "",
    });
    if (!res.ok) throw new Error(res.message);
    state.premio.claimed = true;
    $("#doneTxt").textContent = CONFIG.ENDPOINT
      ? `Te enviamos el cupón a ${f.email.trim()}. Revisa también tu carpeta de spam. Nuestro equipo coordinará contigo la activación.`
      : `Modo demo: en producción el cupón llegaría a ${f.email.trim()}.`;
    $("#prizeView").hidden = true;
    $("#doneView").hidden = false;
    renderUI();
  } catch (er) {
    err.textContent = er.message && er.message !== "Failed to fetch" ? er.message : "No se pudo enviar. Intenta de nuevo.";
  } finally {
    btn.disabled = false;
  }
}

/* ---------- confeti ---------- */
function confetti() {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const colors = ["#16e1ef", "#56efce", "#ffc93c", "#ffffff", "#3b5ff0"];
  for (let i = 0; i < 120; i++) {
    const c = document.createElement("i");
    c.className = "confetti";
    c.style.left = Math.random() * 100 + "vw";
    c.style.background = colors[i % colors.length];
    c.style.setProperty("--dx", (Math.random() - 0.5) * 300 + "px");
    c.style.setProperty("--r", Math.random() * 1080 + "deg");
    c.style.animationDuration = 2.2 + Math.random() * 2 + "s";
    c.style.animationDelay = Math.random() * 0.4 + "s";
    document.body.appendChild(c);
    c.addEventListener("animationend", () => c.remove());
  }
}

/* ---------- acordeón ---------- */
function initAccordion() {
  document.querySelectorAll(".acc-head").forEach((head) => {
    head.addEventListener("click", () => {
      const item = head.parentElement;
      const open = !item.classList.contains("open");
      document.querySelectorAll(".acc-item").forEach((it) => {
        it.classList.remove("open");
        it.querySelector(".acc-head").setAttribute("aria-expanded", "false");
      });
      if (open) { item.classList.add("open"); head.setAttribute("aria-expanded", "true"); }
    });
  });
}

/* ---------- init ---------- */
drawWheel();
renderUI();
initAccordion();
$("#spinBtn").addEventListener("click", spin);
$("#claimForm").addEventListener("submit", submitClaim);
$("#gameStatus").addEventListener("click", (e) => { if (e.target.tagName !== "A" && state.premio && !state.premio.claimed) openPrize(); });
document.querySelectorAll("[data-open-terms]").forEach((a) =>
  a.addEventListener("click", (e) => { e.preventDefault(); $("#termsModal").showModal(); })
);

// Estado guardado en el servidor (oportunidades restantes y premio previo)
(async () => {
  try {
    const st = await api({ action: "status" });
    if (st && st.ok) { state.restantes = st.restantes; state.premio = st.premio; renderUI(); }
  } catch { /* sin conexión: se intenta al girar */ }
})();
