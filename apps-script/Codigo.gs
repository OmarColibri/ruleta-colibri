// Colibrí Lucky Shot 2026 - backend de la ruleta (Google Apps Script)
//
// - 3 oportunidades por persona ("Gira de nuevo" no gasta oportunidad).
// - El servidor decide el resultado de cada giro según FRECUENCIA y CUPO.
// - Un solo premio por persona (navegador + huella) y por correo.
// - Al reclamar se guarda el registro y se envía el cupón por correo.
//
// Hojas:
//   LuckyShot_Giros     → una fila por GANADOR
//     A fecha | B deviceId | C premio | D codigo | E nombre | F email | G telefono | H empresa | I reclamado | J huella | K servicio
//   LuckyShot_Intentos  → una fila por CADA giro
//     A fecha | B deviceId | C huella | D resultado
//
// Instalación: pega este archivo, ejecuta setup() una vez y publica con
// Implementar → Administrar implementaciones → Editar → Nueva versión (así se mantiene la URL).

// ===== PREMIOS Y FRECUENCIAS =====
// peso  = qué tan seguido sale (relativo; la suma no tiene que dar 100)
// cupo  = máximo de ganadores (null = sin límite). Al agotarse deja de salir.
// Los id deben coincidir con los de la landing (site/app.js).
const RESULTADOS = {
  video:   {peso: 8,  cupo: 5,    label: "Edición de un video promocional de hasta 45 segundos"},
  desc15:  {peso: 12, cupo: null, label: "15% de descuento en uno de nuestros servicios seleccionados", tipo: "descuento", pct: 15},
  bono100: {peso: 5,  cupo: 2,    label: "$100 de bono inicial en la contratación de uno de nuestros servicios", tipo: "credito"},
  bono50:  {peso: 10, cupo: 2,    label: "$50 de bono inicial en la contratación de uno de nuestros servicios", tipo: "credito"},
  desc10:  {peso: 20, cupo: null, label: "10% de descuento en uno de nuestros servicios", tipo: "descuento", pct: 10},
  lose:    {peso: 36},  // "Sigue intentando" (gasta oportunidad)
  retry:   {peso: 9}    // "Gira de nuevo" (no gasta oportunidad)
};
const OPORTUNIDADES = 3;
// Varios teléfonos del mismo modelo pueden compartir huella, por eso se permite
// más de una persona por huella antes de bloquear.
const MAX_INTENTOS_POR_HUELLA = 6;
const MAX_GANADORES_POR_HUELLA = 2;

// Deben ser IGUALES a las listas de site/app.js
const SERVICIOS = ["Branding", "SEO", "Redes sociales", "Edición audiovisual"];
const PLANES = [
  {s: "SEO",                 c: "Silver",   p: 580},
  {s: "SEO",                 c: "Gold",     p: 780},
  {s: "SEO",                 c: "Platinum", p: 980},
  {s: "Redes sociales",      c: "Silver",   p: 580},
  {s: "Redes sociales",      c: "Gold",     p: 780},
  {s: "Redes sociales",      c: "Platinum", p: 1080},
  {s: "Edición audiovisual", c: "Silver",   p: 499},
  {s: "Edición audiovisual", c: "Gold",     p: 799},
  {s: "Edición audiovisual", c: "Platinum", p: 1199}
];
// Servicios sin planes en la lista → se cotizan
const A_COTIZAR = "Cotización";

// ===== VIGENCIA (hora de Puerto Rico) =====
const INICIO = new Date("2026-11-18T00:00:00-04:00");
const FIN    = new Date("2026-12-05T23:59:59-04:00");
const VIGENCIA = "Del 18 de noviembre al 5 de diciembre de 2026";

const SHEET_GIROS = "LuckyShot_Giros";
const SHEET_INTENTOS = "LuckyShot_Intentos";

// ===== COLORES DE MARCA (landing Lucky Shot) =====
const COLORES = {
  primario: "#061a52", // franja superior y títulos
  acento:   "#0647ba", // código y detalles
  claro:    "#e6fdff", // fondo de la tarjeta del premio
  texto:    "#00143c", // texto principal
  suave:    "#5a6b8c"  // texto secundario y términos
};

