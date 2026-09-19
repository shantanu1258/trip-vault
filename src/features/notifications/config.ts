// Public application-server key, not a credential. Private keys live only in Supabase.
export const publicPushKey =
  import.meta.env.VITE_VAPID_PUBLIC_KEY ||
  "BDjN45K7r8HgtBpT4rbr1xCa9aiSYw14auJJSZ2hxImAAs3T7-StBJmkb_ZvD3EMtrxurFhvpFOFKFMR5cZLgJc";

// Enable only after applying the migration and deploying the protected sender.
export const pushEnabled = import.meta.env.VITE_PUSH_ENABLED === "true";

export function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  const key = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
  if (key.length !== 65 || key[0] !== 4) throw new Error("Invalid public notification key.");
  return key;
}
