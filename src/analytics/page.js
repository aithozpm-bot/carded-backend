function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function number(value, digits = 0) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(Number(value || 0));
}

function date(value, withTime = false) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(new Date(value));
}

function percentage(part, total) {
  return Number(total) ? (Number(part) / Number(total)) * 100 : 0;
}

function growth(value) {
  if (value === null) return '<span class="delta up">New</span>';
  const numeric = Number(value || 0);
  const className = numeric > 0 ? 'up' : numeric < 0 ? 'down' : 'flat';
  const sign = numeric > 0 ? '+' : '';
  return `<span class="delta ${className}">${sign}${number(numeric, 1)}%</span>`;
}

function option(value, selected, label = value) {
  return `<option value="${escapeHtml(value)}"${value === selected ? ' selected' : ''}>${escapeHtml(label)}</option>`;
}

function bars(rows, emptyText = 'No data in this period') {
  if (!rows.length) return `<div class="empty">${escapeHtml(emptyText)}</div>`;
  const max = Math.max(...rows.map((row) => Number(row.value)), 1);
  const total = rows.reduce((sum, row) => sum + Number(row.value), 0);
  return rows.map((row) => `
    <div class="bar-row">
      <div class="bar-label" title="${escapeHtml(row.label)}">${escapeHtml(row.label)}</div>
      <div class="bar-track"><span style="width:${(Number(row.value) / max) * 100}%"></span></div>
      <div class="bar-value">${number(row.value)} <small>${number(percentage(row.value, total), 1)}%</small></div>
    </div>`).join('');
}

function qualityRow(label, value, total) {
  const pct = percentage(value, total);
  return `
    <div class="quality-row">
      <div><span>${escapeHtml(label)}</span><strong>${number(value)} <small>(${number(pct, 1)}%)</small></strong></div>
      <div class="quality-track"><span style="width:${pct}%"></span></div>
    </div>`;
}

function userRows(users, recent = false) {
  if (!users.length) return '<tr><td colspan="5" class="empty">No users found</td></tr>';
  return users.map((user) => `
    <tr>
      <td><strong>${escapeHtml(user.full_name)}</strong><small>${escapeHtml(user.email)}</small></td>
      <td>${number(user.cards)}</td>
      <td>${number(user.scans)}</td>
      <td>${date(user.created_at)}</td>
      <td>${recent ? 'New signup' : date(user.last_scan, true)}</td>
    </tr>`).join('');
}

