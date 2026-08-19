import type { Architecture, WorkerSpec } from "@veolms/fleet-types";

export interface InstanceProfile {
  readonly instanceType: string;
  readonly cpu: number;
  readonly memoryMb: number;
  readonly architecture: Architecture;
  readonly isArm: boolean;
}

export const ARM64_INSTANCE_PROFILES: readonly InstanceProfile[] = [
  {
    instanceType: "t4g.small",
    cpu: 2,
    memoryMb: 2048,
    architecture: "arm64",
    isArm: true,
  },
  {
    instanceType: "c7g.large",
    cpu: 2,
    memoryMb: 4096,
    architecture: "arm64",
    isArm: true,
  },
  {
    instanceType: "c7g.xlarge",
    cpu: 4,
    memoryMb: 8192,
    architecture: "arm64",
    isArm: true,
  },
  {
    instanceType: "c7g.2xlarge",
    cpu: 8,
    memoryMb: 16384,
    architecture: "arm64",
    isArm: true,
  },
  {
    instanceType: "c7g.4xlarge",
    cpu: 16,
    memoryMb: 32768,
    architecture: "arm64",
    isArm: true,
  },
  {
    instanceType: "c7g.8xlarge",
    cpu: 32,
    memoryMb: 65536,
    architecture: "arm64",
    isArm: true,
  },
];

export const X86_64_INSTANCE_PROFILES: readonly InstanceProfile[] = [
  {
    instanceType: "t3.small",
    cpu: 2,
    memoryMb: 2048,
    architecture: "x86_64",
    isArm: false,
  },
  {
    instanceType: "c6i.large",
    cpu: 2,
    memoryMb: 4096,
    architecture: "x86_64",
    isArm: false,
  },
  {
    instanceType: "c6i.xlarge",
    cpu: 4,
    memoryMb: 8192,
    architecture: "x86_64",
    isArm: false,
  },
  {
    instanceType: "c6i.2xlarge",
    cpu: 8,
    memoryMb: 16384,
    architecture: "x86_64",
    isArm: false,
  },
  {
    instanceType: "c6i.4xlarge",
    cpu: 16,
    memoryMb: 32768,
    architecture: "x86_64",
    isArm: false,
  },
  {
    instanceType: "c6i.8xlarge",
    cpu: 32,
    memoryMb: 65536,
    architecture: "x86_64",
    isArm: false,
  },
];

export function selectOptimalInstanceType(spec: WorkerSpec): string {
  const isArm = spec.architecture === "arm64";
  const profiles = isArm ? ARM64_INSTANCE_PROFILES : X86_64_INSTANCE_PROFILES;

  // Find the smallest instance meeting or exceeding CPU and memory requirements
  const matched = profiles.find(
    (profile) => profile.cpu >= spec.cpu && profile.memoryMb >= spec.memoryMb,
  );

  if (matched) {
    return matched.instanceType;
  }

  // Fallback to highest available instance in table
  const fallback = profiles[profiles.length - 1];
  return fallback ? fallback.instanceType : isArm ? "c7g.xlarge" : "c6i.xlarge";
}
