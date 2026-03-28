import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ROLE_KEY = "carechat.role";
const DAD_UI_KEY = "carechat.dad_ui";
const CAREGIVER_UI_KEY = "carechat.caregiver_ui";
const TRUST_KEY = "carechat.trust_rules";
const OUTBOX_KEY = "carechat.local_outbox";
const LOCAL_MSG_KEY = "carechat.local_messages";
const ROLE_HINT_KEY = "carechat.role_hint";
const CONVERSATION_KEY = "carechat.conversation_id";
const AUTH_EMAIL_KEY = "carechat.auth_email";
const AUTH_CODE_KEY = "carechat.auth_code";
const AUTH_COOLDOWN_KEY = "carechat.auth_cooldown_until";
const EMAIL_OTP_MIN_LEN = 6;
const EMAIL_OTP_MAX_LEN = 12;
const LOCAL_MODE_KEY = "carechat.local_mode";
const DAD_DRAFT_KEY = "carechat.dad_draft";
const CAREGIVER_DRAFT_KEY = "carechat.caregiver_draft";
const CAREGIVER_TAB_KEY = "carechat.caregiver_tab";
const DAD_UI_DRAFT_KEY = "carechat.dad_ui_draft";
const DAD_LAST_MSG_AT_KEY = "carechat.dad_last_msg_at";
const DAD_LAST_MSG_ID_KEY = "carechat.dad_last_msg_id";
const CAREGIVER_LAST_MSG_AT_KEY = "carechat.caregiver_last_msg_at";
const CAREGIVER_LAST_MSG_ID_KEY = "carechat.caregiver_last_msg_id";
const DAD_ALERT_PROMPTED_KEY = "carechat.dad_alert_prompted";

const appRoot = document.getElementById("app");
const roleSelect = document.getElementById("role");
const rolePicker = document.querySelector(".role-picker");
const appTitle = document.getElementById("appTitle");
let activeMessageMenu = null;
let activeMenuOutsideHandler = null;
let activeMenuEscapeHandler = null;
let swRegistration = null;

const config = window.APP_CONFIG || {};

// Caregiver photo pick: allow large library files; encode down before send (messages store a data URL).
const MAX_CAREGIVER_IMAGE_PICK_BYTES =
  Math.min(50, Math.max(3, Number(config.MAX_CAREGIVER_IMAGE_PICK_MB || 25))) * 1024 * 1024;
const CAREGIVER_IMAGE_MAX_EDGE_PX = Number(config.CAREGIVER_IMAGE_MAX_EDGE_PX || 1920);
const CAREGIVER_IMAGE_JPEG_QUALITY = Number(
  config.CAREGIVER_IMAGE_JPEG_QUALITY != null ? config.CAREGIVER_IMAGE_JPEG_QUALITY : 0.82
);

function parseMsWithDefault(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const SUPABASE_FETCH_TIMEOUT_MS = Math.min(
  300_000,
  Math.max(45_000, parseMsWithDefault(config.SUPABASE_FETCH_TIMEOUT_MS, 180_000))
);
const APP_UPDATE_CHECK_MS = Math.max(60_000, parseMsWithDefault(config.APP_UPDATE_CHECK_MS, 300_000));
const APP_UPDATE_IDLE_RELOAD_MS = Math.max(
  15_000,
  parseMsWithDefault(config.APP_UPDATE_IDLE_RELOAD_MS, 60_000)
);
const DAD_INACTIVE_AUTO_SCROLL_MS = Math.max(
  10_000,
  parseMsWithDefault(config.DAD_INACTIVE_AUTO_SCROLL_MS, 60_000)
);
const IMAGE_STORAGE_BUCKET = String(config.IMAGE_STORAGE_BUCKET || "chat-images").trim();
const USE_STORAGE_FOR_IMAGES = config.USE_STORAGE_FOR_IMAGES !== false;

function fetchWithTimeout(url, options = {}) {
  const { signal: outer, ...rest } = options;
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), SUPABASE_FETCH_TIMEOUT_MS);
  const onOuterAbort = () => {
    clearTimeout(id);
    ctrl.abort();
  };
  if (outer) {
    if (outer.aborted) {
      clearTimeout(id);
      return Promise.reject(outer.reason ?? new DOMException("Aborted", "AbortError"));
    }
    outer.addEventListener("abort", onOuterAbort, { once: true });
  }
  return fetch(url, { ...rest, signal: ctrl.signal }).finally(() => {
    clearTimeout(id);
    if (outer) outer.removeEventListener("abort", onOuterAbort);
  });
}

function isAbortLikeError(err) {
  const name = String(err?.name || "");
  if (name === "AbortError") return true;
  const msg = String(err?.message || err || "").toLowerCase();
  return msg.includes("abort") || msg.includes("timeout") || msg.includes("timed out");
}

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("cloud") === "1") {
  localStorage.removeItem(LOCAL_MODE_KEY);
}
if (urlParams.get("local") === "1") {
  localStorage.setItem(LOCAL_MODE_KEY, "1");
}
const forceLocalMode = localStorage.getItem(LOCAL_MODE_KEY) === "1";
const hasSupabaseConfig = !forceLocalMode && Boolean(config.SUPABASE_URL && config.SUPABASE_ANON_KEY);
const supabase = hasSupabaseConfig
  ? createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
      global: { fetch: fetchWithTimeout },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const state = {
  role: localStorage.getItem(ROLE_KEY) || "dad",
  roleHint: localStorage.getItem(ROLE_HINT_KEY) || "caregiver",
  authEmailDraft: localStorage.getItem(AUTH_EMAIL_KEY) || "",
  authCodeDraft: localStorage.getItem(AUTH_CODE_KEY) || "",
  authCooldownUntil: Number(localStorage.getItem(AUTH_COOLDOWN_KEY) || 0),
  dadDraft: localStorage.getItem(DAD_DRAFT_KEY) || "",
  caregiverDraft: localStorage.getItem(CAREGIVER_DRAFT_KEY) || "",
  caregiverImageDraft: null,
  caregiverTab: localStorage.getItem(CAREGIVER_TAB_KEY) || "chat",
  messages: [],
  outbox: readJson(OUTBOX_KEY, []),
  conversationId: localStorage.getItem(CONVERSATION_KEY) || null,
  session: null,
  profile: null,
  authRequired: false,
  appliedDadUI: readJson(DAD_UI_KEY, {
    fontScale: 22,
    uiFontScale: 16,
    theme: "high-contrast",
    bubbleWidth: 80,
    imageSize: "medium",
    alertsEnabled: true,
  }),
  caregiverUI: readJson(CAREGIVER_UI_KEY, {
    fontScale: 18,
    uiFontScale: 16,
    theme: "clear",
    bubbleWidth: 84,
  }),
  previewDadUI: readJson(DAD_UI_DRAFT_KEY, null),
  roleLockEnabled: false,
  trustRules: readJson(TRUST_KEY, {
    trustLevel: 1,
    delaySeconds: config.DEFAULT_DELAY_SECONDS || 180,
  }),
  authDebug: {
    lastEvent: "init",
    lastCallback: "none",
    lastError: "",
  },
  dadVisibleMessageCount: 0,
  caregiverVisibleMessageCount: 0,
  dadStickToBottom: true,
  caregiverStickToBottom: true,
  dadTyping: false,
  dadAlertUnreadCount: 0,
  dadAlertText: "",
  lastDadMessageAt: localStorage.getItem(DAD_LAST_MSG_AT_KEY) || "",
  lastDadMessageId: localStorage.getItem(DAD_LAST_MSG_ID_KEY) || "",
  lastCaregiverMessageAt: localStorage.getItem(CAREGIVER_LAST_MSG_AT_KEY) || "",
  lastCaregiverMessageId: localStorage.getItem(CAREGIVER_LAST_MSG_ID_KEY) || "",
  lastDadTypingEmitAt: 0,
  lastDadTypingValue: false,
  pushSubscribed: false,
  outboxStorageWarned: false,
  outboxSyncInFlight: false,
  refreshInFlight: false,
  dadLastInteractionAt: Date.now(),
  lastInteractionAt: Date.now(),
};

init().catch((err) => {
  console.error(err);
  showFatalStartupError(err);
});

async function init() {
  bindGlobalInteractionTracking();
  roleSelect.value = state.role;
  roleSelect.addEventListener("change", onRoleChange);
  if (supabase) {
    await processAuthCallbackIfPresent();
    await hydrateAuth();
    supabase.auth.onAuthStateChange(async (evt, session) => {
      try {
        state.authDebug.lastEvent = evt;
        state.session = session;
        await bootstrapRemote();
        render();
      } catch (err) {
        console.error("Auth state update failed", err);
        showFatalStartupError(err);
      }
    });
  }
  try {
    await bootstrapRemote();
    enforceRoleLock();
    await loadMessages();
    primeInboundMessageMarkers();
    render();
  } catch (err) {
    showFatalStartupError(err);
    return;
  }
  startOutboxSyncLoop();
  startMessageRefreshLoop();
  await setupServiceWorker();
  setupAppUpdatePolling();
  render();
}

