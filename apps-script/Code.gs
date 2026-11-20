const CONFIG = Object.freeze({
  adminSessionPrefix: "achetsu-admin-session-",
  adminSessionSeconds: 2 * 60 * 60,
  adminMaxFailedLogins: 5,
  adminLockoutSeconds: 15 * 60,
  passwordHashIterations: 3000,
  requestSheet: "Solicitudes",
  memberSheet: "Socios",
  congressSpreadsheetId: "1YByh_TEXxJn41cZju-cdfWoid40gOYTXuhlVgO3OSz0",
  congressSheet: "Inscripciones",
  congressMaxSendsPerEmail: 3,
  congressMaxGlobalSends: 60,
  congressRateWindowSeconds: 600,
  challengePrefix: "achetsu-email-challenge-",
  challengeLifetimeSeconds: 600,
  challengeMaxAttempts: 5,
  challengeMaxSends: 3,
  challengeMaxGlobalSends: 30,
  maxAttachmentBytes: 5 * 1024 * 1024,
  maxSearchResults: 8,
  publicSiteUrl: "https://estebancofre-coy.github.io/achetsuweb/",
  adminNotificationEmail: "esteban.cofre@uaysen.cl"
});

const ACHETSU_UNIVERSITIES = Object.freeze([
  "Universidad Alberto Hurtado (UAH)",
  "Pontificia Universidad Católica de Chile (PUC)",
  "Universidad de Chile",
  "Universidad de Las Américas (UDLA)",
  "Universidad Católica del Maule (UCM)",
  "Universidad Bernardo O'Higgins (UBO)",
  "Universidad Santo Tomás (UST)",
  "Universidad Andrés Bello (UNAB)",
  "Universidad Autónoma de Chile",
  "Universidad Católica Cardenal Silva Henríquez (UCSH)",
  "Universidad Austral de Chile (UACh)",
  "Universidad Academia de Humanismo Cristiano (UAHC)",
  "Universidad Central de Chile (UCEN)",
  "Universidad Miguel de Cervantes (UMC)"
]);

const CONGRESS_HEADERS = [
  "Folio", "Fecha de inscripción", "Tipo de participante",
  "Nombre completo", "Correo electrónico", "Cargo",
  "Pertenencia ACHETSU", "Universidad o institución", "Jornadas de asistencia",
  "Confirmación al inscrito", "Notificación administrativa"
];

const REQUEST_HEADERS = [
  "ID", "Fecha", "Estado", "Categoría", "Tipo", "ID socio",
  "Nombre", "Correo", "Teléfono", "Universidad", "Cambios solicitados",
  "ID archivo", "Nombre archivo", "Habilitado 2026",
  "Revisado por", "Fecha revisión", "Nota administrativa",
  "Fecha verificación correo", "Método verificación", "Huella de datos confirmados",
  "Notificación administrativa"
];

const MEMBER_HEADERS = [
  "ID", "Categoría", "Apellidos", "Nombre completo", "Correo",
  "Universidad", "Habilitado 2026", "Actualizado"
];

