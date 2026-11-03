import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function key(): Buffer {
  const raw = process.env["APP_USER_CONNECTION_KEY_SECRET"];
  if (!raw) throw new Error("APP_USER_CONNECTION_KEY_SECRET is not set");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== raw) {
    throw new Error("APP_USER_CONNECTION_KEY_SECRET must be canonical base64 for exactly 32 bytes");
  }
  return decoded;
}

export function encryptConnectionKey(plaintext: string): string {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("A non-empty connector credential is required");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), ct]).toString("base64");
}

export function decryptConnectionKey(stored: string): string {
  const encryptionKey = key();
  if (typeof stored !== "string" || stored.length === 0) {
    throw new Error("Stored connector credential is invalid");
  }
  const buf = Buffer.from(stored, "base64");
  if (buf.length < 29 || buf.toString("base64") !== stored) {
    throw new Error("Stored connector credential envelope is invalid");
  }
  try {
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, buf.subarray(0, 12));
    decipher.setAuthTag(buf.subarray(12, 28));
    const plaintext = Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]).toString("utf8");
    if (!plaintext) throw new Error("Empty credential");
    return plaintext;
  } catch {
    throw new Error("Stored connector credential could not be decrypted");
  }
}

export async function saveConnectionKeyForUser(userId: string, connectorId: string, connectionAPIKey: string, accountEmail?: string | null) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_user_connections").upsert(
    {
      user_id: userId,
      connector_id: connectorId,
      connection_key_ciphertext: encryptConnectionKey(connectionAPIKey),
      account_email: accountEmail ?? null,
      verified_at: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,connector_id" },
  );
  if (error) throw error;
}

export async function getConnectionForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("app_user_connections")
    .select("connection_key_ciphertext, account_email, verified_at")
    .eq("user_id", userId)
    .eq("connector_id", connectorId)
    .maybeSingle();
  if (error) throw error;
  return data ? { key: decryptConnectionKey(data.connection_key_ciphertext), email: data.account_email, verifiedAt: data.verified_at } : null;
}

export async function setAccountEmail(userId: string, connectorId: string, email: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("app_user_connections").update({ account_email: email }).eq("user_id", userId).eq("connector_id", connectorId);
}

export async function deleteConnectionForUser(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_user_connections").delete().eq("user_id", userId).eq("connector_id", connectorId);
  if (error) throw error;
}


export async function markConnectionVerified(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_user_connections")
    .update({ verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
  if (error) throw error;
}

export async function markConnectionUnverified(userId: string, connectorId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("app_user_connections")
    .update({ verified_at: null, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("connector_id", connectorId);
  if (error) throw error;
}
