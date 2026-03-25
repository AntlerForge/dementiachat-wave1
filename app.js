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
const LOCAL_MODE_KEY = "carechat.local_mode";
const DAD_DRAFT_KEY = "carechat.dad_draft";
const CAREGIVER_DRAFT_KEY = "carechat.caregiver_draft";
const CAREGIVER_TAB_KEY = "carechat.caregiver_tab";
const DAD_UI_DRAFT_KEY = "carechat.dad_ui_draft";

const appRoot = document.getElementById("app");
const roleSelect = document.getElementById("role");
const rolePicker = document.querySelector(".role-picker");
const appTitle = document.getElementById("appTitle");
let activeMessageMenu = null;
let activeMenuOutsideHandler = null;
let activeMenuEscapeHandler = null;

const config = window.APP_CONFIG || {};
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
};

init().catch((err) => {
  console.error(err);
  alert("Initialization failed. Check console for details.");
});

async function init() {
  roleSelect.value = state.role;
  roleSelect.addEventListener("change", onRoleChange);
  if (supabase) {
    await processAuthCallbackIfPresent();
    await hydrateAuth();
    supabase.auth.onAuthStateChange(async (evt, session) => {
      state.authDebug.lastEvent = evt;
      state.session = session;
      await bootstrapRemote();
      render();
    });
  }
  await bootstrapRemote();
  enforceRoleLock();
  await loadMessages();
  render();
  startOutboxSyncLoop();
  startMessageRefreshLoop();
  setupServiceWorker();
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

async function ensureConversation() {
  if (config.SHARED_CONVERSATION_ID) {
    state.conversationId = config.SHARED_CONVERSATION_ID;
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
      uiFontScale: state.appliedDadUI.uiFontScale || 16,
      theme: uiData.theme,
      bubbleWidth: uiData.bubble_width,
      imageSize: uiData.image_default_size || "medium",
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
    <p class="subtext">Preferred: email code (OTP). Magic link also remains supported.</p>
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
      <label>6-digit code (if provided by email)</label>
      <input id="authCode" type="text" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" placeholder="123456" />
      <button id="verifyAuthCode" type="submit">Verify code</button>
    </form>
    <div class="row">
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
    state.authCodeDraft = codeInput.value.replace(/\D/g, "").slice(0, 6);
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
        "Sign-in email sent. Enter the 6-digit code if present, or open the magic link.";
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
    if (!/^\d{6}$/.test(token)) {
      status.textContent = "Enter a valid 6-digit code.";
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
  input.addEventListener("input", () => {
    state.dadDraft = input.value;
    localStorage.setItem(DAD_DRAFT_KEY, state.dadDraft);
  });

  applyUiFontScale(panel, state.appliedDadUI.uiFontScale, 16);
  applyDadUiTokens(thread, state.appliedDadUI);

  let visibleCount = 0;
  for (const msg of state.messages) {
    if (msg.hidden_for_dad) continue;
    visibleCount += 1;
    thread.appendChild(renderBubble(msg, { viewerRole: "dad" }));
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    state.dadDraft = "";
    localStorage.setItem(DAD_DRAFT_KEY, "");
    await queueMessage(text, "dad");
    await loadMessages();
    render();
  });

  appRoot.appendChild(node);
  if (state.dadStickToBottom || visibleCount > state.dadVisibleMessageCount) {
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
  applyUiFontScale(panel, state.caregiverUI.uiFontScale, 16);
  applyCaregiverUiTokens(thread, state.caregiverUI);

  let visibleCount = 0;
  for (const msg of state.messages) {
    visibleCount += 1;
    thread.appendChild(renderBubble(msg, { viewerRole: "caregiver" }));
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
    await queueMessage(text, "caregiver");
    await loadMessages();
    render();
  });

  wireImageSize(node);
  wireCaregiverImage(node);
  wireThreadMessageActions(thread);
  wireDadUiPane(node);
  wireCaregiverUiPane(node);
  wireAiRulesPane(node);

  outboxStatus.textContent = outboxSummary();
  appRoot.appendChild(node);
  if (state.caregiverStickToBottom || visibleCount > state.caregiverVisibleMessageCount) {
    scrollThreadToBottom(thread);
  }
  state.caregiverVisibleMessageCount = visibleCount;
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
    if (file.size > 3 * 1024 * 1024) {
      status.textContent = "Image too large. Please use a file under 3MB.";
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file);
      state.caregiverImageDraft = { dataUrl, name: file.name };
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
  const previewBtn = root.getElementById("previewSettings");
  const applyBtn = root.getElementById("applySettings");
  const note = root.getElementById("previewNote");
  const previewThread = root.getElementById("dadUiPreviewThread");
  if (!fontScale || !uiFontScale || !theme || !bubbleWidth || !previewBtn || !applyBtn || !note)
    return;

  const currentDraft = state.previewDadUI || { ...state.appliedDadUI };
  fontScale.value = String(currentDraft.fontScale);
  uiFontScale.value = String(currentDraft.uiFontScale || 16);
  theme.value = currentDraft.theme;
  bubbleWidth.value = String(currentDraft.bubbleWidth);

  const saveDraftFromControls = () => {
    state.previewDadUI = {
      fontScale: Number(fontScale.value),
      uiFontScale: Number(uiFontScale.value),
      theme: theme.value,
      bubbleWidth: Number(bubbleWidth.value),
      imageSize: state.appliedDadUI.imageSize || "medium",
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
  if (msg.image_url) {
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

async function loadMessages() {
  if (!state.conversationId && supabase && state.session) {
    await ensureConversation();
  }
  if (supabase) {
    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", state.conversationId)
      .order("created_at", { ascending: true })
      .limit(200);
    if (!error && data) {
      state.messages = data;
      localStorage.setItem(LOCAL_MSG_KEY, JSON.stringify(data));
      return;
    }
    console.warn("Remote load failed, using local cache.", error);
  }
  state.messages = readJson(LOCAL_MSG_KEY, []);
}

async function queueMessage(content, senderRole) {
  if (!state.conversationId && supabase && state.session) {
    await ensureConversation();
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
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(state.outbox));
  await syncOutboxOnce();
}

async function queueImageMessage(imageUrl, senderRole, imageSize) {
  if (!state.conversationId && supabase && state.session) {
    await ensureConversation();
  }
  const message = {
    id: crypto.randomUUID(),
    client_msg_id: crypto.randomUUID(),
    conversation_id: state.conversationId,
    sender_role: senderRole,
    content: "",
    image_url: imageUrl,
    image_size: imageSize || "medium",
    hidden_for_dad: false,
    created_at: new Date().toISOString(),
    status: "sending",
  };
  state.outbox.push(message);
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(state.outbox));
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
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(state.outbox));
  return changed;
}

async function sendRemote(msg) {
  if (!supabase) {
    const local = readJson(LOCAL_MSG_KEY, []);
    local.push(msg);
    localStorage.setItem(LOCAL_MSG_KEY, JSON.stringify(local));
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
  const insertOnce = async () => supabase.from("messages").insert(payload);
  let { error } = await insertOnce();
  if (error && shouldRetryAfterMembershipRepair(error)) {
    await ensureConversationMembership(msg.conversation_id);
    const retry = await insertOnce();
    error = retry.error;
  }
  if (error) {
    const code = error.code ? `[${error.code}] ` : "";
    throw new Error(`${code}${error.message || "Insert failed"}`);
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
      localStorage.setItem(LOCAL_MSG_KEY, JSON.stringify(local));
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
}

async function hideMessageForDad(messageId, hide) {
  if (!supabase) {
    const local = readJson(LOCAL_MSG_KEY, []);
    const idx = local.findIndex((m) => m.id === messageId);
    if (idx >= 0) {
      local[idx].hidden_for_dad = hide;
      localStorage.setItem(LOCAL_MSG_KEY, JSON.stringify(local));
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
}

async function deleteMessage(messageId) {
  if (!messageId) return;
  if (!supabase) {
    const local = readJson(LOCAL_MSG_KEY, []);
    const next = local.filter((m) => m.id !== messageId);
    localStorage.setItem(LOCAL_MSG_KEY, JSON.stringify(next));
    return;
  }
  const { error } = await supabase.rpc("caregiver_delete_message", {
    p_message_id: messageId,
    p_reason: "caregiver_delete",
  });
  if (!error) return;

  const msg = String(error.message || "").toLowerCase();
  const missingFn = msg.includes("could not find the function") || msg.includes("schema cache");
  if (missingFn) {
    throw new Error(
      "Delete RPC is not deployed yet. Run the new SQL function migration, then retry."
    );
  }
  throw new Error(error.message);
}

function startOutboxSyncLoop() {
  const ms = Number(config.OUTBOX_SYNC_MS || 5000);
  setInterval(async () => {
    const changed = await syncOutboxOnce();
    if (
      changed &&
      !state.authRequired &&
      state.role === "caregiver" &&
      !isUserEditingControl()
    ) {
      render();
    }
  }, ms);
}

function startMessageRefreshLoop() {
  const ms = Number(config.MESSAGE_POLL_MS || 2500);
  setInterval(async () => {
    if (!supabase || !state.session || state.authRequired || !state.conversationId) return;
    const beforeSig = appStateSignature();
    await Promise.all([loadMessages(), loadRemoteSettings()]);
    const afterSig = appStateSignature();
    if (beforeSig !== afterSig && !isUserEditingControl()) {
      render();
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

function setupServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  // Dev stability: clear any prior SW/cache so auth JS is always current.
  navigator.serviceWorker
    .getRegistrations()
    .then((regs) => Promise.all(regs.map((r) => r.unregister())))
    .catch((err) => {
      console.warn("Service worker unregister failed", err);
    });
  if ("caches" in window) {
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .catch((err) => {
        console.warn("Cache clear failed", err);
      });
  }
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
  return `${ui.fontScale || 22}|${ui.theme || "high-contrast"}|${ui.bubbleWidth || 80}|${
    ui.imageSize || "medium"
  }`;
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

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}
