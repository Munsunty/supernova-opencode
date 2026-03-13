const state = {
  projects: [],
  selectedProjectId: null,
  selectedSessionId: null,
  currentView: "overview",
};

const dom = {
  projectList: document.getElementById("projectList"),
  workspaceSummary: document.getElementById("workspaceSummary"),
  refreshButton: document.getElementById("refreshButton"),
  enqueueForm: document.getElementById("enqueueForm"),
  promptInput: document.getElementById("promptInput"),
  threadIdInput: document.getElementById("threadIdInput"),
  enqueueResult: document.getElementById("enqueueResult"),
  heroTitle: document.getElementById("heroTitle"),
  heroMeta: document.getElementById("heroMeta"),
  heroHint: document.getElementById("heroHint"),
  healthBadge: document.getElementById("healthBadge"),
  statsGrid: document.getElementById("statsGrid"),
  x4Decisions: document.getElementById("x4Decisions"),
  webThreads: document.getElementById("webThreads"),
  recentTasks: document.getElementById("recentTasks"),
  recentInteractions: document.getElementById("recentInteractions"),
  sessionsList: document.getElementById("sessionsList"),
  agentMix: document.getElementById("agentMix"),
  recentMetrics: document.getElementById("recentMetrics"),
  sessionDetail: document.getElementById("sessionDetail"),
  sessionDetailLabel: document.getElementById("sessionDetailLabel"),
  viewTabs: [...document.querySelectorAll(".view-tab")],
  viewPages: [...document.querySelectorAll(".view-page")],
};

function formatTime(ts) {
  if (!ts) return "n/a";
  return new Date(ts).toLocaleString();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getJson(url, options) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let message = `${response.status}`;
    try {
      const payload = await response.json();
      message = payload.error || message;
    } catch {}
    throw new Error(message);
  }
  return response.json();
}

function setView(nextView) {
  state.currentView = nextView;
  for (const tab of dom.viewTabs) {
    tab.classList.toggle("active", tab.dataset.view === nextView);
  }
  for (const page of dom.viewPages) {
    page.classList.toggle("active", page.id === `view-${nextView}`);
  }
}

function renderProjects() {
  dom.projectList.innerHTML = state.projects.map((project) => `
    <button class="project-button ${project.id === state.selectedProjectId ? "active" : ""}" data-project-id="${escapeHtml(project.id)}">
      <p class="eyebrow">Source</p>
      <h3>${escapeHtml(project.name)}</h3>
      <p class="muted">${escapeHtml(project.opencodeBaseUrl)}</p>
      <div class="project-tags">
        ${(project.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
      </div>
    </button>
  `).join("");

  for (const button of dom.projectList.querySelectorAll("[data-project-id]")) {
    button.addEventListener("click", () => {
      state.selectedProjectId = button.dataset.projectId;
      state.selectedSessionId = null;
      renderProjects();
      loadOverview();
    });
  }
}

function renderWorkspace(project, overview) {
  if (!project || !overview) {
    dom.workspaceSummary.innerHTML = `<div class="empty-state">Select a source to see workspace information.</div>`;
    return;
  }

  dom.workspaceSummary.innerHTML = `
    <div class="workspace-meta">
      <p><strong>Root</strong></p>
      <code>${escapeHtml(project.rootDir)}</code>
    </div>
    <div class="workspace-meta">
      <p><strong>OpenCode</strong></p>
      <code>${escapeHtml(project.opencodeBaseUrl)}</code>
    </div>
    <div class="workspace-meta">
      <p><strong>Queue Snapshot</strong></p>
      <p class="muted">pending ${escapeHtml(overview.tasks.stats.pending || 0)} · running ${escapeHtml(overview.tasks.stats.running || 0)} · answered ${escapeHtml(overview.interactions.stats.answered || 0)}</p>
    </div>
  `;
}

function renderStats(overview) {
  const cards = [
    ["Pending Tasks", overview.tasks.stats.pending || 0, "Queue pressure right now"],
    ["Running Tasks", overview.tasks.stats.running || 0, "Active work in flight"],
    ["Answered Interactions", overview.interactions.stats.answered || 0, "Resolved X3 exchanges"],
    ["Sessions Visible", overview.sessions.recent.length, "Recent OpenCode sessions"],
  ];

  dom.statsGrid.innerHTML = cards.map(([label, value, note]) => `
    <article class="stat-card">
      <p class="eyebrow">${escapeHtml(label)}</p>
      <div class="value">${escapeHtml(value)}</div>
      <p class="muted">${escapeHtml(note)}</p>
    </article>
  `).join("");
}