// ===== CONTACTO =====
const CONTACTO = {
  waNumero:  "17874942330",
  waTexto:   "+1 (787) 494-2330",
  telNumero: "+17874942330",
  telTexto:  "+1 (787) 494-2330",
  email:     "info@colibrisearcher.com"
};
const TYC = [
  "Promoción válida del 18 de noviembre al 5 de diciembre de 2026. El cupón deberá solicitarse o activarse durante ese período.",
  "Cada participante tiene hasta 3 oportunidades para girar la ruleta y puede obtener un solo premio.",
  "El descuento será del 10% o 15%, según el beneficio obtenido en la ruleta.",
  "Los bonos de $50 y $100 aplican como crédito inicial en la contratación de uno de los servicios participantes.",
  "El video promocional incluye la edición de un video de hasta 45 segundos.",
  "El beneficio aplica únicamente a los servicios seleccionados: Branding, producción audiovisual, gestión de redes sociales y SEO.",
  "El cupón es personal e intransferible.",
  "El descuento se mantendrá vigente mientras el cliente conserve activo al menos el servicio que le da derecho al beneficio, sujeto a las condiciones de contratación.",
  "En caso de cancelar o interrumpir el servicio, el cliente perderá el beneficio y no podrá recuperarlo mediante la reactivación posterior.",
  "No acumulable con otras promociones, descuentos o beneficios comerciales.",
  "La aplicación del cupón estará sujeta a la disponibilidad y condiciones de cada servicio.",
  "Premios con cupos limitados, sujetos a disponibilidad."
];

// ===== Hojas =====
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const g = ss.getSheetByName(SHEET_GIROS) || ss.insertSheet(SHEET_GIROS);
  g.getRange(1, 1, 1, 11).setValues([["fecha","deviceId","premio","codigo","nombre","email","telefono","empresa","reclamado","huella","servicio"]]);
  const t = ss.getSheetByName(SHEET_INTENTOS) || ss.insertSheet(SHEET_INTENTOS);
  t.getRange(1, 1, 1, 4).setValues([["fecha","deviceId","huella","resultado"]]);
}

function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function esc(s) {
  return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function rows(name) { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name).getDataRange().getValues().slice(1); }

// Oportunidades usadas por este navegador ("Gira de nuevo" no cuenta)
function usados(deviceId) {
  return rows(SHEET_INTENTOS).filter(r => r[1] === deviceId && r[3] !== "retry").length;
}

function estado(deviceId) {
  const win = rows(SHEET_GIROS).find(r => r[1] === deviceId);
  const restantes = Math.max(0, OPORTUNIDADES - usados(deviceId));
  if (win) return {ok: true, restantes: 0, premio: {prizeId: win[2], code: win[3], claimed: win[8] === "SI"}};
  return {ok: true, restantes: restantes, premio: null};
}

function elegir() {
  const ganadores = rows(SHEET_GIROS);
  const count = {};
  ganadores.forEach(r => count[r[2]] = (count[r[2]] || 0) + 1);
  const opciones = Object.keys(RESULTADOS).filter(k => {
    const r = RESULTADOS[k];
    return r.peso > 0 && (r.cupo == null || (count[k] || 0) < r.cupo);
  });
  const total = opciones.reduce((a, k) => a + RESULTADOS[k].peso, 0);
  let n = Math.random() * total;
  for (const k of opciones) { n -= RESULTADOS[k].peso; if (n < 0) return k; }
  return "lose";
}

