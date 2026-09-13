import { describe, expect, it } from "vitest";
import { resolveMediaAssetUrl } from "../../src/lib/mediaUrl";

describe("resolveMediaAssetUrl", () => {
  const mediaId = "11111111-2222-3333-4444-555555555555";

  it("returns null for empty, null, or undefined values", () => {
    expect(resolveMediaAssetUrl(null)).toBeNull();
    expect(resolveMediaAssetUrl(undefined)).toBeNull();
    expect(resolveMediaAssetUrl("")).toBeNull();
    expect(resolveMediaAssetUrl("   ")).toBeNull();
  });

  it("preserves data:, blob:, and full external URLs", () => {
    expect(resolveMediaAssetUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==")).toBe(
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==",
    );
    expect(resolveMediaAssetUrl("blob:http://localhost:3000/123-abc")).toBe(
      "blob:http://localhost:3000/123-abc",
    );
    expect(resolveMediaAssetUrl("https://cdn.example.com/thumbnails/img.png")).toBe(
      "https://cdn.example.com/thumbnails/img.png",
    );
    expect(resolveMediaAssetUrl("http://example.com/avatar.jpg")).toBe(
      "http://example.com/avatar.jpg",
    );
  });

  it("preserves static bundled asset paths", () => {
    expect(resolveMediaAssetUrl("/assets/sofia-avatar-160.webp")).toBe(
      "/assets/sofia-avatar-160.webp",
    );
    expect(resolveMediaAssetUrl("/assets/ethan-avatar-160.webp")).toBe(
      "/assets/ethan-avatar-160.webp",
    );
    expect(resolveMediaAssetUrl("/assets/courses/git.png")).toBe(
      "/assets/courses/git.png",
    );
  });

  it("resolves raw media IDs into api media assets", () => {
    const resolved = resolveMediaAssetUrl(mediaId);
    expect(resolved).toBeTruthy();
    expect(resolved).toContain(mediaId);
  });

  it("resolves relative /media/ or /m/ paths without doubling", () => {
    const fromMedia = resolveMediaAssetUrl(`/media/${mediaId}`);
    const fromM = resolveMediaAssetUrl(`/m/${mediaId}`);
    const fromApi = resolveMediaAssetUrl(`/api/v1/media/${mediaId}`);

    expect(fromMedia).toBeTruthy();
    expect(fromMedia).toContain(mediaId);
    expect(fromM).toBeTruthy();
    expect(fromM).toContain(mediaId);
    expect(fromApi).toBeTruthy();
    expect(fromApi).toContain(mediaId);
  });
});
