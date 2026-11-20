const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

function loadApp() {
  const templates = [];
  const modes = Object.freeze({ DEFAULT: "DEFAULT", ALLOWALL: "ALLOWALL" });
  function output(content) {
    return {
      content,
      frameMode: modes.DEFAULT,
      setTitle(title) {
        this.title = title;
        return this;
      },
      setXFrameOptionsMode(mode) {
        assert.ok(Object.values(modes).includes(mode), "Unsupported frame mode");
        this.frameMode = mode;
        return this;
      },
      addMetaTag(name) {
        assert.ok(
          ["apple-mobile-web-app-capable", "google-site-verification",
            "mobile-web-app-capable", "viewport"].includes(name),
          "Unsupported meta tag"
        );
        return this;
      }
    };
  }
  const context = vm.createContext({
    HtmlService: {
      XFrameOptionsMode: modes,
      createHtmlOutput: output,
      createTemplateFromFile(name) {
        const template = { name, evaluate: () => output(name) };
        templates.push(template);
        return template;
      }
    }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "..", "Code.gs"), "utf8"), context);
  context.publicAppUrl_ = () => "https://script.google.com/macros/s/test/exec";
  return { context, templates };
}

test("directory remains embeddable and receives the deployment URL", () => {
  const { context, templates } = loadApp();
  const result = context.doGet({ parameter: { view: "directory" } });
  assert.equal(result.content, "Directory");
  assert.equal(result.frameMode, "ALLOWALL");
  assert.ok(result.title.includes("padr"));
  assert.equal(templates[0].appUrl, context.publicAppUrl_());
});

test("admin retains Google's default framing protection", () => {
  const { context, templates } = loadApp();
  const result = context.doGet({ parameter: { view: "admin" } });
  assert.equal(result.content, "Admin");
  assert.equal(result.frameMode, "DEFAULT");
  assert.equal(templates[0].publicUrl, context.publicAppUrl_());
});

test("intake preserves rectification parameters and default framing", () => {
  const { context, templates } = loadApp();
  const result = context.doGet({
    parameter: {
      view: "intake", memberId: "123", category: "naturales", requestType: "rectificacion"
    }
  });
  assert.equal(result.content, "Intake");
  assert.equal(result.frameMode, "DEFAULT");
  assert.equal(templates[0].appUrl, context.publicAppUrl_());
  assert.equal(templates[0].memberId, "123");
  assert.equal(templates[0].category, "naturales");
  assert.equal(templates[0].requestType, "rectificacion");
});

test("intake accepts omitted optional parameters", () => {
  const { context, templates } = loadApp();
  context.doGet({ parameter: { view: "intake" } });
  for (const key of ["memberId", "category", "requestType"]) {
    assert.equal(templates[0][key], "");
  }
});

test("congreso view is embeddable and receives deployment and home URLs", () => {
  const { context, templates } = loadApp();
  const result = context.doGet({ parameter: { view: "congreso" } });
  assert.equal(result.content, "Congreso");
  assert.equal(result.frameMode, "ALLOWALL");
  assert.ok(result.title.includes("Congreso"));
  assert.equal(templates[0].appUrl, context.publicAppUrl_());
  assert.ok(templates[0].homeUrl.endsWith("congreso.html"));
});

test("submitCongressRegistration writes to sheet 1YByh_TEXxJn41cZju-cdfWoid40gOYTXuhlVgO3OSz0 and sends both emails", () => {
  const { context } = loadApp();
  const appendedRows = [];
  const statusUpdates = [];
  const sentEmails = [];
  let openedSpreadsheetId = null;

  const mockSheet = {
    getLastRow: () => appendedRows.length + 1,
    getLastColumn: () => 0,
    appendRow: (row) => appendedRows.push(row),
    getRange: (r, c, numR, numC) => ({
      setValues: (vals) => statusUpdates.push({ r, c, numR, numC, vals })
    }),
    setFrozenRows: () => {}
  };

  context.PropertiesService = {
    getScriptProperties: () => ({
      getProperty: () => null
    })
  };
  context.LockService = {
    getScriptLock: () => ({
      waitLock: () => {},
      releaseLock: () => {}
    })
  };
  context.CacheService = {
    getScriptCache: () => ({
      get: () => null,
      put: () => {}
    })
  };
  context.Utilities = {
    DigestAlgorithm: { SHA_256: "SHA_256" },
    computeDigest: () => [1, 2, 3, 4],
    getUuid: () => "12345678-aaaa-bbbb-cccc-1234567890ab",
    formatDate: () => "19/11/2026 21:45"
  };
  context.Session = {
    getScriptTimeZone: () => "America/Santiago"
  };
  context.SpreadsheetApp = {
    openById: (id) => {
      openedSpreadsheetId = id;
      return {
        getSheetByName: () => mockSheet,
        getSheets: () => [mockSheet]
      };
    }
  };
  context.MailApp = {
    sendEmail: (msg) => sentEmails.push(msg)
  };
  context.Logger = { log: () => {} };

  const res = context.submitCongressRegistration({
    fullName: "Dra. María Soto",
    email: "maria.soto@uahurtado.cl",
    role: "Académico/a",
    university: "Universidad Alberto Hurtado (UAH)",
    otherInstitution: "",
    attendance: "Ambas jornadas (martes 24 y miércoles 25 de noviembre)"
  });

  assert.equal(openedSpreadsheetId, "1YByh_TEXxJn41cZju-cdfWoid40gOYTXuhlVgO3OSz0");
  assert.equal(res.folio, "CONG-2026-12345678");
  assert.equal(res.institutionType, "Universidad ACHETSU");
  assert.equal(res.institution, "Universidad Alberto Hurtado (UAH)");
  assert.equal(appendedRows.length, 1);
  assert.equal(sentEmails.length, 2);
  assert.equal(sentEmails[0].to, "maria.soto@uahurtado.cl");
  assert.equal(sentEmails[1].to, "esteban.cofre@uaysen.cl");

  // Also test "Otra institución" validation and registration
  assert.throws(
    () => context.submitCongressRegistration({
      fullName: "Juan Pérez",
      email: "juan@otra.cl",
      role: "Docente colaborador/a",
      university: "Otra institución",
      otherInstitution: ""
    }),
    /Indica el nombre de tu institución/
  );

  const resOther = context.submitCongressRegistration({
    fullName: "Juan Pérez",
    email: "juan@otra.cl",
    role: "Otro",
    otherRole: "Investigador postdoctoral",
    university: "Otra institución",
    otherInstitution: "Universidad de Aysén"
  });
  assert.equal(resOther.institutionType, "Otra institución");
  assert.equal(resOther.institution, "Universidad de Aysén");
  assert.equal(resOther.role, "Otro (Investigador postdoctoral)");
});

test("root and unknown views render without unsupported HTML service calls", () => {
  const { context } = loadApp();
  for (const event of [undefined, {}, { parameter: {} }, { parameter: { view: "unknown" } }]) {
    const result = context.doGet(event);
    assert.equal(result.title, "ACHETSU");
    assert.equal(result.frameMode, "DEFAULT");
  }
});
