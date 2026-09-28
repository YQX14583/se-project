/* MarkHub — 轻量 Markdown 渲染器（CommonMark 子集 + GFM 扩展）
 * 覆盖：标题/粗体/斜体/行内代码/代码块/引用/有序无序列表/任务列表/表格/
 *       链接/图片/水平线/删除线/[[wiki-link]]
 * 设计约束：非法结构容错渲染、绝不抛异常（对应 FR-03 边界条款）
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* ---------- 行内解析 ---------- */
  function inline(text) {
    const tokens = [];
    // 先整体转义 HTML（默认不透传原始 HTML，防注入），再抽取代码片段保护起来
    let s = escapeHtml(String(text)).replace(/`([^`]+)`/g, (m, code) => {
      tokens.push('<code>' + code + '</code>');
      return '\u0000' + (tokens.length - 1) + '\u0000';
    });
    // wiki-link [[...]]
    s = s.replace(/\[\[([^\[\]]+?)\]\]/g, (m, name) => {
      const esc = name.trim();
      return '<a class="wiki-link" data-note="' + esc + '" href="javascript:void(0)">' + esc + '</a>';
    });
    // 图片 ![alt](src)
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,
      (m, alt, src) => '<img alt="' + alt + '" src="' + src + '" loading="lazy">');
    // 链接 [text](url)
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,
      (m, txt, url) => '<a href="' + url + '" target="_blank" rel="noopener">' + txt + '</a>');
    // 粗体 **x** / 斜体 *x* / 删除线 ~~x~~
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
    // 还原代码片段
    s = s.replace(/\u0000(\d+)\u0000/g, (m, i) => tokens[+i]);
    return s;
  }

  /* ---------- 块级解析 ---------- */
  function render(src) {
    if (src == null) src = '';
    const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    let i = 0;

    function parseTable(start) {
      const row = (l) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
      if (start + 1 >= lines.length) return -1;
      const sep = lines[start + 1].trim();
      if (!/^\|?[\s:-]+\|[\s:|-]*$/.test(sep) || !sep.includes('-')) return -1;
      const heads = row(lines[start]);
      let j = start + 2, body = [];
      while (j < lines.length && lines[j].trim().startsWith('|')) { body.push(row(lines[j])); j++; }
      let html = '<table><thead><tr>' + heads.map(h => '<th>' + inline(h) + '</th>').join('') + '</tr></thead><tbody>';
      for (const r of body) html += '<tr>' + r.map(c => '<td>' + inline(c) + '</td>').join('') + '</tr>';
      out.push(html + '</tbody></table>');
      return j;
    }

    while (i < lines.length) {
      const line = lines[i];

      // 代码块 ```
      const fence = line.match(/^\s*```(\S*)\s*$/);
      if (fence) {
        const buf = [];
        i++;
        while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) { buf.push(lines[i]); i++; }
        i++; // 跳过闭合（未闭合则按容错直接结束）
        out.push('<pre><code class="lang-' + escapeHtml(fence[1] || '') + '">' + escapeHtml(buf.join('\n')) + '</code></pre>');
        continue;
      }
      // 空行
      if (!line.trim()) { i++; continue; }
      // 表格
      if (line.trim().startsWith('|')) {
        const next = parseTable(i);
        if (next > 0) { i = next; continue; }
      }
      // ATX 标题
      const h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) { out.push('<h' + h[1].length + '>' + inline(h[2].replace(/\s#+\s*$/, '')) + '</h' + h[1].length + '>'); i++; continue; }
      // 水平线
      if (/^\s{0,3}([-*_])\s*(\1\s*){2,}$/.test(line)) { out.push('<hr>'); i++; continue; }
      // 引用
      if (/^\s*>/.test(line)) {
        const buf = [];
        while (i < lines.length && /^\s*>/.test(lines[i])) { buf.push(lines[i].replace(/^\s*>\s?/, '')); i++; }
        out.push('<blockquote>' + render(buf.join('\n')) + '</blockquote>');
        continue;
      }
      // 列表（含任务列表）
      const li = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
      if (li) {
        const isOrdered = (t) => /\d/.test(t);
        const ordered = isOrdered(li[2]);
        const items = [];
        while (i < lines.length) {
          const m = lines[i].match(/^(\s*)([-*+]|\d+[.)])\s+(.*)$/);
          if (!m) {
            // 列表项的续行（缩进文本）
            if (items.length && /^\s+\S/.test(lines[i])) { items[items.length - 1].text += ' ' + lines[i].trim(); i++; continue; }
            break;
          }
          // 标记类型变化（有序↔无序）则结束当前列表，交由外层开启新列表
          if (isOrdered(m[2]) !== ordered) break;
          const task = m[3].match(/^\[([ xX])\]\s+(.*)$/);
          items.push({ text: task ? task[2] : m[3], task, checked: task && task[1] !== ' ' });
          i++;
        }
        const tag = ordered ? 'ol' : 'ul';
        const cls = items.some(x => x.task) ? ' class="task-list"' : '';
        const html = items.map(x => x.task
          ? '<li class="task' + (x.checked ? ' done' : '') + '"><input type="checkbox" disabled' + (x.checked ? ' checked' : '') + '>' + inline(x.text) + '</li>'
          : '<li>' + inline(x.text) + '</li>').join('');
        out.push('<' + tag + cls + '>' + html + '</' + tag + '>');
        continue;
      }
      // 段落（连续非空行合并）
      const buf = [line]; i++;
      while (i < lines.length && lines[i].trim() && !/^\s*(#{1,6}\s|>|```|[-*+]\s|\d+[.)]\s|\|)/.test(lines[i])) { buf.push(lines[i]); i++; }
      out.push('<p>' + inline(buf.join('\n')).replace(/\n/g, '<br>') + '</p>');
    }
    return out.join('\n');
  }

  // 提取笔记中的 wiki-link 目标（供反向链接索引使用）
  function extractLinks(src) {
    const set = new Set();
    const re = /\[\[([^\[\]]+?)\]\]/g;
    let m;
    while ((m = re.exec(String(src || '')))) set.add(m[1].trim());
    return [...set];
  }

  // 提取标签：front matter tags 与行内 #tag
  function extractTags(src) {
    const tags = new Set();
    const fm = String(src || '').match(/^---\n([\s\S]*?)\n---/);
    if (fm) {
      const inlineArr = fm[1].match(/tags:\s*\[([^\]]*)\]/);
      if (inlineArr) inlineArr[1].split(',').forEach(t => { const v = t.trim(); if (v) tags.add(v); });
      const multi = fm[1].match(/tags:\n((?:\s*-\s*.+\n?)+)/);
      if (multi) multi[1].match(/-\s*(.+)/g)?.forEach(t => { const v = t.replace(/-\s*/, '').trim(); if (v) tags.add(v); });
    }
    const re = /(^|\s)#([\p{L}\p{N}_/-]{1,50})(?=\s|$)/gu;
    let m;
    while ((m = re.exec(String(src || '')))) tags.add(m[2]);
    return [...tags];
  }

  global.Markdown = { render, extractLinks, extractTags, escapeHtml };
})(window);