function doGet(event) {
  const view = event && event.parameter ? event.parameter.view : "";
  if (view === "admin") {
    const template = HtmlService.createTemplateFromFile("Admin");
    template.publicUrl = publicAppUrl_();
    return template.evaluate().setTitle("Revisión de solicitudes · ACHETSU");
  }
  if (view === "directory") {
    const template = HtmlService.createTemplateFromFile("Directory");
    template.appUrl = publicAppUrl_();
    return template.evaluate()
      .setTitle("Consulta del padrón · ACHETSU")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  if (view === "intake") {
    const template = HtmlService.createTemplateFromFile("Intake");
    template.appUrl = publicAppUrl_();
    template.homeUrl = CONFIG.publicSiteUrl;
    template.memberId = event.parameter.memberId || "";
    template.category = event.parameter.category || "";
    template.requestType = event.parameter.requestType || "";
    return template.evaluate().setTitle("Solicitud de actualización · ACHETSU");
  }
  if (view === "congreso") {
    const template = HtmlService.createTemplateFromFile("Congreso");
    template.appUrl = publicAppUrl_();
    template.homeUrl = CONFIG.publicSiteUrl + "congreso.html";
    return template.evaluate()
      .setTitle("Inscripción · I Congreso ACHETSU 2026")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createHtmlOutput("Aplicación de solicitudes de ACHETSU.")
    .setTitle("ACHETSU");
}

function doPost(event) {
  try {
    const raw = event && event.postData && event.postData.contents ? event.postData.contents : "";
    const payload = raw ? JSON.parse(raw) : (event && event.parameter ? event.parameter : {});
    if (payload && payload.action === "registerCongress") {
      const result = submitCongressRegistration(payload);
      return jsonResponse_({ ok: true, result: result });
    }
    return jsonResponse_({ ok: false, error: "Acción no válida." });
  } catch (error) {
    return jsonResponse_({
      ok: false,
      error: error && error.message ? error.message : "No se pudo procesar la solicitud."
    });
  }
}

function jsonResponse_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function initializeBackend() {
  const properties = PropertiesService.getScriptProperties();
  let spreadsheetId = properties.getProperty("ACHETSU_SPREADSHEET_ID");
  let folderId = properties.getProperty("ACHETSU_PRIVATE_FOLDER_ID");

  if (!spreadsheetId) {
    const spreadsheet = SpreadsheetApp.create("ACHETSU · solicitudes y padrón");
    spreadsheetId = spreadsheet.getId();
    properties.setProperty("ACHETSU_SPREADSHEET_ID", spreadsheetId);
  }

  if (!folderId) {
    const folder = DriveApp.createFolder("ACHETSU · antecedentes pendientes de revisión");
    folderId = folder.getId();
    properties.setProperty("ACHETSU_PRIVATE_FOLDER_ID", folderId);
  }

  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  ensureSheet_(spreadsheet, CONFIG.requestSheet, REQUEST_HEADERS);
  ensureSheet_(spreadsheet, CONFIG.memberSheet, MEMBER_HEADERS);
  const congressSheet = getCongressSheet_();
  MailApp.getRemainingDailyQuota();
  return {
    spreadsheetUrl: spreadsheet.getUrl(),
    congressSpreadsheetUrl: congressSheet.getParent().getUrl(),
    privateFolderUrl: DriveApp.getFolderById(folderId).getUrl()
  };
}

function submitCongressRegistration(form) {
  if (!form || typeof form !== "object") {
    throw new Error("No se recibieron los datos de inscripción.");
  }
  if (form.website) {
    throw new Error("No se pudo procesar la inscripción.");
  }

  const fullName = cleanText_(form.fullName, 160);
  const email = cleanText_(form.email, 254).toLowerCase();
  const rawRole = cleanText_(form.role, 80);
  const otherRole = cleanText_(form.otherRole, 120);
  const universitySelection = cleanText_(form.university, 180);
  const otherInstitution = cleanText_(form.otherInstitution, 180);
  const rawAttendance = cleanText_(form.attendance, 140);

  if (fullName.length < 3) {
    throw new Error("Ingresa tu nombre completo.");
  }
  if (!isValidEmail_(email)) {
    throw new Error("Ingresa un correo electrónico válido para enviarte la confirmación.");
  }

  const roleMap = {
    "academico": "Académico/a",
    "Académico/a": "Académico/a",
    "Académico": "Académico/a",
    "docente_colaborador": "Docente colaborador/a",
    "Docente colaborador/a": "Docente colaborador/a",
    "Docente colaborador": "Docente colaborador/a",
    "otro": "Otro",
    "Otro": "Otro"
  };
  const normalizedRole = roleMap[rawRole];
  if (!normalizedRole) {
    throw new Error("Selecciona un cargo válido (Académico/a, Docente colaborador/a u Otro).");
  }
  const roleLabel = normalizedRole === "Otro" && otherRole
    ? "Otro (" + otherRole + ")"
    : normalizedRole;

  const isAchetsuUniversity = ACHETSU_UNIVERSITIES.includes(universitySelection);
  const isOtherInstitution = universitySelection === "Otra institución" || universitySelection === "otra";
  if (!isAchetsuUniversity && !isOtherInstitution) {
    throw new Error("Selecciona una de las 14 universidades de ACHETSU o la opción «Otra institución».");
  }
  if (isOtherInstitution && otherInstitution.length < 2) {
    throw new Error("Indica el nombre de tu institución en el campo «Nombre de la institución».");
  }

  const institutionType = isAchetsuUniversity ? "Universidad ACHETSU" : "Otra institución";
  const finalInstitution = isAchetsuUniversity ? universitySelection : otherInstitution;

  const attendanceMap = {
    "ambas": "Ambas jornadas (martes 24 y miércoles 25 de noviembre)",
    "Ambas jornadas (martes 24 y miércoles 25 de noviembre)": "Ambas jornadas (martes 24 y miércoles 25 de noviembre)",
    "dia1": "Solo martes 24 de noviembre",
    "Solo martes 24 de noviembre": "Solo martes 24 de noviembre",
    "dia2": "Solo miércoles 25 de noviembre",
    "Solo miércoles 25 de noviembre": "Solo miércoles 25 de noviembre"
  };
  const attendanceLabel = attendanceMap[rawAttendance] || "Ambas jornadas (martes 24 y miércoles 25 de noviembre)";

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const emailRateKey = "achetsu-congress-rate-" + hashText_(email);
    const emailSends = Number(cache.get(emailRateKey) || 0);
    if (emailSends >= CONFIG.congressMaxSendsPerEmail) {
      throw new Error("Ya registramos solicitudes recientes con este correo. Revisa tu bandeja de entrada o intenta en 10 minutos.");
    }
    const globalRateKey = "achetsu-congress-global-rate";
    const globalSends = Number(cache.get(globalRateKey) || 0);
    if (globalSends >= CONFIG.congressMaxGlobalSends) {
      throw new Error("El sistema está recibiendo muchas inscripciones en este momento. Intenta nuevamente en unos minutos.");
    }

    const sheet = getCongressSheet_();
    const folio = "CONG-2026-" + Utilities.getUuid().slice(0, 8).toUpperCase();
    const timestamp = new Date();
    const formattedDate = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");
    const rowNumber = sheet.getLastRow() + 1;

    sheet.appendRow([
      safeSheetText_(folio),
      timestamp,
      "Persona natural",
      safeSheetText_(fullName),
      safeSheetText_(email),
      safeSheetText_(roleLabel),
      safeSheetText_(institutionType),
      safeSheetText_(finalInstitution),
      safeSheetText_(attendanceLabel),
      "Pendiente",
      "Pendiente"
    ]);

    cache.put(emailRateKey, String(emailSends + 1), CONFIG.congressRateWindowSeconds);
    cache.put(globalRateKey, String(globalSends + 1), CONFIG.congressRateWindowSeconds);

    let participantEmailSent = true;
    try {
      MailApp.sendEmail({
        to: email,
        replyTo: CONFIG.adminNotificationEmail,
        subject: "ACHETSU | Confirmación de inscripción · I Congreso ACHETSU 2026 (" + folio + ")",
        body: "Estimado/a " + fullName + ",\n\n" +
          "Confirmamos tu inscripción como persona natural al I Congreso ACHETSU 2026: " +
          "«Desafíos de la academia en torno a la formación profesional en clave de nuevas tecnologías y nuevos campos profesionales».\n\n" +
          "DETALLE DE TU INSCRIPCIÓN\n" +
          "- Folio: " + folio + "\n" +
          "- Fecha de registro: " + formattedDate + "\n" +
          "- Nombre: " + fullName + "\n" +
          "- Correo: " + email + "\n" +
          "- Cargo: " + roleLabel + "\n" +
          "- Universidad / Institución: " + finalInstitution + " (" + institutionType + ")\n" +
          "- Participación declarada: " + attendanceLabel + "\n\n" +
          "INFORMACIÓN IMPORTANTE DEL ENCUENTRO\n" +
          "- Fechas: Martes 24 y miércoles 25 de noviembre de 2026 (acreditación desde las 09:00 h).\n" +
          "- Lugar: Universidad Alberto Hurtado (Av. Libertador Bernardo O'Higgins 1825, Santiago — Metro Los Héroes).\n" +
          "- Costo: Asistir al seminario y a las actividades del Congreso NO tiene costo.\n" +
          "- Participación: Se prefiere que las personas inscritas participen en ambas jornadas para acompañar las ponencias, los grupos de trabajo y el plenario de la Agenda ACHETSU 2026–2029.\n\n" +
          "Programa e información actualizada: " + CONFIG.publicSiteUrl + "congreso.html\n\n" +
          "Atentamente,\n" +
          "Equipo Organizador · I Congreso ACHETSU 2026\n" +
          "Asociación Chilena de Enseñanza en Trabajo Social Universitario",
        htmlBody: "<div style=\"font-family:'Segoe UI',Arial,sans-serif;max-width:640px;margin:0 auto;color:#302d2b;line-height:1.6;background:#f7f3e8;padding:24px;border:1px solid #dfd4bf\">" +
          "<p style=\"margin:0 0 6px;color:#b94f2d;font-size:12px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase\">Asociación Chilena de Enseñanza en Trabajo Social Universitario</p>" +
          "<h2 style=\"margin:0 0 14px;font-family:Georgia,serif;font-weight:400;font-size:26px;color:#174e4b\">Confirmación de inscripción · I Congreso ACHETSU 2026</h2>" +
          "<p>Estimado/a <strong>" + escapeHtml_(fullName) + "</strong>,</p>" +
          "<p>Hemos registrado tu inscripción como <strong>persona natural</strong> para el <strong>I Congreso ACHETSU 2026</strong>: <em>«Desafíos de la academia en torno a la formación profesional en clave de nuevas tecnologías y nuevos campos profesionales»</em>.</p>" +
          "<div style=\"background:#fffdf8;border:1px solid #d7a93f;padding:16px;margin:18px 0\">" +
          "<p style=\"margin:0 0 10px;font-weight:800;color:#174e4b;font-size:13px;letter-spacing:0.08em;text-transform:uppercase\">Resumen de tu inscripción</p>" +
          "<p style=\"margin:4px 0\"><strong>Folio:</strong> " + escapeHtml_(folio) + "</p>" +
          "<p style=\"margin:4px 0\"><strong>Fecha de registro:</strong> " + escapeHtml_(formattedDate) + "</p>" +
          "<p style=\"margin:4px 0\"><strong>Nombre completo:</strong> " + escapeHtml_(fullName) + "</p>" +
          "<p style=\"margin:4px 0\"><strong>Correo electrónico:</strong> " + escapeHtml_(email) + "</p>" +
          "<p style=\"margin:4px 0\"><strong>Cargo:</strong> " + escapeHtml_(roleLabel) + "</p>" +
          "<p style=\"margin:4px 0\"><strong>Universidad / Institución:</strong> " + escapeHtml_(finalInstitution) + " (" + escapeHtml_(institutionType) + ")</p>" +
          "<p style=\"margin:4px 0\"><strong>Jornadas:</strong> " + escapeHtml_(attendanceLabel) + "</p>" +
          "</div>" +
          "<div style=\"background:#eee5d3;border-left:4px solid #1c625e;padding:14px 16px;margin:18px 0;font-size:14px\">" +
          "<p style=\"margin:0 0 6px\"><strong>Coordenadas del encuentro:</strong></p>" +
          "<p style=\"margin:4px 0\">• <strong>Fechas:</strong> Martes 24 y miércoles 25 de noviembre de 2026 (recepción y acreditación desde las 09:00 h).</p>" +
          "<p style=\"margin:4px 0\">• <strong>Sede:</strong> Universidad Alberto Hurtado, Av. Libertador Bernardo O'Higgins 1825, Santiago (Metro Los Héroes).</p>" +
          "<p style=\"margin:4px 0\">• <strong>Actividad gratuita:</strong> Asistir al seminario y al Congreso <strong>no tiene costo</strong>.</p>" +
          "<p style=\"margin:4px 0\">• <strong>Participación:</strong> Se prefiere que las y los participantes asistan a <strong>ambas jornadas</strong> para acompañar las ponencias, el conversatorio y el plenario de la Agenda ACHETSU 2026–2029.</p>" +
          "</div>" +
          "<p style=\"font-size:14px\">Puedes revisar el programa completo en <a href=\"" + CONFIG.publicSiteUrl + "congreso.html\" style=\"color:#b94f2d;font-weight:700\">la página oficial del I Congreso ACHETSU 2026</a>.</p>" +
          "<p style=\"margin:18px 0 0;font-size:13px;color:#716961\">Equipo Organizador · I Congreso ACHETSU 2026</p>" +
          "</div>",
        name: "I Congreso ACHETSU 2026"
      });
    } catch (error) {
      participantEmailSent = false;
      Logger.log("Error al enviar correo de confirmación al inscrito (" + folio + "): " + error);
    }

    let adminNotificationSent = true;
    try {
      const sheetUrl = "https://docs.google.com/spreadsheets/d/" +
        (PropertiesService.getScriptProperties().getProperty("ACHETSU_CONGRESS_SPREADSHEET_ID") || CONFIG.congressSpreadsheetId) +
        "/edit";
      MailApp.sendEmail({
        to: CONFIG.adminNotificationEmail,
        replyTo: email,
        subject: "ACHETSU | Nueva inscripción Congreso 2026 · " + fullName + " (" + folio + ")",
        body: "Se ha registrado una nueva inscripción de persona natural al I Congreso ACHETSU 2026.\n\n" +
          "Folio: " + folio + "\n" +
          "Fecha: " + formattedDate + "\n" +
          "Nombre completo: " + fullName + "\n" +
          "Correo electrónico: " + email + "\n" +
          "Cargo: " + roleLabel + "\n" +
          "Pertenencia: " + institutionType + "\n" +
          "Universidad / Institución: " + finalInstitution + "\n" +
          "Jornadas: " + attendanceLabel + "\n" +
          "Confirmación enviada al inscrito: " + (participantEmailSent ? "Sí" : "Fallida") + "\n\n" +
          "Ver planilla de inscritos en Google Sheets:\n" + sheetUrl + "\n\nACHETSU",
        htmlBody: "<div style=\"font-family:'Segoe UI',Arial,sans-serif;max-width:600px;color:#302d2b;line-height:1.55\">" +
          "<h2 style=\"margin:0 0 12px;font-family:Georgia,serif;color:#174e4b\">Nueva inscripción al I Congreso ACHETSU 2026</h2>" +
          "<p style=\"margin:0 0 12px\">Se registró una nueva inscripción de <strong>persona natural</strong> en la planilla del Congreso:</p>" +
          "<table style=\"width:100%;border-collapse:collapse;background:#fffdf8;border:1px solid #dfd4bf;font-size:14px\">" +
          "<tr><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf;font-weight:700;width:38%\">Folio</td><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf\">" + escapeHtml_(folio) + "</td></tr>" +
          "<tr><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf;font-weight:700\">Fecha y hora</td><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf\">" + escapeHtml_(formattedDate) + "</td></tr>" +
          "<tr><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf;font-weight:700\">Nombre completo</td><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf\">" + escapeHtml_(fullName) + "</td></tr>" +
          "<tr><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf;font-weight:700\">Correo electrónico</td><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf\">" + escapeHtml_(email) + "</td></tr>" +
          "<tr><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf;font-weight:700\">Cargo</td><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf\">" + escapeHtml_(roleLabel) + "</td></tr>" +
          "<tr><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf;font-weight:700\">Pertenencia</td><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf\">" + escapeHtml_(institutionType) + "</td></tr>" +
          "<tr><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf;font-weight:700\">Universidad / Institución</td><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf\">" + escapeHtml_(finalInstitution) + "</td></tr>" +
          "<tr><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf;font-weight:700\">Jornadas</td><td style=\"padding:8px 12px;border-bottom:1px solid #dfd4bf\">" + escapeHtml_(attendanceLabel) + "</td></tr>" +
          "<tr><td style=\"padding:8px 12px;font-weight:700\">Correo al inscrito</td><td style=\"padding:8px 12px\">" + (participantEmailSent ? "Enviado correctamente" : "No se pudo enviar") + "</td></tr>" +
          "</table>" +
          "<p style=\"margin:16px 0 0\"><a href=\"" + sheetUrl + "\" style=\"display:inline-block;padding:10px 16px;background:#1c625e;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px\">Abrir planilla Google Sheets ↗</a></p>" +
          "</div>",
        name: "I Congreso ACHETSU 2026"
      });
    } catch (error) {
      adminNotificationSent = false;
      Logger.log("Error al enviar notificación administrativa de inscripción (" + folio + "): " + error);
    }

    try {
      sheet.getRange(rowNumber, 10, 1, 2).setValues([[
        participantEmailSent ? "Enviada" : "Fallida",
        adminNotificationSent ? "Enviada" : "Fallida"
      ]]);
    } catch (error) {
      Logger.log("No se pudo actualizar el estado de correo para la fila " + rowNumber + ": " + error);
    }

    return {
      folio: folio,
      receivedAt: formattedDate,
      fullName: fullName,
      email: email,
      role: roleLabel,
      institutionType: institutionType,
      institution: finalInstitution,
      attendance: attendanceLabel,
      participantEmailSent: participantEmailSent,
      adminNotificationSent: adminNotificationSent
    };
  } finally {
    lock.releaseLock();
  }
}

function beginEmailChallenge(form) {
  if (!form) throw new Error("No se recibió la solicitud.");
  const email = cleanText_(form.email, 254).toLowerCase();
  if (!isValidEmail_(email)) throw new Error("Ingresa un correo válido para recibir el código de verificación.");
  if (form.consent !== "on") throw new Error("Confirma la declaración antes de solicitar el código.");
  if (form.website) throw new Error("No se pudo procesar la solicitud.");
  const requestFingerprint = requestFingerprint_(form);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const rateKey = "achetsu-email-rate-" + hashText_(email);
    const sends = Number(cache.get(rateKey) || 0);
    if (sends >= CONFIG.challengeMaxSends) {
      throw new Error("Se alcanzó el límite de códigos para este correo. Intenta nuevamente en 10 minutos.");
    }
    const globalRateKey = "achetsu-email-global-rate";
    const globalSends = Number(cache.get(globalRateKey) || 0);
    if (globalSends >= CONFIG.challengeMaxGlobalSends) {
      throw new Error("Se alcanzó el límite temporal de envíos. Intenta nuevamente en 10 minutos.");
    }
    if (MailApp.getRemainingDailyQuota() < 1) {
      throw new Error("El servicio de correo alcanzó su límite diario. Intenta nuevamente más tarde o contacta a ACHETSU.");
    }

    const verificationCode = createVerificationCode_();
    const challengeId = Utilities.getUuid();
    const expiresAt = Date.now() + CONFIG.challengeLifetimeSeconds * 1000;
    const payload = JSON.stringify({
      codeHash: hashText_(challengeId + ":" + verificationCode),
      requestFingerprint: requestFingerprint,
      email: email,
      createdAt: Date.now(),
      expiresAt: expiresAt,
      failedAttempts: 0
    });
    const cacheKey = CONFIG.challengePrefix + challengeId;
    cache.put(cacheKey, payload, CONFIG.challengeLifetimeSeconds);
    cache.put(rateKey, String(sends + 1), CONFIG.challengeLifetimeSeconds);
    cache.put(globalRateKey, String(globalSends + 1), CONFIG.challengeLifetimeSeconds);
    try {
      const expiryMinutes = Math.ceil(CONFIG.challengeLifetimeSeconds / 60);
      MailApp.sendEmail({
        to: email,
        subject: "ACHETSU | Código para confirmar tu solicitud",
        body: "Tu código de verificación ACHETSU es: " + verificationCode +
          "\n\nIngresa este código en el formulario para confirmar el envío de los datos y el antecedente adjunto que completaste. " +
          "Vence en " + expiryMinutes + " minutos y solo puede usarse una vez. No lo compartas.\n\n" +
          "Este código confirma el acceso a esta casilla y la conformidad con el envío; " +
          "no es una firma electrónica legal ni acredita por sí solo tu identidad. " +
          "La solicitud seguirá pendiente de revisión administrativa.\n\n" +
          "Si no solicitaste este código, puedes ignorar este mensaje.\n\nACHETSU",
        htmlBody: "<div style=\"font-family:Arial,sans-serif;color:#302d2b;line-height:1.6\">" +
          "<p>Confirma el envío de los datos y el antecedente adjunto de tu solicitud a ACHETSU con este código:</p>" +
          "<p style=\"font-size:28px;font-weight:bold;letter-spacing:6px;color:#174e4b\">" +
          verificationCode + "</p>" +
          "<p>Vence en " + expiryMinutes + " minutos, solo puede usarse una vez y no debes compartirlo.</p>" +
          "<p>El código confirma el acceso a esta casilla y la conformidad con el envío. " +
          "No es una firma electrónica legal ni acredita por sí solo tu identidad. " +
          "La solicitud seguirá pendiente de revisión administrativa.</p>" +
          "<p>Si no solicitaste este código, puedes ignorar este mensaje.</p><p>ACHETSU</p></div>",
        name: "ACHETSU | Solicitudes"
      });
    } catch (error) {
      cache.remove(cacheKey);
      Logger.log("No se pudo enviar el código de verificación por correo: " + error);
      throw new Error("No se pudo enviar el código a ese correo. Revisa la dirección o intenta nuevamente más tarde.");
    }

    const previousId = cleanText_(form.challengeId, 80);
    if (previousId) {
      const previousKey = CONFIG.challengePrefix + previousId;
      const previousText = cache.get(previousKey);
      if (previousText && JSON.parse(previousText).email === email) cache.remove(previousKey);
    }
    return {
      challengeId: challengeId,
      maskedEmail: maskEmail_(email),
      lifetimeSeconds: CONFIG.challengeLifetimeSeconds
    };
  } finally {
    lock.releaseLock();
  }
}

