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

  // Caregiver image upload (optional). Picked files can be large; they are resized to JPEG before send.
  // MAX_CAREGIVER_IMAGE_PICK_MB: 25,
  // CAREGIVER_IMAGE_MAX_EDGE_PX: 1920,
  // CAREGIVER_IMAGE_JPEG_QUALITY: 0.82,
  // Prefer Supabase Storage URLs (recommended for reliability with multi-device sync).
  // USE_STORAGE_FOR_IMAGES: true,
  // IMAGE_STORAGE_BUCKET: "chat-images",
  // Supabase REST fetch timeout (ms); helps slow networks / large responses (default 120000).
  // SUPABASE_FETCH_TIMEOUT_MS: 120000,
};
