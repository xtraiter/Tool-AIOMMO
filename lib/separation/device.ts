import type { TierId } from "./models";

export type DeviceInfo = {
  webgpu: boolean;
  memoryGB: number | null;
  cores: number;
  mobile: boolean;
  isolated: boolean;
};

export async function detectDevice(): Promise<DeviceInfo> {
  const nav: any = navigator;
  let webgpu = false;
  try {
    webgpu = !!nav.gpu && !!(await nav.gpu.requestAdapter());
  } catch { /* no WebGPU */ }
  return {
    webgpu,
    memoryGB: typeof nav.deviceMemory === "number" ? nav.deviceMemory : null,
    cores: navigator.hardwareConcurrency || 2,
    mobile: /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent),
    isolated: typeof crossOriginIsolated !== "undefined" && crossOriginIsolated,
  };
}

export function recommendTier(d: DeviceInfo): { tier: TierId; reason: string } {
  if (d.mobile || (d.memoryGB !== null && d.memoryGB <= 2)) {
    return { tier: "light", reason: "Thiết bị di động hoặc RAM thấp — mức Nhẹ chạy ổn định nhất." };
  }
  if (d.webgpu && d.cores >= 8 && (d.memoryGB === null || d.memoryGB >= 8)) {
    return { tier: "high", reason: "Máy có WebGPU, nhiều nhân CPU và RAM lớn — đủ sức chạy mức Cao cấp." };
  }
  if (d.webgpu || d.cores >= 8) {
    return {
      tier: "balanced",
      reason: d.webgpu
        ? "Máy có WebGPU — mức Cân bằng chạy nhanh và cho chất lượng tốt."
        : "Máy nhiều nhân CPU — mức Cân bằng chạy được nhưng sẽ chậm hơn.",
    };
  }
  return { tier: "light", reason: "Không phát hiện WebGPU — mức Nhẹ cho thời gian chờ ngắn nhất." };
}