function submitRequest(form) {
  if (!form) throw new Error("No se recibió la solicitud.");

  const challengeId = cleanText_(form.challengeId, 80);
  const cache = CacheService.getScriptCache();
  const cacheKey = CONFIG.challengePrefix + challengeId;
  const category = cleanText_(form.category, 30);
  const requestType = cleanText_(form.requestType, 30);
  const memberId = cleanText_(form.memberId, 80);
  const surname = cleanText_(form.surname, 160);
  const givenName = cleanText_(form.givenName, 160);
  const email = cleanText_(form.email, 254).toLowerCase();
  const phone = cleanText_(form.phone, 40);
  const university = cleanText_(form.university, 180);
  const description = cleanText_(form.description, 2500);
  const consent = form.consent === "on";

  if (!["naturales", "institucionales"].includes(category)) throw new Error("Selecciona una categoría de socio.");
  if (!["rectificacion", "incorporacion"].includes(requestType)) throw new Error("Selecciona el tipo de solicitud.");
  if (!surname || !givenName || !isValidEmail_(email) || !isValidPhone_(phone) || !university || !description) {
    throw new Error("Completa apellidos, nombre, correo, teléfono, universidad y cambios solicitados.");
  }
  if (!consent) throw new Error("Debes confirmar que autorizas la revisión administrativa de esta solicitud.");
  if (form.website) throw new Error("No se pudo procesar la solicitud.");
  const details = JSON.stringify({ surname, givenName, email, university, description });

  const isUpdate = requestType === "rectificacion";
  if (isUpdate && !memberId) throw new Error("Selecciona el registro que deseas rectificar.");
  if (!isUpdate && memberId) throw new Error("Una incorporación nueva no debe incluir un ID de socio.");
  const attachment = form.attachment;
  const requestFingerprint = requestFingerprint_(form);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  let uploadedFile = null;
  let requestStored = false;
  try {
    const challengeText = cache.get(cacheKey);
    if (!challengeText) throw new Error("El código venció o ya fue utilizado. Solicita uno nuevo.");
    const challenge = JSON.parse(challengeText);
    if (Number(challenge.expiresAt) <= Date.now()) {
      cache.remove(cacheKey);
      throw new Error("El código venció. Solicita uno nuevo.");
    }
    if (challenge.email !== email) {
      throw new Error("El correo cambió después de solicitar el código. Usa «Enviar otro código» para verificar la nueva dirección.");
    }
    if (!constantTimeEquals_(challenge.requestFingerprint, requestFingerprint)) {
      throw new Error("Los datos o el antecedente cambiaron después de solicitar el código. Usa «Enviar otro código» para confirmar la solicitud actualizada.");
    }
    if (!verifyEmailCode_(challengeId, challenge, form.verificationCode)) {
      challenge.failedAttempts = Number(challenge.failedAttempts || 0) + 1;
      const expiresAt = Number(challenge.expiresAt) || 0;
      const remainingSeconds = Math.ceil((expiresAt - Date.now()) / 1000);
      if (challenge.failedAttempts >= CONFIG.challengeMaxAttempts || remainingSeconds <= 0) {
        cache.remove(cacheKey);
        throw new Error("El código venció o se agotaron los intentos. Solicita un código nuevo.");
      } else {
        cache.put(cacheKey, JSON.stringify(challenge), remainingSeconds);
      }
      throw new Error("El código no es válido. Revisa el correo e inténtalo nuevamente.");
    }
    cache.remove(cacheKey);

    const existingMember = isUpdate ? findMember_(memberId, category) : null;
    if (isUpdate && !existingMember) {
      throw new Error("No se encontró el registro indicado. Vuelve al padrón y selecciónalo nuevamente.");
    }

    const requestId = Utilities.getUuid();
    const timestamp = new Date();
    const folder = DriveApp.getFolderById(getRequiredProperty_("ACHETSU_PRIVATE_FOLDER_ID"));
    const safeFileName = sanitizeFileName_(attachment.getName());
    uploadedFile = folder.createFile(attachment.copyBlob().setName(requestId + "-" + safeFileName));

    const requestSheet = getSheet_(CONFIG.requestSheet);
    const requestTypeLabel = requestType === "rectificacion" ? "Rectificación de datos" : "Nueva incorporación";
    const categoryLabel = category === "naturales" ? "Socio/a natural" : "Representante institucional";
    const requestRow = requestSheet.getLastRow() + 1;
    requestSheet.appendRow([
      requestId, timestamp, "Pendiente", category, requestType, safeSheetText_(memberId),
      safeSheetText_([surname, givenName].join(", ")),
      safeSheetText_(email), safeSheetText_(phone), safeSheetText_(university), details,
      uploadedFile.getId(), safeSheetText_(safeFileName),
      existingMember ? existingMember.eligible2026 : false,
      "", "", "", timestamp, "Código de un solo uso; datos y antecedente confirmados",
      requestFingerprint, "Pendiente"
    ]);
    requestStored = true;

    let adminNotificationSent = true;
    try {
      MailApp.sendEmail({
        to: CONFIG.adminNotificationEmail,
        subject: "ACHETSU | Nueva solicitud recibida · " + requestId,
        body: "Se recibió una nueva solicitud para revisión administrativa.\n\n" +
          "Folio: " + requestId + "\n" +
          "Fecha: " + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm") + "\n" +
          "Tipo: " + requestTypeLabel + "\n" +
          "Categoría: " + categoryLabel + "\n" +
          "Nombre: " + surname + ", " + givenName + "\n" +
          "Correo: " + email + "\n" +
          "Teléfono: " + phone + "\n" +
          "Universidad o unidad académica: " + university + "\n" +
          "Cambios solicitados: " + description + "\n" +
          "Antecedente adjunto: " + safeFileName + "\n\n" +
          "Abre el panel administrativo para revisar la solicitud: " + publicAppUrl_() + "?view=admin\n\nACHETSU",
        name: "ACHETSU | Solicitudes"
      });
    } catch (error) {
      adminNotificationSent = false;
      Logger.log("La solicitud " + requestId + " se guardó, pero falló el aviso al administrador: " + error);
    }

    try {
      requestSheet.getRange(requestRow, REQUEST_HEADERS.length)
        .setValue(adminNotificationSent ? "Enviada" : "Fallida");
    } catch (error) {
      Logger.log("No se pudo registrar el estado del aviso administrativo para " + requestId + ": " + error);
    }

    return {
      requestId: requestId,
      message: "Solicitud recibida para revisión administrativa.",
      adminNotificationSent: adminNotificationSent,
      receipt: {
        requestType: requestType,
        category: category,
        name: [surname, givenName].join(", "),
        email: email,
        phone: phone,
        university: university,
        description: description,
        attachmentName: safeFileName,
        receivedAt: Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm")
      }
    };
  } catch (error) {
    if (uploadedFile && !requestStored) uploadedFile.setTrashed(true);
    throw error;
  } finally {
    lock.releaseLock();
  }
}

