import "server-only";
import { createClient } from "@/lib/supabase/server";

const BUCKET = "screenshots";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour - long enough to view a trade detail page

/** Uploads a trade screenshot, scoped under the user's own folder (required by the bucket's RLS policies). Returns the storage path to store on the trade row - not a public URL (the bucket is private). */
export async function uploadScreenshot(userId: string, file: File): Promise<string> {
  const supabase = await createClient();
  const path = `${userId}/${crypto.randomUUID()}-${file.name}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw new Error(`Screenshot upload failed: ${error.message}`);
  return path;
}

/** Turns a stored path into a short-lived signed URL for display - never a permanent public link, since screenshots may show account info. */
export async function getSignedScreenshotUrl(path: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}
