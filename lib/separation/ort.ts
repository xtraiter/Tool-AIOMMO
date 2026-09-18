let loading: Promise<any> | null = null;

/** Loads onnxruntime-web from our own origin (copied to /ort at install time). */
export function loadOrt(): Promise<any> {
  const w = window as any;
  if (w.ort) return Promise.resolve(w.ort);
  if (loading) return loading;
  loading = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/ort/ort.all.min.js";
    s.onload = () => {
      const ort = w.ort;
      ort.env.wasm.wasmPaths = "/ort/";
      ort.env.wasm.numThreads = window.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1;
      resolve(ort);
    };
    s.onerror = () => {
      loading = null;
      reject(new Error("Không tải được thư viện chạy AI (onnxruntime)."));
    };
    document.body.appendChild(s);
  });
  return loading;
}
