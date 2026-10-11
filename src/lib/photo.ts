/**
 * Profile pictures are kept small enough to live inside the player's database
 * record, saved through the same password-checked functions as everything else.
 * That needs no separate file store and no new keys. It suits a club of dozens
 * or hundreds of players; a much bigger app would move photos to a file store.
 */

/** Width and height of a stored photo, in pixels. */
export const PHOTO_SIZE = 160;

/**
 * Crop a picture to a centred square, shrink it, and return it as a small JPEG
 * data URL (about 10 KB) ready to save. Runs in the browser.
 */
export async function shrinkPhoto(file: Blob, size = PHOTO_SIZE, quality = 0.8): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file is not a picture.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("That picture could not be read. Try a JPG or PNG.");
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot process pictures.");
  ctx.fillStyle = "#ffffff"; // see-through PNGs get a white background
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, size, size);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", quality);
}