function renderTable(host, columns, rows, emptyMessage = "No data yet.") {
  if (!rows.length) {
    host.innerHTML = `<div class="empty-state">${escapeHtml(emptyMessage)}</div>`;
    return;
  }

  host.innerHTML = `
    <table>
      <thead>
        <tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows.map((row) => `
          <tr>${columns.map((column) => `<td>${column.render(row)}</td>`).join("")}</tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderOverview(overview) {
  dom.heroTitle.textContent = overview.project.name;
  dom.heroMeta.textContent = `${overview.project.rootDir} | ${overview.project.opencodeBaseUrl}`;
  dom.heroHint.textContent = state.currentView === "channel"
    ? "You are in Channel view. Use stable thread names for workstream continuity."
    : "Start with Overview, then move to a focused view instead of scanning one long page.";
  dom.healthBadge.textContent = overview.health.ok
    ? `Healthy ${overview.health.version || ""}`.trim()
    : `Unavailable${overview.health.error ? `: ${overview.health.error}` : ""}`;
  dom.healthBadge.className = `health-badge ${overview.health.ok ? "ok" : "bad"}`;

  renderWorkspace(overview.project, overview);
  renderStats(overview);

  renderTable(dom.x4Decisions, [
    { label: "Action", render: (row) => escapeHtml(row.action || "n/a") },
    { label: "Score", render: (row) => escapeHtml(row.score ?? "n/a") },
    { label: "Route", render: (row) => escapeHtml(row.route || "n/a") },
    { label: "Reason", render: (row) => escapeHtml(row.reason || "n/a") },
  ], overview.interactions.x4Recent, "No X4 decisions recorded yet.");

  renderTable(dom.webThreads, [
    { label: "Thread", render: (row) => `<code>${escapeHtml(row.threadId)}</code>` },
    { label: "Tasks", render: (row) => escapeHtml(row.taskCount) },
    { label: "Pending", render: (row) => escapeHtml(row.pendingCount) },
    { label: "Running", render: (row) => escapeHtml(row.runningCount) },
    { label: "Latest", render: (row) => escapeHtml(formatTime(row.latestTaskAt)) },
  ], overview.webThreads, "No web threads yet.");

  renderTable(dom.recentTasks, [
    { label: "Task", render: (row) => `<code>${escapeHtml(row.id.slice(0, 8))}</code>` },
    { label: "Status", render: (row) => escapeHtml(row.status) },
    { label: "Type", render: (row) => escapeHtml(row.type) },
    { label: "Agent", render: (row) => escapeHtml(row.runAgent || "n/a") },
    { label: "Source", render: (row) => `<code>${escapeHtml(row.source)}</code>` },
  ], overview.tasks.recent, "No tasks recorded yet.");

  renderTable(dom.recentInteractions, [
    { label: "Interaction", render: (row) => `<code>${escapeHtml(row.id.slice(0, 8))}</code>` },
    { label: "Type", render: (row) => escapeHtml(row.type) },
    { label: "Status", render: (row) => escapeHtml(row.status) },
    { label: "Origin", render: (row) => escapeHtml(row.origin) },
    { label: "Created", render: (row) => escapeHtml(formatTime(row.createdAt)) },
  ], overview.interactions.recent, "No interactions recorded yet.");

  renderTable(dom.sessionsList, [
    {
      label: "Session",
      render: (row) => `<button class="table-button" data-session-id="${escapeHtml(row.id)}">${escapeHtml(row.title || row.id)}</button>`,
    },
    { label: "Status", render: (row) => escapeHtml(row.status || "n/a") },
    { label: "Updated", render: (row) => escapeHtml(formatTime(row.updatedAt)) },
  ], overview.sessions.recent, "No sessions available.");

  for (const button of dom.sessionsList.querySelectorAll("[data-session-id]")) {
    button.addEventListener("click", () => {
      state.selectedSessionId = button.dataset.sessionId;
      setView("sessions");
      loadSessionDetail();
    });
  }

  const chips = [
    ...overview.agents.run.map((item) => ({ ...item, label: "run" })),
    ...overview.agents.summary.map((item) => ({ ...item, label: "summary" })),
  ];
  dom.agentMix.innerHTML = chips.length
    ? chips.map((item) => `<span class="chip">${escapeHtml(item.label)} · ${escapeHtml(item.name)} · ${escapeHtml(item.count)}</span>`).join("")
    : `<div class="empty-state">No agent data yet.</div>`;

  renderTable(dom.recentMetrics, [
    { label: "Event", render: (row) => escapeHtml(row.eventType) },
    { label: "Source", render: (row) => escapeHtml(row.source || "n/a") },
    { label: "Status", render: (row) => escapeHtml(row.status || "n/a") },
    { label: "Time", render: (row) => escapeHtml(formatTime(row.createdAt)) },
  ], overview.metrics.recent, "No metrics captured yet.");
}

function renderSessionDetail(detail) {
  dom.sessionDetailLabel.textContent = detail.session.title || detail.session.id;
  dom.sessionDetail.innerHTML = `
    <div class="detail-grid">
      <section class="detail-section">
        <h3>Session Metrics</h3>
        <dl class="keyvals">
          <div><dt>Messages</dt><dd>${escapeHtml(detail.messages.total)}</dd></div>
          <div><dt>Assistant</dt><dd>${escapeHtml(detail.messages.assistant)}</dd></div>
          <div><dt>User</dt><dd>${escapeHtml(detail.messages.user)}</dd></div>
          <div><dt>Cost</dt><dd>$${escapeHtml(detail.cost.totalUsd.toFixed(6))}</dd></div>
          <div><dt>Input Tokens</dt><dd>${escapeHtml(detail.tokens.input)}</dd></div>
          <div><dt>Output Tokens</dt><dd>${escapeHtml(detail.tokens.output)}</dd></div>
          <div><dt>Reasoning</dt><dd>${escapeHtml(detail.tokens.reasoning)}</dd></div>
          <div><dt>Todos</dt><dd>${escapeHtml(detail.todoCount ?? "n/a")}</dd></div>
        </dl>
      </section>
      <section class="detail-section">
        <h3>Execution</h3>
        <p><strong>Agents:</strong> ${escapeHtml(detail.execution.observedAgents.join(", ") || "n/a")}</p>
        <p><strong>Models:</strong> ${escapeHtml(detail.execution.observedModels.join(", ") || "n/a")}</p>
        <p><strong>Diff Files:</strong> ${escapeHtml(detail.diffFileCount ?? "n/a")}</p>
      </section>
      <section class="detail-section">
        <h3>Tool Usage</h3>
        <div class="chip-host">
          ${detail.toolUsage.map((tool) => `<span class="chip">${escapeHtml(tool.name)} · ${escapeHtml(tool.count)}</span>`).join("") || '<span class="muted">No tool parts recorded.</span>'}
        </div>
      </section>
      <section class="detail-section">
        <h3>Linked Tasks</h3>
        ${detail.linkedTasks.length ? `
          <table>
            <thead><tr><th>Task</th><th>Status</th><th>Source</th></tr></thead>
            <tbody>
              ${detail.linkedTasks.map((task) => `
                <tr>
                  <td><code>${escapeHtml(task.id.slice(0, 8))}</code></td>
                  <td>${escapeHtml(task.status)}</td>
                  <td><code>${escapeHtml(task.source)}</code></td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        ` : '<div class="muted">No linked tasks found in state.db.</div>'}
      </section>
    </div>
    <section class="detail-section stacked-detail">
      <h3>Message Timeline</h3>
      ${detail.timeline.length ? `
        <table>
          <thead><tr><th>Role</th><th>Agent</th><th>Model</th><th>Tools</th><th>Created</th></tr></thead>
          <tbody>
            ${detail.timeline.map((item) => `
              <tr>
                <td>${escapeHtml(item.role || "n/a")}</td>
                <td>${escapeHtml(item.agent || "n/a")}</td>
                <td>${escapeHtml(item.model || "n/a")}</td>
                <td>${escapeHtml(item.toolNames.join(", ") || "none")}</td>
                <td>${escapeHtml(formatTime(item.createdAt))}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      ` : '<div class="muted">No messages available.</div>'}
    </section>
  `;
}

async function loadProjects() {
  const payload = await getJson("/api/projects");
  state.projects = payload.projects;
  if (!state.selectedProjectId && state.projects.length > 0) {
    state.selectedProjectId = state.projects[0].id;
  }
  renderProjects();
}

async function loadOverview() {
  if (!state.selectedProjectId) return;
  const overview = await getJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/overview`);
  renderOverview(overview);
}

async function loadSessionDetail() {
  if (!state.selectedProjectId || !state.selectedSessionId) return;
  dom.sessionDetail.innerHTML = `<div class="empty-state">Loading session detail...</div>`;
  const detail = await getJson(`/api/projects/${encodeURIComponent(state.selectedProjectId)}/sessions/${encodeURIComponent(state.selectedSessionId)}`);
  renderSessionDetail(detail);
}

async function submitEnqueue(event) {
  event.preventDefault();
  if (!state.selectedProjectId) {
    dom.enqueueResult.textContent = "Select a source first.";
    return;
  }

  try {
    const payload = await getJson(
      `/api/projects/${encodeURIComponent(state.selectedProjectId)}/channels/web/tasks`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          threadId: dom.threadIdInput.value,
          prompt: dom.promptInput.value,
        }),
      },
    );
    dom.enqueueResult.textContent = `Queued ${payload.created.taskId.slice(0, 8)} on ${payload.created.source}`;
    dom.promptInput.value = "";
    setView("queue");
    await loadOverview();
  } catch (error) {
    dom.enqueueResult.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function boot() {
  await loadProjects();
  await loadOverview();
}

for (const tab of dom.viewTabs) {
  tab.addEventListener("click", () => {
    setView(tab.dataset.view);
  });
}

dom.refreshButton.addEventListener("click", async () => {
  await loadProjects();
  await loadOverview();
  if (state.currentView === "sessions" && state.selectedSessionId) {
    await loadSessionDetail();
  }
});

dom.enqueueForm.addEventListener("submit", submitEnqueue);

boot().catch((error) => {
  dom.heroTitle.textContent = "Failed to load control plane";
  dom.heroMeta.textContent = error instanceof Error ? error.message : String(error);
});
