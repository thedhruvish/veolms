import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { describe, it } from "node:test";
import type { S3Client } from "@aws-sdk/client-s3";
import { startIncrementalHlsUpload } from "../src/s3.ts";

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("incremental HLS uploads", () => {
  it("re-uploads a playlist after FFmpeg updates it", async () => {
    const dir = await mkdtemp(join(tmpdir(), "veolms-hls-test-"));
    const playlistPath = join(dir, "720p.m3u8");
    const uploadedKeys: string[] = [];
    const s3 = {
      async send(command: {
        input: { Key?: string; Body?: unknown };
      }): Promise<void> {
        uploadedKeys.push(command.input.Key ?? "");
        const body = command.input.Body;
        if (body instanceof Readable) {
          await new Promise<void>((resolve, reject) => {
            body.once("end", resolve);
            body.once("error", reject);
            body.resume();
          });
        }
      },
    } as unknown as S3Client;

    try {
      await writeFile(playlistPath, "#EXTM3U\n#EXTINF:6,\nsegment_000.ts\n");
      const handle = startIncrementalHlsUpload({
        s3,
        bucket: "test-bucket",
        localDir: dir,
        s3Prefix: "output/job-1",
        pollIntervalMs: 10,
        settleMs: 0,
        getConcurrency: async () => 1,
      });

      await wait(150);
      await writeFile(
        playlistPath,
        "#EXTM3U\n#EXTINF:6,\nsegment_000.ts\n#EXTINF:6,\nsegment_001.ts\n",
      );
      await wait(150);
      await handle.abort();

      assert.equal(
        uploadedKeys.filter((key) => key.endsWith("720p.m3u8")).length,
        2,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
