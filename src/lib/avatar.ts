import { supabase } from "@/integrations/supabase/client";

const MAX_EDGE = 512;

/** Shrink a phone photo down to something sensible before it ever leaves the device. */
export async function resizeImage(file: File, maxEdge = MAX_EDGE): Promise<Blob> {
  if (typeof document === "undefined") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Store at {profile_id}/{timestamp}.jpg — the folder the person is allowed to write into. */
export async function uploadAvatar(profileId: string, file: File): Promise<string> {
  const blob = await resizeImage(file);
  const path = `${profileId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage
    .from("avatars")
    .upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (error) throw error;
  return path;
}

export async function removeAvatarFile(path: string): Promise<void> {
  await supabase.storage.from("avatars").remove([path]);
}