function renderAnalyticsPage(data, secret) {
  const { filters } = data;
  const startValue = filters.from.toISOString().slice(0, 10);
  const endDate = new Date(filters.to.getTime() - 1);
  const endValue = endDate.toISOString().slice(0, 10);
  const chartData = JSON.stringify(data.trend).replace(/</g, '\\u003c');
  const scanOptions = (data.options.scan_types || []).map((v) => option(v, filters.scanType)).join('');
  const categoryOptions = (data.options.categories || []).map((v) => option(v, filters.category)).join('');
  const leadOptions = (data.options.lead_types || []).map((v) => option(v, filters.leadType)).join('');
  const authSuccessRate = percentage(data.auth.login_success, Number(data.auth.login_success) + Number(data.auth.login_failed));
  const params = new URLSearchParams({
    secret,
    range: filters.range,
    start: startValue,
    end: endValue,
    scanType: filters.scanType,
    category: filters.category,
    leadType: filters.leadType,
    format: 'csv',
  });

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="robots" content="noindex,nofollow,noarchive">
  <title>Carded Analytics</title>
  <style>
    :root{--bg:#07101f;--panel:#0d192b;--panel2:#101f34;--line:#1d304a;--text:#edf4ff;--muted:#8ca0bb;--purple:#8b5cf6;--cyan:#22d3ee;--green:#34d399;--red:#fb7185;--orange:#fbbf24}
    *{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% -20%,#2a155b 0,transparent 34%),var(--bg);color:var(--text);font:14px/1.45 Inter,ui-sans-serif,system-ui,-apple-system,sans-serif}
    .shell{max-width:1500px;margin:auto;padding:28px}.top{display:flex;align-items:flex-start;justify-content:space-between;gap:20px;margin-bottom:22px}
    h1{font-size:28px;letter-spacing:-.04em;margin:0}.brand{display:flex;align-items:center;gap:12px}.logo{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:linear-gradient(135deg,var(--purple),#5b21b6);box-shadow:0 12px 35px #7c3aed44;font-size:20px}
    .subtitle,.meta,small{color:var(--muted)}.subtitle{margin-top:3px}.live{display:inline-flex;align-items:center;gap:7px;color:var(--green);font-weight:700}.live:before{content:"";width:7px;height:7px;border-radius:50%;background:var(--green);box-shadow:0 0 0 5px #34d39918}
    .actions{display:flex;gap:8px;align-items:center}.button{border:1px solid var(--line);background:var(--panel);color:var(--text);padding:9px 13px;border-radius:10px;text-decoration:none;cursor:pointer;font-weight:650}.button:hover{border-color:#4f6a8c}.button.primary{background:var(--purple);border-color:var(--purple)}
    .filters{display:grid;grid-template-columns:1.15fr repeat(5,minmax(120px,1fr)) auto;gap:10px;padding:14px;border:1px solid var(--line);border-radius:16px;background:#0b1728cc;backdrop-filter:blur(12px);margin-bottom:18px}
    label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:750;margin-bottom:5px}select,input{width:100%;height:39px;border:1px solid var(--line);border-radius:9px;background:#081322;color:var(--text);padding:0 10px;outline:none}select:focus,input:focus{border-color:var(--purple)}.filter-submit{align-self:end;height:39px}
    .grid{display:grid;gap:14px}.kpis{grid-template-columns:repeat(4,1fr);margin-bottom:14px}.card{background:linear-gradient(145deg,#101e32dd,#0b1627dd);border:1px solid var(--line);border-radius:16px;padding:18px;min-width:0}.kpi{position:relative;overflow:hidden}.kpi:after{content:"";position:absolute;width:90px;height:90px;border-radius:50%;background:var(--accent);filter:blur(50px);opacity:.2;right:-25px;top:-30px}.kpi-label{color:var(--muted);font-weight:650}.kpi-value{font-size:31px;font-weight:800;letter-spacing:-.04em;margin:7px 0 3px}.kpi-foot{display:flex;justify-content:space-between;gap:8px;font-size:12px}.delta{font-weight:750}.delta.up{color:var(--green)}.delta.down{color:var(--red)}.delta.flat{color:var(--muted)}
    .two{grid-template-columns:minmax(0,1.65fr) minmax(300px,1fr);margin-bottom:14px}.three{grid-template-columns:repeat(3,1fr);margin-bottom:14px}.section-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:17px}.section-head h2{font-size:16px;margin:0;letter-spacing:-.02em}.section-head p{margin:3px 0 0;color:var(--muted);font-size:12px}
    .legend{display:flex;gap:13px;flex-wrap:wrap}.legend span{font-size:11px;color:var(--muted)}.legend i{display:inline-block;width:7px;height:7px;border-radius:50%;margin-right:5px}.chart-wrap{height:265px;position:relative}.chart-wrap canvas{width:100%;height:100%}
    .funnel-step{margin-bottom:17px}.funnel-step:last-child{margin:0}.funnel-copy{display:flex;justify-content:space-between;margin-bottom:6px}.funnel-copy strong{font-size:17px}.funnel-track,.quality-track,.bar-track{height:8px;background:#07111f;border-radius:99px;overflow:hidden}.funnel-track span,.quality-track span,.bar-track span{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,var(--purple),var(--cyan))}
    .bar-row{display:grid;grid-template-columns:minmax(85px,1fr) 2fr 82px;align-items:center;gap:10px;margin:13px 0}.bar-label{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.bar-value{text-align:right;font-weight:700}.bar-value small{font-weight:500}.bar-track{height:7px}.empty{padding:34px;text-align:center;color:var(--muted)}
    .auth-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:11px}.mini{background:#081523;border:1px solid #172a42;border-radius:12px;padding:13px}.mini strong{display:block;font-size:20px;margin-bottom:2px}.mini span{color:var(--muted);font-size:11px}.quality-row{margin:14px 0}.quality-row>div:first-child{display:flex;justify-content:space-between;margin-bottom:6px}.quality-row small{font-weight:500}.quality-track{height:6px}
    .table-card{padding:0;overflow:hidden}.table-head{padding:18px 18px 0}table{border-collapse:collapse;width:100%}th,td{text-align:left;padding:12px 18px;border-top:1px solid var(--line);white-space:nowrap}th{font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}td:first-child{white-space:normal}td strong,td small{display:block}.tables{grid-template-columns:1fr 1fr;margin-bottom:14px}
    .footer{display:flex;justify-content:space-between;gap:12px;color:var(--muted);font-size:11px;padding:5px 2px 20px}
    @media(max-width:1100px){.filters{grid-template-columns:repeat(3,1fr)}.kpis{grid-template-columns:repeat(2,1fr)}.three{grid-template-columns:1fr 1fr}.three .card:last-child{grid-column:1/-1}.tables{grid-template-columns:1fr}}
    @media(max-width:720px){.shell{padding:16px}.top{display:block}.actions{margin-top:14px}.filters{grid-template-columns:1fr 1fr}.two,.three,.kpis{grid-template-columns:1fr}.three .card:last-child{grid-column:auto}.auth-grid{grid-template-columns:1fr 1fr}.table-card{overflow:auto}.footer{display:block}.filter-submit{width:100%}}
  </style>
</head>
<body>
  <main class="shell">
    <header class="top">
      <div class="brand"><div class="logo">♠</div><div><h1>Carded Analytics</h1><div class="subtitle">Product, growth, engagement and security overview</div></div></div>
      <div class="actions">
        <span class="live">Live database</span>
        <a class="button" href="/analytics?${params.toString()}">Export CSV</a>
        <button class="button" onclick="location.reload()">Refresh</button>
      </div>
    </header>

    <form class="filters" method="get" action="/analytics">
      <input type="hidden" name="secret" value="${escapeHtml(secret)}">
      <div><label for="range">Date range</label><select id="range" name="range">
        ${option('7d', filters.range, 'Last 7 days')}${option('30d', filters.range, 'Last 30 days')}${option('90d', filters.range, 'Last 90 days')}${option('365d', filters.range, 'Last 12 months')}${option('custom', filters.range, 'Custom range')}
      </select></div>
      <div><label for="start">Start</label><input id="start" type="date" name="start" value="${startValue}"></div>
      <div><label for="end">End</label><input id="end" type="date" name="end" value="${endValue}"></div>
      <div><label for="scanType">Scan source</label><select id="scanType" name="scanType"><option value="">All sources</option>${scanOptions}</select></div>
      <div><label for="category">Category</label><select id="category" name="category"><option value="">All categories</option>${categoryOptions}</select></div>
      <div><label for="leadType">Lead type</label><select id="leadType" name="leadType"><option value="">All lead types</option>${leadOptions}</select></div>
      <button class="button primary filter-submit" type="submit">Apply filters</button>
    </form>

    <section class="grid kpis">
      <article class="card kpi" style="--accent:var(--purple)"><div class="kpi-label">New users</div><div class="kpi-value">${number(data.period.users)}</div><div class="kpi-foot">${growth(data.growth.users)}<span>${number(data.totals.users)} all-time</span></div></article>
      <article class="card kpi" style="--accent:var(--cyan)"><div class="kpi-label">Cards created</div><div class="kpi-value">${number(data.period.cards)}</div><div class="kpi-foot">${growth(data.growth.cards)}<span>${number(data.totals.cards)} all-time</span></div></article>
      <article class="card kpi" style="--accent:var(--green)"><div class="kpi-label">Cards collected</div><div class="kpi-value">${number(data.period.collected)}</div><div class="kpi-foot">${growth(data.growth.collected)}<span>${number(data.totals.collected)} all-time</span></div></article>
      <article class="card kpi" style="--accent:var(--orange)"><div class="kpi-label">Active users</div><div class="kpi-value">${number(data.period.active_users)}</div><div class="kpi-foot"><span class="delta flat">${number(percentage(data.period.active_users, data.totals.users), 1)}% of users</span><span>selected period</span></div></article>
    </section>

    <section class="grid two">
      <article class="card">
        <div class="section-head"><div><h2>Growth trend</h2><p>New users, cards created, and cards collected per ${escapeHtml(data.bucket)}</p></div><div class="legend"><span><i style="background:#8b5cf6"></i>Users</span><span><i style="background:#22d3ee"></i>Cards</span><span><i style="background:#34d399"></i>Collected</span></div></div>
        <div class="chart-wrap"><canvas id="trend" aria-label="Growth trend chart"></canvas></div>
      </article>
      <article class="card">
        <div class="section-head"><div><h2>Activation funnel</h2><p>All-time account adoption</p></div></div>
        <div class="funnel-step"><div class="funnel-copy"><span>Registered users</span><strong>${number(data.funnel.users)}</strong></div><div class="funnel-track"><span style="width:100%"></span></div></div>
        <div class="funnel-step"><div class="funnel-copy"><span>Created a card</span><strong>${number(data.funnel.with_card)} <small>${number(percentage(data.funnel.with_card, data.funnel.users), 1)}%</small></strong></div><div class="funnel-track"><span style="width:${percentage(data.funnel.with_card, data.funnel.users)}%"></span></div></div>
        <div class="funnel-step"><div class="funnel-copy"><span>Collected a card</span><strong>${number(data.funnel.with_scan)} <small>${number(percentage(data.funnel.with_scan, data.funnel.users), 1)}%</small></strong></div><div class="funnel-track"><span style="width:${percentage(data.funnel.with_scan, data.funnel.users)}%"></span></div></div>
        <div class="funnel-step"><div class="funnel-copy"><span>Fully activated</span><strong>${number(data.funnel.activated)} <small>${number(percentage(data.funnel.activated, data.funnel.users), 1)}%</small></strong></div><div class="funnel-track"><span style="width:${percentage(data.funnel.activated, data.funnel.users)}%"></span></div></div>
        <div class="auth-grid"><div class="mini"><strong>${number(data.funnel.avg_cards, 2)}</strong><span>Avg cards / user</span></div><div class="mini"><strong>${number(data.funnel.avg_scans, 2)}</strong><span>Avg scans / user</span></div><div class="mini"><strong>${number(percentage(data.funnel.activated, data.funnel.users), 1)}%</strong><span>Activation rate</span></div></div>
      </article>
    </section>

    <section class="grid three">
      <article class="card"><div class="section-head"><div><h2>Scan sources</h2><p>How contacts were captured</p></div></div>${bars(data.scans)}</article>
      <article class="card"><div class="section-head"><div><h2>Categories</h2><p>Contact organization coverage</p></div></div>${bars(data.categories)}</article>
      <article class="card"><div class="section-head"><div><h2>Lead types</h2><p>Lead qualification mix</p></div></div>${bars(data.leads)}</article>
    </section>

    <section class="grid two">
      <article class="card">
        <div class="section-head"><div><h2>Authentication health</h2><p>Security and login activity in selected period</p></div><strong>${number(authSuccessRate, 1)}% <small>login success</small></strong></div>
        <div class="auth-grid">
          <div class="mini"><strong>${number(data.auth.login_success)}</strong><span>Successful logins</span></div>
          <div class="mini"><strong>${number(data.auth.login_failed)}</strong><span>Failed logins</span></div>
          <div class="mini"><strong>${number(data.auth.unique_logins)}</strong><span>Unique users logged in</span></div>
          <div class="mini"><strong>${number(data.auth.password_resets)}</strong><span>Password reset events</span></div>
          <div class="mini"><strong>${number(data.auth.otp_failed)}</strong><span>Failed OTP checks</span></div>
          <div class="mini"><strong>${number(data.auth.rate_limited)}</strong><span>Rate-limited events</span></div>
        </div>
      </article>
      <article class="card">
        <div class="section-head"><div><h2>Collected-card completeness</h2><p>Data quality in the filtered set</p></div><strong>${number(data.quality.total)} <small>records</small></strong></div>
        ${qualityRow('Has email', data.quality.with_email, data.quality.total)}
        ${qualityRow('Has phone', data.quality.with_phone, data.quality.total)}
        ${qualityRow('Has company', data.quality.with_company, data.quality.total)}
        ${qualityRow('Has website', data.quality.with_website, data.quality.total)}
        ${qualityRow('Has notes', data.quality.with_remarks, data.quality.total)}
        ${qualityRow('Has image', data.quality.with_image, data.quality.total)}
      </article>
    </section>

    <section class="grid tables">
      <article class="card table-card"><div class="section-head table-head"><div><h2>Most engaged users</h2><p>Ranked by collected cards</p></div></div><table><thead><tr><th>User</th><th>Cards</th><th>Scans</th><th>Joined</th><th>Last scan</th></tr></thead><tbody>${userRows(data.topUsers)}</tbody></table></article>
      <article class="card table-card"><div class="section-head table-head"><div><h2>Recent signups</h2><p>Latest registered accounts</p></div></div><table><thead><tr><th>User</th><th>Cards</th><th>Scans</th><th>Joined</th><th>Status</th></tr></thead><tbody>${userRows(data.recentUsers, true)}</tbody></table></article>
    </section>

    <footer class="footer"><span>Period: ${date(filters.from)} – ${date(endDate)} · Filters affect collected-card metrics</span><span>Generated ${date(data.generatedAt, true)} · Query ${number(data.queryTimeMs)} ms · ${number(data.totals.auth_events)} auth events all-time</span></footer>
  </main>
  <script>
    (() => {
      const rows = ${chartData};
      const canvas = document.getElementById('trend');
      const ctx = canvas.getContext('2d');
      const colors = { users: '#8b5cf6', cards: '#22d3ee', scans: '#34d399' };
      function draw() {
        const rect = canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
        ctx.scale(dpr, dpr);
        const w = rect.width, h = rect.height, pad = { l: 35, r: 10, t: 10, b: 28 };
        const max = Math.max(1, ...rows.flatMap(r => [r.users, r.cards, r.scans].map(Number)));
        ctx.font = '10px system-ui'; ctx.lineWidth = 1; ctx.strokeStyle = '#1d304a'; ctx.fillStyle = '#7186a3';
        for (let i = 0; i <= 4; i++) {
          const y = pad.t + (h-pad.t-pad.b) * i / 4;
          ctx.beginPath(); ctx.moveTo(pad.l,y); ctx.lineTo(w-pad.r,y); ctx.stroke();
          ctx.fillText(Math.round(max*(1-i/4)), 3, y+3);
        }
        if (rows.length < 2) return;
        const x = i => pad.l + (w-pad.l-pad.r) * i / (rows.length-1);
        const y = v => pad.t + (h-pad.t-pad.b) * (1-Number(v)/max);
        for (const key of ['users','cards','scans']) {
          ctx.beginPath(); ctx.lineWidth = 2; ctx.strokeStyle = colors[key];
          rows.forEach((r,i) => i ? ctx.lineTo(x(i),y(r[key])) : ctx.moveTo(x(i),y(r[key])));
          ctx.stroke();
        }
        const labels = Math.min(6, rows.length);
        ctx.fillStyle = '#7186a3'; ctx.textAlign = 'center';
        for (let i=0;i<labels;i++) {
          const index = Math.round(i*(rows.length-1)/(labels-1 || 1));
          ctx.fillText(new Date(rows[index].bucket).toLocaleDateString('en-IN',{day:'2-digit',month:'short'}),x(index),h-5);
        }
      }
      draw(); addEventListener('resize', draw);
      document.getElementById('range').addEventListener('change', event => {
        const custom = event.target.value === 'custom';
        document.getElementById('start').disabled = !custom;
        document.getElementById('end').disabled = !custom;
      });
    })();
  </script>
</body>
</html>`;
}

module.exports = { renderAnalyticsPage };
