import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { isMainModule } from "../src/entrypoint.ts";

describe("isMainModule", () => {
  const sampleLinuxUrl =
    "file:///home/debian/project/apps/fleet-manager/src/cli.ts";
  const sampleWindowsUrl =
    "file:///C:/Users/developer/project/apps/fleet-manager/src/cli.ts";

  it("returns false if argv1 is undefined or empty", () => {
    assert.equal(isMainModule(sampleLinuxUrl, undefined), false);
    assert.equal(isMainModule(sampleLinuxUrl, ""), false);
  });

  it("detects exact match for POSIX paths", () => {
    assert.equal(
      isMainModule(
        sampleLinuxUrl,
        "/home/debian/project/apps/fleet-manager/src/cli.ts",
      ),
      true,
    );
  });

  it("detects match for POSIX relative paths via segment matching", () => {
    assert.equal(isMainModule(sampleLinuxUrl, "src/cli.ts"), true);
    assert.equal(isMainModule(sampleLinuxUrl, "./src/cli.ts"), true);
    assert.equal(
      isMainModule(sampleLinuxUrl, "apps/fleet-manager/src/cli.ts"),
      true,
    );
  });

  it("detects match for Windows backward slash paths", () => {
    assert.equal(
      isMainModule(
        sampleWindowsUrl,
        "C:\\Users\\developer\\project\\apps\\fleet-manager\\src\\cli.ts",
      ),
      true,
    );
    assert.equal(isMainModule(sampleWindowsUrl, "src\\cli.ts"), true);
    assert.equal(isMainModule(sampleWindowsUrl, ".\\src\\cli.ts"), true);
    assert.equal(
      isMainModule(sampleWindowsUrl, "apps\\fleet-manager\\src\\cli.ts"),
      true,
    );
  });

  it("handles case-insensitivity in Windows paths and drive letters", () => {
    assert.equal(
      isMainModule(
        sampleWindowsUrl,
        "c:\\users\\developer\\project\\apps\\fleet-manager\\src\\cli.ts",
      ),
      true,
    );
    assert.equal(isMainModule(sampleWindowsUrl, "SRC\\CLI.TS"), true);
  });

  it("returns false for different files", () => {
    assert.equal(isMainModule(sampleLinuxUrl, "src/index.ts"), false);
    assert.equal(isMainModule(sampleWindowsUrl, "src\\index.ts"), false);
    assert.equal(isMainModule(sampleLinuxUrl, "src/other-cli.ts"), false);
  });

  it("does not false-positive on substring prefix without segment boundary", () => {
    assert.equal(isMainModule(sampleLinuxUrl, "manager/src/cli.ts.bak"), false);
    assert.equal(isMainModule(sampleLinuxUrl, "fake-cli.ts"), false);
  });

  it("works with real current module and process.argv[1]", () => {
    const thisFileUrl = import.meta.url;
    const thisFilePath = resolve(process.argv[1] ?? "");
    const thisFileExpected = pathToFileURL(thisFilePath).href === thisFileUrl;

    assert.equal(isMainModule(thisFileUrl), thisFileExpected);
  });
});