// ===== Acciones =====
function handle(p) {
  const ahora = new Date();
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    if (p.action === "status") {
      if (!p.deviceId) return {ok: false, message: "Identificador de navegador no disponible."};
      return estado(p.deviceId);
    }

    if (p.action === "spin") {
      if (ahora < INICIO) return {ok: false, error: "closed", message: "La promoción inicia el 18 de noviembre de 2026."};
      if (ahora > FIN) return {ok: false, error: "closed", message: "La promoción finalizó. ¡Gracias por participar!"};
      if (!p.deviceId) return {ok: false, message: "Identificador de navegador no disponible."};
      const fp = String(p.fp || "").trim();
      if (!fp) return {ok: false, error: "no_fp", message: "No pudimos verificar tu navegador. Intenta de nuevo."};

      // Ya ganó en este navegador → se devuelve su cupón
      const st = estado(p.deviceId);
      if (st.premio) return {ok: false, error: "already", premio: st.premio};
      if (st.restantes <= 0) return {ok: false, error: "no_chances", message: "Ya usaste tus 3 oportunidades. ¡Gracias por participar!"};

      // Huella del dispositivo (evita jugar de nuevo en modo incógnito)
      const intentosHuella = rows(SHEET_INTENTOS).filter(r => String(r[2]) === fp && r[3] !== "retry").length;
      const ganadoresHuella = rows(SHEET_GIROS).filter(r => String(r[9]) === fp).length;
      if (intentosHuella >= MAX_INTENTOS_POR_HUELLA || ganadoresHuella >= MAX_GANADORES_POR_HUELLA)
        return {ok: false, error: "limit", message: "Este dispositivo ya participó."};

      const resultado = elegir();
      ss.getSheetByName(SHEET_INTENTOS).appendRow([ahora, p.deviceId, fp, resultado]);
      const restantes = resultado === "retry" ? st.restantes : st.restantes - 1;

      if (RESULTADOS[resultado].label) {
        const code = "COLIBRI-" + Utilities.getUuid().replace(/-/g, "").slice(0, 6).toUpperCase();
        ss.getSheetByName(SHEET_GIROS).appendRow([ahora, p.deviceId, resultado, code, "", "", "", "", "NO", fp, ""]);
        return {ok: true, result: resultado, code: code, restantes: 0};
      }
      return {ok: true, result: resultado, restantes: restantes};
    }

    if (p.action === "claim") {
      const sh = ss.getSheetByName(SHEET_GIROS);
      const data = sh.getDataRange().getValues();
      const i = data.findIndex((r, n) => n > 0 && r[1] === p.deviceId && r[3] === p.code);
      if (i < 0) return {ok: false, message: "Cupón no encontrado."};
      if (data[i][8] === "SI") return {ok: false, message: "Este cupón ya fue reclamado."};

      const email = String(p.email || "").trim().toLowerCase();
      if (!p.nombre || !/^\S+@\S+\.\S+$/.test(email) || String(p.telefono || "").trim().length < 7)
        return {ok: false, message: "Revisa tu nombre, correo y teléfono."};
      if (data.some((r, n) => n > 0 && n !== i && r[8] === "SI" && String(r[5]).toLowerCase() === email))
        return {ok: false, message: "Este correo ya reclamó un premio de Lucky Shot."};

      const pr = RESULTADOS[data[i][2]];
      if (!pr || !pr.label) return {ok: false, message: "Premio no válido."};
      let elegido = "";
      if (pr.tipo === "descuento") {
        const [s, c] = String(p.servicio || "").split("|");
        const pl = PLANES.find(x => x.s === s && x.c === c);
        if (pl) elegido = pl.s + " " + pl.c + " ($" + pl.p + " → $" + Math.round(pl.p * (100 - pr.pct) / 100) + ")";
        else if (SERVICIOS.indexOf(s) >= 0 && c === A_COTIZAR) elegido = s + " (precio a cotizar con " + pr.pct + "% de descuento)";
        else return {ok: false, message: "Selecciona un servicio."};
      } else if (pr.tipo === "credito") {
        if (SERVICIOS.indexOf(p.servicio) < 0) return {ok: false, message: "Selecciona un servicio."};
        elegido = p.servicio;
      }

      sh.getRange(i + 1, 5, 1, 5).setValues([[p.nombre, email, p.telefono, p.empresa || "", "SI"]]);
      sh.getRange(i + 1, 11).setValue(elegido);
      MailApp.sendEmail({
        to: email, name: "Colibrí Searcher",
        subject: "¡Ganaste en Colibrí Lucky Shot! Tu cupón: " + p.code,
        body: buildPlain(p.nombre, pr, elegido, p.code),
        htmlBody: buildEmail(p.nombre, pr, elegido, p.code)
      });
      return {ok: true};
    }

    return {ok: false, message: "Acción inválida."};
  } finally { lock.releaseLock(); }
}

// La landing envía POST con JSON (los datos personales no viajan en la URL)
function doPost(e) {
  let p = {};
  try { p = JSON.parse(e.postData.contents); } catch (err) { return json({ok: false, message: "Solicitud inválida."}); }
  return json(handle(p));
}
// GET solo para consultar el estado
function doGet(e) {
  const p = e.parameter || {};
  if (p.action !== "status") return json({ok: false, message: "Usa POST."});
  return json(handle(p));
}

