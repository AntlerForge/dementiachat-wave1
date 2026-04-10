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
  // Per-send operation timeout (ms) before surfacing a failed send state (default 15000).
  // SEND_OPERATION_TIMEOUT_MS: 15000,
  // App update polling via service worker (defaults: 5 min check, 60s idle auto-apply).
  // APP_UPDATE_CHECK_MS: 300000,
  // APP_UPDATE_IDLE_RELOAD_MS: 60000,
  // Runtime version-manifest checks while app is open/focused (default 30s).
  // RUNTIME_VERSION_CHECK_MS: 30000,
  // Dad presence status in caregiver header (defaults: 45s heartbeat, 180s online window).
  // PRESENCE_HEARTBEAT_MS: 45000,
  // DAD_ONLINE_WINDOW_MS: 180000,
  // Polling cadence knobs to reduce Disk IO (realtime still handles instant updates).
  // MESSAGE_POLL_MS: 7000,
  // MESSAGE_POLL_IDLE_MS: 15000,
  // MESSAGE_POLL_MAX_MS: 30000,
  // REMOTE_SETTINGS_POLL_MS: 60000,
  // DAD_TYPING_POLL_MS: 5000,
  // Auto-scroll and message aging behavior.
  // DAD_INACTIVE_AUTO_SCROLL_MS: 60000,
  // CAREGIVER_INACTIVE_AUTO_SCROLL_MS: 60000,
  // AUTO_SCROLL_SELF_CHECK_MS: 8000,
  // MESSAGE_AGED_DAYS: 2,
  // Information board sync/save tuning.
  // INFO_BOARD_POLL_MS: 30000,
  // INFO_BOARD_SAVE_DEBOUNCE_MS: 700,
};