function searchMembers(category, query) {
  const normalizedCategory = cleanText_(category, 30);
  const normalizedQuery = normalizeText_(cleanText_(query, 100));
  if (!["naturales", "institucionales"].includes(normalizedCategory)) {
    throw new Error("Selecciona un padrón válido.");
  }
  if (normalizedQuery.length < 2) return [];

  const sheet = getSheet_(CONFIG.memberSheet);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) return [];

  const results = [];
  for (let row = 1; row < values.length && results.length < CONFIG.maxSearchResults; row += 1) {
    const member = memberFromRow_(values[row]);
    if (member.category !== normalizedCategory) continue;
    // Los socios institucionales se buscan por universidad: la institución asociada
    // cambia con mucha menor frecuencia que su representante.
    const searchable = normalizedCategory === "institucionales"
      ? normalizeText_(member.university)
      : normalizeText_(member.surname + " " + member.givenName);
    if (searchable.includes(normalizedQuery)) results.push(publicMember_(member));
  }
  return results;
}

function getPublicMember(memberId, category) {
  const member = findMember_(cleanText_(memberId, 80), cleanText_(category, 30));
  if (!member) return null;
  return publicMember_(member);
}

function secureAdminPassword() {
  const properties = PropertiesService.getScriptProperties();
  const user = cleanText_(properties.getProperty("ACHETSU_ADMIN_USER"), 80);
  const password = String(properties.getProperty("ACHETSU_ADMIN_PASSWORD") || "");
  if (!user) throw new Error("Agrega la propiedad ACHETSU_ADMIN_USER en Configuración del proyecto > Propiedades del script.");
  if (password.length < 8) throw new Error("Agrega la propiedad ACHETSU_ADMIN_PASSWORD (mínimo 8 caracteres) antes de ejecutar esta función.");
  const salt = Utilities.getUuid();
  properties.setProperties({
    ACHETSU_ADMIN_PASSWORD_SALT: salt,
    ACHETSU_ADMIN_PASSWORD_HASH: hashPassword_(password, salt)
  });
  properties.deleteProperty("ACHETSU_ADMIN_PASSWORD");
  return "Contraseña protegida para el usuario " + user + ". La propiedad en texto plano fue eliminada.";
}

