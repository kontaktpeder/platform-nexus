/** Client-side image resize for small email logos / avatars. */

export async function resizeImageFile(
  file: File,
  opts?: { maxWidth?: number; maxHeight?: number; quality?: number },
): Promise<{ blob: Blob; mimeType: "image/jpeg" | "image/png"; ext: "jpg" | "png" }> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Velg et bilde");
  }
  const maxWidth = opts?.maxWidth ?? 280;
  const maxHeight = opts?.maxHeight ?? 140;
  const quality = opts?.quality ?? 0.82;

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxWidth / bitmap.width, maxHeight / bitmap.height);
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Kunne ikke lese bildet");
    ctx.drawImage(bitmap, 0, 0, w, h);

    const preferPng = file.type === "image/png" || file.type === "image/webp";
    if (preferPng) {
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, "image/png"),
      );
      if (blob) return { blob, mimeType: "image/png", ext: "png" };
    }
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality),
    );
    if (!blob) throw new Error("Kunne ikke komprimere bildet");
    return { blob, mimeType: "image/jpeg", ext: "jpg" };
  } finally {
    bitmap.close();
  }
}
