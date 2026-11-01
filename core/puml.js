/* ============================================================
   Tools-X · PlantUML 轻量渲染（零依赖，纯 SVG）
   支持时序图 / 类图 / 活动图（常用子集），供 Docs 预览与本地预览页共用。
   入口：renderPuml(src) → SVG 字符串；无法识别时返回 ''。
============================================================ */
let PUML_SEQ = 0;

function pumlEsc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function pumlW(s, size) {
  const n = String(s || '').split('\n').reduce((a, l) => Math.max(a, l.length), 0);
  return n * (size || 12.5) * 0.62;
}
function pumlClean(src) {
  const out = [];
  let block = false;
  for (const raw of String(src || '').replace(/\r\n?/g, '\n').split('\n')) {
    const l = raw.replace(/\s+/g, ' ').trim();
    if (!l) continue;
    if (block) { if (l.includes("'/")) block = false; continue; }
    if (l.startsWith("/'")) { if (!l.includes("'/")) block = true; continue; }
    if (l.startsWith("'")) continue;
    if (/^@(start|end)uml/i.test(l)) continue;
    if (/^(skinparam|!theme|!pragma|scale|hide|show|left to right direction|top to bottom direction|allow_mixing)/i.test(l)) continue;
    out.push(l);
  }
  return out;
}
function pumlKind(lines) {
  if (lines.some((l) => /^(abstract\s+class|class|interface|enum|struct|object)\s+/i.test(l) ||
      /^entity\s+\S+\s*\{/i.test(l) ||
      /^[\w."]+\s+(<\|--|--\|>|\*--|--\*|o--|--o|<\|\.\.|\.\.\|>)\s+[\w."]/i.test(l))) return 'class';
  if (lines.some((l) => /^(start|stop|endif|endwhile|repeat|fork|:.*;)/i.test(l))) return 'activity';
  return 'sequence';
}
function pumlTitle(lines) {
  let title = '';
  for (const l of lines) {
    const m = l.match(/^title\s+(.*)$/i);
    if (m) title = m[1];
  }
  return title;
}

/* ---------------- 时序图 ---------------- */
function pumlSequence(lines, title) {
  const parts = [], map = {};
  function part(key, kind) {
    if (!map[key]) { map[key] = { key, label: key, kind: kind || 'participant', idx: parts.length }; parts.push(map[key]); }
    else if (kind) map[key].kind = kind;
    return map[key];
  }
  for (const l of lines) {
    const m = l.match(/^(participant|actor|boundary|control|entity|database|collections|queue)\s+(?:"([^"]+)"|([^\s:]+))(?:\s+as\s+([^\s:]+))?/i);
    if (m) {
      const key = (m[4] || m[2] || m[3]).trim();
      const p = part(key, m[1].toLowerCase());
      p.label = (m[2] || m[3]).trim();
    }
  }
  const events = [], frames = [];
  let y = 86, auto = 0, autoOn = false;
  let group = null;
  const act = {};
  const actBars = [];
  const noteLines = [];
  function cxOf(k) { return map[k] ? map[k].cx : 0; }
  function parseMsg(l) {
    const i = l.indexOf(':');
    const head = i >= 0 ? l.slice(0, i).trim() : l.trim();
    const text = i >= 0 ? l.slice(i + 1).trim() : '';
    const m = head.match(/^([^\s]+)\s+([<|>o*.\-#\[\]a-z0-9]+)\s+([^\s]+)$/i);
    if (!m || !/[<>]/.test(m[2])) return null;
    return { a: m[1].replace(/"/g, ''), b: m[3].replace(/"/g, ''), arrow: m[2], text };
  }
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (/^title\s+/i.test(l) || /^participant|^actor|^boundary|^control|^entity|^database|^collections|^queue/i.test(l)) continue;
    if (/^autonumber/i.test(l)) { autoOn = true; continue; }
    if (/^(activate|deactivate)\s+/i.test(l)) {
      const m = l.match(/^(activate|deactivate)\s+([^\s]+)/i);
      if (!m) continue;
      const k = m[2].replace(/"/g, '');
      if (!map[k]) part(k);
      if (m[1].toLowerCase() === 'activate') { (act[k] = act[k] || []).push(y); }
      else if (act[k] && act[k].length) actBars.push({ k, top: act[k].pop(), bottom: y });
      continue;
    }
    if (/^note\s+/i.test(l)) {
      const m = l.match(/^note\s+(left of|right of|over)\s+([^\s,]+)(?:\s*,\s*([^\s:]+))?\s*(?::\s*(.*))?/i);
      if (!m || !m[4]) continue;
      const pos = m[1].toLowerCase(), a = m[2].replace(/"/g, ''), b = (m[3] || '').replace(/"/g, '');
      const buf = [m[4]];
      if (!map[a]) part(a);
      const w = Math.max(90, Math.min(320, pumlW(buf.join('\n')) + 24));
      const h = 18 + Math.max(1, buf.length) * 16;
      events.push({ t: 'note', pos, a, b, lines: buf, w, h, y });
      y += h + 16;
      continue;
    }
    if (/^==/.test(l)) {
      const m = l.match(/^==\s*(.*?)\s*==/);
      events.push({ t: 'div', text: m ? m[1] : '', y });
      y += 34;
      continue;
    }
    const gm = l.match(/^(alt|opt|loop|group|par|critical|break)\s*(.*)$/i);
    if (gm && !group) { group = { label: (gm[2] || gm[1]).trim(), top: y - 18, seps: [] }; frames.push(group); continue; }
    if (/^else\s*/i.test(l) && group) { group.seps.push({ y: y - 12, text: l.replace(/^else\s*/i, '').trim() }); continue; }
    if (/^end$/i.test(l) && group) { group.bottom = y - 10; group = null; continue; }
    const msg = parseMsg(l);
    if (msg) {
      if (!map[msg.a]) part(msg.a);
      if (!map[msg.b]) part(msg.b);
      auto++;
      const txt = msg.text || '';
      events.push({ t: 'msg', a: msg.a, b: msg.b, arrow: msg.arrow, text: autoOn ? (auto + '. ' + txt) : txt, y });
      y += 40 + (msg.a === msg.b ? 18 : 0);
      continue;
    }
    noteLines.push(l);
  }
  for (const e of events) if (e.t === 'msg') { if (!map[e.a]) part(e.a); if (!map[e.b]) part(e.b); }

  let cursor = 24;
  const gap = 44;
  for (const p of parts) { p.w = Math.max(90, pumlW(p.label) + 28); p.cx = cursor + p.w / 2; cursor += p.w + gap; }
  const W = Math.max(240, cursor - gap + 24);
  const H = Math.max(150, y + 8) + (title ? 0 : 0);
  const id = 'pl' + (++PUML_SEQ);
  const defs = `<defs>
<marker id="${id}a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>
<marker id="${id}s" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="currentColor"/></marker>
</defs>`;
  const out = [];
  /* 分组框 */
  for (const g of frames) {
    const x1 = Math.max(12, (parts[0] ? parts[0].cx - parts[0].w / 2 : 20) - 10);
    const x2 = (parts.length ? parts[parts.length - 1].cx + parts[parts.length - 1].w / 2 : 200) + 10;
    const w = x2 - x1;
    out.push(`<rect class="pl-group" x="${x1}" y="${g.top}" width="${w}" height="${(g.bottom || y) - g.top}" rx="6"/>`);
    out.push(`<rect class="pl-bg" x="${x1}" y="${g.top - 8}" width="${pumlW(g.label, 11) + 16}" height="16" rx="3"/>`);
    out.push(`<text class="pl-group-label" x="${x1 + 8}" y="${g.top + 4}">${pumlEsc(g.label)}</text>`);
    for (const s of g.seps) {
      out.push(`<line class="pl-line pl-dash" x1="${x1}" y1="${s.y}" x2="${x2}" y2="${s.y}"/>`);
      if (s.text) {
        out.push(`<rect class="pl-bg" x="${x1 + 8}" y="${s.y - 14}" width="${pumlW(s.text, 11) + 12}" height="15"/>`);
        out.push(`<text class="pl-group-label" x="${x1 + 14}" y="${s.y - 3}">${pumlEsc(s.text)}</text>`);
      }
    }
  }
  /* 生命线 */
  for (const p of parts) out.push(`<line class="pl-lifeline" x1="${p.cx}" y1="50" x2="${p.cx}" y2="${H - 8}"/>`);
  /* 激活条 */
  for (const b of actBars) {
    const p = map[b.k]; if (!p) continue;
    out.push(`<rect class="pl-act" x="${p.cx - 5}" y="${b.top}" width="10" height="${Math.max(12, b.bottom - b.top)}" rx="2"/>`);
  }
  /* 消息 / 分隔 / 备注 */
  for (const e of events) {
    if (e.t === 'msg') {
      const a = map[e.a], b = map[e.b];
      const x1 = a.cx, x2 = b.cx;
      const dash = e.arrow.includes('--') || e.arrow.includes('..');
      const headStart = e.arrow.includes('<') && !e.arrow.includes('>');
      if (a === b) {
        const d = `M${x1},${e.y} H${x1 + 36} V${e.y + 24} H${x1}`;
        out.push(`<path class="pl-line${dash ? ' pl-dash' : ''}" d="${d}" marker-end="url(#${id}a)"/>`);
        if (e.text) {
          out.push(`<text class="pl-label" x="${x1 + 44}" y="${e.y + 16}">${pumlEsc(e.text)}</text>`);
        }
      } else {
        out.push(`<line class="pl-line${dash ? ' pl-dash' : ''}" x1="${x1}" y1="${e.y}" x2="${x2}" y2="${e.y}" ${headStart ? `marker-start="url(#${id}s)"` : `marker-end="url(#${id}a)"`}/>`);
        if (e.text) {
          const mid = (x1 + x2) / 2, tw = pumlW(e.text, 11.5);
          out.push(`<rect class="pl-bg" x="${mid - tw / 2 - 4}" y="${e.y - 17}" width="${tw + 8}" height="15"/>`);
          out.push(`<text class="pl-label" x="${mid}" y="${e.y - 6}" text-anchor="middle">${pumlEsc(e.text)}</text>`);
        }
      }
    } else if (e.t === 'div') {
      const x1 = (parts[0] ? parts[0].cx - 20 : 20), x2 = (parts[parts.length - 1] ? parts[parts.length - 1].cx + 20 : 220);
      out.push(`<line class="pl-line pl-dash" x1="${x1}" y1="${e.y}" x2="${x2}" y2="${e.y}"/>`);
      if (e.text) {
        const mid = (x1 + x2) / 2, tw = pumlW(e.text, 11.5);
        out.push(`<rect class="pl-bg" x="${mid - tw / 2 - 5}" y="${e.y - 16}" width="${tw + 10}" height="15"/>`);
        out.push(`<text class="pl-label" x="${mid}" y="${e.y - 5}" text-anchor="middle">${pumlEsc(e.text)}</text>`);
      }
    } else if (e.t === 'note') {
      const a = map[e.a], b = e.b && map[e.b];
      let nx = a.cx - e.w - 10;
      if (e.pos === 'right of') nx = a.cx + 10;
      else if (e.pos === 'over') nx = b ? (a.cx + b.cx) / 2 - Math.max(e.w, Math.abs(b.cx - a.cx) + 40) / 2 : a.cx - e.w / 2;
      const nw = e.pos === 'over' && b ? Math.max(e.w, Math.abs(b.cx - a.cx) + 40) : e.w;
      out.push(`<path class="pl-note" d="M${nx},${e.y} H${nx + nw - 10} L${nx + nw},${e.y + 10} V${e.y + e.h} H${nx} Z"/>`);
      out.push(`<path class="pl-line" d="M${nx + nw - 10},${e.y} V${e.y + 10} H${nx + nw}"/>`);
      e.lines.forEach((line, k) => out.push(`<text class="pl-note-t" x="${nx + 9}" y="${e.y + 20 + k * 16}">${pumlEsc(line)}</text>`));
    }
  }
  /* 参与者头部 */
  for (const p of parts) {
    out.push(`<rect class="pl-box${p.kind === 'actor' ? ' pl-actor' : ''}" x="${p.cx - p.w / 2}" y="16" width="${p.w}" height="34" rx="6"/>`);
    out.push(`<text class="pl-name" x="${p.cx}" y="37" text-anchor="middle">${pumlEsc(p.label)}</text>`);
  }
  const off = title ? 28 : 0;
  const body = off ? `<g transform="translate(0,${off})">${out.join('')}</g>` : out.join('');
  const cap = title ? `<text class="pl-title" x="${W / 2}" y="19" text-anchor="middle">${pumlEsc(title)}</text>` : '';
  return `<svg class="puml-svg" viewBox="0 0 ${W} ${H + off}" width="${W}" height="${H + off}" role="img" aria-label="${pumlEsc(title || 'PlantUML 时序图')}">${defs}${cap}${body}</svg>`;
}

/* ---------------- 类图 ---------------- */
function pumlClass(lines, title) {
  const nodes = [], map = {};
  function get(name) {
    if (!map[name]) { map[name] = { name, label: name, stereo: '', members: [], idx: nodes.length }; nodes.push(map[name]); }
    return map[name];
  }
  const relRe = /^("?[\w.]+"?)\s+([<|>o*.\-#\[\]a-z0-9]+)\s+("?[\w.]+"?)\s*(?::\s*(.*))?$/i;
  const isArrow = (a) => !!a && /[-.]/.test(a) && /^[<>|o*.-]+$/.test(a);
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (/^title\s+/i.test(l)) { i++; continue; }
    const m = l.match(/^(abstract\s+class|class|interface|enum|object|entity|struct)\s+("([^"]+)"|[^\s{]+)(?:\s+as\s+([^\s{]+))?\s*(\{)?/i);
    if (m) {
      const key = (m[4] || m[3] || m[2]).trim();
      const n = get(key);
      n.label = (m[3] || m[2]).trim();
      const st = m[1].toLowerCase();
      n.stereo = st === 'class' || st === 'struct' ? '' : (st === 'abstract class' ? 'abstract' : st);
      const hasBrace = !!m[5];
      i++;
      if (hasBrace || (i < lines.length && lines[i] === '{')) {
        while (i < lines.length && lines[i] !== '}') {
          if (lines[i] !== '--' && !/^note /i.test(lines[i])) n.members.push(lines[i]);
          i++;
        }
        i++;
      }
      continue;
    }
    const rm = l.match(relRe);
    if (rm && isArrow(rm[2])) { i++; continue; }
    const fm = l.match(/^("?[^\s:"]+"?|[^\s:]+)\s*:\s*(.+)$/);
    if (fm) { get(fm[1].replace(/"/g, '')).members.push(fm[2]); i++; continue; }
    i++;
  }
  const rels = [];
  for (const l of lines) {
    const m = l.match(relRe);
    if (!m || !isArrow(m[2])) continue;
    const a = map[m[1].replace(/"/g, '')], b = map[m[3].replace(/"/g, '')];
    if (a && b) rels.push({ a, b, arrow: m[2], label: m[4] || '' });
  }
  if (!nodes.length) return '';
  const BW = 212, GX = 96, GY = 72;
  const cols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(nodes.length))));
  const rows = Math.ceil(nodes.length / cols);
  const rowH = [];
  nodes.forEach((n, k) => {
    const r = Math.floor(k / cols);
    rowH[r] = Math.max(rowH[r] || 0, 46 + n.members.length * 17);
  });
  const off = title ? 26 : 0;
  let y = 28 + off;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const k = r * cols + c, n = nodes[k];
      if (!n) continue;
      n.x = 24 + c * (BW + GX); n.y = y; n.w = BW; n.h = rowH[r];
    }
    y += rowH[r] + GY;
  }
  const W = 24 + cols * BW + (cols - 1) * GX + 24;
  const H = y - GY + 28;
  const id = 'pl' + (++PUML_SEQ);
  const defs = `<defs>
<marker id="${id}a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>
<marker id="${id}s" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="currentColor"/></marker>
<marker id="${id}t" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,0 L12,6 L0,12 z" fill="none" stroke="currentColor" stroke-width="1.2"/></marker>
<marker id="${id}d" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,6 L6,0 L12,6 L6,12 z" fill="currentColor"/></marker>
<marker id="${id}o" viewBox="0 0 12 12" refX="10" refY="6" markerWidth="10" markerHeight="10" orient="auto"><path d="M0,6 L6,0 L12,6 L6,12 z" fill="none" stroke="currentColor" stroke-width="1.2"/></marker>
</defs>`;
  const out = [];
  /* 关系线 */
  for (const r of rels) {
    const a = r.a, b = r.b;
    const acx = a.x + a.w / 2, acy = a.y + a.h / 2, bcx = b.x + b.w / 2, bcy = b.y + b.h / 2;
    let x1, y1, x2, y2;
    if (Math.abs(bcx - acx) >= Math.abs(bcy - acy)) {
      x1 = bcx > acx ? a.x + a.w : a.x; y1 = acy;
      x2 = bcx > acx ? b.x : b.x + b.w; y2 = bcy;
    } else {
      x1 = acx; y1 = bcy > acy ? a.y + a.h : a.y;
      x2 = bcx; y2 = bcy > acy ? b.y : b.y + b.h;
    }
    const headStart = /^[<*o|]/.test(r.arrow);
    let mark = 'a';
    if (/<\|/.test(r.arrow) || /\|>/.test(r.arrow)) mark = 't';
    else if (/^[*]/.test(r.arrow) || /[*]$/.test(r.arrow)) mark = 'd';
    else if (/^[o]/.test(r.arrow) || /[o]$/.test(r.arrow)) mark = 'o';
    const dash = r.arrow.includes('..') || r.arrow.includes('.');
    out.push(`<line class="pl-line${dash ? ' pl-dash' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" ${headStart ? `marker-start="url(#${id}${mark})"` : `marker-end="url(#${id}${mark})"`}/>`);
    if (r.label) {
      const mx = (x1 + x2) / 2, my = (y1 + y2) / 2, tw = pumlW(r.label, 11);
      out.push(`<rect class="pl-bg" x="${mx - tw / 2 - 4}" y="${my - 17}" width="${tw + 8}" height="15"/>`);
      out.push(`<text class="pl-label" x="${mx}" y="${my - 6}" text-anchor="middle">${pumlEsc(r.label)}</text>`);
    }
  }
  /* 类框 */
  for (const n of nodes) {
    const hh = n.stereo ? 38 : 30;
    out.push(`<rect class="pl-box" x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6"/>`);
    out.push(`<rect class="pl-box-head" x="${n.x}" y="${n.y}" width="${n.w}" height="${hh}" rx="6"/>`);
    if (n.stereo) out.push(`<text class="pl-stereo" x="${n.x + n.w / 2}" y="${n.y + 14}" text-anchor="middle">«${pumlEsc(n.stereo)}»</text>`);
    out.push(`<text class="pl-name" x="${n.x + n.w / 2}" y="${n.y + (n.stereo ? 31 : 20)}" text-anchor="middle">${pumlEsc(n.label)}</text>`);
    n.members.forEach((m, k) => out.push(`<text class="pl-member" x="${n.x + 10}" y="${n.y + hh + 16 + k * 17}">${pumlEsc(m)}</text>`));
  }
  const cap = title ? `<text class="pl-title" x="${W / 2}" y="19" text-anchor="middle">${pumlEsc(title)}</text>` : '';
  return `<svg class="puml-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${pumlEsc(title || 'PlantUML 类图')}">${defs}${cap}${out.join('')}</svg>`;
}

/* ---------------- 活动图 ---------------- */
function pumlActivity(lines, title) {
  const nodes = [], edges = [];
  let cursor = 0, x = 0, prev = [], titleH = title ? 24 : 0;
  const GAP = 30, ctx = [];
  function add(shape, text, w, h) {
    const n = { shape, text, x, w, h, y: cursor + GAP };
    nodes.push(n);
    for (const p of prev) edges.push({ from: p, to: n });
    cursor = n.y + n.h;
    prev = [n];
    return n;
  }
  for (const l of lines) {
    if (/^title /i.test(l)) continue;
    if (/^(start)$/i.test(l)) { add('start', '', 20, 20); continue; }
    if (/^(stop|end)$/i.test(l)) { add('stop', '', 22, 22); continue; }
    const act = l.match(/^:\s*(.*?)(?:;|$)/);
    if (act) { const text = act[1]; add('action', text, Math.min(300, Math.max(90, pumlW(text) + 28)), 22 + (text.split('\n').length - 1) * 17); continue; }
    const iff = l.match(/^if\s*\((.*?)\)(?:\s+then\s*\((.*?)\))?/i);
    if (iff) {
      const d = add('diamond', iff[1], 160, 76);
      ctx.push({ type: 'if', x, d, thenEnds: [], elseEnds: [], elseX: x + 250, phase: 'then' });
      continue;
    }
    if (/^else/i.test(l) && ctx.length) {
      const c = ctx[ctx.length - 1];
      c.thenEnds = prev.slice();
      c.phase = 'else';
      x = c.elseX;
      cursor = c.d.y + c.d.h;
      prev = [c.d];
      continue;
    }
    if (/^(endif|endwhile)$/i.test(l) && ctx.length) {
      const c = ctx.pop();
      if (c.phase === 'else') c.elseEnds = prev.slice(); else c.thenEnds = prev.slice();
      const ends = (c.thenEnds || []).concat(c.elseEnds || []);
      const bottom = ends.length ? Math.max(...ends.map((n) => n.y + n.h)) : cursor;
      cursor = bottom;
      x = c.x;
      prev = ends.length ? ends : [c.d];
      if (c.type === 'while' && c.d) edges.push({ from: ends[0] || c.d, to: c.d, back: true });
      continue;
    }
    if (/^while\s*\((.*?)\)/i.test(l)) {
      const m = l.match(/^while\s*\((.*?)\)/i);
      const d = add('diamond', m[1], 160, 76);
      ctx.push({ type: 'while', x, d, thenEnds: [], elseEnds: [], phase: 'then' });
      continue;
    }
    /* repeat / fork / note / partition / swimlane 等：忽略 */
  }
  if (!nodes.length) return '';
  const minL = Math.min(...nodes.map((n) => n.x - n.w / 2));
  const maxR = Math.max(...nodes.map((n) => n.x + n.w / 2));
  const dx = 24 - Math.min(0, minL);
  const W = maxR - minL + 48;
  const H = cursor + 30 + titleH;
  const id = 'pl' + (++PUML_SEQ);
  const defs = `<defs><marker id="${id}a" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker></defs>`;
  const out = [];
  for (const e of edges) {
    const a = e.from, b = e.to;
    if (e.back) {
      const ax = a.x + dx + a.w / 2, ay = a.y + titleH + a.h / 2;
      const bx = b.x + dx + b.w / 2 + 10, by = b.y + titleH + b.h / 2;
      out.push(`<path class="pl-line" d="M${ax},${ay} H${bx} V${by}" marker-end="url(#${id}a)"/>`);
      continue;
    }
    const x1 = a.x + dx, y1 = a.y + titleH + a.h, x2 = b.x + dx, y2 = b.y + titleH;
    const mid = (y1 + y2) / 2;
    out.push(`<path class="pl-line" d="M${x1},${y1} V${mid} H${x2} V${y2}" marker-end="url(#${id}a)"/>`);
  }
  for (const n of nodes) {
    const px = n.x + dx, py = n.y + titleH;
    if (n.shape === 'start') out.push(`<circle class="pl-fill" cx="${px}" cy="${py + n.h / 2}" r="9"/>`);
    else if (n.shape === 'stop') { out.push(`<circle class="pl-box" cx="${px}" cy="${py + n.h / 2}" r="11"/>`); out.push(`<circle class="pl-fill" cx="${px}" cy="${py + n.h / 2}" r="6"/>`); }
    else if (n.shape === 'diamond') {
      const hw = n.w / 2, hh = n.h / 2;
      out.push(`<polygon class="pl-box" points="${px},${py} ${px + hw},${py + hh} ${px},${py + n.h} ${px - hw},${py + hh}"/>`);
      out.push(`<text class="pl-label" x="${px}" y="${py + hh + 4}" text-anchor="middle">${pumlEsc(n.text)}</text>`);
    } else {
      out.push(`<rect class="pl-box" x="${px - n.w / 2}" y="${py}" width="${n.w}" height="${n.h}" rx="8"/>`);
      out.push(`<text class="pl-label" x="${px}" y="${py + n.h / 2 + 4}" text-anchor="middle">${pumlEsc(n.text)}</text>`);
    }
  }
  const cap = title ? `<text class="pl-title" x="${W / 2}" y="18" text-anchor="middle">${pumlEsc(title)}</text>` : '';
  return `<svg class="puml-svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${pumlEsc(title || 'PlantUML 活动图')}">${defs}${cap}${out.join('')}</svg>`;
}

/* ---------------- 入口 ---------------- */
function renderPuml(src) {
  try {
    const lines = pumlClean(src);
    if (!lines.length) return '';
    const title = pumlTitle(lines);
    const kind = pumlKind(lines);
    if (kind === 'class') return pumlClass(lines, title);
    if (kind === 'activity') return pumlActivity(lines, title);
    return pumlSequence(lines, title);
  } catch (e) {
    return '';
  }
}