function adminLogin(userInput, passwordInput) {
  const user = cleanText_(userInput, 80);
  const password = String(passwordInput || "").slice(0, 200);
  const properties = PropertiesService.getScriptProperties();
  const expectedUser = cleanText_(properties.getProperty("ACHETSU_ADMIN_USER"), 80);
  const salt = properties.getProperty("ACHETSU_ADMIN_PASSWORD_SALT");
  const expectedHash = properties.getProperty("ACHETSU_ADMIN_PASSWORD_HASH");
  if (!expectedUser || !salt || !expectedHash) {
    throw new Error("El acceso administrativo no está configurado. Ejecuta secureAdminPassword() desde el editor.");
  }

  const cache = CacheService.getScriptCache();
  const failureKey = "achetsu-admin-failures";
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const failures = Number(cache.get(failureKey) || 0);
    if (failures >= CONFIG.adminMaxFailedLogins) {
      throw new Error("Demasiados intentos fallidos. Espera 15 minutos antes de volver a intentar.");
    }
    const validUser = user.toLowerCase() === expectedUser.toLowerCase();
    const validPassword = constantTimeEquals_(hashPassword_(password, salt), expectedHash);
    if (!validUser || !validPassword) {
      cache.put(failureKey, String(failures + 1), CONFIG.adminLockoutSeconds);
      throw new Error("Usuario o contraseña incorrectos.");
    }
    cache.remove(failureKey);
    const token = Utilities.getUuid() + Utilities.getUuid();
    cache.put(CONFIG.adminSessionPrefix + hashText_(token), expectedUser, CONFIG.adminSessionSeconds);
    return { token: token, user: expectedUser, expiresInSeconds: CONFIG.adminSessionSeconds };
  } finally {
    lock.releaseLock();
  }
}

