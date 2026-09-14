/* xrddatavis frontend.
 *
 * Left: a table of every live plot on the server. Right: the selected plots,
 * drawn with Plotly. The plot list is kept in step with the server through a
 * server-sent event stream (falling back to polling), and the arrays for a
 * trace are fetched once and cached until the server says its version changed.
 */

(() => {
  "use strict";

  // Fixed categorical slot order - a colour follows a plot for its whole life,
  // it is never reassigned by position in the list. Past eight live plots the
  // slots repeat, so repeats are separated by line style as well as hue.
  const PALETTE = {
    light: [
      "#2a78d6",
      "#eb6834",
      "#1baf7a",
      "#eda100",
      "#e87ba4",
      "#008300",
      "#4a3aa7",
      "#e34948",
    ],
    dark: [
      "#3987e5",
      "#d95926",
      "#199e70",
      "#c98500",
      "#d55181",
      "#008300",
      "#9085e9",
      "#e66767",
    ],
  };
  const DASHES = ["solid", "dot", "dashdot", "longdash"];
  const POLL_MS = 5000;
  const TICK_MS = 1000;

  const $ = (id) => document.getElementById(id);
  const el = {
    rows: $("plot-rows"),
    filter: $("filter"),
    capacity: $("capacity"),
    ttlPill: $("ttl-pill"),
    conn: $("conn"),
    connLabel: $("conn-label"),
    selectedCount: $("selected-count"),
    updatedAt: $("updated-at"),
    chart: $("chart"),
    overlay: $("overlay-msg"),
    mode: $("mode"),
  };

  const store = {
    read(key, fallback) {
      try {
        const raw = localStorage.getItem(`xrddatavis.${key}`);
        return raw === null ? fallback : JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    write(key, value) {
      try {
        localStorage.setItem(`xrddatavis.${key}`, JSON.stringify(value));
      } catch {
        /* private window or blocked storage - preferences just won't persist */
      }
    },
  };

  const state = {
    plots: [],
    selected: new Set(store.read("selected", [])),
    cache: new Map(),
    limits: { max_plots: null, ttl_seconds: null },
    revision: -1,
    filter: "",
    sort: store.read("sort", { key: "created_at", dir: "desc" }),
    mode: store.read("mode", "overlay"),
    opts: Object.assign(
      { errors: true, fits: true, logy: false, normalise: false },
      store.read("opts", {}),
    ),
    theme: store.read("theme", null),
    editing: null,
    booted: false,
    drawing: false,
    redrawQueued: false,
  };

  /* ------------------------------------------------------------ helpers - */

  const css = (name) =>
    getComputedStyle(document.documentElement).getPropertyValue(name).trim();

  const isDark = () => {
    const stamped = document.documentElement.dataset.theme;
    if (stamped) return stamped === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  };

  const palette = () => (isDark() ? PALETTE.dark : PALETTE.light);

  const fmtNumber = (value) => {
    if (!Number.isFinite(value)) return "—";
    const abs = Math.abs(value);
    if (abs !== 0 && (abs < 1e-3 || abs >= 1e5)) return value.toExponential(2);
    return Number(value.toPrecision(5)).toString();
  };

  const fmtDuration = (seconds) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return "0s";
    const s = Math.round(seconds);
    if (s < 60) return `${s}s`;
    if (s < 3600) return `${Math.floor(s / 60)}m ${s % 60}s`;
    const h = Math.floor(s / 3600);
    return `${h}h ${Math.floor((s % 3600) / 60)}m`;
  };

  const fmtTime = (iso) =>
    new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

  let toastTimer = null;
  function toast(message) {
    let node = document.querySelector(".toast");
    if (!node) {
      node = document.createElement("div");
      node.className = "toast";
      node.setAttribute("role", "status");
      document.body.appendChild(node);
    }
    node.textContent = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => node.remove(), 6000);
  }

  async function api(path, options = {}) {
    const response = await fetch(path, {
      cache: "no-store",
      headers: { Accept: "application/json" },
      ...options,
    });
    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const body = await response.json();
        if (body && body.detail) detail = body.detail;
      } catch {
        /* non-JSON error body */
      }
      throw new Error(detail);
    }
    return response.status === 204 ? null : response.json();
  }

  /* --------------------------------------------------------- data layer - */

  let refreshing = null;

  function refresh() {
    // collapse concurrent refreshes - SSE can fire faster than a round trip
    if (!refreshing) {
      refreshing = doRefresh().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function doRefresh() {
    let payload;
    try {
      payload = await api("liveplots");
      setConnection(sseHealthy ? "live" : "polling");
    } catch (error) {
      setConnection("down");
      toast(`Could not reach the server: ${error.message}`);
      return;
    }

    state.plots = payload.plots;
    state.revision = payload.revision;
    state.limits = {
      max_plots: payload.max_plots,
      ttl_seconds: payload.ttl_seconds,
    };

    const live = new Set(state.plots.map((p) => p.id));
    let selectionChanged = false;
    for (const id of [...state.selected]) {
      if (!live.has(id)) {
        state.selected.delete(id);
        selectionChanged = true;
      }
    }
    for (const id of [...state.cache.keys()]) {
      if (!live.has(id)) state.cache.delete(id);
    }
    for (const plot of state.plots) {
      const cached = state.cache.get(plot.id);
      if (cached && cached.version !== plot.version) state.cache.delete(plot.id);
    }
    // first load with nothing remembered: show the newest plot straight away
    if (!state.booted) {
      state.booted = true;
      if (!state.selected.size && state.plots.length) {
        state.selected.add(state.plots[0].id);
        selectionChanged = true;
      }
    }
    if (selectionChanged) persistSelection();

    el.updatedAt.textContent = `updated ${fmtTime(new Date().toISOString())}`;
    renderStatus();
    renderTable();
    drawChart();
  }

  async function ensureData(summaries) {
    const missing = summaries.filter((s) => !state.cache.has(s.id));
    await Promise.all(
      missing.map(async (summary) => {
        try {
          const plot = await api(`plot/${summary.id}`);
          state.cache.set(summary.id, { version: plot.version, plot });
        } catch (error) {
          toast(`Could not load "${summary.name}": ${error.message}`);
        }
      }),
    );
  }

  /* ------------------------------------------------------------- events - */

  let sseHealthy = false;
  let pollTimer = null;

  function setConnection(mode) {
    const labels = { live: "live", polling: "polling", down: "offline" };
    el.conn.dataset.state = mode;
    el.connLabel.textContent = labels[mode] || mode;
  }

  function startEvents() {
    if (!("EventSource" in window)) {
      startPolling();
      return;
    }
    const source = new EventSource("events");
    source.onopen = () => {
      sseHealthy = true;
      setConnection("live");
      stopPolling();
    };
    source.onmessage = (event) => {
      let revision = null;
      try {
        revision = JSON.parse(event.data).revision;
      } catch {
        /* keep-alive or malformed - just refresh */
      }
      if (revision === null || revision !== state.revision) refresh();
    };
    source.onerror = () => {
      sseHealthy = false;
      setConnection("polling");
      startPolling(); // EventSource retries on its own; poll until it is back
    };
  }

  function startPolling() {
    if (pollTimer === null) pollTimer = setInterval(refresh, POLL_MS);
  }

  function stopPolling() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  /* -------------------------------------------------------------- table - */

  function sortedPlots() {
    const { key, dir } = state.sort;
    const sign = dir === "asc" ? 1 : -1;
    return [...state.plots].sort((a, b) => {
      let result;
      if (key === "name") result = a.name.localeCompare(b.name, undefined, { numeric: true });
      else if (key === "points") result = a.points - b.points;
      else result = new Date(a.created_at) - new Date(b.created_at);
      return result * sign || a.id.localeCompare(b.id);
    });
  }

  function visiblePlots() {
    const needle = state.filter.trim().toLowerCase();
    if (!needle) return sortedPlots();
    return sortedPlots().filter((plot) =>
      [plot.name, plot.filepath || "", String(plot.filenumber ?? "")]
        .join(" ")
        .toLowerCase()
        .includes(needle),
    );
  }

  // Selected plots, in table order - the order traces are drawn in.
  function selectedPlots() {
    return sortedPlots().filter((plot) => state.selected.has(plot.id));
  }

  function renderStatus() {
    const { max_plots: max, ttl_seconds: ttl } = state.limits;
    const held = state.plots.length;
    el.capacity.textContent = `${held} / ${max ?? "—"} plots`;
    el.capacity.classList.toggle("full", max !== null && held >= max);
    el.capacity.title =
      max === null
        ? ""
        : `The server holds at most ${max} plots; the oldest is dropped to make room.`;
    el.ttlPill.textContent = ttl === null ? "ttl —" : `ttl ${fmtDuration(ttl)}`;
    el.ttlPill.title = "Plots are cleared automatically this long after arriving.";

    const count = state.selected.size;
    el.selectedCount.textContent = `${count} shown of ${held}`;
  }

  function renderTable() {
    const plots = visiblePlots();
    const colours = palette();

    if (!plots.length) {
      const message = state.plots.length
        ? "No plots match that filter."
        : "No plots yet — POST XYEData to /plot.";
      el.rows.innerHTML = `<tr class="empty-row"><td colspan="5">${message}</td></tr>`;
      return;
    }

    el.rows.innerHTML = plots
      .map((plot) => {
        const selected = state.selected.has(plot.id);
        const colour = colours[plot.colour_index % colours.length];
        const bits = [];
        if (plot.filenumber !== null && plot.filenumber !== undefined)
          bits.push(`<span class="tag">#${plot.filenumber}</span>`);
        if (plot.has_errors) bits.push(`<span class="tag">e</span>`);
        if (plot.has_fit) bits.push(`<span class="tag">fit</span>`);
        const range = `${fmtNumber(plot.x_min)} – ${fmtNumber(plot.x_max)}`;
        const where = plot.filepath ? escapeHtml(plot.filepath) : "";
        return `
        <tr data-id="${plot.id}" class="${selected ? "selected" : ""}">
          <td class="pick">
            <input type="checkbox" ${selected ? "checked" : ""}
                   aria-label="Show ${escapeAttr(plot.name)}" />
            <button class="swatch" style="background:${colour}"
                    title="Change colour" aria-label="Change colour"></button>
          </td>
          <td>
            <div class="name" title="Double-click to rename">${escapeHtml(plot.name)}</div>
            <div class="sub">${bits.join("")}x ${range}${where ? ` · ${where}` : ""}</div>
          </td>
          <td class="num">${plot.points.toLocaleString()}</td>
          <td class="num ttl" data-created="${plot.created_at}"></td>
          <td class="kill">
            <button class="icon-btn" title="Delete plot"
                    aria-label="Delete ${escapeAttr(plot.name)}">✕</button>
          </td>
        </tr>`;
      })
      .join("");

    updateTtls();
    renderSortIndicators();
  }

  function renderSortIndicators() {
    document.querySelectorAll("thead th[data-sort]").forEach((th) => {
      const active = th.dataset.sort === state.sort.key;
      const arrow = state.sort.dir === "asc" ? "▲" : "▼";
      th.innerHTML = active
        ? `${th.dataset.label} <span class="arrow">${arrow}</span>`
        : th.dataset.label;
      th.setAttribute(
        "aria-sort",
        active ? (state.sort.dir === "asc" ? "ascending" : "descending") : "none",
      );
    });
  }

  function updateTtls() {
    const ttl = state.limits.ttl_seconds;
    if (!ttl) return;
    const now = Date.now();
    el.rows.querySelectorAll("td.ttl").forEach((cell) => {
      const created = new Date(cell.dataset.created).getTime();
      const remaining = Math.max(0, ttl - (now - created) / 1000);
      const fraction = Math.max(0, Math.min(1, remaining / ttl));
      const expiring = fraction < 0.15;
      cell.innerHTML = `${fmtDuration(remaining)}
        <div class="ttl-bar${expiring ? " expiring" : ""}">
          <span style="width:${(fraction * 100).toFixed(1)}%"></span>
        </div>`;
      cell.title = `Cleared at ${new Date(created + ttl * 1000).toLocaleTimeString()}`;
    });
  }

  function escapeHtml(value) {
    return String(value).replace(
      /[&<>"']/g,
      (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
    );
  }
  const escapeAttr = escapeHtml;

  /* -------------------------------------------------------------- chart - */

  function transform(y, e) {
    // returns {y, e} after normalisation, leaving the raw values for hover
    if (!state.opts.normalise) return { y, e };
    const max = Math.max(...y);
    const min = Math.min(...y);
    if (state.opts.logy) {
      const scale = max === 0 ? 1 : Math.abs(max);
      return { y: y.map((v) => v / scale), e: e && e.map((v) => v / scale) };
    }
    const span = max - min;
    if (span === 0) return { y: y.map(() => 0), e: e && e.map(() => 0) };
    return { y: y.map((v) => (v - min) / span), e: e && e.map((v) => v / span) };
  }

  function buildTraces(summaries) {
    const colours = palette();
    const seenSlot = new Map();
    const prepared = summaries.map((summary) => {
      const entry = state.cache.get(summary.id);
      const plot = entry.plot;
      const slot = summary.colour_index % colours.length;
      const repeat = seenSlot.get(slot) || 0;
      seenSlot.set(slot, repeat + 1);
      return {
        summary,
        plot,
        colour: colours[slot],
        dash: DASHES[repeat % DASHES.length],
        main: transform(plot.data.y, state.opts.errors ? plot.data.e : null),
        fit: plot.fit ? transform(plot.fit.y, null) : null,
      };
    });

    // vertical offset per trace, so a stack of similar patterns is readable
    let step = 0;
    let factor = 1;
    if (state.mode === "offset" && prepared.length > 1) {
      if (state.opts.logy) {
        factor = 3;
      } else {
        const spans = prepared.map((p) => {
          const ys = p.main.y;
          return Math.max(...ys) - Math.min(...ys);
        });
        step = 0.5 * Math.max(...spans, 0);
      }
    }

    const traces = [];
    prepared.forEach((item, index) => {
      const shift = (values) =>
        state.mode === "offset"
          ? values.map((v) => (state.opts.logy ? v * factor ** index : v + step * index))
          : values;

      const mode =
        item.summary.plot_type === "scatter"
          ? "markers"
          : item.summary.plot_type === "line+markers"
            ? "lines+markers"
            : "lines";

      const axes =
        state.mode === "grid"
          ? { xaxis: `x${index + 1}`, yaxis: `y${index + 1}` }
          : {};

      // WebGL for big traces; SVG below that and whenever error bars are on,
      // which scattergl does not draw
      const withErrors = state.opts.errors && Boolean(item.main.e);
      const glyph =
        item.plot.data.x.length > 4000 && !withErrors ? "scattergl" : "scatter";

      const trace = {
        type: glyph,
        mode,
        name: item.summary.name,
        x: item.plot.data.x,
        y: shift(item.main.y),
        customdata: item.plot.data.y,
        line: { color: item.colour, width: 2, dash: item.dash, shape: "linear" },
        marker: { color: item.colour, size: 5, line: { width: 0 } },
        hovertemplate: "%{customdata:.5g}<extra>%{fullData.name}</extra>",
        legendgroup: item.summary.id,
        ...axes,
      };

      if (withErrors) {
        trace.error_y = {
          type: "data",
          array: item.main.e,
          color: item.colour,
          thickness: 1,
          width: 0,
          opacity: 0.55,
        };
      }
      traces.push(trace);

      if (state.opts.fits && item.fit) {
        traces.push({
          type: glyph === "scattergl" ? "scattergl" : "scatter",
          mode: "lines",
          name: `${item.plot.fit.name}`,
          x: item.plot.fit.x,
          y: shift(item.fit.y),
          customdata: item.plot.fit.y,
          line: { color: item.colour, width: 2, dash: "dot" },
          hovertemplate: "%{customdata:.5g}<extra>%{fullData.name}</extra>",
          legendgroup: item.summary.id,
          ...axes,
        });
      }
    });

    return { traces, prepared };
  }

  function axisStyle(extra = {}) {
    return {
      gridcolor: css("--border"),
      zerolinecolor: css("--border-strong"),
      linecolor: css("--border-strong"),
      tickfont: { color: css("--text-secondary"), size: 11 },
      title: { font: { color: css("--text-secondary"), size: 12 } },
      automargin: true,
      ...extra,
    };
  }

  function buildLayout(prepared, traceCount) {
    const surface = css("--surface-1");
    // axis labels come from the first drawn trace, if the poster supplied them
    const first = prepared.length ? prepared[0].plot.data : null;
    const xTitle = (first && first.x_label) || "x";
    const yBase = (first && first.y_label) || "Intensity";
    const yTitle = state.opts.normalise ? `${yBase} (normalised)` : yBase;
    const base = {
      paper_bgcolor: surface,
      plot_bgcolor: surface,
      font: { color: css("--text-primary"), family: getComputedStyle(document.body).fontFamily },
      margin: { l: 62, r: 18, t: 34, b: 48 },
      showlegend: traceCount > 1,
      legend: {
        orientation: "h",
        yanchor: "bottom",
        y: 1.01,
        xanchor: "left",
        x: 0,
        font: { color: css("--text-secondary"), size: 11 },
        bgcolor: "rgba(0,0,0,0)",
      },
      hoverlabel: {
        bgcolor: css("--surface-1"),
        bordercolor: css("--border-strong"),
        font: { color: css("--text-primary"), size: 12 },
      },
      // keep the user's zoom across live updates, reset it when the view changes
      uirevision: `${state.mode}|${state.opts.logy}|${state.opts.normalise}`,
    };

    if (state.mode === "grid") {
      const count = Math.max(1, prepared.length);
      const columns = Math.min(3, Math.ceil(Math.sqrt(count)));
      const rows = Math.ceil(count / columns);
      base.grid = { rows, columns, pattern: "independent", xgap: 0.12, ygap: 0.22 };
      base.showlegend = false;
      base.hovermode = "closest";
      base.margin = { l: 56, r: 16, t: 46, b: 44 };
      base.annotations = prepared.map((item, index) => ({
        text: item.summary.name,
        xref: `x${index + 1} domain`,
        yref: `y${index + 1} domain`,
        x: 0,
        y: 1.03,
        xanchor: "left",
        yanchor: "bottom",
        showarrow: false,
        font: { color: item.colour, size: 11 },
      }));
      prepared.forEach((_, index) => {
        const n = index + 1;
        base[`xaxis${n}`] = axisStyle({
          title: {
            text: index >= count - columns ? xTitle : "",
            font: { color: css("--text-secondary"), size: 11 },
          },
        });
        base[`yaxis${n}`] = axisStyle({
          type: state.opts.logy ? "log" : "linear",
          title: {
            text: index % columns === 0 ? yTitle : "",
            font: { color: css("--text-secondary"), size: 11 },
          },
        });
      });
      return base;
    }

    base.hovermode = "x unified";
    base.xaxis = axisStyle({
      title: { text: xTitle, font: { color: css("--text-secondary"), size: 12 } },
      showspikes: true,
      spikemode: "across",
      spikethickness: 1,
      spikedash: "dot",
      spikecolor: css("--text-muted"),
    });
    base.yaxis = axisStyle({
      type: state.opts.logy ? "log" : "linear",
      title: {
        text:
          state.mode === "offset"
            ? `${yTitle} (offset)`
            : yTitle,
        font: { color: css("--text-secondary"), size: 12 },
      },
    });
    return base;
  }

  function showOverlay(html) {
    el.overlay.innerHTML = html;
    el.overlay.hidden = false;
  }

  function hideOverlay() {
    el.overlay.hidden = true;
  }

  async function drawChart() {
    if (state.drawing) {
      state.redrawQueued = true;
      return;
    }
    state.drawing = true;
    try {
      if (typeof Plotly === "undefined") {
        showOverlay(
          `<strong>Plotly could not be loaded</strong>
           <div>The page pulls it from cdnjs.cloudflare.com — check the browser can reach it.</div>`,
        );
        return;
      }

      const summaries = selectedPlots();
      if (!summaries.length) {
        Plotly.purge(el.chart);
        showOverlay(
          state.plots.length
            ? `<strong>Nothing selected</strong>
               <div>Tick a plot in the table on the left to draw it. Tick several to overlay them.</div>`
            : `<strong>No plots on the server</strong>
               <div>POST an XYEData document to <code>/plot</code> and it will appear here.</div>`,
        );
        return;
      }

      await ensureData(summaries);
      const drawable = summaries.filter((s) => state.cache.has(s.id));
      if (!drawable.length) {
        showOverlay(`<strong>Could not load the selected plots</strong>`);
        return;
      }

      const { traces, prepared } = buildTraces(drawable);
      const layout = buildLayout(prepared, traces.length);
      hideOverlay();
      await Plotly.react(el.chart, traces, layout, {
        responsive: true,
        displaylogo: false,
        scrollZoom: true,
        modeBarButtonsToRemove: ["select2d", "lasso2d"],
        toImageButtonOptions: { filename: "xrddatavis", scale: 2 },
      });
    } finally {
      state.drawing = false;
      if (state.redrawQueued) {
        state.redrawQueued = false;
        drawChart();
      }
    }
  }

  /* ---------------------------------------------------------- selection - */

  function persistSelection() {
    store.write("selected", [...state.selected]);
    renderStatus();
  }

  function toggle(id, force) {
    const selected = force === undefined ? !state.selected.has(id) : force;
    if (selected) state.selected.add(id);
    else state.selected.delete(id);
    const row = el.rows.querySelector(`tr[data-id="${id}"]`);
    if (row) {
      row.classList.toggle("selected", selected);
      const box = row.querySelector('input[type="checkbox"]');
      if (box) box.checked = selected;
    }
    persistSelection();
    drawChart();
  }

  /* ------------------------------------------------------------- wiring - */

  el.rows.addEventListener("click", async (event) => {
    const row = event.target.closest("tr[data-id]");
    if (!row) return;
    const id = row.dataset.id;

    if (event.target.matches(".icon-btn")) {
      event.stopPropagation();
      try {
        await api(`remove/${id}`, { method: "DELETE" });
        await refresh();
      } catch (error) {
        toast(`Delete failed: ${error.message}`);
      }
      return;
    }

    if (event.target.matches(".swatch")) {
      event.stopPropagation();
      const plot = state.plots.find((p) => p.id === id);
      if (!plot) return;
      try {
        await api(`edit/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ colour_index: (plot.colour_index + 1) % PALETTE.light.length }),
        });
        await refresh();
      } catch (error) {
        toast(`Could not change colour: ${error.message}`);
      }
      return;
    }

    if (event.target.matches(".name-input")) return;
    if (event.target.matches('input[type="checkbox"]')) {
      toggle(id, event.target.checked);
      return;
    }
    toggle(id);
  });

  el.rows.addEventListener("dblclick", (event) => {
    const cell = event.target.closest(".name");
    if (!cell) return;
    const row = event.target.closest("tr[data-id]");
    const id = row.dataset.id;
    const current = cell.textContent.trim();
    cell.innerHTML = "";
    const input = document.createElement("input");
    input.className = "name-input";
    input.value = current;
    cell.appendChild(input);
    input.focus();
    input.select();

    const finish = async (commit) => {
      const value = input.value.trim();
      input.removeEventListener("blur", onBlur);
      if (!commit || !value || value === current) {
        renderTable();
        return;
      }
      try {
        await api(`edit/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: value }),
        });
        await refresh();
      } catch (error) {
        toast(`Rename failed: ${error.message}`);
        renderTable();
      }
    };
    const onBlur = () => finish(true);
    input.addEventListener("blur", onBlur);
    input.addEventListener("keydown", (keyEvent) => {
      if (keyEvent.key === "Enter") finish(true);
      if (keyEvent.key === "Escape") finish(false);
    });
  });

  document.querySelectorAll("thead th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.dataset.sort;
      state.sort =
        state.sort.key === key
          ? { key, dir: state.sort.dir === "asc" ? "desc" : "asc" }
          : { key, dir: key === "name" ? "asc" : "desc" };
      store.write("sort", state.sort);
      renderTable();
      drawChart();
    });
  });

  el.filter.addEventListener("input", () => {
    state.filter = el.filter.value;
    renderTable();
  });

  $("select-all").addEventListener("click", () => {
    visiblePlots().forEach((plot) => state.selected.add(plot.id));
    persistSelection();
    renderTable();
    drawChart();
  });

  $("select-none").addEventListener("click", () => {
    state.selected.clear();
    persistSelection();
    renderTable();
    drawChart();
  });

  $("clear-all").addEventListener("click", async () => {
    if (!state.plots.length) return;
    if (!window.confirm(`Delete all ${state.plots.length} plots from the server?`)) return;
    try {
      await api("plots", { method: "DELETE" });
      await refresh();
    } catch (error) {
      toast(`Clear failed: ${error.message}`);
    }
  });

  el.mode.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button) return;
    state.mode = button.dataset.mode;
    store.write("mode", state.mode);
    syncModeButtons();
    drawChart();
  });

  function syncModeButtons() {
    el.mode.querySelectorAll("button[data-mode]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === state.mode));
    });
  }

  const optionInputs = {
    errors: $("opt-errors"),
    fits: $("opt-fits"),
    logy: $("opt-logy"),
    normalise: $("opt-normalise"),
  };
  Object.entries(optionInputs).forEach(([key, input]) => {
    input.checked = state.opts[key];
    input.addEventListener("change", () => {
      state.opts[key] = input.checked;
      store.write("opts", state.opts);
      drawChart();
    });
  });

  $("reset-zoom").addEventListener("click", () => {
    if (typeof Plotly === "undefined") return;
    Plotly.relayout(el.chart, { "xaxis.autorange": true, "yaxis.autorange": true });
    drawChart();
  });

  $("theme-toggle").addEventListener("click", () => {
    const next = isDark() ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    state.theme = next;
    store.write("theme", next);
    renderTable();
    drawChart();
  });

  window
    .matchMedia("(prefers-color-scheme: dark)")
    .addEventListener("change", () => {
      if (!document.documentElement.dataset.theme) {
        renderTable();
        drawChart();
      }
    });

  /* --------------------------------------------------------------- boot - */

  if (state.theme) document.documentElement.dataset.theme = state.theme;
  syncModeButtons();
  renderSortIndicators();
  setInterval(updateTtls, TICK_MS);
  refresh().then(startEvents);
})();
