import type { FastifyReply, FastifyRequest } from "fastify";
import type { PresignMediaRequest } from "@veolms/contracts";
import type { MediaService } from "./media.service.ts";

export function createMediaController({
  service,
}: {
  service: MediaService;
}) {
  async function presignMediaUpload(
    request: FastifyRequest<{ Body: PresignMediaRequest }>,
    reply: FastifyReply,
  ) {
    const creatorId = request.user!.id;
    const result = await service.presignMediaUpload(creatorId, request.body);
    reply.code(200);
    return result;
  }

  async function confirmMediaUpload(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
  ) {
    const { mediaId } = request.params;
    const creatorId = request.user!.id;
    const result = await service.confirmUpload(mediaId, creatorId, request.log);
    return { success: true, status: result.status };
  }

  async function getVideoJobProgress(
    request: FastifyRequest<{ Params: { id: string; videoId: string } }>,
  ) {
    const { id, videoId } = request.params;
    const creatorId = request.user!.id;
    return await service.getVideoJobProgress(id, videoId, creatorId);
  }

  return {
    presignMediaUpload,
    confirmMediaUpload,
    getVideoJobProgress,
  };
}

export type MediaController = ReturnType<typeof createMediaController>;
