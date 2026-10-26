import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  isNewerVersion,
  detectPackageManager,
  getPackageInfo,
  getPackageRoot,
  isDevEnvironment,
  getCachePath,
} from "../src/utils/updater.js";

describe("Updater Utility Unit Tests", () => {
  describe("isNewerVersion", () => {
    test("detects major version bumps", () => {
      assert.equal(isNewerVersion("1.0.0", "2.0.0"), true);
      assert.equal(isNewerVersion("2.0.0", "1.9.9"), false);
    });

    test("detects minor version bumps", () => {
      assert.equal(isNewerVersion("2.1.0", "2.2.0"), true);
      assert.equal(isNewerVersion("2.3.0", "2.2.9"), false);
    });

    test("detects patch version bumps", () => {
      assert.equal(isNewerVersion("2.1.1", "2.1.2"), true);
      assert.equal(isNewerVersion("2.1.2", "2.1.1"), false);
    });

    test("handles multi-digit version numbers accurately (numeric vs lexicographic)", () => {
      assert.equal(isNewerVersion("2.9.0", "2.10.0"), true);
      assert.equal(isNewerVersion("2.10.0", "2.9.0"), false);
      assert.equal(isNewerVersion("1.0.9", "1.0.10"), true);
      assert.equal(isNewerVersion("1.0.10", "1.0.9"), false);
    });

    test("returns false for identical versions", () => {
      assert.equal(isNewerVersion("2.1.1", "2.1.1"), false);
      assert.equal(isNewerVersion("0.0.1", "0.0.1"), false);
    });

    test("handles 'v' prefixes cleanly", () => {
      assert.equal(isNewerVersion("v2.1.1", "2.1.2"), true);
      assert.equal(isNewerVersion("2.1.1", "v2.1.2"), true);
      assert.equal(isNewerVersion("v2.1.1", "v2.1.1"), false);
    });

    test("handles pre-release tags safely", () => {
      assert.equal(isNewerVersion("2.1.1-beta.1", "2.1.2"), true);
      assert.equal(isNewerVersion("2.1.1", "2.1.1-beta.2"), false);
    });

    test("returns false safely for invalid or missing inputs", () => {
      assert.equal(isNewerVersion("", "2.1.1"), false);
      assert.equal(isNewerVersion("2.1.1", ""), false);
      assert.equal(isNewerVersion(null, "2.1.1"), false);
      assert.equal(isNewerVersion("2.1.1", null), false);
      assert.equal(isNewerVersion(undefined, undefined), false);
    });
  });

  describe("Environment & Package Inspection", () => {
    test("getPackageRoot returns valid directory containing package.json", () => {
      const root = getPackageRoot();
      assert.ok(root, "Root should be defined");
      assert.ok(fs.existsSync(path.join(root, "package.json")), "package.json must exist in root");
    });

    test("getPackageInfo returns valid package name and version", () => {
      const info = getPackageInfo();
      assert.ok(info.name, "Package name should exist");
      assert.ok(info.version, "Package version should exist");
      assert.equal(typeof info.name, "string");
      assert.equal(typeof info.version, "string");
    });

    test("isDevEnvironment returns true when inside git clone repository", () => {
      // In this current checkout, .git exists
      assert.equal(isDevEnvironment(), true);
    });

    test("isDevEnvironment respects FORCE_UPDATE_CHECK override", () => {
      process.env.FORCE_UPDATE_CHECK = "true";
      assert.equal(isDevEnvironment(), false);
      delete process.env.FORCE_UPDATE_CHECK;
      assert.equal(isDevEnvironment(), true);
    });

    test("detectPackageManager returns valid package manager identifier", () => {
      const pm = detectPackageManager();
      assert.ok(["npm", "pnpm", "yarn", "bun"].includes(pm), `Unrecognized package manager: ${pm}`);
    });

    test("getCachePath resolves inside ~/.codemcp directory", () => {
      const cachePath = getCachePath();
      assert.ok(cachePath.includes(".codemcp"), "Cache path should be inside .codemcp directory");
      assert.ok(cachePath.endsWith("update-cache.json"), "Cache filename should be update-cache.json");
    });
  });
});
