/**
 * Curated AWS EC2 Instance Types for Video Transcoding Workloads.
 */
export interface EC2InstanceDefinition {
  readonly instanceType: string;
  readonly family: "compute_cpu" | "graviton_arm" | "gpu_nvidia" | "general";
  readonly vCpu: number;
  readonly memoryGiB: number;
  readonly architecture: "x86_64" | "arm64";
  readonly gpuName?: string;
  readonly spotAverageCostPerHourUsd: number;
  readonly onDemandCostPerHourUsd: number;
  readonly recommendedFor: string;
}

export const EC2_VIDEO_INSTANCES: readonly EC2InstanceDefinition[] = [
  {
    instanceType: "c6i.large",
    family: "compute_cpu",
    vCpu: 2,
    memoryGiB: 4,
    architecture: "x86_64",
    spotAverageCostPerHourUsd: 0.027,
    onDemandCostPerHourUsd: 0.085,
    recommendedFor: "720p/1080p Single-Rendition or Low Complexity Chunks",
  },
  {
    instanceType: "c6i.xlarge",
    family: "compute_cpu",
    vCpu: 4,
    memoryGiB: 8,
    architecture: "x86_64",
    spotAverageCostPerHourUsd: 0.054,
    onDemandCostPerHourUsd: 0.17,
    recommendedFor: "1080p Multi-Rendition Adaptive Bitrate (Standard Default)",
  },
  {
    instanceType: "c6i.2xlarge",
    family: "compute_cpu",
    vCpu: 8,
    memoryGiB: 16,
    architecture: "x86_64",
    spotAverageCostPerHourUsd: 0.108,
    onDemandCostPerHourUsd: 0.34,
    recommendedFor: "4K UHD High-Throughput Multi-Bitrate Transcoding",
  },
  {
    instanceType: "c7g.xlarge",
    family: "graviton_arm",
    vCpu: 4,
    memoryGiB: 8,
    architecture: "arm64",
    spotAverageCostPerHourUsd: 0.044,
    onDemandCostPerHourUsd: 0.145,
    recommendedFor: "AWS Graviton3 ARM - Ultra Cost-Efficient Encoding",
  },
  {
    instanceType: "c7g.2xlarge",
    family: "graviton_arm",
    vCpu: 8,
    memoryGiB: 16,
    architecture: "arm64",
    spotAverageCostPerHourUsd: 0.088,
    onDemandCostPerHourUsd: 0.289,
    recommendedFor: "AWS Graviton3 ARM - High-Density Transcoding Fleet",
  },
  {
    instanceType: "g4dn.xlarge",
    family: "gpu_nvidia",
    vCpu: 4,
    memoryGiB: 16,
    architecture: "x86_64",
    gpuName: "NVIDIA T4 (16GB)",
    spotAverageCostPerHourUsd: 0.158,
    onDemandCostPerHourUsd: 0.526,
    recommendedFor: "NVIDIA NVENC Hardware-Accelerated 4K/60fps H.264 & HEVC",
  },
  {
    instanceType: "g5.xlarge",
    family: "gpu_nvidia",
    vCpu: 4,
    memoryGiB: 24,
    architecture: "x86_64",
    gpuName: "NVIDIA A10G (24GB)",
    spotAverageCostPerHourUsd: 0.302,
    onDemandCostPerHourUsd: 1.006,
    recommendedFor: "Extreme-Speed Realtime GPU Encoding Pipeline",
  },
];

export function listAvailableEC2Instances(): readonly EC2InstanceDefinition[] {
  return EC2_VIDEO_INSTANCES;
}

export function getEC2InstanceDefinition(
  instanceType: string,
): EC2InstanceDefinition {
  const match = EC2_VIDEO_INSTANCES.find(
    (i) => i.instanceType === instanceType,
  );
  if (!match) {
    return {
      instanceType,
      family: "compute_cpu",
      vCpu: 4,
      memoryGiB: 8,
      architecture: "x86_64",
      spotAverageCostPerHourUsd: 0.054,
      onDemandCostPerHourUsd: 0.17,
      recommendedFor: "Custom EC2 Instance Type",
    };
  }
  return match;
}

export interface WorkloadSizingInput {
  readonly complexityScore?: number;
  readonly is4KOrAbove?: boolean;
  readonly isGpuPreferred?: boolean;
  readonly requestedQualitiesCount?: number;
}

/**
 * Dynamically selects the best EC2 instance type from the allowed instance pool
 * based on workload complexity and hardware requirements.
 */
export function selectBestEC2Instance(
  allowedTypes: readonly string[],
  workload: WorkloadSizingInput = {},
): string {
  if (allowedTypes.length === 0) {
    return "c6i.xlarge";
  }
  if (allowedTypes.length === 1) {
    return allowedTypes[0]!;
  }

  const allowedDefs = allowedTypes.map((t) => getEC2InstanceDefinition(t));

  // 1. If GPU is preferred or 4K/60fps HEVC extreme workload
  if (workload.isGpuPreferred || workload.is4KOrAbove) {
    const gpuMatch = allowedDefs.find((d) => d.family === "gpu_nvidia");
    if (gpuMatch) {
      return gpuMatch.instanceType;
    }
  }

  // 2. High complexity (e.g. 4+ renditions or complexityScore >= 3.0)
  if (
    (workload.complexityScore && workload.complexityScore >= 3.0) ||
    (workload.requestedQualitiesCount && workload.requestedQualitiesCount >= 4)
  ) {
    const highCompute = allowedDefs.find((d) => d.vCpu >= 8);
    if (highCompute) {
      return highCompute.instanceType;
    }
  }

  // 3. Medium complexity (1080p standard ABR)
  const standardCompute = allowedDefs.find((d) => d.vCpu >= 4);
  if (standardCompute) {
    return standardCompute.instanceType;
  }

  // 4. Fallback to lowest cost / first allowed type
  return allowedTypes[0]!;
}
