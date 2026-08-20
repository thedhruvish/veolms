import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { extractVideoExtension } from "../src/processor.ts";

describe("extractVideoExtension", () => {
  it("extracts the extension from a plain S3 key", () => {
    assert.equal(extractVideoExtension("raw/video.mp4"), "mp4");
  });

  it("extracts the extension from an HTTP(S) URL with a query string", () => {
    assert.equal(
      extractVideoExtension("https://cdn.example.com/course-01.mov?token=abc"),
      "mov",
    );
  });

  it("lowercases the extension", () => {
    assert.equal(extractVideoExtension("raw/clip.MKV"), "mkv");
  });

  it("falls back to mp4 when there is no extension", () => {
    assert.equal(extractVideoExtension("raw/video-without-extension"), "mp4");
  });

  it("ignores a URL fragment when extracting the extension", () => {
    assert.equal(
      extractVideoExtension("https://cdn.example.com/clip.webm#t=10"),
      "webm",
    );
  });
});
