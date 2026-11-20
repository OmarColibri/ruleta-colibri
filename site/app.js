/* =========================================================
   Colibrí Lucky Shot — configuración
   ========================================================= */
const CONFIG = {
  // URL que recibe el registro del premio (POST JSON). Ej: webhook de n8n, Make, Formspree, Google Apps Script.
  // Si se deja vacío, el registro se envía por WhatsApp al número de abajo.
  FORM_ENDPOINT: "",
  WHATSAPP: "17874942330",
  CHANCES: 3,
  // Vigencia (hora de Puerto Rico, UTC-4)
  START: "2026-11-18T00:00:00-04:00",
  END: "2026-12-05T23:59:59-04:00",
  // Segmentos de la ruleta en orden horario empezando arriba. weight = probabilidad relativa.
  // type: "prize" gana | "retry" no gasta oportunidad | "lose" gasta oportunidad
  SEGMENTS: [
    { label: ["10% de", "descuento"], name: "10% de descuento", desc: "En uno de nuestros servicios.", type: "prize", weight: 20, color: "#d6e6fb" },
    { label: ["Video", "promocional"], name: "un Video promocional", desc: "Edición de un video promocional de hasta 45 segundos.", type: "prize", weight: 8, color: "#ffffff" },
    { label: ["15% de", "descuento"], name: "15% de descuento", desc: "En uno de nuestros servicios seleccionados.", type: "prize", weight: 12, color: "#d6e6fb" },
    { label: ["Sigue", "intentando"], type: "lose", weight: 18, color: "#ffffff" },
    { label: ["$100", "de bono"], name: "$100 de bono", desc: "Como bono inicial en la contratación de uno de nuestros servicios.", type: "prize", weight: 5, color: "#d6e6fb" },
    { label: ["Sigue", "intentando"], type: "lose", weight: 18, color: "#ffffff" },
    { label: ["$50", "de bono"], name: "$50 de bono", desc: "Como bono inicial en la contratación de uno de nuestros servicios.", type: "prize", weight: 10, color: "#d6e6fb" },
    { label: ["Gira de", "nuevo"], type: "retry", weight: 9, color: "#f7d987" },
  ],
};

/* ========================================================= */
const $ = (s) => document.querySelector(s);
const STORE_KEY = "colibri-lucky-shot-2026";
const SEG = 360 / CONFIG.SEGMENTS.length;

const load = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch { return null; } };
const save = (s) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch {} };
let state = load() || { chances: CONFIG.CHANCES, prize: null, registered: false };

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

  // focos
  for (let i = 0; i < 16; i++) {
    const [x, y] = pt(i * 22.5 + 11.25, 186);
    el("circle", { cx: x, cy: y, r: 5.5, fill: "#ffc93c", class: "bulb" });
  }
  el("circle", { cx, cy, r: 62, fill: "#fff" });
}

/* ---------- UI ---------- */
function renderUI(msg) {
  const btn = $("#spinBtn");
  $("#chancesNum").textContent = state.chances;
  $("#chancesLabel").innerHTML = (state.chances === 1 ? "Oportunidad<br>restante" : "Oportunidades<br>restantes");
  const now = Date.now();
  const before = now < Date.parse(CONFIG.START), after = now > Date.parse(CONFIG.END);

  let status = msg || "";
  let disabled = false;
  if (before) { disabled = true; status = "La promoción inicia el 18 de noviembre de 2026."; }
  else if (after) { disabled = true; status = "La promoción finalizó. ¡Gracias por participar!"; }
  else if (state.prize) {
    disabled = true;
    const p = CONFIG.SEGMENTS[state.prize];
    status = state.registered ? `Ya registraste tu premio: ${p.name}.` : `Ganaste ${p.name}. Registra tu premio →`;
  } else if (state.chances <= 0) { disabled = true; status = status || "Se acabaron tus oportunidades. ¡Gracias por participar!"; }

  btn.disabled = disabled;
  btn.classList.toggle("pulse", !disabled);
  const st = $("#gameStatus");
  st.textContent = status;
  st.style.cursor = state.prize && !state.registered ? "pointer" : "";
}

