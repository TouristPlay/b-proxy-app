import jsQR from "jsqr";

/** Текст QR-кода с картинки (файл, снимок экрана, вставка из буфера); null — кода не нашли. */
export async function decodeQrImage(blob: Blob): Promise<string | null> {
  const bitmap = await createImageBitmap(blob);
  // Большие фото уменьшаем: jsQR быстрее, а код всё равно читается.
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const data = ctx.getImageData(0, 0, width, height);
  return jsQR(data.data, width, height, { inversionAttempts: "attemptBoth" })?.data.trim() || null;
}

/** Камера телефона: системный экран сканера; null — отменили или нет доступа к камере. */
export async function scanQrWithCamera(): Promise<string | null> {
  const { scan, Format, checkPermissions, requestPermissions } = await import("@tauri-apps/plugin-barcode-scanner");
  let perm = await checkPermissions();
  if (perm !== "granted") perm = await requestPermissions();
  if (perm !== "granted") throw new Error("camera-denied");
  const res = await scan({ formats: [Format.QRCode], windowed: false });
  return res?.content?.trim() || null;
}
