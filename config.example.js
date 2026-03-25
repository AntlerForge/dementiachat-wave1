window.APP_CONFIG = {
  // Copy this file to config.js and fill values.
  SUPABASE_URL: "https://YOUR_PROJECT.supabase.co",
  SUPABASE_ANON_KEY: "YOUR_PUBLIC_ANON_KEY",
  // Optional: force both users into a known conversation UUID.
  SHARED_CONVERSATION_ID: "",

  // Web Push (Safari iOS/macOS and other modern browsers).
  // Generated server-side as VAPID public key.
  PUSH_VAPID_PUBLIC_KEY: "",

  // Polling interval for local outbox retry loop (ms).
  OUTBOX_SYNC_MS: 5000,

  // Delayed auto defaults (Wave 1 Level 3 guardrails).
  DEFAULT_DELAY_SECONDS: 180,
  MAX_DELAY_SECONDS: 900,
};
