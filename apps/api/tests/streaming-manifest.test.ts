import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatMediaAssetUrl,
  formatStreamingManifestUrl,
} from "../src/modules/media/media.service.ts";

describe("Streaming Manifest URL Formatting", () => {
  const mediaId = "11111111-2222-3333-4444-555555555555";

  it("formats path without prefix when streamingUrl is omitted or empty", () => {
    assert.equal(
      formatStreamingManifestUrl(mediaId),
      `/${mediaId}/hls/master.m3u8`,
    );
    assert.equal(
      formatStreamingManifestUrl(mediaId, ""),
      `/${mediaId}/hls/master.m3u8`,
    );
  });

  it("formats relative path prefix when configured with /m or custom prefix", () => {
    assert.equal(
      formatStreamingManifestUrl(mediaId, "/m"),
      `/m/${mediaId}/hls/master.m3u8`,
    );
    assert.equal(
      formatStreamingManifestUrl(mediaId, "/custom/stream"),
      `/custom/stream/${mediaId}/hls/master.m3u8`,
    );
  });

  it("formats full HTTP/HTTPS URL directly with path", () => {
    assert.equal(
      formatStreamingManifestUrl(mediaId, "https://streaming.example.com"),
      `https://streaming.example.com/${mediaId}/hls/master.m3u8`,
    );
    assert.equal(
      formatStreamingManifestUrl(mediaId, "http://localhost:4000"),
      `http://localhost:4000/${mediaId}/hls/master.m3u8`,
    );
  });

  it("formats full HTTP/HTTPS URL with subpath when configured", () => {
    assert.equal(
      formatStreamingManifestUrl(mediaId, "https://streaming.example.com/m"),
      `https://streaming.example.com/m/${mediaId}/hls/master.m3u8`,
    );
    assert.equal(
      formatStreamingManifestUrl(mediaId, "http://localhost:4000/api/v1/m"),
      `http://localhost:4000/api/v1/m/${mediaId}/hls/master.m3u8`,
    );
  });

  it("preserves exact HLS path from table and adds streamingUrl prefix", () => {
    const tablePath = `transcoded/${mediaId}/master.m3u8`;
    assert.equal(
      formatStreamingManifestUrl(tablePath, "/m"),
      `/m/transcoded/${mediaId}/master.m3u8`,
    );
    assert.equal(
      formatStreamingManifestUrl(tablePath, "https://cdn.example.com"),
      `https://cdn.example.com/transcoded/${mediaId}/master.m3u8`,
    );
    assert.equal(
      formatStreamingManifestUrl(tablePath, "http://localhost:4000"),
      `http://localhost:4000/transcoded/${mediaId}/master.m3u8`,
    );
  });

  it("handles table paths that already start with /cdn/* or similar full path", () => {
    const cdnPath = `/cdn/transcoded/${mediaId}/master.m3u8`;
    assert.equal(
      formatStreamingManifestUrl(cdnPath, "/m"),
      `/m/cdn/transcoded/${mediaId}/master.m3u8`,
    );
    assert.equal(
      formatStreamingManifestUrl(cdnPath, "https://cdn.example.com"),
      `https://cdn.example.com/cdn/transcoded/${mediaId}/master.m3u8`,
    );
  });
});

describe("Media Asset URL Formatting", () => {
  const mediaId = "11111111-2222-3333-4444-555555555555";

  it("formats path without prefix when streamingUrl is omitted or empty", () => {
    assert.equal(formatMediaAssetUrl(mediaId), `/${mediaId}`);
    assert.equal(formatMediaAssetUrl(mediaId, ""), `/${mediaId}`);
  });

  it("formats relative path prefix when configured with /m or similar", () => {
    assert.equal(formatMediaAssetUrl(mediaId, "/m"), `/m/${mediaId}`);
    assert.equal(
      formatMediaAssetUrl(mediaId, "/custom/assets"),
      `/custom/assets/${mediaId}`,
    );
  });

  it("formats full HTTP/HTTPS URL directly", () => {
    assert.equal(
      formatMediaAssetUrl(mediaId, "https://streaming.example.com"),
      `https://streaming.example.com/${mediaId}`,
    );
    assert.equal(
      formatMediaAssetUrl(mediaId, "http://localhost:4000"),
      `http://localhost:4000/${mediaId}`,
    );
  });

  it("formats full HTTP/HTTPS URL with subpath when configured", () => {
    assert.equal(
      formatMediaAssetUrl(mediaId, "https://streaming.example.com/m"),
      `https://streaming.example.com/m/${mediaId}`,
    );
    assert.equal(
      formatMediaAssetUrl(mediaId, "http://localhost:4000/api/v1/m"),
      `http://localhost:4000/api/v1/m/${mediaId}`,
    );
  });
});

