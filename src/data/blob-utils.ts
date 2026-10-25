export function isBlobLike(value: unknown): value is Blob {
  if (typeof value !== "object" || value === null) return false;
  const blob = value as { size?: unknown; type?: unknown; slice?: unknown };
  return typeof blob.size === "number" && typeof blob.type === "string" && typeof blob.slice === "function";
}

export function readBlobAsArrayBuffer(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === "function") return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read the selected file."));
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) resolve(reader.result);
      else reject(new Error("The selected file returned invalid binary data."));
    };
    reader.readAsArrayBuffer(blob);
  });
}