function adminLogout(token) {
  const value = String(token || "");
  if (value) CacheService.getScriptCache().remove(CONFIG.adminSessionPrefix + hashText_(value));
  return { loggedOut: true };
}

function getAttachment(token, requestId) {
  requireAdmin_(token);
  const id = cleanText_(requestId, 80);
  const row = getSheet_(CONFIG.requestSheet).getDataRange().getValues()
    .find((candidate, index) => index > 0 && String(candidate[0]) === id);
  if (!row || !row[11]) throw new Error("La solicitud no tiene antecedentes adjuntos.");
  const blob = DriveApp.getFileById(String(row[11])).getBlob();
  return {
    name: unescapeSheetText_(row[12]) || blob.getName(),
    mimeType: blob.getContentType(),
    data: Utilities.base64Encode(blob.getBytes())
  };
}

function listPendingRequests(token) {
  requireAdmin_(token);
  const sheet = getSheet_(CONFIG.requestSheet);
  const values = sheet.getDataRange().getValues();
  const memberSheet = getSheet_(CONFIG.memberSheet);
  const membersById = new Map(memberSheet.getDataRange().getValues().slice(1).map((row) => {
    const member = memberFromRow_(row);
    return [member.id, member];
  }));
  return values.slice(1)
    .filter((row) => row[2] === "Pendiente")
    .map((row) => {
      const changes = parseChangeDetails_(String(row[10] || "")) || {};
      const currentMember = membersById.get(unescapeSheetText_(row[5])) || null;
      return {
        id: String(row[0]),
        date: row[1] instanceof Date ? row[1].toISOString() : String(row[1]),
        category: unescapeSheetText_(row[3]),
        requestType: String(row[4]),
        memberId: unescapeSheetText_(row[5]),
        fullName: unescapeSheetText_(row[6]),
        email: unescapeSheetText_(row[7]),
        phone: unescapeSheetText_(row[8]),
        university: unescapeSheetText_(row[9]),
        details: String(changes.description || ""),
        proposed: {
          surname: String(changes.surname || ""),
          givenName: String(changes.givenName || ""),
          email: String(changes.email || ""),
          university: String(changes.university || "")
        },
        currentMember: currentMember ? publicMember_(currentMember) : null,
        hasAttachment: Boolean(row[11]),
        attachmentName: unescapeSheetText_(row[12]),
        eligible2026: row[13] === true,
        emailVerifiedAt: row[17] instanceof Date ? row[17].toISOString() : String(row[17] || ""),
        verificationMethod: unescapeSheetText_(row[18])
      };
    });
}

function reviewRequest(token, requestId, decision, note, eligible2026) {
  const adminUser = requireAdmin_(token);
  const id = cleanText_(requestId, 80);
  const action = cleanText_(decision, 20);
  if (!["Aprobada", "Rechazada"].includes(action)) throw new Error("La decisión no es válida.");

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(CONFIG.requestSheet);
    const values = sheet.getDataRange().getValues();
    const rowIndex = values.findIndex((row, index) => index > 0 && String(row[0]) === id);
    if (rowIndex < 1) throw new Error("No se encontró la solicitud.");
    const row = values[rowIndex];
    if (row[2] !== "Pendiente") throw new Error("Esta solicitud ya fue revisada.");

    if (action === "Aprobada") {
      applyApprovedRequest_(row, eligible2026 === true);
    }
    sheet.getRange(rowIndex + 1, 3).setValue(action);
    sheet.getRange(rowIndex + 1, 14).setValue(action === "Aprobada" && eligible2026 === true);
    sheet.getRange(rowIndex + 1, 15, 1, 3).setValues([[
      safeSheetText_(adminUser), new Date(), safeSheetText_(cleanText_(note, 2000))
    ]]);
    return { status: action };
  } finally {
    lock.releaseLock();
  }
}