/* ---------- giro ---------- */
let spinning = false, rotation = 0;

function pickIndex() {
  const total = CONFIG.SEGMENTS.reduce((a, s) => a + s.weight, 0);
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  let n = (buf[0] / 2 ** 32) * total;
  for (let i = 0; i < CONFIG.SEGMENTS.length; i++) {
    n -= CONFIG.SEGMENTS[i].weight;
    if (n < 0) return i;
  }
  return 0;
}

function spin() {
  if (spinning || state.prize || state.chances <= 0) return;
  spinning = true;
  const btn = $("#spinBtn");
  btn.disabled = true;
  btn.classList.remove("pulse");
  $("#gameStatus").textContent = "Girando…";

  const idx = pickIndex();
  const jitter = (Math.random() - 0.5) * (SEG * 0.7);
  const target = 360 - (idx * SEG + SEG / 2) + jitter;
  const current = ((rotation % 360) + 360) % 360;
  rotation += 360 * 6 + ((target - current + 360) % 360);
  const wheel = $("#wheel");
  wheel.style.transform = `rotate(${rotation}deg)`;

  const done = () => {
    wheel.removeEventListener("transitionend", done);
    clearTimeout(fallback);
    spinning = false;
    onResult(idx);
  };
  wheel.addEventListener("transitionend", done);
  const fallback = setTimeout(done, 6000);
}

function onResult(idx) {
  const s = CONFIG.SEGMENTS[idx];
  if (s.type === "retry") {
    renderUI("¡Gira de nuevo! Esta no cuenta como oportunidad.");
    return;
  }
  state.chances = Math.max(0, state.chances - 1);
  if (s.type === "prize") {
    state.prize = idx;
    save(state);
    renderUI();
    confetti();
    openPrize();
    return;
  }
  save(state);
  renderUI(state.chances > 0
    ? `Sigue intentando. Te ${state.chances === 1 ? "queda 1 oportunidad" : `quedan ${state.chances} oportunidades`}.`
    : "Se acabaron tus oportunidades. ¡Gracias por participar!");
}

/* ---------- modal premio ---------- */
function openPrize() {
  const p = CONFIG.SEGMENTS[state.prize];
  $("#prizeName").textContent = p.name;
  $("#prizeDesc").textContent = p.desc;
  $("#prizeView").hidden = state.registered;
  $("#doneView").hidden = !state.registered;
  $("#prizeModal").showModal();
}

async function submitClaim(e) {
  e.preventDefault();
  const form = e.target;
  const data = Object.fromEntries(new FormData(form));
  const p = CONFIG.SEGMENTS[state.prize];
  const payload = {
    nombre: data.nombre, negocio: data.negocio, email: data.email, telefono: data.telefono,
    premio: p.name.replace(/^un /, ""), fecha: new Date().toISOString(), origen: "Colibrí Lucky Shot 2026",
  };
  const btn = form.querySelector("button[type=submit]");
  const err = $("#formError");
  err.textContent = "";
  btn.disabled = true;

  try {
    if (CONFIG.FORM_ENDPOINT) {
      const res = await fetch(CONFIG.FORM_ENDPOINT, {
        method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(res.status);
    } else {
      const text = `¡Hola Colibrí Searcher! Gané en Lucky Shot 🎉\n\nPremio: ${payload.premio}\nNombre: ${payload.nombre}\nNegocio: ${payload.negocio}\nEmail: ${payload.email}\nTeléfono: ${payload.telefono}`;
      window.open(`https://wa.me/${CONFIG.WHATSAPP}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    }
    state.registered = true;
    save(state);
    $("#prizeView").hidden = true;
    $("#doneView").hidden = false;
    renderUI();
  } catch {
    err.textContent = "No pudimos registrar tu premio. Intenta de nuevo o escríbenos a info@colibrisearcher.com.";
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
$("#gameStatus").addEventListener("click", () => { if (state.prize && !state.registered) openPrize(); });
document.querySelectorAll("[data-open-terms]").forEach((a) =>
  a.addEventListener("click", (e) => { e.preventDefault(); $("#termsModal").showModal(); })
);
