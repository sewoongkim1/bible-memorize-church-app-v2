/* 관리자 전용. API에서도 모든 검색·조회·수정 요청의 비밀번호를 검증한다. */
(() => {
  const $ = id => document.getElementById(id);
  let pw = sessionStorage.getItem("admin-pw") || "";
  let selected = null, pending = null, saving = false, historyRequest = 0;
  const normalize = value => String(value || "").trim().replace(/\s+/g, " ");
  const label = u => u.type === "교구" ? `${u.name} · ${u.gu}교구 ${u.mok}목장` : `${u.name} · ${u.bu} ${u.grade || ""}`;
  const messages = {
    unauthorized: "관리자 인증이 만료되었거나 비밀번호가 올바르지 않습니다. 허브에서 다시 로그인해 주세요.",
    "no-password-set": "서버에 관리자 비밀번호가 설정되어 있지 않습니다.",
    "invalid-search": "검색할 이름을 80자 이내로 입력해 주세요.",
    "invalid-member": "선택한 성도 정보를 확인할 수 없습니다. 다시 검색해 주세요.",
    "invalid-profile": "이름·소속과 변경 사유를 확인해 주세요. 목장은 숫자 또는 남성으로 입력하고, | < > 및 큰따옴표는 사용할 수 없습니다.",
    "member-not-found": "해당 성도를 찾을 수 없습니다. 다시 검색해 주세요.",
    "member-changed": "다른 관리자가 정보를 변경했습니다. 다시 검색한 뒤 수정해 주세요.",
    "identity-conflict": "같은 이름·소속이 다른 성도 또는 다른 성도의 이전 정보로 등록되어 있습니다. 저장하지 않았습니다. 대상자를 확인해 주세요.",
  };
  const errorText = e => messages[e.message] || "요청을 완료하지 못했습니다. 연결 상태를 확인하고 다시 시도해 주세요. 저장 중이었다면 다시 검색하여 변경 여부를 먼저 확인해 주세요.";
  const call = (action, body = {}) => supaCall(action, { ...body, pw });
  function status(id, text, kind = "") { $(id).textContent = text; $(id).className = `status ${kind}`; }
  function closeEditor() {
    selected = null; pending = null; historyRequest++;
    $("editor").hidden = true; $("confirmation").hidden = true; $("edit-fields").disabled = false;
  }
  function updateType() {
    const district = $("member-type").value === "교구";
    $("district-fields").hidden = !district; $("school-fields").hidden = district;
    ["gu", "mok"].forEach(k => { $("member-" + k).required = district; $("member-" + k).disabled = !district; });
    ["bu", "grade"].forEach(k => { $("member-" + k).required = !district; $("member-" + k).disabled = district; });
  }
  async function history(userId) {
    const ticket = ++historyRequest;
    $("history").textContent = "불러오는 중…";
    try {
      const result = await call("adminMemberHistory", { user_id: userId });
      if (ticket !== historyRequest) return;
      $("history").replaceChildren();
      if (!result.history.length) $("history").textContent = "변경 이력이 없습니다.";
      result.history.forEach(h => {
        const row = document.createElement("div"); row.className = "history-item";
        const date = document.createElement("small"); date.textContent = new Date(h.created_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
        const change = document.createElement("div"); change.textContent = `${label(h.before_profile)} → ${label(h.after_profile)}`;
        const reason = document.createElement("div"); reason.textContent = `사유: ${h.reason}`;
        row.append(date, change, reason); $("history").append(row);
      });
    } catch (e) { if (ticket === historyRequest) $("history").textContent = errorText(e); }
  }
  function edit(user) {
    if (saving) return;
    selected = user; pending = null;
    $("editor").hidden = false; $("confirmation").hidden = true; $("edit-fields").disabled = false;
    $("selected-info").textContent = `선택한 성도: ${label(user)}`;
    ["name", "type", "gu", "mok", "bu", "grade"].forEach(k => { $("member-" + k).value = user[k] || ""; });
    $("reason").value = ""; updateType(); status("edit-status", "");
    history(user.id); $("member-name").focus();
  }
  $("login-form").addEventListener("submit", async e => {
    e.preventDefault(); pw = $("password").value.trim(); await login();
  });
  async function login() {
    $("login-button").disabled = true;
    try {
      await call("authCheck"); sessionStorage.setItem("admin-pw", pw);
      $("gate").hidden = true; $("workspace").hidden = false; $("password").value = ""; $("query").focus();
    } catch (e) { status("login-status", errorText(e), "error"); }
    finally { $("login-button").disabled = false; }
  }
  $("search-form").addEventListener("submit", async e => {
    e.preventDefault(); if (saving || $("search-button").disabled) return;
    closeEditor(); $("results").replaceChildren(); $("search-button").disabled = true;
    status("search-status", "검색 중…");
    try {
      const data = await call("adminFindMembers", { query: normalize($("query").value) });
      status("search-status", data.more ? "50명까지만 표시합니다. 이름을 더 구체적으로 입력해 주세요." : `${data.users.length}명 · 이름과 소속을 확인한 뒤 선택해 주세요.`);
      data.users.forEach(user => {
        const row = document.createElement("div"); row.className = "member";
        const info = document.createElement("div"), title = document.createElement("strong"), meta = document.createElement("small");
        title.textContent = label(user);
        meta.textContent = `등록: ${new Date(user.created_at).toLocaleDateString("ko-KR")} · 최근 접속: ${user.last_seen_at ? new Date(user.last_seen_at).toLocaleDateString("ko-KR") : "없음"}`;
        info.append(title, meta);
        const button = document.createElement("button"); button.type = "button"; button.className = "secondary"; button.textContent = "수정"; button.setAttribute("aria-label", `${label(user)} 수정`); button.onclick = () => edit(user);
        row.append(info, button); $("results").append(row);
      });
    } catch (e) { status("search-status", errorText(e), "error"); }
    finally { $("search-button").disabled = false; }
  });
  $("member-type").addEventListener("change", updateType);
  $("close-editor").onclick = closeEditor;
  $("edit-form").addEventListener("submit", e => {
    e.preventDefault(); if (!selected || saving) return;
    const profile = {};
    ["name", "type", "gu", "mok", "bu", "grade"].forEach(k => { profile[k] = normalize($("member-" + k).value); });
    if (profile.type === "교구") { profile.bu = null; profile.grade = null; } else { profile.gu = null; profile.mok = null; }
    const reason = normalize($("reason").value);
    if (!profile.name || !reason || Object.values(profile).some(v => v && /[|<>"\x00-\x1f]/.test(v)) ||
      (profile.type === "교구" ? !profile.gu || !/^(\d+|남성)$/.test(profile.mok) : !profile.bu || !profile.grade)) {
      status("edit-status", messages["invalid-profile"], "error"); return;
    }
    if (Object.keys(profile).every(k => (selected[k] || "") === (profile[k] || ""))) {
      status("edit-status", "변경된 내용이 없습니다."); return;
    }
    pending = { user_id: selected.id, expected_key: selected.identity_key, profile, reason };
    $("before").textContent = label(selected); $("after").textContent = label(profile); $("confirm-reason").textContent = `사유: ${reason}`;
    $("edit-fields").disabled = true; $("confirmation").hidden = false; status("edit-status", ""); $("save-button").focus();
  });
  $("back-button").onclick = () => { pending = null; $("confirmation").hidden = true; $("edit-fields").disabled = false; $("member-name").focus(); };
  $("save-button").onclick = async () => {
    if (!pending || saving) return;
    saving = true; $("save-button").disabled = true; $("back-button").disabled = true; $("search-button").disabled = true;
    status("edit-status", "저장 중…");
    try {
      const result = await call("adminUpdateMember", pending);
      selected = result.user; pending = null;
      $("confirmation").hidden = true; $("edit-fields").disabled = true;
      $("selected-info").textContent = `저장된 성도: ${label(result.user)}`;
      $("results").replaceChildren(); status("search-status", "수정할 성도를 다시 검색해 주세요.");
      status("edit-status", result.changed ? "이름·소속을 변경했습니다. 기존 기록과 사용자 번호는 유지됩니다." : "이미 같은 정보로 저장되어 있습니다.", "success");
      history(result.user.id);
    } catch (e) {
      status("edit-status", errorText(e), "error");
      if (["member-changed", "member-not-found"].includes(e.message)) { pending = null; $("confirmation").hidden = true; }
    } finally {
      saving = false; $("save-button").disabled = false; $("back-button").disabled = false; $("search-button").disabled = false;
    }
  };
  if (pw) login();
})();
