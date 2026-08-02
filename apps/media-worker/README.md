# Media Worker

The media worker will run independently from the API, potentially on a separately provisioned VPS or virtual machine. It will eventually claim media jobs from a PostgreSQL-backed job system, download or read source media, use `ffprobe` and FFmpeg, generate HLS renditions and possibly thumbnails, extract audio, and generate subtitles or transcripts.

It will upload processed output, report progress and completion, clean temporary files, and support idempotent job handling and crash recovery. Additional worker applications may be added later for workloads with different resource requirements. The media-processing implementation will be added later.
