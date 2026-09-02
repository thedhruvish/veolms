import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isPrivateOrReservedHost,
  validateHttpVideoUrl,
} from "../src/http-download.ts";

describe("SSRF Protection & URL Validation", () => {
  it("rejects loopback and local hostnames", () => {
    assert.equal(isPrivateOrReservedHost("localhost"), true);
    assert.equal(isPrivateOrReservedHost("127.0.0.1"), true);
    assert.equal(isPrivateOrReservedHost("127.0.1.1"), true);
    assert.equal(isPrivateOrReservedHost("::1"), true);
    assert.equal(isPrivateOrReservedHost("app.local"), true);
    assert.equal(isPrivateOrReservedHost("service.internal"), true);
  });

  it("rejects AWS and cloud metadata endpoints", () => {
    assert.equal(isPrivateOrReservedHost("169.254.169.254"), true);
    assert.equal(isPrivateOrReservedHost("169.254.1.1"), true);
    assert.equal(isPrivateOrReservedHost("instance-data"), true);
    assert.equal(isPrivateOrReservedHost("metadata.google.internal"), true);
  });

  it("rejects RFC 1918 private IPv4 networks", () => {
    assert.equal(isPrivateOrReservedHost("10.0.0.1"), true);
    assert.equal(isPrivateOrReservedHost("10.255.255.255"), true);
    assert.equal(isPrivateOrReservedHost("172.16.0.1"), true);
    assert.equal(isPrivateOrReservedHost("172.31.255.255"), true);
    assert.equal(isPrivateOrReservedHost("192.168.1.1"), true);
    assert.equal(isPrivateOrReservedHost("192.168.0.254"), true);
  });

  it("allows public IPv4 addresses and public domains", () => {
    assert.equal(isPrivateOrReservedHost("example.com"), false);
    assert.equal(isPrivateOrReservedHost("s3.amazonaws.com"), false);
    assert.equal(isPrivateOrReservedHost("8.8.8.8"), false);
    assert.equal(isPrivateOrReservedHost("1.1.1.1"), false);
  });

  it("validateHttpVideoUrl accepts safe public HTTPS URLs", () => {
    const url = validateHttpVideoUrl("https://example.com/videos/sample.mp4");
    assert.equal(url.hostname, "example.com");
    assert.equal(url.protocol, "https:");
  });

  it("validateHttpVideoUrl throws on metadata or private URLs", () => {
    assert.throws(
      () =>
        validateHttpVideoUrl(
          "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        ),
      /Access to private, loopback, or cloud metadata network addresses is prohibited/,
    );
    assert.throws(
      () => validateHttpVideoUrl("http://localhost:8080/secret.mp4"),
      /Access to private, loopback, or cloud metadata network addresses is prohibited/,
    );
    assert.throws(
      () => validateHttpVideoUrl("http://192.168.1.50/video.mp4"),
      /Access to private, loopback, or cloud metadata network addresses is prohibited/,
    );
  });

  it("validateHttpVideoUrl throws on unsupported protocols", () => {
    assert.throws(
      () => validateHttpVideoUrl("file:///etc/passwd"),
      /Unsupported protocol "file:" in video URL/,
    );
    assert.throws(
      () => validateHttpVideoUrl("ftp://files.example.com/video.mp4"),
      /Unsupported protocol "ftp:" in video URL/,
    );
  });
});