function importDirectory(token, jsonText) {
  requireAdmin_(token);
  const text = cleanText_(jsonText, 200000);
  let records;
  try {
    records = JSON.parse(text);
  } catch (error) {
    throw new Error("El archivo no contiene un JSON válido.");
  }
  if (!Array.isArray(records) || records.length > 2000) throw new Error("El archivo debe ser un listado válido de hasta 2000 registros.");

  const rows = records.map((record, index) => {
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      throw new Error("El registro " + (index + 1) + " no tiene un formato válido.");
    }
    const category = cleanText_(record.category, 30);
    if (!["naturales", "institucionales"].includes(category)) {
      throw new Error("El registro " + (index + 1) + " tiene una categoría no válida.");
    }
    return [
      safeSheetText_(cleanText_(record.id, 80) || Utilities.getUuid()),
      safeSheetText_(category),
      safeSheetText_(cleanText_(record.surname, 160)),
      safeSheetText_(cleanText_(record.givenName, 160)),
      safeSheetText_(cleanText_(record.email, 254).toLowerCase()),
      safeSheetText_(cleanText_(record.university, 180)),
      record.eligible2026 === true,
      new Date()
    ];
  });
  if (rows.some((row) => !row[2] || !row[3])) throw new Error("Cada registro debe incluir apellidos y nombre.");
  if (new Set(rows.map((row) => row[0])).size !== rows.length) {
    throw new Error("El padrón contiene IDs duplicados. Corrige el archivo antes de importar.");
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet_(CONFIG.memberSheet);
    sheet.clearContents();
    sheet.getRange(1, 1, 1, MEMBER_HEADERS.length).setValues([MEMBER_HEADERS]);
    if (rows.length) sheet.getRange(2, 1, rows.length, MEMBER_HEADERS.length).setValues(rows);
  } finally {
    lock.releaseLock();
  }
  return { imported: rows.length };
}

function savePublicWebAppUrl(token, url) {
  requireAdmin_(token);
  const value = cleanText_(url, 300);
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value)) {
    throw new Error("Ingresa la URL /exec del despliegue público de Google Apps Script.");
  }
  PropertiesService.getScriptProperties().setProperty("ACHETSU_PUBLIC_WEB_APP_URL", value);
  return { saved: true };
}

function publicAppUrl_() {
  const saved = PropertiesService.getScriptProperties().getProperty("ACHETSU_PUBLIC_WEB_APP_URL");
  if (saved) return saved;
  const current = String(ScriptApp.getService().getUrl() || "");
  return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(current) ? current : "";
}

function hashText_(value) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value)
    .map((byte) => (byte & 255).toString(16).padStart(2, "0"))
    .join("");
}

function applyApprovedRequest_(row, eligible2026) {
  const sheet = getSheet_(CONFIG.memberSheet);
  const category = unescapeSheetText_(row[3]);
  const requestType = String(row[4]);
  const memberId = unescapeSheetText_(row[5]);
  if (!["naturales", "institucionales"].includes(category) ||
      !["rectificacion", "incorporacion"].includes(requestType)) {
    throw new Error("La solicitud contiene una categoría o tipo no válido; no se aplicaron cambios.");
  }
  if (requestType === "incorporacion" && memberId) {
    throw new Error("Una incorporación nueva no puede reemplazar un registro existente.");
  }
  const existing = memberId ? findMemberRow_(memberId, category) : null;

  if (requestType === "rectificacion" && !existing) {
    throw new Error("El registro original ya no existe; no se puede aprobar la rectificación.");
  }

  const proposed = {
    surname: "",
    givenName: "",
    email: "",
    university: ""
  };
  const parsedDetails = parseChangeDetails_(String(row[10] || ""));
  if (!parsedDetails ||
      !parsedDetails.surname ||
      !parsedDetails.givenName ||
      !isValidEmail_(parsedDetails.email) ||
      !parsedDetails.university) {
    throw new Error("La solicitud no contiene los datos de padrón requeridos; no se aplicaron cambios.");
  }
  proposed.surname = parsedDetails.surname;
  proposed.givenName = parsedDetails.givenName;
  proposed.email = parsedDetails.email;
  proposed.university = parsedDetails.university;

  const targetId = existing ? memberId : Utilities.getUuid();
  const data = [
    safeSheetText_(targetId), safeSheetText_(category),
    safeSheetText_(proposed.surname), safeSheetText_(proposed.givenName),
    safeSheetText_(proposed.email), safeSheetText_(proposed.university), eligible2026, new Date()
  ];

  if (existing) {
    sheet.getRange(existing.row, 1, 1, MEMBER_HEADERS.length).setValues([data]);
  } else {
    sheet.appendRow(data);
  }
}

function parseChangeDetails_(text) {
  try {
    const data = JSON.parse(text);
    return {
      surname: cleanText_(data.surname, 160),
      givenName: cleanText_(data.givenName, 160),
      email: cleanText_(data.email, 254).toLowerCase(),
      university: cleanText_(data.university, 180),
      description: cleanText_(data.description, 2500)
    };
  } catch (error) {
    return null;
  }
}

function createVerificationCode_() {
  const randomHex = Utilities.getUuid().replace(/-/g, "").slice(0, 8);
  return String(parseInt(randomHex, 16) % 1000000).padStart(6, "0");
}

function requestFingerprint_(form) {
  const attachment = form.attachment;
  validateAttachment_(attachment);
  const attachmentHash = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    attachment.getBytes()
  ).map((byte) => (byte & 255).toString(16).padStart(2, "0")).join("");
  const snapshot = {
    category: cleanText_(form.category, 30),
    requestType: cleanText_(form.requestType, 30),
    memberId: cleanText_(form.memberId, 80),
    surname: cleanText_(form.surname, 160),
    givenName: cleanText_(form.givenName, 160),
    email: cleanText_(form.email, 254).toLowerCase(),
    phone: cleanText_(form.phone, 40),
    university: cleanText_(form.university, 180),
    description: cleanText_(form.description, 2500),
    consent: form.consent === "on",
    attachmentName: sanitizeFileName_(attachment.getName()),
    attachmentHash: attachmentHash
  };
  return hashText_(JSON.stringify(snapshot));
}

function verifyEmailCode_(challengeId, challenge, inputCode) {
  const code = cleanText_(inputCode, 6);
  return /^\d{6}$/.test(code) &&
    constantTimeEquals_(hashText_(challengeId + ":" + code), challenge.codeHash);
}

