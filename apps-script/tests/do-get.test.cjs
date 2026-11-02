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

test("root and unknown views render without unsupported HTML service calls", () => {
  const { context } = loadApp();
  for (const event of [undefined, {}, { parameter: {} }, { parameter: { view: "unknown" } }]) {
    const result = context.doGet(event);
    assert.equal(result.title, "ACHETSU");
    assert.equal(result.frameMode, "DEFAULT");
  }
});