async function processAuthCallbackIfPresent() {
  const url = new URL(window.location.href);
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const hasCode = Boolean(url.searchParams.get("code"));
  const hasAuthHash = Boolean(hash.get("access_token"));
  const tokenHash = url.searchParams.get("token_hash");
  const otpType = url.searchParams.get("type");
  const callbackError =
    url.searchParams.get("error_description") || hash.get("error_description") || "";

  if (callbackError) {
    state.authDebug.lastError = callbackError;
  }

  if (hasCode) {
    const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
    if (error) {
      state.authDebug.lastCallback = "code_exchange_failed";
      state.authDebug.lastError = error.message;
      console.warn("Auth code exchange failed:", error.message);
    } else {
      state.authDebug.lastCallback = "code_exchange_ok";
    }
  } else if (hasAuthHash) {
    const access_token = hash.get("access_token");
    const refresh_token = hash.get("refresh_token");
    if (access_token && refresh_token) {
      const { error } = await supabase.auth.setSession({ access_token, refresh_token });
      if (error) {
        state.authDebug.lastCallback = "hash_session_failed";
        state.authDebug.lastError = error.message;
      } else {
        state.authDebug.lastCallback = "hash_session_ok";
      }
    }
  } else if (tokenHash && otpType) {
    const { error } = await supabase.auth.verifyOtp({
      type: otpType,
      token_hash: tokenHash,
    });
    if (error) {
      state.authDebug.lastCallback = "verify_otp_failed";
      state.authDebug.lastError = error.message;
    } else {
      state.authDebug.lastCallback = "verify_otp_ok";
    }
  }

  const { data } = await supabase.auth.getSession();
  if ((hasCode || hasAuthHash) && data?.session) {
    window.history.replaceState({}, document.title, window.location.pathname);
  } else if (tokenHash && otpType && data?.session) {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

async function hydrateAuth() {
  const { data } = await supabase.auth.getSession();
  state.session = data?.session || null;
}

async function bootstrapRemote() {
  if (!supabase) return;
  if (!state.session) {
    state.authRequired = true;
    return;
  }
  state.authRequired = false;
  await ensureProfile();
  await ensureConversation();
  await loadRemoteSettings();
}

async function ensureProfile() {
  const { data, error } = await supabase.rpc("ensure_profile", {
    p_role: state.roleHint,
    p_display_name: "",
  });
  if (error) throw new Error(`ensure_profile failed: ${error.message}`);
  state.profile = data;
}

function getSharedConversationId() {
  const raw = config.SHARED_CONVERSATION_ID;
  if (raw == null || raw === "") return "";
  return String(raw).trim();
}

/**
 * When SHARED_CONVERSATION_ID is set, we must stay on that conversation. Previously, any join error
 * fell through to create_or_join(null) and opened a *new* random conversation while localStorage
 * still looked "valid" — sends/notifications used one id, loadMessages another. Alerts fired but the
 * chat thread stayed empty or showed ghost rows from carechat.local_messages.
 */
async function ensureConversation() {
  if (!supabase) return;

  const shared = getSharedConversationId();

  if (shared) {
    const prev = String(state.conversationId || localStorage.getItem(CONVERSATION_KEY) || "");
    if (prev && prev !== shared) {
      try {
        localStorage.removeItem(LOCAL_MSG_KEY);
        localStorage.setItem(OUTBOX_KEY, JSON.stringify([]));
      } catch {
        /* noop */
      }
      state.messages = [];
      state.outbox = [];
    }
    state.conversationId = shared;
    const joinRole = state.roleHint === "dad" ? "dad" : "caregiver_admin";
    const { error: joinErr } = await supabase.rpc("create_or_join_conversation", {
      p_conversation_id: state.conversationId,
      p_member_role: joinRole,
    });
    if (joinErr) {
      throw new Error(`Join shared conversation failed: ${joinErr.message}`);
    }
    localStorage.setItem(CONVERSATION_KEY, state.conversationId);
    return;
  }

  if (!state.conversationId) {
    state.conversationId = localStorage.getItem(CONVERSATION_KEY) || null;
  }
  if (state.conversationId) {
    const joinRole = state.roleHint === "dad" ? "dad" : "caregiver_admin";
    const { error: joinErr } = await supabase.rpc("create_or_join_conversation", {
      p_conversation_id: state.conversationId,
      p_member_role: joinRole,
    });
    if (!joinErr) {
      localStorage.setItem(CONVERSATION_KEY, state.conversationId);
      return;
    }
    console.warn("Re-join existing conversation failed, creating new.", joinErr);
  }
  const memberRole = state.roleHint === "dad" ? "dad" : "caregiver_admin";
  const { data, error } = await supabase.rpc("create_or_join_conversation", {
    p_conversation_id: null,
    p_member_role: memberRole,
  });
  if (error) throw new Error(`create_or_join_conversation failed: ${error.message}`);
  state.conversationId = data;
  localStorage.setItem(CONVERSATION_KEY, state.conversationId);
}

async function loadRemoteSettings() {
  if (!supabase || !state.conversationId) return;

  const [{ data: uiData }, { data: trustData }] = await Promise.all([
    supabase
      .from("dad_ui_profiles")
      .select("*")
      .eq("conversation_id", state.conversationId)
      .maybeSingle(),
    supabase
      .from("trust_rules")
      .select("*")
      .eq("conversation_id", state.conversationId)
      .maybeSingle(),
  ]);

  if (uiData) {
    state.appliedDadUI = {
      fontScale: uiData.font_scale,
      uiFontScale: uiData.ui_font_scale || state.appliedDadUI.uiFontScale || 16,
      theme: uiData.theme,
      bubbleWidth: uiData.bubble_width,
      imageSize: uiData.image_default_size || "medium",
      alertsEnabled:
        uiData.alerts_enabled == null
          ? state.appliedDadUI.alertsEnabled !== false
          : Boolean(uiData.alerts_enabled),
    };
    state.roleLockEnabled = Boolean(uiData.role_lock_enabled);
    localStorage.setItem(DAD_UI_KEY, JSON.stringify(state.appliedDadUI));
  } else {
    state.roleLockEnabled = false;
  }

  if (trustData) {
    state.trustRules = {
      trustLevel: trustData.trust_level,
      delaySeconds: trustData.delayed_auto_seconds,
      level3ChecklistConfirmed: trustData.level3_checklist_confirmed,
    };
    localStorage.setItem(TRUST_KEY, JSON.stringify(state.trustRules));
  }
}

function onRoleChange(event) {
  state.role = event.target.value;
  if (isDadRoleLocked()) {
    state.role = "dad";
    roleSelect.value = "dad";
  }
  localStorage.setItem(ROLE_KEY, state.role);
  render();
}

function render() {
  rememberThreadScrollIntent();
  dismissMessageContextMenu();
  enforceRoleLock();
  applyRoleTheme();
  updateAppTitle();
  appRoot.innerHTML = "";
  if (state.authRequired) {
    renderAuthGate();
    return;
  }
  if (state.role === "dad") {
    renderDadView();
  } else {
    renderCaregiverView();
  }
}

function rememberThreadScrollIntent() {
  const dadThread = document.getElementById("dadThread");
  if (dadThread) {
    state.dadStickToBottom = isThreadNearBottom(dadThread);
  }
  const caregiverThread = document.getElementById("caregiverThread");
  if (caregiverThread) {
    state.caregiverStickToBottom = isThreadNearBottom(caregiverThread);
  }
}

function applyRoleTheme() {
  const body = document.body;
  if (!body) return;
  body.classList.remove("role-dad", "role-caregiver");
  body.classList.add(state.role === "caregiver" ? "role-caregiver" : "role-dad");
}

function renderAuthGate() {
  const wrapper = document.createElement("section");
  wrapper.className = "panel";
  wrapper.innerHTML = `
    <h2>Sign in to Care Chat</h2>
    <p class="subtext">
      <strong>iPhone / Home Screen app:</strong> use the <strong>sign-in code</strong> from the email below — links open in
      Safari and won’t finish sign-in inside the installed app. If your email has no code, add
      <code>{{ .Token }}</code> to the Magic Link template in Supabase (Authentication → Email Templates).
    </p>
    <form id="authSendForm" class="row">
      <label>Email</label>
      <input id="authEmail" type="email" placeholder="you@example.com" required />
      <label>Role hint</label>
      <select id="authRoleHint">
        <option value="caregiver">Caregiver</option>
        <option value="dad">Dad</option>
      </select>
      <button id="sendAuthEmail" type="submit">Send sign-in email</button>
    </form>
    <form id="authVerifyForm" class="row">
      <label>Sign-in code from email (numbers only)</label>
      <input id="authCode" type="text" inputmode="numeric" pattern="[0-9]{${EMAIL_OTP_MIN_LEN},${EMAIL_OTP_MAX_LEN}}" maxlength="${EMAIL_OTP_MAX_LEN}" placeholder="12345678" />
      <button id="verifyAuthCode" type="submit">Verify code</button>
    </form>
    <div class="row auth-actions">
      <button id="reloadApp" type="button">Reload app</button>
      <button id="useLocalMode" type="button">Continue without sign-in (local demo)</button>
    </div>
    <details>
      <summary>Auth diagnostics</summary>
      <pre id="authDebug" class="status"></pre>
    </details>
    <p id="authStatus" class="status"></p>
  `;
  const sendForm = wrapper.querySelector("#authSendForm");
  const verifyForm = wrapper.querySelector("#authVerifyForm");
  const emailInput = wrapper.querySelector("#authEmail");
  const codeInput = wrapper.querySelector("#authCode");
  const roleHint = wrapper.querySelector("#authRoleHint");
  const status = wrapper.querySelector("#authStatus");
  const sendBtn = wrapper.querySelector("#sendAuthEmail");
  const verifyBtn = wrapper.querySelector("#verifyAuthCode");
  const localModeBtn = wrapper.querySelector("#useLocalMode");
  const reloadBtn = wrapper.querySelector("#reloadApp");
  const debugBox = wrapper.querySelector("#authDebug");
  roleHint.value = state.roleHint;
  emailInput.value = state.authEmailDraft;
  codeInput.value = state.authCodeDraft;

  const refreshDiagnostics = () => {
    debugBox.textContent = JSON.stringify(
      {
        mode: forceLocalMode ? "local-forced" : "cloud-auth",
        origin: window.location.origin,
        path: window.location.pathname,
        callback: state.authDebug.lastCallback,
        event: state.authDebug.lastEvent,
        hasSession: Boolean(state.session),
        error: state.authDebug.lastError || null,
      },
      null,
      2
    );
  };
  refreshDiagnostics();

  const refreshCooldownUi = () => {
    const now = Date.now();
    const ms = state.authCooldownUntil - now;
    if (ms > 0) {
      const sec = Math.ceil(ms / 1000);
      sendBtn.disabled = true;
      sendBtn.textContent = `Wait ${sec}s`;
      if (!status.textContent) {
        status.textContent = `Please wait ${sec}s before requesting another email.`;
      }
      return;
    }
    sendBtn.disabled = false;
    sendBtn.textContent = "Send sign-in email";
  };

  refreshCooldownUi();
  const cooldownTimer = setInterval(refreshCooldownUi, 1000);

  emailInput.addEventListener("input", () => {
    state.authEmailDraft = emailInput.value;
    localStorage.setItem(AUTH_EMAIL_KEY, state.authEmailDraft);
  });
  codeInput.addEventListener("input", () => {
    state.authCodeDraft = codeInput.value.replace(/\D/g, "").slice(0, EMAIL_OTP_MAX_LEN);
    codeInput.value = state.authCodeDraft;
    localStorage.setItem(AUTH_CODE_KEY, state.authCodeDraft);
  });
  sendForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (Date.now() < state.authCooldownUntil) return;
    const email = emailInput.value.trim();
    state.roleHint = roleHint.value;
    localStorage.setItem(ROLE_HINT_KEY, state.roleHint);
    try {
      const redirectTo = `${window.location.origin}${window.location.pathname}`;
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${redirectTo}?cloud=1` },
      });
      if (error) throw error;
      state.authEmailDraft = email;
      localStorage.setItem(AUTH_EMAIL_KEY, state.authEmailDraft);
      state.authCooldownUntil = Date.now() + 60_000;
      localStorage.setItem(AUTH_COOLDOWN_KEY, String(state.authCooldownUntil));
      status.textContent =
        "Sign-in email sent. Enter the code from the email here (check spam). On iPhone, avoid the email link if you opened this from the Home Screen icon.";
      state.authDebug.lastError = "";
      state.authDebug.lastCallback = "otp_or_link_sent";
      refreshDiagnostics();
    } catch (err) {
      const msg = String(err?.message || err || "Unknown error");
      if (msg.toLowerCase().includes("rate limit exceeded")) {
        state.authCooldownUntil = Date.now() + 5 * 60_000;
        localStorage.setItem(AUTH_COOLDOWN_KEY, String(state.authCooldownUntil));
        status.textContent =
          "Too many requests. Supabase rate limit hit. Wait a few minutes, then try once.";
      } else {
        status.textContent = `Sign-in failed: ${msg}`;
      }
      state.authDebug.lastError = msg;
      state.authDebug.lastCallback = "send_link_failed";
      refreshDiagnostics();
    }
  });
  verifyForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = emailInput.value.trim();
    const token = codeInput.value.trim();
    if (!email) {
      status.textContent = "Enter email first.";
      return;
    }
    if (!new RegExp(`^\\d{${EMAIL_OTP_MIN_LEN},${EMAIL_OTP_MAX_LEN}}$`).test(token)) {
      status.textContent = `Enter the full code from the email (${EMAIL_OTP_MIN_LEN}–${EMAIL_OTP_MAX_LEN} digits).`;
      return;
    }
    verifyBtn.disabled = true;
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email,
        token,
        type: "email",
      });
      if (error) throw error;
      state.session = data?.session || null;
      state.authDebug.lastError = "";
      state.authDebug.lastCallback = "verify_otp_code_ok";
      state.authDebug.lastEvent = "SIGNED_IN";
      localStorage.setItem(AUTH_CODE_KEY, "");
      state.authCodeDraft = "";
      await bootstrapRemote();
      status.textContent = "Signed in successfully.";
      render();
    } catch (err) {
      const msg = String(err?.message || err || "Unknown error");
      state.authDebug.lastError = msg;
      state.authDebug.lastCallback = "verify_otp_code_failed";
      status.textContent = `Code verification failed: ${msg}`;
      refreshDiagnostics();
    } finally {
      verifyBtn.disabled = false;
    }
  });
  localModeBtn.addEventListener("click", () => {
    localStorage.setItem(LOCAL_MODE_KEY, "1");
    window.location.href = `${window.location.origin}${window.location.pathname}`;
  });
  if (reloadBtn) {
    reloadBtn.addEventListener("click", () => {
      const base = `${window.location.origin}${window.location.pathname}`;
      window.location.href = `${base}?cloud=1`;
    });
  }
  wrapper.addEventListener("DOMNodeRemoved", () => clearInterval(cooldownTimer), { once: true });
  appRoot.appendChild(wrapper);
}

function renderDadView() {
  const tpl = document.getElementById("dad-view-template");
  const node = tpl.content.cloneNode(true);
  const panel = node.querySelector(".panel");
  const thread = node.getElementById("dadThread");
  const form = node.getElementById("dadComposer");
  const input = node.getElementById("dadInput");
  input.value = state.dadDraft;
  const markDadInteraction = () => {
    state.dadLastInteractionAt = Date.now();
  };
  input.addEventListener("focus", markDadInteraction);
  input.addEventListener("keydown", markDadInteraction);
  input.addEventListener("input", () => {
    markDadInteraction();
    state.dadDraft = input.value;
    localStorage.setItem(DAD_DRAFT_KEY, state.dadDraft);
    emitDadTypingStatus(input.value.trim().length > 0);
  });
  input.addEventListener("blur", () => {
    emitDadTypingStatus(false, true);
  });

  applyUiFontScale(panel, state.appliedDadUI.uiFontScale, 16);
  applyDadUiTokens(thread, state.appliedDadUI);

  let visibleCount = 0;
  for (const msg of state.messages) {
    if (msg.hidden_for_dad) continue;
    visibleCount += 1;
    thread.appendChild(renderBubble(msg, { viewerRole: "dad" }));
  }
  const dadPending = getPendingOutboxMessagesForRole("dad");
  for (const pending of dadPending) {
    visibleCount += 1;
    thread.appendChild(renderPendingBubble(pending));
  }
  thread.addEventListener("scroll", markDadInteraction, { passive: true });
  thread.addEventListener("pointerdown", markDadInteraction, { passive: true });
  thread.addEventListener("touchstart", markDadInteraction, { passive: true });
  maybeRequestDadAlertPermission();

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    state.dadDraft = "";
    localStorage.setItem(DAD_DRAFT_KEY, "");
    try {
      await queueMessage(text, "dad");
      emitDadTypingStatus(false, true);
      await loadMessages();
      render();
    } catch (err) {
      state.dadDraft = text;
      localStorage.setItem(DAD_DRAFT_KEY, state.dadDraft);
      input.value = text;
      alert(`Send failed: ${String(err?.message || err)}`);
    }
  });

  appRoot.appendChild(node);
  const dadHasBeenInactive = Date.now() - state.dadLastInteractionAt >= DAD_INACTIVE_AUTO_SCROLL_MS;
  const hasNewVisibleMessages = visibleCount > state.dadVisibleMessageCount;
  if (state.dadStickToBottom || hasNewVisibleMessages || dadHasBeenInactive) {
    scrollThreadToBottom(thread);
  }
  state.dadVisibleMessageCount = visibleCount;
}

function renderCaregiverView() {
  const tpl = document.getElementById("caregiver-view-template");
  const node = tpl.content.cloneNode(true);
  const panel = node.querySelector(".panel");
  const thread = node.getElementById("caregiverThread");
  const form = node.getElementById("caregiverComposer");
  const input = node.getElementById("caregiverInput");
  input.value = state.caregiverDraft;
  input.addEventListener("input", () => {
    state.caregiverDraft = input.value;
    localStorage.setItem(CAREGIVER_DRAFT_KEY, state.caregiverDraft);
  });

  const tabs = node.getElementById("tabs");
  const outboxStatus = node.getElementById("outboxStatus");
  const purgeInlineImagesBtn = node.getElementById("purgeInlineImages");
  const dadAlertBanner = node.getElementById("dadAlertBanner");
  const dadAlertText = node.getElementById("dadAlertText");
  const clearDadAlert = node.getElementById("clearDadAlert");
  const enableAlerts = node.getElementById("enableAlerts");
  const dadTypingIndicator = node.getElementById("dadTypingIndicator");
  applyUiFontScale(panel, state.caregiverUI.uiFontScale, 16);
  applyCaregiverUiTokens(thread, state.caregiverUI);

  let visibleCount = 0;
  for (const msg of state.messages) {
    visibleCount += 1;
    thread.appendChild(renderBubble(msg, { viewerRole: "caregiver" }));
  }
  const caregiverPending = getPendingOutboxMessagesForRole("caregiver");
  for (const pending of caregiverPending) {
    visibleCount += 1;
    thread.appendChild(renderPendingBubble(pending));
  }

  const panes = node.querySelectorAll(".pane");
  const setCaregiverTab = (tab) => {
    const safeTab = ["chat", "dad-ui", "ai-rules"].includes(tab) ? tab : "chat";
    state.caregiverTab = safeTab;
    localStorage.setItem(CAREGIVER_TAB_KEY, safeTab);
    tabs.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === safeTab);
    });
    panes.forEach((p) => {
      p.classList.toggle("active", p.dataset.pane === safeTab);
    });
  };

  setCaregiverTab(state.caregiverTab);
  tabs.addEventListener("click", (e) => {
    const tab = e.target?.dataset?.tab;
    if (!tab) return;
    setCaregiverTab(tab);
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    state.caregiverDraft = "";
    localStorage.setItem(CAREGIVER_DRAFT_KEY, "");
    try {
      await queueMessage(text, "caregiver");
      await loadMessages();
      render();
    } catch (err) {
      state.caregiverDraft = text;
      localStorage.setItem(CAREGIVER_DRAFT_KEY, state.caregiverDraft);
      input.value = text;
      outboxStatus.textContent = `Send failed: ${String(err?.message || err)}`;
    }
  });

  wireImageSize(node);
  wireCaregiverImage(node);
  wireCaregiverPullRefresh(thread, outboxStatus);
  wireThreadMessageActions(thread);
  wireDadUiPane(node);
  wireCaregiverUiPane(node);
  wireAiRulesPane(node);

  if (dadAlertBanner && dadAlertText && clearDadAlert && enableAlerts) {
    if (state.dadAlertUnreadCount > 0) {
      dadAlertBanner.hidden = false;
      dadAlertText.textContent = `${state.dadAlertUnreadCount} new Dad message${
        state.dadAlertUnreadCount === 1 ? "" : "s"
      }: ${state.dadAlertText}`;
    } else {
      dadAlertBanner.hidden = true;
    }

    const alertUi = getAlertEnableUiState();
    enableAlerts.textContent = alertUi.label;
    enableAlerts.disabled = alertUi.disabled;

    clearDadAlert.addEventListener("click", () => {
      state.dadAlertUnreadCount = 0;
      state.dadAlertText = "";
      render();
    });
    enableAlerts.addEventListener("click", async () => {
      await enablePushAlerts();
      render();
    });
  }
  if (dadTypingIndicator) {
    dadTypingIndicator.hidden = !state.dadTyping;
  }
  if (purgeInlineImagesBtn) {
    purgeInlineImagesBtn.addEventListener("click", async () => {
      const ok = confirm(
        "Purge heavy inline image payloads in this conversation? This keeps text but removes embedded photos."
      );
      if (!ok) return;
      try {
        const removed = await purgeInlineImagesForConversation();
        outboxStatus.textContent = `Purged ${removed} inline image message${removed === 1 ? "" : "s"}.`;
        await loadMessages();
        render();
      } catch (err) {
        outboxStatus.textContent = `Purge failed: ${String(err?.message || err)}`;
      }
    });
  }

  outboxStatus.textContent = outboxSummary();
  appRoot.appendChild(node);
  if (state.caregiverStickToBottom || visibleCount > state.caregiverVisibleMessageCount) {
    scrollThreadToBottom(thread);
  }
  state.caregiverVisibleMessageCount = visibleCount;
}

function wireCaregiverPullRefresh(threadEl, statusEl) {
  if (!threadEl) return;
  const parent = threadEl.parentElement;
  if (!parent) return;

  const indicator = document.createElement("div");
  indicator.className = "pull-refresh-indicator";
  indicator.textContent = "Pull down to refresh";
  parent.insertBefore(indicator, threadEl);

  const THRESHOLD = 72;
  const MAX_PULL = 120;
  let startY = 0;
  let pullDistance = 0;
  let pulling = false;
  let refreshing = false;

  const setIndicator = (text, active = false) => {
    indicator.textContent = text;
    indicator.classList.toggle("active", active);
  };

  const resetVisuals = () => {
    pullDistance = 0;
    threadEl.classList.remove("pulling");
    threadEl.style.transform = "";
    indicator.style.height = "0px";
    indicator.style.opacity = "0";
    setIndicator("Pull down to refresh", false);
  };

  const shouldIgnoreStart = (event) => {
    const target = event.target;
    if (!target || !(target instanceof Element)) return false;
    if (target.closest(".message-context-menu")) return true;
    const tag = target.tagName;
    return ["INPUT", "TEXTAREA", "BUTTON", "SELECT", "LABEL"].includes(tag);
  };

  const onStart = (event) => {
    if (refreshing) return;
    if (event.touches?.length !== 1) return;
    if (threadEl.scrollTop > 0) return;
    if (shouldIgnoreStart(event)) return;
    startY = event.touches[0].clientY;
    pulling = true;
    threadEl.classList.add("pulling");
    indicator.style.opacity = "1";
  };

  const onMove = (event) => {
    if (!pulling || refreshing) return;
    if (event.touches?.length !== 1) return;
    const dy = event.touches[0].clientY - startY;
    if (dy <= 0) {
      resetVisuals();
      pulling = false;
      return;
    }
    if (threadEl.scrollTop > 0) {
      resetVisuals();
      pulling = false;
      return;
    }
    pullDistance = Math.min(MAX_PULL, dy * 0.55);
    if (pullDistance > 0) {
      event.preventDefault();
    }
    threadEl.style.transform = `translateY(${pullDistance}px)`;
    indicator.style.height = `${Math.min(46, pullDistance * 0.62)}px`;
    indicator.style.opacity = `${Math.min(1, pullDistance / 50)}`;
    setIndicator(
      pullDistance >= THRESHOLD ? "Release to refresh" : "Pull down to refresh",
      pullDistance >= THRESHOLD
    );
  };

  const onEnd = async () => {
    if (!pulling || refreshing) return;
    pulling = false;
    const trigger = pullDistance >= THRESHOLD;
    if (!trigger) {
      resetVisuals();
      return;
    }
    refreshing = true;
    indicator.style.height = "34px";
    indicator.style.opacity = "1";
    setIndicator("Refreshing...", true);
    threadEl.style.transform = "translateY(34px)";
    try {
      await Promise.all([loadMessages(), loadRemoteSettings(), loadDadTypingStatus()]);
      if (statusEl) statusEl.textContent = "Refreshed.";
    } catch (err) {
      if (statusEl) statusEl.textContent = `Refresh failed: ${String(err?.message || err)}`;
    } finally {
      refreshing = false;
      resetVisuals();
      render();
    }
  };

  threadEl.addEventListener("touchstart", onStart, { passive: true });
  threadEl.addEventListener("touchmove", onMove, { passive: false });
  threadEl.addEventListener("touchend", onEnd, { passive: true });
  threadEl.addEventListener("touchcancel", onEnd, { passive: true });
}

function wireImageSize(root) {
  const picker = root.getElementById("imageSize");
  picker.value = state.appliedDadUI.imageSize || "medium";
  picker.addEventListener("change", () => {
    state.appliedDadUI.imageSize = picker.value;
  });
}

function wireCaregiverImage(root) {
  const fileInput = root.getElementById("caregiverImageFile");
  const preview = root.getElementById("caregiverImagePreview");
  const sendBtn = root.getElementById("sendCaregiverImage");
  const clearBtn = root.getElementById("clearCaregiverImage");
  const status = root.getElementById("imageStatus");

  const renderPreview = () => {
    if (state.caregiverImageDraft?.dataUrl) {
      preview.src = state.caregiverImageDraft.dataUrl;
      preview.style.display = "block";
      status.textContent = `Selected: ${state.caregiverImageDraft.name}`;
      return;
    }
    preview.removeAttribute("src");
    preview.style.display = "none";
    status.textContent = "";
  };

  fileInput.addEventListener("change", async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      status.textContent = "Please choose an image file.";
      return;
    }
    const maxMb = Math.round(MAX_CAREGIVER_IMAGE_PICK_BYTES / (1024 * 1024));
    if (file.size > MAX_CAREGIVER_IMAGE_PICK_BYTES) {
      status.textContent = `Image too large. Use a file under ${maxMb}MB (photos are resized before sending).`;
      return;
    }
    try {
      status.textContent = "Processing photo…";
      const dataUrl = await encodeImageFileForUpload(file);
      state.caregiverImageDraft = { dataUrl, name: file.name };
      status.textContent = "";
      renderPreview();
    } catch (err) {
      status.textContent = `Could not read image: ${String(err.message || err)}`;
    }
  });

  clearBtn.addEventListener("click", () => {
    state.caregiverImageDraft = null;
    fileInput.value = "";
    renderPreview();
  });

  sendBtn.addEventListener("click", async () => {
    if (!state.caregiverImageDraft?.dataUrl) {
      status.textContent = "Choose a photo first.";
      return;
    }
    try {
      await queueImageMessage(
        state.caregiverImageDraft.dataUrl,
        "caregiver",
        state.appliedDadUI.imageSize || "medium"
      );
      state.caregiverImageDraft = null;
      fileInput.value = "";
      await loadMessages();
      render();
    } catch (err) {
      status.textContent = `Send failed: ${String(err.message || err)}`;
    }
  });

  renderPreview();
}

function wireThreadMessageActions(threadEl) {
  const LONG_PRESS_MS = 550;
  const LONG_PRESS_MOVE_PX = 12;
  let longPressTimer = null;
  let pressStartX = 0;
  let pressStartY = 0;
  let pressMessageId = null;
  let suppressContextMenuUntil = 0;

  const clearLongPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    pressMessageId = null;
  };

  threadEl.addEventListener("contextmenu", (event) => {
    const bubble = event.target.closest(".bubble[data-message-id]");
    if (!bubble) return;
    event.preventDefault();
    if (Date.now() < suppressContextMenuUntil) return;
    const messageId = bubble.dataset.messageId;
    const msg = state.messages.find((m) => m.id === messageId);
    if (!msg) return;
    openMessageContextMenu(event.clientX, event.clientY, msg);
  });

  threadEl.addEventListener("pointerdown", (event) => {
    const bubble = event.target.closest(".bubble[data-message-id]");
    if (!bubble) return;
    if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
    clearLongPress();
    pressStartX = event.clientX;
    pressStartY = event.clientY;
    pressMessageId = bubble.dataset.messageId;
    longPressTimer = setTimeout(() => {
      const msg = state.messages.find((m) => m.id === pressMessageId);
      if (!msg) return;
      suppressContextMenuUntil = Date.now() + 800;
      openMessageContextMenu(pressStartX, pressStartY, msg);
      clearLongPress();
    }, LONG_PRESS_MS);
  });

  threadEl.addEventListener("pointermove", (event) => {
    if (!longPressTimer) return;
    const dx = Math.abs(event.clientX - pressStartX);
    const dy = Math.abs(event.clientY - pressStartY);
    if (dx > LONG_PRESS_MOVE_PX || dy > LONG_PRESS_MOVE_PX) {
      clearLongPress();
    }
  });

  threadEl.addEventListener("pointerup", clearLongPress);
  threadEl.addEventListener("pointercancel", clearLongPress);
  threadEl.addEventListener("pointerleave", clearLongPress);
}

function getAlertEnableUiState() {
  if (typeof Notification === "undefined") {
    return { label: "Alerts unsupported", disabled: true };
  }
  const permission = Notification.permission;
  if (permission === "denied") {
    return { label: "Alerts blocked", disabled: true };
  }
  if (permission !== "granted") {
    return { label: "Enable alerts", disabled: false };
  }
  if (!swRegistration || !("PushManager" in window)) {
    return { label: "Push unavailable", disabled: true };
  }
  if (state.pushSubscribed) {
    return { label: "Alerts enabled", disabled: true };
  }
  return { label: "Enable alerts", disabled: false };
}

function maybeRequestDadAlertPermission() {
  if (state.role !== "dad") return;
  if (state.appliedDadUI?.alertsEnabled === false) return;
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "default") return;
  if (localStorage.getItem(DAD_ALERT_PROMPTED_KEY) === "1") return;
  localStorage.setItem(DAD_ALERT_PROMPTED_KEY, "1");
  Notification.requestPermission().catch(() => {
    // noop
  });
}

async function enablePushAlerts() {
  if (typeof Notification === "undefined") return;
  if (!("PushManager" in window)) {
    alert("Push is not supported in this browser.");
    return;
  }
  try {
    if (Notification.permission === "default") {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return;
    }
    if (Notification.permission !== "granted") return;
    const registration = await ensureServiceWorkerRegistration();
    if (!registration) {
      alert("Service worker is unavailable. Cannot enable push alerts.");
      return;
    }
    const vapidPublicKey = String(config.PUSH_VAPID_PUBLIC_KEY || "").trim();
    if (!vapidPublicKey) {
      alert("Missing PUSH_VAPID_PUBLIC_KEY in config.js");
      return;
    }
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ||
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      }));
    await savePushSubscription(subscription);
    state.pushSubscribed = true;
  } catch (err) {
    console.warn("Enable push alerts failed", err);
    alert(`Enable alerts failed: ${String(err?.message || err)}`);
  }
}

async function savePushSubscription(subscription) {
  if (!supabase || !state.conversationId || !subscription) return;
  const payload = subscription.toJSON();
  const endpoint = payload.endpoint || "";
  const p256dh = payload.keys?.p256dh || "";
  const auth = payload.keys?.auth || "";
  if (!endpoint || !p256dh || !auth) {
    throw new Error("Push subscription is missing endpoint/keys.");
  }
  const platform = detectPushPlatform();
  const userAgent = navigator.userAgent || "";
  const { error } = await supabase.rpc("save_push_subscription", {
    p_conversation_id: state.conversationId,
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: userAgent,
    p_platform: platform,
  });
  if (error) throw new Error(error.message);
}

function detectPushPlatform() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macos";
  if (/Android/i.test(ua)) return "android";
  return "web";
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function dismissMessageContextMenu() {
  if (activeMessageMenu) {
    activeMessageMenu.remove();
    activeMessageMenu = null;
  }
  if (activeMenuOutsideHandler) {
    document.removeEventListener("pointerdown", activeMenuOutsideHandler, true);
    activeMenuOutsideHandler = null;
  }
  if (activeMenuEscapeHandler) {
    document.removeEventListener("keydown", activeMenuEscapeHandler, true);
    activeMenuEscapeHandler = null;
  }
}

function openMessageContextMenu(x, y, msg) {
  dismissMessageContextMenu();
  const menu = document.createElement("div");
  menu.className = "message-context-menu";

  const status = document.createElement("div");
  status.className = "menu-title";
  status.textContent = truncate(msg.content || "[Image message]", 48);
  menu.appendChild(status);

  const addAction = (label, action, danger = false) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = label;
    if (danger) btn.classList.add("danger");
    btn.addEventListener("click", async () => {
      dismissMessageContextMenu();
      try {
        await action();
      } catch (err) {
        alert(String(err?.message || err || "Action failed"));
      }
    });
    menu.appendChild(btn);
  };

  addAction("Edit", async () => {
    const next = prompt("Edit message text", msg.content || "");
    if (next == null) return;
    await editMessage(msg.id, next.trim());
    await loadMessages();
    render();
  });

  const hideLabel = msg.hidden_for_dad ? "Unhide from Dad" : "Hide from Dad";
  addAction(hideLabel, async () => {
    await hideMessageForDad(msg.id, !msg.hidden_for_dad);
    await loadMessages();
    render();
  });

  addAction(
    "Delete permanently",
    async () => {
      const ok = confirm("Delete this message permanently?");
      if (!ok) return;
      await deleteMessage(msg.id);
      await loadMessages();
      render();
    },
    true
  );

  document.body.appendChild(menu);
  activeMessageMenu = menu;
  menu.style.left = `${x}px`;
  menu.style.top = `${y}px`;

  const rect = menu.getBoundingClientRect();
  const paddedX = Math.max(8, Math.min(x, window.innerWidth - rect.width - 8));
  const paddedY = Math.max(8, Math.min(y, window.innerHeight - rect.height - 8));
  menu.style.left = `${paddedX}px`;
  menu.style.top = `${paddedY}px`;

  activeMenuOutsideHandler = (event) => {
    if (activeMessageMenu && !activeMessageMenu.contains(event.target)) {
      dismissMessageContextMenu();
    }
  };
  activeMenuEscapeHandler = (event) => {
    if (event.key === "Escape") {
      dismissMessageContextMenu();
    }
  };
  document.addEventListener("pointerdown", activeMenuOutsideHandler, true);
  document.addEventListener("keydown", activeMenuEscapeHandler, true);
}

function wireDadUiPane(root) {
  const fontScale = root.getElementById("fontScale");
  const uiFontScale = root.getElementById("dadUiFontScale");
  const theme = root.getElementById("theme");
  const bubbleWidth = root.getElementById("bubbleWidth");
  const dadAlertsEnabled = root.getElementById("dadAlertsEnabled");
  const previewBtn = root.getElementById("previewSettings");
  const applyBtn = root.getElementById("applySettings");
  const note = root.getElementById("previewNote");
  const previewThread = root.getElementById("dadUiPreviewThread");
  if (
    !fontScale ||
    !uiFontScale ||
    !theme ||
    !bubbleWidth ||
    !dadAlertsEnabled ||
    !previewBtn ||
    !applyBtn ||
    !note
  )
    return;

  const currentDraft = state.previewDadUI || { ...state.appliedDadUI };
  fontScale.value = String(currentDraft.fontScale);
  uiFontScale.value = String(currentDraft.uiFontScale || 16);
  theme.value = currentDraft.theme;
  bubbleWidth.value = String(currentDraft.bubbleWidth);
  dadAlertsEnabled.value = currentDraft.alertsEnabled === false ? "0" : "1";

  const saveDraftFromControls = () => {
    state.previewDadUI = {
      fontScale: Number(fontScale.value),
      uiFontScale: Number(uiFontScale.value),
      theme: theme.value,
      bubbleWidth: Number(bubbleWidth.value),
      imageSize: state.appliedDadUI.imageSize || "medium",
      alertsEnabled: dadAlertsEnabled.value !== "0",
    };
    localStorage.setItem(DAD_UI_DRAFT_KEY, JSON.stringify(state.previewDadUI));
  };

  const updatePreview = () => {
    if (!previewThread || !state.previewDadUI) return;
    applyDadUiTokens(previewThread, state.previewDadUI);
  };

  fontScale.addEventListener("input", () => {
    saveDraftFromControls();
    updatePreview();
    note.textContent = "Draft updated. Click 'Apply to Dad' when ready.";
  });
  uiFontScale.addEventListener("input", () => {
    saveDraftFromControls();
    updatePreview();
    note.textContent = "Draft updated. Click 'Apply to Dad' when ready.";
  });
  theme.addEventListener("change", () => {
    saveDraftFromControls();
    updatePreview();
    note.textContent = "Draft updated. Click 'Apply to Dad' when ready.";
  });
  bubbleWidth.addEventListener("input", () => {
    saveDraftFromControls();
    updatePreview();
    note.textContent = "Draft updated. Click 'Apply to Dad' when ready.";
  });
  dadAlertsEnabled.addEventListener("change", () => {
    saveDraftFromControls();
    note.textContent = "Draft updated. Click 'Apply to Dad' when ready.";
  });
  previewBtn.addEventListener("click", () => {
    saveDraftFromControls();
    updatePreview();
    note.textContent =
      "Preview shown above. These changes are not live for Dad until you click 'Apply to Dad'.";
  });

  applyBtn.addEventListener("click", async () => {
    if (!state.previewDadUI) {
      note.textContent = "Set your draft first, then click Preview.";
      return;
    }
    try {
      saveDraftFromControls();
      if (supabase && state.conversationId) {
        const { error: saveErr } = await saveDadUiDraftCompat();
        if (saveErr) throw saveErr;
        const { error: applyErr } = await supabase.rpc("apply_dad_ui_draft", {
          p_conversation_id: state.conversationId,
        });
        if (applyErr) throw applyErr;
        const { error: uiFontErr } = await saveDadUiFontScaleCompat();
        if (uiFontErr) throw uiFontErr;
      }
      state.appliedDadUI = { ...state.previewDadUI };
      localStorage.setItem(DAD_UI_KEY, JSON.stringify(state.appliedDadUI));
      enforceRoleLock();
      note.textContent = "Applied to Dad.";
    } catch (err) {
      note.textContent = `Apply failed: ${err.message}`;
    }
  });

  updatePreview();
}

async function saveDadUiFontScaleCompat() {
  const payload = {
    p_conversation_id: state.conversationId,
    p_ui_font_scale: Number(state.previewDadUI?.uiFontScale || 16),
  };
  const v1 = await supabase.rpc("save_dad_ui_font_scale", payload);
  if (!v1.error) return v1;

  const msg = String(v1.error.message || "").toLowerCase();
  const missingSig = msg.includes("could not find the function") || msg.includes("schema cache");
  if (!missingSig) return v1;

  return {
    data: null,
    error: new Error(
      "Dad UI font sync needs SQL update: run save_dad_ui_font_scale migration in Supabase."
    ),
  };
}

function wireCaregiverUiPane(root) {
  const fontScale = root.getElementById("caregiverFontScale");
  const uiFontScale = root.getElementById("caregiverUiFontScale");
  const theme = root.getElementById("caregiverTheme");
  const bubbleWidth = root.getElementById("caregiverBubbleWidth");
  const applyBtn = root.getElementById("applyCaregiverUi");
  const status = root.getElementById("caregiverUiStatus");
  if (!fontScale || !uiFontScale || !theme || !bubbleWidth || !applyBtn || !status) return;

  fontScale.value = String(state.caregiverUI.fontScale || 18);
  uiFontScale.value = String(state.caregiverUI.uiFontScale || 16);
  theme.value = state.caregiverUI.theme || "clear";
  bubbleWidth.value = String(state.caregiverUI.bubbleWidth || 84);

  applyBtn.addEventListener("click", () => {
    state.caregiverUI = {
      fontScale: Number(fontScale.value),
      uiFontScale: Number(uiFontScale.value),
      theme: theme.value,
      bubbleWidth: Number(bubbleWidth.value),
    };
    localStorage.setItem(CAREGIVER_UI_KEY, JSON.stringify(state.caregiverUI));
    status.textContent = "Applied to caregiver view.";
    render();
  });
}

async function saveDadUiDraftCompat() {
  const payloadV2 = {
    p_conversation_id: state.conversationId,
    p_font_scale: state.previewDadUI.fontScale,
    p_theme: state.previewDadUI.theme,
    p_bubble_width: state.previewDadUI.bubbleWidth,
    p_image_default_size: state.previewDadUI.imageSize || "medium",
    p_role_lock_enabled: state.roleLockEnabled,
    p_alerts_enabled: state.previewDadUI.alertsEnabled !== false,
  };
  const v2 = await supabase.rpc("save_dad_ui_draft", payloadV2);
  if (!v2.error) return v2;

  const msg = String(v2.error.message || "").toLowerCase();
  const missingSig = msg.includes("could not find the function") || msg.includes("schema cache");
  if (!missingSig) return v2;

  // Backward-compatible fallback for older deployed schema without role lock arg.
  const payloadV1 = {
    p_conversation_id: state.conversationId,
    p_font_scale: state.previewDadUI.fontScale,
    p_theme: state.previewDadUI.theme,
    p_bubble_width: state.previewDadUI.bubbleWidth,
    p_image_default_size: state.previewDadUI.imageSize || "medium",
  };
  return supabase.rpc("save_dad_ui_draft", payloadV1);
}

function wireAiRulesPane(root) {
  const trustLevel = root.getElementById("trustLevel");
  const delaySeconds = root.getElementById("delaySeconds");
  const save = root.getElementById("saveRules");
  const status = root.getElementById("rulesStatus");
  if (!trustLevel || !delaySeconds || !save || !status) return;

  trustLevel.value = String(state.trustRules.trustLevel ?? 1);
  delaySeconds.value = String(state.trustRules.delaySeconds ?? Number(config.DEFAULT_DELAY_SECONDS || 180));

  save.addEventListener("click", async () => {
    const nextLevel = Number(trustLevel.value);
    const nextDelay = Number(delaySeconds.value);
    const maxDelay = Number(config.MAX_DELAY_SECONDS || 900);
    if (nextDelay < 30 || nextDelay > maxDelay) {
      status.textContent = `Delay must be 30-${maxDelay} seconds.`;
      return;
    }
    try {
      if (supabase && state.conversationId) {
        const { error } = await supabase.rpc("save_trust_rules", {
          p_conversation_id: state.conversationId,
          p_trust_level: nextLevel,
          p_delayed_auto_seconds: nextDelay,
          p_checklist_confirmed: nextLevel < 3 ? true : true,
        });
        if (error) throw error;
      }
      state.trustRules = { trustLevel: nextLevel, delaySeconds: nextDelay };
      localStorage.setItem(TRUST_KEY, JSON.stringify(state.trustRules));
      status.textContent = "Trust rules saved.";
    } catch (err) {
      status.textContent = `Failed to save rules: ${err.message}`;
    }
  });
}

function renderBubble(msg, options = {}) {
  const viewerRole = options.viewerRole || state.role;
  const isHiddenForDadInCaregiverView = viewerRole === "caregiver" && msg.hidden_for_dad;
  const bubble = document.createElement("article");
  bubble.className = `bubble ${msg.sender_role === "caregiver" ? "me" : ""}`;
  if (isHiddenForDadInCaregiverView) {
    bubble.classList.add("hidden-for-dad-muted");
  }
  if (viewerRole === "caregiver") {
    bubble.classList.add("is-actionable");
  }
  bubble.dataset.messageId = msg.id;
  if (msg._cache_image_omitted && !msg.image_url) {
    bubble.textContent = "[Photo — wait for sync or reload the page]";
  } else if (msg.image_url) {
    const img = document.createElement("img");
    const imageSize = msg.image_size || "medium";
    img.className = `bubble-image size-${imageSize}`;
    img.src = msg.image_url;
    img.alt = "Shared photo";
    bubble.appendChild(img);
    if (msg.content) {
      const text = document.createElement("div");
      text.textContent = msg.content;
      bubble.appendChild(text);
    }
  } else if (msg.content) {
    bubble.textContent = msg.content;
  } else {
    bubble.textContent = `[Image] (${msg.image_size || "medium"})`;
  }
  const meta = document.createElement("div");
  meta.className = "meta";
  const hidden = msg.hidden_for_dad ? " hidden-for-dad" : "";
  meta.textContent = `${senderLabel(msg.sender_role)} · ${formatTime(msg.created_at)}${hidden}`;
  bubble.appendChild(meta);
  return bubble;
}

function getPendingOutboxMessagesForRole(viewerRole) {
  if (!Array.isArray(state.outbox) || !state.outbox.length) return [];
  const now = Date.now();
  return state.outbox
    .filter((m) => {
      if (!m || !m.sender_role) return false;
      if (viewerRole === "dad" && m.sender_role !== "dad") return false;
      if (viewerRole === "caregiver" && m.sender_role !== "caregiver") return false;
      return m.status === "sending" || m.status === "failed";
    })
    .map((m) => ({
      ...m,
      created_at: m.created_at || new Date(now).toISOString(),
    }))
    .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")));
}

function renderPendingBubble(msg) {
  const bubble = document.createElement("article");
  bubble.className = `bubble ${msg.sender_role === "caregiver" ? "me" : ""}`;
  bubble.classList.add("pending");
  if (msg.image_url) {
    const img = document.createElement("img");
    const imageSize = msg.image_size || "medium";
    img.className = `bubble-image size-${imageSize}`;
    img.src = msg.image_url;
    img.alt = "Pending shared photo";
    bubble.appendChild(img);
    if (msg.content) {
      const text = document.createElement("div");
      text.textContent = msg.content;
      bubble.appendChild(text);
    }
  } else if (msg.content) {
    bubble.textContent = msg.content;
  } else {
    bubble.textContent = "[Pending message]";
  }
  const meta = document.createElement("div");
  meta.className = "meta";
  const label = msg.status === "failed" ? "failed, will retry" : "sending";
  meta.textContent = `${senderLabel(msg.sender_role)} · ${formatTime(msg.created_at)} · ${label}`;
  bubble.appendChild(meta);
  return bubble;
}

function applyDadUiTokens(threadEl, prefs) {
  threadEl.style.fontSize = `${prefs.fontScale || 22}px`;
  threadEl.style.setProperty("--dad-bubble-width", `${prefs.bubbleWidth || 80}%`);
  if (prefs.theme === "dark") {
    threadEl.style.background = "#111827";
    threadEl.style.color = "#f9fafb";
  } else if (prefs.theme === "warm") {
    threadEl.style.background = "#fffaf0";
    threadEl.style.color = "#1f2937";
  }
}

function applyCaregiverUiTokens(threadEl, prefs) {
  threadEl.style.fontSize = `${prefs.fontScale || 18}px`;
  threadEl.style.setProperty("--dad-bubble-width", `${prefs.bubbleWidth || 84}%`);
  if (prefs.theme === "dark") {
    threadEl.style.background = "#0f172a";
    threadEl.style.color = "#f9fafb";
  } else if (prefs.theme === "warm") {
    threadEl.style.background = "#fffaf0";
    threadEl.style.color = "#1f2937";
  } else {
    threadEl.style.background = "#eff6ff";
    threadEl.style.color = "#0f172a";
  }
}

function applyUiFontScale(panelEl, fontSize, fallback) {
  if (!panelEl) return;
  panelEl.style.fontSize = `${Number(fontSize || fallback || 16)}px`;
}

function emitDadTypingStatus(isTyping, force = false) {
  if (!supabase || !state.session || !state.conversationId) return;
  const isDadActor = state.profile?.role === "dad" || state.roleHint === "dad";
  if (!isDadActor) return;
  if (!force && isTyping === state.lastDadTypingValue && Date.now() - state.lastDadTypingEmitAt < 1500)
    return;
  state.lastDadTypingEmitAt = Date.now();
  state.lastDadTypingValue = isTyping;
  supabase
    .from("activity_events")
    .insert({
      conversation_id: state.conversationId,
      event_type: "dad_typing",
      payload: { typing: Boolean(isTyping) },
    })
    .then(({ error }) => {
      if (error) console.warn("dad_typing emit failed", error.message);
    });
}

function primeInboundMessageMarkers() {
  const latestDad = getLatestMessageByRole(state.messages, "dad");
  if (!state.lastDadMessageAt || !state.lastDadMessageId) {
    if (latestDad) {
      state.lastDadMessageAt = latestDad.created_at || "";
      state.lastDadMessageId = latestDad.id || "";
      localStorage.setItem(DAD_LAST_MSG_AT_KEY, state.lastDadMessageAt);
      localStorage.setItem(DAD_LAST_MSG_ID_KEY, state.lastDadMessageId);
    }
  }
  const latestCaregiver = getLatestMessageByRole(state.messages, "caregiver");
  if (!state.lastCaregiverMessageAt || !state.lastCaregiverMessageId) {
    if (latestCaregiver) {
      state.lastCaregiverMessageAt = latestCaregiver.created_at || "";
      state.lastCaregiverMessageId = latestCaregiver.id || "";
      localStorage.setItem(CAREGIVER_LAST_MSG_AT_KEY, state.lastCaregiverMessageAt);
      localStorage.setItem(CAREGIVER_LAST_MSG_ID_KEY, state.lastCaregiverMessageId);
    }
  }
}

function getLatestMessageByRole(messages, senderRole) {
  if (!Array.isArray(messages) || !messages.length) return null;
  let latest = null;
  for (const msg of messages) {
    if (msg.sender_role !== senderRole) continue;
    if (!latest) {
      latest = msg;
      continue;
    }
    const nextAt = msg.created_at || "";
    const latestAt = latest.created_at || "";
    if (nextAt > latestAt || (nextAt === latestAt && String(msg.id) > String(latest.id))) {
      latest = msg;
    }
  }
  return latest;
}

function hasNewMessageSinceMarker(msg, savedAt, savedId) {
  if (!msg) return false;
  const currentAt = msg.created_at || "";
  const currentId = String(msg.id || "");
  if (!savedAt) return true;
  return currentAt > savedAt || (currentAt === savedAt && currentId > savedId);
}

function handleInboundAlerts(beforeMessages, afterMessages) {
  if (state.role === "caregiver") {
    handleCaregiverInboundAlerts(beforeMessages, afterMessages);
  } else if (state.role === "dad") {
    handleDadInboundFromCaregiver(beforeMessages, afterMessages);
  }
}

function handleCaregiverInboundAlerts(beforeMessages, afterMessages) {
  if (state.role !== "caregiver") return;
  const latestBefore = getLatestMessageByRole(beforeMessages, "dad");
  const latestAfter = getLatestMessageByRole(afterMessages, "dad");
  if (!latestAfter) return;
  if (latestBefore && latestBefore.id === latestAfter.id) return;
  if (!hasNewMessageSinceMarker(latestAfter, state.lastDadMessageAt, String(state.lastDadMessageId)))
    return;

  state.lastDadMessageAt = latestAfter.created_at || "";
  state.lastDadMessageId = latestAfter.id || "";
  localStorage.setItem(DAD_LAST_MSG_AT_KEY, state.lastDadMessageAt);
  localStorage.setItem(DAD_LAST_MSG_ID_KEY, state.lastDadMessageId);

  const preview = truncate(latestAfter.content || "[Image message]", 120);
  state.dadAlertUnreadCount += 1;
  state.dadAlertText = preview;
  playDadAlertSound();
  showSystemNotification("Dad sent a message", preview, "dad-inbound-alert");
}

function handleDadInboundFromCaregiver(beforeMessages, afterMessages) {
  if (state.role !== "dad") return;
  if (state.appliedDadUI?.alertsEnabled === false) return;
  const latestBefore = getLatestMessageByRole(beforeMessages, "caregiver");
  const latestAfter = getLatestMessageByRole(afterMessages, "caregiver");
  if (!latestAfter) return;
  if (latestBefore && latestBefore.id === latestAfter.id) return;
  if (
    !hasNewMessageSinceMarker(
      latestAfter,
      state.lastCaregiverMessageAt,
      String(state.lastCaregiverMessageId)
    )
  )
    return;

  state.lastCaregiverMessageAt = latestAfter.created_at || "";
  state.lastCaregiverMessageId = latestAfter.id || "";
  localStorage.setItem(CAREGIVER_LAST_MSG_AT_KEY, state.lastCaregiverMessageAt);
  localStorage.setItem(CAREGIVER_LAST_MSG_ID_KEY, state.lastCaregiverMessageId);

  const preview = truncate(latestAfter.content || "[Image message]", 120);
  playDadAlertSound();
  showSystemNotification("Tony sent a message", preview, "caregiver-inbound-alert");
}

async function loadDadTypingStatus() {
  if (!supabase || !state.session || !state.conversationId || state.role !== "caregiver") return;
  const { data, error } = await supabase
    .from("activity_events")
    .select("payload, created_at")
    .eq("conversation_id", state.conversationId)
    .eq("event_type", "dad_typing")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return;
  if (!data) {
    state.dadTyping = false;
    return;
  }
  const isTyping = Boolean(data?.payload?.typing);
  const ageMs = Date.now() - new Date(data.created_at).getTime();
  state.dadTyping = isTyping && ageMs <= 8000;
}

function showSystemNotification(title, preview, tag) {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, {
      body: preview,
      tag: tag || "carechat-inbound-alert",
      renotify: true,
      requireInteraction: true,
    });
  } catch (err) {
    console.warn("System notification failed", err);
  }
}

function playDadAlertSound() {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const beep = (time, freq, dur) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.exponentialRampToValueAtTime(0.15, time + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(time);
      osc.stop(time + dur + 0.02);
    };
    beep(now, 880, 0.18);
    beep(now + 0.24, 1175, 0.2);
    setTimeout(() => {
      try {
        ctx.close();
      } catch {
        // noop
      }
    }, 1000);
  } catch {
    // noop
  }
}

async function loadMessages() {
  if (supabase && state.session) {
    await ensureConversation();
  }
  if (supabase) {
    if (!state.conversationId) {
      console.warn("loadMessages: no conversation id yet");
      return;
    }
    // Newest first + limit, then reverse for display. Ascending + limit(200) only returned the
    // *oldest* 200 rows — new messages vanished from the UI while push still saw them in the DB.
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", state.conversationId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      // Never replace live state with disk cache on failure — carechat.local_messages can lag
      // behind the server (e.g. after delete). That made deleted bubbles reappear and the next
      // delete hit "Message not found" because the row was already gone.
      console.warn("Remote load failed; keeping in-memory messages (not stale local cache).", error);
      if (!Array.isArray(state.messages) || state.messages.length === 0) {
        state.messages = readJson(LOCAL_MSG_KEY, []);
      }
      return;
    }

    // Avoid wiping the thread: some clients return data: null with no error on odd failures.
    if (data == null) {
      console.warn("Messages query returned no data array; keeping prior messages.");
      if (!Array.isArray(state.messages) || state.messages.length === 0) {
        state.messages = readJson(LOCAL_MSG_KEY, []);
      }
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    state.messages = [...rows].reverse();
    persistMessagesCache(state.messages);
    return;
  }
  state.messages = readJson(LOCAL_MSG_KEY, []);
}

/** Put server row into state after insert so the thread updates even if the next SELECT fails. */
function mergeServerMessageIntoState(row) {
  if (!row || !row.id) return;
  const rid = String(row.id);
  const cid = String(row.client_msg_id || "");
  const next = state.messages.filter((m) => {
    if (String(m.id) === rid) return false;
    if (cid && String(m.client_msg_id || "") === cid) return false;
    return true;
  });
  next.push(row);
  state.messages = next.sort((a, b) =>
    String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );
  persistMessagesCache(state.messages);
}

async function queueMessage(content, senderRole) {
  if (supabase && state.session) {
    try {
      await ensureConversation();
    } catch (err) {
      // Do not block send on transient re-join failure if we already have a conversation id.
      if (!state.conversationId) throw err;
      console.warn("ensureConversation failed during queueMessage; using existing conversation id.", err);
    }
  }
  const message = {
    id: crypto.randomUUID(),
    client_msg_id: crypto.randomUUID(),
    conversation_id: state.conversationId,
    sender_role: senderRole,
    content,
    image_url: null,
    image_size: null,
    hidden_for_dad: false,
    created_at: new Date().toISOString(),
    status: "sending",
  };
  state.outbox.push(message);
  persistOutbox();
  await syncOutboxOnce();
}

async function queueImageMessage(imageUrl, senderRole, imageSize) {
  if (supabase && state.session) {
    try {
      await ensureConversation();
    } catch (err) {
      if (!state.conversationId) throw err;
      console.warn(
        "ensureConversation failed during queueImageMessage; using existing conversation id.",
        err
      );
    }
  }
  let finalImageUrl = imageUrl;
  if (supabase && state.session && USE_STORAGE_FOR_IMAGES && state.conversationId) {
    try {
      finalImageUrl = await uploadImageForMessage(imageUrl, state.conversationId);
    } catch (err) {
      console.warn("Storage upload failed; falling back to inline image payload.", err);
    }
  }
  const message = {
    id: crypto.randomUUID(),
    client_msg_id: crypto.randomUUID(),
    conversation_id: state.conversationId,
    sender_role: senderRole,
    content: "",
    image_url: finalImageUrl,
    image_size: imageSize || "medium",
    hidden_for_dad: false,
    created_at: new Date().toISOString(),
    status: "sending",
  };
  state.outbox.push(message);
  persistOutbox();
  await syncOutboxOnce();
}

async function syncOutboxOnce() {
  let changed = false;
  for (const item of state.outbox) {
    if (item.status === "sent") continue;
    try {
      await sendRemote(item);
      if (item.status !== "sent") {
        item.status = "sent";
        changed = true;
      }
    } catch (err) {
      const nextErr = String(err);
      if (item.status !== "failed" || item.error !== nextErr) {
        item.status = "failed";
        item.error = nextErr;
        changed = true;
      }
    }
  }
  const beforeLength = state.outbox.length;
  state.outbox = state.outbox.filter((x) => x.status !== "sent");
  if (state.outbox.length !== beforeLength) changed = true;
  persistOutbox();
  return changed;
}

async function sendRemote(msg) {
  if (!supabase) {
    const local = readJson(LOCAL_MSG_KEY, []);
    local.push(msg);
    persistMessagesCache(local);
    return;
  }
  if (!msg.conversation_id) {
    throw new Error("No conversation selected for send.");
  }
  const payload = {
    client_msg_id: msg.client_msg_id,
    conversation_id: msg.conversation_id,
    sender_role: msg.sender_role,
    content: msg.content,
    image_url: msg.image_url || null,
    image_size: msg.image_size,
    hidden_for_dad: false,
  };
  const insertOnce = async () =>
    supabase.from("messages").insert(payload).select("*").maybeSingle();
  let { data: insertedRow, error } = await insertOnce();
  if (error && isAbortLikeError(error)) {
    const existingAfterAbort = await loadExistingMessageByClientMsgId(
      msg.conversation_id,
      msg.client_msg_id
    );
    if (existingAfterAbort) {
      mergeServerMessageIntoState(existingAfterAbort);
      return;
    }
    const retryAbort = await insertOnce();
    error = retryAbort.error;
    insertedRow = retryAbort.data;
  }
  if (error && shouldRetryAfterMembershipRepair(error)) {
    await ensureConversationMembership(msg.conversation_id);
    const retry = await insertOnce();
    error = retry.error;
    insertedRow = retry.data;
  }
  if (error && isClientMsgIdUniqueViolation(error)) {
    const existing = await loadExistingMessageByClientMsgId(
      msg.conversation_id,
      msg.client_msg_id
    );
    if (existing) {
      mergeServerMessageIntoState(existing);
      return;
    }
  }
  if (error) {
    const code = error.code ? `[${error.code}] ` : "";
    throw new Error(`${code}${error.message || "Insert failed"}`);
  }

  if (insertedRow) {
    mergeServerMessageIntoState(insertedRow);
  }

  if (msg.sender_role === "dad" && Number(state.trustRules.trustLevel) === 3) {
    const idempotency = crypto.randomUUID();
    const { error: queueErr } = await supabase.rpc("queue_delayed_auto", {
      p_conversation_id: msg.conversation_id,
      p_source_message_id: null,
      p_delay_seconds: Number(state.trustRules.delaySeconds || 180),
      p_idempotency_key: idempotency,
    });
    if (queueErr) {
      console.warn("queue_delayed_auto failed", queueErr.message);
    }
  }
}

function shouldRetryAfterMembershipRepair(error) {
  const code = String(error?.code || "");
  const msg = String(error?.message || "").toLowerCase();
  return (
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("permission denied")
  );
}

/** Insert often succeeds on the server then the client times out — retries hit messages_client_msg_id_key. */
function isClientMsgIdUniqueViolation(error) {
  const code = String(error?.code || "");
  if (code === "23505") return true;
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("client_msg_id") || msg.includes("messages_client_msg_id");
}

async function loadExistingMessageByClientMsgId(conversationId, clientMsgId) {
  if (!supabase || !conversationId || !clientMsgId) return null;
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .eq("client_msg_id", clientMsgId)
    .maybeSingle();
  if (error) return null;
  return data;
}

async function ensureConversationMembership(conversationId) {
  if (!supabase || !conversationId) return;
  const joinRole = state.roleHint === "dad" ? "dad" : "caregiver_admin";
  const { error } = await supabase.rpc("create_or_join_conversation", {
    p_conversation_id: conversationId,
    p_member_role: joinRole,
  });
  if (error) {
    throw new Error(`Membership repair failed: ${error.message}`);
  }
}

async function editMessage(messageId, nextText) {
  if (!nextText) return;
  if (!supabase) {
    const local = readJson(LOCAL_MSG_KEY, []);
    const idx = local.findIndex((m) => m.id === messageId);
    if (idx >= 0) {
      local[idx].content = nextText;
      persistMessagesCache(local);
    }
    return;
  }
  const { error } = await supabase.rpc("caregiver_edit_message", {
    p_message_id: messageId,
    p_next_content: nextText,
    p_hide_for_dad: false,
    p_reason: "caregiver_edit",
  });
  if (error) throw new Error(error.message);
  state.messages = state.messages.map((m) =>
    String(m.id) === String(messageId)
      ? { ...m, content: nextText, hidden_for_dad: false, updated_at: new Date().toISOString() }
      : m
  );
  persistMessagesCache(state.messages);
}

async function hideMessageForDad(messageId, hide) {
  if (!supabase) {
    const local = readJson(LOCAL_MSG_KEY, []);
    const idx = local.findIndex((m) => m.id === messageId);
    if (idx >= 0) {
      local[idx].hidden_for_dad = hide;
      persistMessagesCache(local);
    }
    return;
  }
  const current = state.messages.find((m) => m.id === messageId);
  const nextContent = current?.content || "";
  const { error } = await supabase.rpc("caregiver_edit_message", {
    p_message_id: messageId,
    p_next_content: nextContent,
    p_hide_for_dad: hide,
    p_reason: hide ? "caregiver_hide" : "caregiver_unhide",
  });
  if (error) throw new Error(error.message);
  state.messages = state.messages.map((m) =>
    String(m.id) === String(messageId)
      ? { ...m, hidden_for_dad: Boolean(hide), updated_at: new Date().toISOString() }
      : m
  );
  persistMessagesCache(state.messages);
}

async function deleteMessage(messageId) {
  if (!messageId) return;
  if (!supabase) {
    const local = readJson(LOCAL_MSG_KEY, []);
    const next = local.filter((m) => m.id !== messageId);
    persistMessagesCache(next);
    return;
  }
  const { error } = await supabase.rpc("caregiver_delete_message", {
    p_message_id: messageId,
    p_reason: "caregiver_delete",
  });
  if (error) {
    const msg = String(error.message || "").toLowerCase();
    const missingFn = msg.includes("could not find the function") || msg.includes("schema cache");
    if (missingFn) {
      throw new Error(
        "Delete RPC is not deployed yet. Run the new SQL function migration, then retry."
      );
    }
    throw new Error(error.message);
  }

  const sid = String(messageId);
  state.messages = state.messages.filter((m) => String(m.id) !== sid);
  persistMessagesCache(state.messages);
}

function startOutboxSyncLoop() {
  const ms = Number(config.OUTBOX_SYNC_MS || 5000);
  setInterval(async () => {
    if (state.outboxSyncInFlight) return;
    state.outboxSyncInFlight = true;
    try {
      const changed = await syncOutboxOnce();
      if (
        changed &&
        !state.authRequired &&
        state.role === "caregiver" &&
        !isUserEditingControl()
      ) {
        render();
      }
    } catch (err) {
      console.warn("Outbox sync loop failed", err);
    } finally {
      state.outboxSyncInFlight = false;
    }
  }, ms);
}

function startMessageRefreshLoop() {
  const ms = Number(config.MESSAGE_POLL_MS || 2500);
  setInterval(async () => {
    if (!supabase || !state.session || state.authRequired || !state.conversationId) return;
    if (state.refreshInFlight) return;
    state.refreshInFlight = true;
    try {
      const beforeSig = appStateSignature();
      const beforeMessages = Array.isArray(state.messages) ? [...state.messages] : [];
      await Promise.all([loadMessages(), loadRemoteSettings(), loadDadTypingStatus()]);
      handleInboundAlerts(beforeMessages, state.messages);
      const afterSig = appStateSignature();
      const messagesChanged =
        messagesSignature(beforeMessages) !== messagesSignature(state.messages);
      if (beforeSig !== afterSig && (!isUserEditingControl() || messagesChanged)) {
        render();
      }
    } catch (err) {
      console.warn("Message refresh loop failed", err);
    } finally {
      state.refreshInFlight = false;
    }
  }, ms);
}

function isDadRoleLocked() {
  return Boolean(
    state.roleLockEnabled && (state.profile?.role === "dad" || state.roleHint === "dad")
  );
}

function isAuthedDad() {
  return Boolean(state.session && state.profile?.role === "dad");
}

function enforceRoleLock() {
  if (isDadRoleLocked()) {
    state.role = "dad";
    roleSelect.value = "dad";
    localStorage.setItem(ROLE_KEY, "dad");
  }
  // Keep Dad accounts in Dad view mode and hide the role picker.
  if (isAuthedDad()) {
    state.role = "dad";
    roleSelect.value = "dad";
    localStorage.setItem(ROLE_KEY, "dad");
    if (rolePicker) rolePicker.style.display = "none";
    return;
  }
  if (rolePicker) rolePicker.style.display = "";
}

function updateAppTitle() {
  if (!appTitle) return;
  const isDadSurface = state.role === "dad";
  const text = isDadSurface ? "Tony Chat" : "Care Chat";
  appTitle.textContent = text;
  document.title = text;
}

function isUserEditingControl() {
  const active = document.activeElement;
  if (!active) return false;
  const tag = active.tagName;
  const interactive = ["INPUT", "TEXTAREA", "SELECT", "BUTTON"].includes(tag);
  if (!interactive) return false;
  return Boolean(active.closest("#app"));
}

async function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  await ensureServiceWorkerRegistration();
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // New service worker took control; refresh to pick latest app shell/module.
    window.location.reload();
  });
}

async function ensureServiceWorkerRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  if (swRegistration) {
    if ("PushManager" in window && Notification.permission === "granted") {
      const sub = await swRegistration.pushManager.getSubscription();
      state.pushSubscribed = Boolean(sub);
    }
    return swRegistration;
  }
  try {
    swRegistration = await navigator.serviceWorker.register("./sw.js");
    if ("PushManager" in window && Notification.permission === "granted") {
      const sub = await swRegistration.pushManager.getSubscription();
      state.pushSubscribed = Boolean(sub);
    }
    return swRegistration;
  } catch (err) {
    console.warn("Service worker register failed", err);
    return null;
  }
}

function bindGlobalInteractionTracking() {
  const mark = () => {
    state.lastInteractionAt = Date.now();
  };
  window.addEventListener("pointerdown", mark, { passive: true });
  window.addEventListener("touchstart", mark, { passive: true });
  window.addEventListener("keydown", mark, { passive: true });
  window.addEventListener("scroll", mark, { passive: true });
}

function shouldApplyUpdateNow() {
  const idleMs = Date.now() - state.lastInteractionAt;
  return document.visibilityState === "hidden" || idleMs >= APP_UPDATE_IDLE_RELOAD_MS;
}

function activateWaitingServiceWorker(registration) {
  if (!registration?.waiting) return false;
  registration.waiting.postMessage({ type: "SKIP_WAITING" });
  return true;
}

function setupAppUpdatePolling() {
  if (!("serviceWorker" in navigator)) return;

  const checkForUpdate = async () => {
    try {
      const reg = await ensureServiceWorkerRegistration();
      if (!reg) return;
      await reg.update();
      if (reg.waiting && shouldApplyUpdateNow()) {
        activateWaitingServiceWorker(reg);
      }
    } catch (err) {
      console.warn("Update poll failed", err);
    }
  };

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    await checkForUpdate();
  });

  setInterval(checkForUpdate, APP_UPDATE_CHECK_MS);
}

function outboxSummary() {
  const sending = state.outbox.filter((x) => x.status === "sending").length;
  const failedItems = state.outbox.filter((x) => x.status === "failed");
  const failed = failedItems.length;
  const mode = supabase ? "remote" : "local";
  if (!failed) return `Outbox (${mode}): ${sending} sending, ${failed} failed`;
  const latestErr = String(failedItems[failedItems.length - 1]?.error || "")
    .replace(/\s+/g, " ")
    .slice(0, 120);
  return `Outbox (${mode}): ${sending} sending, ${failed} failed. Last error: ${latestErr}`;
}

function messagesSignature(messages) {
  if (!Array.isArray(messages) || !messages.length) return "empty";
  return messages
    .map((msg) => {
      const ts = msg.updated_at || msg.created_at || "";
      const hidden = msg.hidden_for_dad ? 1 : 0;
      const content = msg.content || "";
      const image = msg.image_url || "";
      const imageSize = msg.image_size || "";
      return `${msg.id}|${ts}|${hidden}|${content}|${image}|${imageSize}`;
    })
    .join("||");
}

function scrollThreadToBottom(threadEl) {
  if (!threadEl) return;
  requestAnimationFrame(() => {
    threadEl.scrollTop = threadEl.scrollHeight;
  });
}

function isThreadNearBottom(threadEl) {
  if (!threadEl) return true;
  const threshold = 36;
  const distance = threadEl.scrollHeight - threadEl.scrollTop - threadEl.clientHeight;
  return distance <= threshold;
}

function dadUiSignature(ui) {
  if (!ui) return "none";
  return `${ui.fontScale || 22}|${ui.uiFontScale || 16}|${ui.theme || "high-contrast"}|${
    ui.bubbleWidth || 80
  }|${ui.imageSize || "medium"}|${ui.alertsEnabled === false ? 0 : 1}`;
}

function trustRulesSignature(rules) {
  if (!rules) return "none";
  return `${rules.trustLevel || 1}|${rules.delaySeconds || 180}|${
    rules.level3ChecklistConfirmed ? 1 : 0
  }`;
}

function appStateSignature() {
  return [
    messagesSignature(state.messages),
    dadUiSignature(state.appliedDadUI),
    trustRulesSignature(state.trustRules),
    state.dadTyping ? "typing" : "idle",
    String(state.dadAlertUnreadCount || 0),
  ].join("||");
}

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

const LOCAL_MSG_IMAGE_CACHE_MAX_CHARS = 24_000;

/** Avoid QuotaExceededError: huge data URLs in the thread exceed typical 5MB localStorage limits. */
function persistMessagesCache(messages) {
  if (!Array.isArray(messages)) return;
  const lite = messages.map((m) => {
    const u = m.image_url;
    if (typeof u === "string" && u.length > LOCAL_MSG_IMAGE_CACHE_MAX_CHARS) {
      return { ...m, image_url: null, _cache_image_omitted: true };
    }
    return m;
  });
  try {
    localStorage.setItem(LOCAL_MSG_KEY, JSON.stringify(lite));
  } catch (e) {
    const q =
      e?.name === "QuotaExceededError" || e?.code === 22 || String(e?.message || "").includes("quota");
    if (!q) {
      console.warn("Could not persist message cache.", e);
      return;
    }
    try {
      localStorage.removeItem(LOCAL_MSG_KEY);
      const minimal = lite.map((m) => ({
        id: m.id,
        client_msg_id: m.client_msg_id,
        conversation_id: m.conversation_id,
        sender_role: m.sender_role,
        content: m.content,
        image_size: m.image_size,
        hidden_for_dad: m.hidden_for_dad,
        created_at: m.created_at,
        updated_at: m.updated_at,
        _cache_image_omitted: Boolean(m._cache_image_omitted || m.image_url),
      }));
      localStorage.setItem(LOCAL_MSG_KEY, JSON.stringify(minimal));
    } catch (e2) {
      console.warn("Message cache still too large for localStorage; skipping disk cache.", e2);
    }
  }
}

function persistOutbox() {
  try {
    localStorage.setItem(OUTBOX_KEY, JSON.stringify(state.outbox));
  } catch (e) {
    console.warn("Outbox persistence failed; keeping in-memory outbox only.", e);
    try {
      localStorage.removeItem(OUTBOX_KEY);
    } catch {
      // noop
    }
    if (!state.outboxStorageWarned) {
      state.outboxStorageWarned = true;
      alert(
        "Storage is full on this device. Messages may still send now, but queued retries may be lost if the app closes."
      );
    }
  }
}

function showFatalStartupError(err) {
  const message = String(err?.message || err || "Unknown startup error");
  if (!appRoot) {
    alert(`Startup failed: ${message}`);
    return;
  }
  appRoot.innerHTML = `
    <section class="panel">
      <h2>App failed to start</h2>
      <p class="subtext">${message.replace(/[<>&]/g, "")}</p>
      <div class="row auth-actions">
        <button id="startupReload" type="button">Reload app</button>
        <button id="startupCloud" type="button">Retry cloud mode</button>
        <button id="startupLocal" type="button">Open local mode</button>
      </div>
    </section>
  `;
  const reload = document.getElementById("startupReload");
  const cloud = document.getElementById("startupCloud");
  const local = document.getElementById("startupLocal");
  if (reload) reload.addEventListener("click", () => window.location.reload());
  if (cloud) {
    cloud.addEventListener("click", () => {
      const base = `${window.location.origin}${window.location.pathname}`;
      window.location.href = `${base}?cloud=1`;
    });
  }
  if (local) {
    local.addEventListener("click", () => {
      const base = `${window.location.origin}${window.location.pathname}`;
      window.location.href = `${base}?local=1`;
    });
  }
}

function formatTime(iso) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function truncate(value, n) {
  if (!value) return "";
  return value.length > n ? `${value.slice(0, n - 1)}...` : value;
}

function senderLabel(senderRole) {
  if (senderRole === "caregiver") return "Tony";
  if (senderRole === "dad") return "Dad";
  return "System";
}

function dataUrlToBlob(dataUrl) {
  const m = String(dataUrl || "").match(/^data:([^;,]+)?(;base64)?,(.*)$/);
  if (!m) throw new Error("Unsupported data URL.");
  const mime = m[1] || "application/octet-stream";
  const isBase64 = Boolean(m[2]);
  const payload = m[3] || "";
  if (isBase64) {
    const binary = atob(payload);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }
  return new Blob([decodeURIComponent(payload)], { type: mime });
}

async function uploadImageForMessage(dataUrl, conversationId) {
  if (!supabase) return dataUrl;
  const blob = dataUrlToBlob(dataUrl);
  const ext = "jpg";
  const fileName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;
  const path = `${conversationId}/${fileName}`;
  const { error: upErr } = await supabase.storage
    .from(IMAGE_STORAGE_BUCKET)
    .upload(path, blob, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from(IMAGE_STORAGE_BUCKET).getPublicUrl(path);
  const publicUrl = data?.publicUrl || "";
  if (!publicUrl) throw new Error("Could not resolve uploaded image URL.");
  return publicUrl;
}

async function purgeInlineImagesForConversation() {
  if (!supabase || !state.conversationId) {
    throw new Error("Cloud mode and a conversation are required.");
  }
  const { data, error } = await supabase.rpc("caregiver_purge_inline_images", {
    p_conversation_id: state.conversationId,
    p_placeholder_text: "[Image removed to stabilize chat]",
  });
  if (error) throw new Error(error.message);
  return Number(data || 0);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

/** Downscale to JPEG for upload so large iPhone photos don’t blow the DB payload. */
async function encodeImageFileForUpload(file) {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    try {
      const w = bitmap.width;
      const h = bitmap.height;
      if (!w || !h) throw new Error("Invalid image dimensions");
      const maxEdge = CAREGIVER_IMAGE_MAX_EDGE_PX;
      const scale = Math.min(1, maxEdge / Math.max(w, h));
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const canvas = document.createElement("canvas");
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not available");
      ctx.drawImage(bitmap, 0, 0, tw, th);
      return canvas.toDataURL("image/jpeg", CAREGIVER_IMAGE_JPEG_QUALITY);
    } finally {
      if (typeof bitmap.close === "function") bitmap.close();
    }
  }
  return readFileAsDataUrl(file);
}