function maskEmail_(email) {
  const atIndex = email.lastIndexOf("@");
  return email.slice(0, 1) + "***" + email.slice(atIndex);
}

function validateAttachment_(attachment) {
  if (!attachment || typeof attachment.getBytes !== "function") {
    throw new Error("Adjunta un antecedente en PDF o una imagen JPG, PNG, GIF, WEBP, BMP, TIFF, HEIC o HEIF.");
  }
  const name = sanitizeFileName_(attachment.getName());
  const contentType = String(attachment.getContentType() || "").toLowerCase();
  const extension = name.match(/\.([^.]+)$/);
  const typesByExtension = {
    pdf: ["application/pdf", "application/x-pdf"],
    jpg: ["image/jpeg", "image/pjpeg"],
    jpeg: ["image/jpeg", "image/pjpeg"],
    png: ["image/png"],
    gif: ["image/gif"],
    webp: ["image/webp"],
    bmp: ["image/bmp", "image/x-ms-bmp"],
    tif: ["image/tiff"],
    tiff: ["image/tiff"],
    heic: ["image/heic", "image/heic-sequence", "image/x-heic"],
    heif: ["image/heif", "image/heif-sequence", "image/x-heif", "image/heic"]
  };
  const allowedTypes = extension ? typesByExtension[extension[1].toLowerCase()] : null;
  const genericTypes = ["", "application/octet-stream", "binary/octet-stream"];
  if (!allowedTypes || (!allowedTypes.includes(contentType) && !genericTypes.includes(contentType))) {
    throw new Error("El archivo debe ser PDF o una imagen JPG, PNG, GIF, WEBP, BMP, TIFF, HEIC o HEIF.");
  }
  const fileBytes = attachment.getBytes();
  if (!fileBytes.length) {
    throw new Error("El archivo está vacío. Elige un antecedente válido.");
  }
  if (fileBytes.length > CONFIG.maxAttachmentBytes) {
    throw new Error("El archivo supera el límite de 5 MB.");
  }
}

function requireAdmin_(token) {
  const value = String(token || "");
  if (value.length < 32 || value.length > 100) throw new Error("Sesión administrativa no válida. Inicia sesión nuevamente.");
  const cache = CacheService.getScriptCache();
  const key = CONFIG.adminSessionPrefix + hashText_(value);
  const user = cache.get(key);
  if (!user) throw new Error("Sesión administrativa expirada. Inicia sesión nuevamente.");
  cache.put(key, user, CONFIG.adminSessionSeconds);
  return user;
}

function hashPassword_(password, salt) {
  let digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ":" + password, Utilities.Charset.UTF_8);
  for (let i = 1; i < CONFIG.passwordHashIterations; i += 1) {
    digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, digest);
  }
  return digest.map((byte) => (byte & 255).toString(16).padStart(2, "0")).join("");
}

function constantTimeEquals_(a, b) {
  const left = String(a);
  const right = String(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function ensureSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);
  const lastColumn = sheet.getLastColumn();
  if (lastColumn === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    const existingHeaders = sheet.getRange(1, 1, 1, Math.min(lastColumn, headers.length)).getDisplayValues()[0];
    for (let index = 0; index < existingHeaders.length; index += 1) {
      if (existingHeaders[index] !== headers[index]) {
        throw new Error("Los encabezados de la hoja " + name + " no coinciden con el esquema esperado.");
      }
    }
    if (lastColumn < headers.length) {
      sheet.getRange(1, lastColumn + 1, 1, headers.length - lastColumn)
        .setValues([headers.slice(lastColumn)]);
    }
  }
  sheet.setFrozenRows(1);
}

function getSheet_(name) {
  const id = getRequiredProperty_("ACHETSU_SPREADSHEET_ID");
  const sheet = SpreadsheetApp.openById(id).getSheetByName(name);
  if (!sheet) throw new Error("No existe la hoja " + name + ". Ejecuta initializeBackend().");
  return sheet;
}

function getRequiredProperty_(name) {
  const value = PropertiesService.getScriptProperties().getProperty(name);
  if (!value) throw new Error("El backend no está inicializado. Ejecuta initializeBackend() como administrador.");
  return value;
}

function findMember_(memberId, category) {
  const match = findMemberRow_(memberId, category);
  return match ? match.member : null;
}

function findMemberRow_(memberId, category) {
  const values = getSheet_(CONFIG.memberSheet).getDataRange().getValues();
  for (let index = 1; index < values.length; index += 1) {
    if (String(values[index][0]) === memberId && String(values[index][1]) === category) {
      return { row: index + 1, member: memberFromRow_(values[index]) };
    }
  }
  return null;
}

function memberFromRow_(row) {
  return {
    id: unescapeSheetText_(row[0]),
    category: unescapeSheetText_(row[1]),
    surname: unescapeSheetText_(row[2]),
    givenName: unescapeSheetText_(row[3]),
    email: unescapeSheetText_(row[4]),
    university: unescapeSheetText_(row[5]),
    eligible2026: row[6] === true
  };
}

function safeSheetText_(value) {
  const text = String(value == null ? "" : value);
  return text.charAt(0) === "=" ? "'" + text : text;
}

function unescapeSheetText_(value) {
  const text = String(value == null ? "" : value);
  return text.slice(0, 2) === "'=" ? text.slice(1) : text;
}

function publicMember_(member) {
  return {
    id: member.id,
    category: member.category,
    surname: member.surname,
    givenName: member.givenName,
    email: member.email,
    university: member.university,
    eligible2026: member.eligible2026
  };
}

function cleanText_(value, maxLength) {
  return String(value == null ? "" : value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

function normalizeText_(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function isValidEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidPhone_(value) {
  return /^[+()\d\s.-]{8,40}$/.test(value);
}

function sanitizeFileName_(value) {
  return cleanText_(value, 120).replace(/[\\/:*?"<>|]/g, "_") || "antecedente";
}

function getCongressSheet_() {
  const properties = PropertiesService.getScriptProperties();
  const spreadsheetId = properties.getProperty("ACHETSU_CONGRESS_SPREADSHEET_ID") || CONFIG.congressSpreadsheetId;
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(CONFIG.congressSheet);
  if (!sheet) {
    const sheets = spreadsheet.getSheets();
    if (sheets.length === 1 && sheets[0].getLastRow() === 0 && sheets[0].getLastColumn() === 0) {
      sheet = sheets[0];
      sheet.setName(CONFIG.congressSheet);
    }
  }
  ensureSheet_(spreadsheet, CONFIG.congressSheet, CONGRESS_HEADERS);
  return spreadsheet.getSheetByName(CONFIG.congressSheet);
}

function escapeHtml_(value) {
  return String(value == null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