// ===== Correo =====
function buildEmail(nombre, pr, elegido, code) {
  const C = COLORES;
  const wa = "https://wa.me/" + CONTACTO.waNumero + "?text=" + encodeURIComponent("Hola, gané en Colibrí Lucky Shot. Mi cupón es " + code);
  const tel = "tel:" + CONTACTO.telNumero;
  const F = "font-family:Arial,Helvetica,sans-serif;";

  let preciosHtml = "";
  if (pr.tipo === "descuento") {
    const filas = PLANES.map((pl, i) => {
      const sel = elegido.indexOf(pl.s + " " + pl.c + " ") === 0;
      const bg = sel ? C.claro : (i % 2 ? "#f8fafd" : "#ffffff");
      const w = sel ? "font-weight:bold;" : "";
      const celda = "padding:8px 10px;" + F + "font-size:13px;color:" + C.texto + ";border-top:1px solid #dde4f0;" + w;
      return '<tr bgcolor="' + bg + '" style="background:' + bg + ';">' +
        '<td style="' + celda + '">' + esc(pl.s) + '</td>' +
        '<td style="' + celda + '">' + esc(pl.c) + (sel ? ' &larr; tu elección' : '') + '</td>' +
        '<td align="right" style="' + celda + 'color:' + C.suave + ';text-decoration:line-through;">$' + pl.p + '</td>' +
        '<td align="right" style="' + celda + 'color:' + C.acento + ';font-weight:bold;">$' + Math.round(pl.p * (100 - pr.pct) / 100) + '</td>' +
      '</tr>';
    }).join("");
    const th = "padding:9px 10px;" + F + "font-size:12px;color:#ffffff;font-weight:bold;";
    preciosHtml =
      '<tr><td style="padding:22px 32px 4px;">' +
        '<div style="' + F + 'font-size:15px;font-weight:bold;color:' + C.primario + ';margin-bottom:10px;">Precios con tu ' + pr.pct + '% de descuento</div>' +
        '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #dde4f0;border-radius:8px;">' +
          '<tr bgcolor="' + C.primario + '" style="background:' + C.primario + ';">' +
            '<td style="' + th + '">Servicio</td><td style="' + th + '">Plan</td>' +
            '<td align="right" style="' + th + '">Precio real</td><td align="right" style="' + th + '">Con ' + pr.pct + '%</td>' +
          '</tr>' + filas +
        '</table>' +
        '<div style="' + F + 'font-size:12px;color:' + C.suave + ';margin-top:8px;">Branding: precio a cotizar, con tu ' + pr.pct + '% de descuento aplicado.</div>' +
      '</td></tr>';
  }

  const tycHtml =
    '<tr><td style="padding:8px 32px 6px;">' +
    '<div style="' + F + 'font-size:13px;font-weight:bold;color:' + C.primario + ';border-top:1px solid #dde4f0;padding-top:18px;">Términos y condiciones</div>' +
    '<ul style="margin:10px 0 0;padding-left:18px;' + F + 'font-size:12px;line-height:1.6;color:' + C.suave + ';">' +
    TYC.map(t => '<li style="margin-bottom:5px;">' + esc(t) + '</li>').join("") +
    '</ul></td></tr>';

  return '' +
  '<div style="background:#f3f6fb;padding:24px 8px;">' +
  '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">' +
  '<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" bgcolor="#ffffff" style="width:100%;max-width:600px;background:#ffffff;border-radius:14px;border:1px solid #dde4f0;">' +

    '<tr><td align="center" bgcolor="' + C.primario + '" style="background:' + C.primario + ';padding:26px 24px;border-radius:13px 13px 0 0;">' +
      '<div style="' + F + 'font-size:13px;letter-spacing:3px;color:#1ef3ff;text-transform:uppercase;">Colibrí</div>' +
      '<div style="' + F + 'font-size:26px;font-weight:bold;color:#ffffff;margin-top:6px;letter-spacing:1px;">LUCKY SHOT</div>' +
    '</td></tr>' +

    '<tr><td style="padding:30px 32px 6px;">' +
      '<div style="' + F + 'font-size:26px;font-weight:bold;color:' + C.primario + ';">¡Felicidades, ganaste!</div>' +
      '<div style="' + F + 'font-size:16px;line-height:1.6;color:' + C.texto + ';margin-top:10px;">Hola <b>' + esc(nombre) + '</b>, tu giro en Lucky Shot tuvo premio. Aquí tienes los detalles de tu cupón.</div>' +
    '</td></tr>' +

    '<tr><td style="padding:16px 32px 6px;">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="' + C.claro + '" style="background:' + C.claro + ';border-left:5px solid #1ef3ff;border-radius:8px;">' +
        '<tr><td style="padding:18px 20px;">' +
          '<div style="' + F + 'font-size:12px;letter-spacing:2px;color:' + C.suave + ';font-weight:bold;">TU PREMIO</div>' +
          '<div style="' + F + 'font-size:20px;line-height:1.4;color:' + C.primario + ';font-weight:bold;margin-top:6px;">' + esc(pr.label) + '</div>' +
          (elegido ? '<div style="' + F + 'font-size:15px;color:' + C.texto + ';margin-top:10px;">Tu selección: <b>' + esc(elegido) + '</b></div>' : '') +
        '</td></tr>' +
      '</table>' +
    '</td></tr>' +

    '<tr><td align="center" style="padding:20px 32px 6px;">' +
      '<div style="' + F + 'font-size:12px;letter-spacing:2px;color:' + C.suave + ';font-weight:bold;margin-bottom:10px;">CÓDIGO DEL CUPÓN</div>' +
      '<div style="display:inline-block;border:2px dashed ' + C.acento + ';border-radius:10px;padding:14px 26px;font-family:\'Courier New\',Courier,monospace;font-size:28px;font-weight:bold;letter-spacing:3px;color:' + C.acento + ';">' + esc(code) + '</div>' +
      '<div style="' + F + 'font-size:13px;color:' + C.suave + ';margin-top:12px;">Vigencia: ' + esc(VIGENCIA) + '</div>' +
    '</td></tr>' +

    preciosHtml +

    '<tr><td align="center" style="padding:26px 32px 6px;">' +
      '<div style="' + F + 'font-size:17px;font-weight:bold;color:' + C.primario + ';">¿Quieres más información?</div>' +
      '<div style="' + F + 'font-size:14px;color:' + C.texto + ';margin:6px 0 14px;">Escríbenos o llámanos y te ayudamos a canjear tu cupón.</div>' +
      '<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center"><tr>' +
        '<td align="center" bgcolor="#25d366" style="border-radius:8px;"><a href="' + wa + '" style="display:inline-block;padding:12px 22px;' + F + 'font-size:15px;font-weight:bold;color:#06210f;text-decoration:none;">WhatsApp<br><span style="font-size:13px;font-weight:normal;">' + esc(CONTACTO.waTexto) + '</span></a></td>' +
        '<td width="12" style="font-size:0;">&nbsp;</td>' +
        '<td align="center" bgcolor="' + C.acento + '" style="border-radius:8px;"><a href="' + tel + '" style="display:inline-block;padding:12px 22px;' + F + 'font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">Llamar<br><span style="font-size:13px;font-weight:normal;">' + esc(CONTACTO.telTexto) + '</span></a></td>' +
      '</tr></table>' +
      '<div style="' + F + 'font-size:13px;color:' + C.suave + ';margin-top:14px;">o por correo: <a href="mailto:' + esc(CONTACTO.email) + '" style="color:' + C.acento + ';">' + esc(CONTACTO.email) + '</a></div>' +
    '</td></tr>' +

    '<tr><td style="padding:14px 0 0;font-size:0;line-height:0;">&nbsp;</td></tr>' +
    tycHtml +

    '<tr><td align="center" style="padding:16px 24px 24px;' + F + 'font-size:12px;color:' + C.suave + ';">' +
      'Recibes este correo porque participaste en Colibrí Lucky Shot de Colibrí Searcher.' +
    '</td></tr>' +

  '</table></td></tr></table></div>';
}

function buildPlain(nombre, pr, elegido, code) {
  let precios = "";
  if (pr.tipo === "descuento") {
    precios = "\nPrecios con tu " + pr.pct + "% de descuento:\n" +
      PLANES.map(pl => "- " + pl.s + " " + pl.c + ": $" + pl.p + " → $" + Math.round(pl.p * (100 - pr.pct) / 100)).join("\n") +
      "\n- Branding: precio a cotizar\n";
  }
  return "¡Felicidades, ganaste! Hola " + nombre + ", tu premio: " + pr.label + "\n" +
    (elegido ? "Tu selección: " + elegido + "\n" : "") +
    "Código del cupón: " + code + "\nVigencia: " + VIGENCIA + "\n" + precios + "\n" +
    "Más información: WhatsApp " + CONTACTO.waTexto + " | Llamadas " + CONTACTO.telTexto + " | " + CONTACTO.email + "\n" +
    "\nTérminos y condiciones:\n- " + TYC.join("\n- ");
}
