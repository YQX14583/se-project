/* MarkHub — 主应用：UI 编排与交互
 * 实现需求映射：FR-01 创建 / FR-02 编辑器快捷键 / FR-03 实时预览(去抖300ms内)
 * FR-04 自动保存(停输入2s) / FR-05 文件树 / FR-06 标签 / FR-07 收藏
 * FR-08 全文检索 / FR-09 双向链接 / FR-12 导出 / FR-14 回收站 / FR-19 主题
 */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const state = {
    notes: [], currentId: null, searchQuery: '', activeTag: null,
    folder: '', previewOn: true, dirty: false, saveTimer: null, view: 'notes' // notes|trash
  };

  /* ---------- 初始化与种子数据 ---------- */
  async function init() {
    state.notes = await Store.all();
    if (state.notes.length === 0) await seed();
    state.notes = await Store.all();
    rebuildIndex();
    renderAll();
    openNote(firstNote()?.id);

    $('#btn-new').onclick = () => createNote();
    $('#btn-search').oninput = (e) => { state.searchQuery = e.target.value; renderList(); };
    $('#btn-preview').onclick = togglePreview;
    $('#btn-theme').onclick = toggleTheme;
    $('#btn-trash').onclick = () => { state.view = state.view === 'trash' ? 'notes' : 'trash'; renderAll(); };
    $('#btn-export-md').onclick = () => exportCurrent('md');
    $('#btn-export-html').onclick = () => exportCurrent('html');
    $('#btn-export-all').onclick = exportAllMd;

    const ed = $('#editor');
    ed.addEventListener('input', onInput);
    ed.addEventListener('keydown', editorKeys);
    window.addEventListener('keydown', globalKeys);

    // 主题恢复
    const saved = localStorage.getItem('markhub-theme');
    if (saved === 'dark') document.body.classList.add('dark');
  }

  async function seed() {
    await Store.create('欢迎使用 MarkHub', '', `# 欢迎使用 MarkHub

这是一款**本地优先**的 Markdown 笔记与知识管理工具。试试：

- 输入 \`[[\` 触发笔记链接补全，如 [[快速上手]]
- 顶部搜索框支持 \`tag:教程\`、"精确短语"、多词 AND
- 笔记按 \`Ctrl/Cmd + S\` 保存，停止输入 2 秒自动保存

## 快速上手
1. 点击左上角「新建笔记」
2. 用 Markdown 语法书写，右侧实时预览
3. 删除的笔记进入回收站，可恢复

#教程`);
    await Store.create('快速上手', '', `# 快速上手

## 常用快捷键
| 快捷键 | 功能 |
|---|---|
| Ctrl/Cmd+B | 加粗 |
| Ctrl/Cmd+I | 斜体 |
| Ctrl/Cmd+K | 插入链接 |
| Ctrl/Cmd+S | 保存 |

## 标签
在 front matter 中声明：

\`\`\`yaml
---
tags: [教程, 入门]
---
\`\`\`

或直接在正文写行内标签 #入门

参见 [[欢迎使用 MarkHub]]
#入门`);
  }

  /* ---------- 索引 ---------- */
  function rebuildIndex() {
    for (const n of state.notes) n.tags = Markdown.extractTags(n.content);
  }
  const byTitle = (t) => state.notes.find(n => !n.deleted && n.title === t);
  const firstNote = () => state.notes.find(n => !n.deleted);

  /* ---------- 编辑与保存 ---------- */
  function openNote(id) {
    if (state.dirty) flushSave();
    const n = state.notes.find(x => x.id === id);
    if (!n) return;
    state.currentId = id;
    state.dirty = false;
    $('#title-input').value = n.title;
    $('#editor').value = n.content;
    $('#editor').disabled = false;
    renderPreview();
    renderList();
    renderBacklinks();
    setStatus('已打开「' + n.title + '」');
  }

  function onInput() {
    state.dirty = true;
    setStatus('编辑中…（未保存）');
    // FR-03：预览去抖（300ms 内更新）
    clearTimeout(onInput._p);
    onInput._p = setTimeout(renderPreview, 150);
    // FR-04：自动保存（停止输入 2s）
    clearTimeout(state.saveTimer);
    state.saveTimer = setTimeout(flushSave, 2000);
  }

  async function flushSave() {
    const n = state.notes.find(x => x.id === state.currentId);
    if (!n || !state.dirty) return;
    const oldTitle = n.title;
    n.title = sanitizeTitle($('#title-input').value) || '未命名';
    n.content = $('#editor').value;
    n.tags = Markdown.extractTags(n.content);
    await Store.put(n);
    state.dirty = false;
    if (oldTitle !== n.title) renderList();
    renderTags();
    renderPreview();
    renderBacklinks();
    const t = new Date();
    setStatus('已保存 ' + t.toTimeString().slice(0, 8));
  }

  function sanitizeTitle(t) {
    return String(t || '').replace(/[\\/:*?"<>|]/g, '-').replace(/^\.+/, '').trim();
  }

  /* ---------- 编辑器按键（FR-02 / FR-09 补全）---------- */
  function editorKeys(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 's') { e.preventDefault(); flushSave(); return; }
    if (mod && ['b', 'i', 'k'].includes(e.key.toLowerCase())) {
      e.preventDefault();
      wrapSelection({ b: '**', i: '*', k: null }[e.key.toLowerCase()]);
      return;
    }
    // [[ 触发笔记名补全
    if (e.key === '[' ) {
      const ed = $('#editor'), pos = ed.selectionStart;
      if (pos > 0 && ed.value[pos - 1] === '[') {
        e.preventDefault();
        showLinkCompleter(pos);
      }
    }
    if (e.key === 'Escape') hideCompleter();
  }

  function wrapSelection(token) {
    const ed = $('#editor');
    const s = ed.selectionStart, e = ed.selectionEnd;
    const sel = ed.value.slice(s, e);
    if (token) {
      ed.setRangeText(token + sel + token, s, e, 'select');
    } else { // Ctrl+K 链接
      ed.setRangeText('[' + (sel || '链接文字') + '](https://)', s, e, 'select');
    }
    ed.focus();
    onInput();
  }

  /* wiki-link 补全面板 */
  function showLinkCompleter(caretPos) {
    const ed = $('#editor');
    ed.setRangeText('[', caretPos, caretPos, 'end'); // 补第二个 [
    const panel = $('#completer');
    const candidates = state.notes.filter(n => !n.deleted && n.id !== state.currentId)
      .map(n => n.title).slice(0, 8);
    panel.innerHTML = candidates.length
      ? '<div class="comp-hint">选择笔记建立双向链接（Esc 关闭）</div>' +
        candidates.map((t, i) => `<div class="comp-item" data-i="${i}">${Markdown.escapeHtml(t)}</div>`).join('')
      : '<div class="comp-hint">暂无其他笔记</div>';
    panel.style.display = 'block';
    panel.querySelectorAll('.comp-item').forEach((el, i) => {
      el.onclick = () => {
        const title = candidates[i];
        const pos = ed.selectionStart;
        ed.setRangeText(title + ']]', pos, pos, 'end');
        hideCompleter();
        ed.focus();
        onInput();
      };
    });
  }
  function hideCompleter() { $('#completer').style.display = 'none'; }

  function globalKeys(e) {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'p') { e.preventDefault(); $('#btn-search').focus(); }
  }

  /* ---------- 渲染 ---------- */
  function renderAll() { renderTree(); renderTags(); renderList(); renderPreview(); renderBacklinks(); }

  function setStatus(msg) { $('#status').textContent = msg; }

  function togglePreview() {
    state.previewOn = !state.previewOn;
    $('#main').classList.toggle('no-preview', !state.previewOn);
    $('#btn-preview').textContent = state.previewOn ? '◧ 分栏预览' : '▤ 仅编辑';
  }
  function toggleTheme() {
    document.body.classList.toggle('dark');
    localStorage.setItem('markhub-theme', document.body.classList.contains('dark') ? 'dark' : 'light');
  }

  // FR-05 文件树（按文件夹分组）
  function renderTree() {
    const folders = {};
    for (const n of state.notes.filter(x => !x.deleted)) {
      const f = n.folder || '';
      (folders[f] = folders[f] || []).push(n);
    }
    const names = Object.keys(folders).sort();
    $('#tree').innerHTML = '<div class="tree-root' + (state.folder === '' ? ' active' : '') + '" data-f="">📁 全部笔记 (' + state.notes.filter(n => !n.deleted).length + ')</div>' +
      names.map(f => `<div class="tree-folder" data-f="${Markdown.escapeHtml(f)}">📂 ${Markdown.escapeHtml(f || '/')} (${folders[f].length})</div>`).join('') +
      '<div class="tree-root trash" id="trash-entry">🗑 回收站 (' + state.notes.filter(n => n.deleted).length + ')</div>';
    $('#tree').querySelectorAll('[data-f]').forEach(el => {
      el.onclick = () => { state.folder = el.dataset.f; state.activeTag = null; state.searchQuery = ''; $('#btn-search').value = ''; state.view = 'notes'; renderTree(); renderList(); };
    });
    $('#trash-entry').onclick = () => { state.view = 'trash'; renderList(); renderTree(); };
  }

  // FR-06 标签面板
  function renderTags() {
    const count = {};
    for (const n of state.notes.filter(x => !x.deleted))
      for (const t of n.tags) count[t] = (count[t] || 0) + 1;
    const tags = Object.keys(count).sort();
    $('#tags').innerHTML = tags.length
      ? tags.map(t => `<span class="tag${state.activeTag === t ? ' active' : ''}" data-t="${Markdown.escapeHtml(t)}">#${Markdown.escapeHtml(t)} <small>${count[t]}</small></span>`).join('')
      : '<div class="hint">暂无标签：在笔记中写 #标签 或 front matter tags</div>';
    $('#tags').querySelectorAll('.tag').forEach(el => {
      el.onclick = () => {
        state.activeTag = state.activeTag === el.dataset.t ? null : el.dataset.t;
        state.searchQuery = ''; $('#btn-search').value = '';
        renderTags(); renderList();
      };
    });
  }

  // 中列：笔记列表（含搜索结果 / 标签过滤 / 回收站视图）
  function renderList() {
    const list = $('#note-list');
    let items;
    let header;
    if (state.view === 'trash') {
      items = state.notes.filter(n => n.deleted).sort((a, b) => b.deletedAt - a.deletedAt);
      header = '🗑 回收站';
    } else if (state.searchQuery) {
      const r = Store.search(state.notes, state.searchQuery);
      items = r.map(x => x.note);
      header = '🔍 搜索 "' + state.searchQuery + '"（' + items.length + ' 条）';
      list.dataset.snippets = '';
      list.innerHTML = '<div class="list-head">' + Markdown.escapeHtml(header) + '</div>' +
        (items.length ? '' : '<div class="hint">没有匹配结果。支持多词 AND、"精确短语"、tag:xxx、path:xxx</div>') +
        items.map((n, i) => noteItem(n, r[i] ? r[i].snippet : '', r[i] ? r[i].terms : [])).join('');
      bindItems(list);
      return;
    } else if (state.activeTag) {
      items = state.notes.filter(n => !n.deleted && n.tags.includes(state.activeTag));
      header = '#' + state.activeTag + '（' + items.length + '）';
    } else {
      items = state.notes.filter(n => !n.deleted && (n.folder || '') === state.folder)
        .sort((a, b) => b.updatedAt - a.updatedAt);
      header = (state.folder || '全部笔记') + '（' + items.length + '）';
    }
    const favs = state.notes.filter(n => !n.deleted && n.favorite).slice(0, 100);
    list.innerHTML =
      (favs.length ? '<div class="list-head">⭐ 收藏</div>' + favs.map(n => noteItem(n)).join('') : '') +
      '<div class="list-head">' + Markdown.escapeHtml(header) + '</div>' +
      (items.length ? items.map(n => noteItem(n)).join('') : '<div class="hint">空空如也，点「新建笔记」开始</div>');
    bindItems(list);
  }

  function noteItem(n, snippet, terms) {
    const d = new Date(n.updatedAt);
    const date = d.toLocaleDateString() === new Date().toLocaleDateString()
      ? d.toTimeString().slice(0, 5) : d.toLocaleDateString();
    let snip = '';
    if (snippet !== undefined && snippet !== null && snippet !== '') {
      let s = Markdown.escapeHtml(snippet);
      for (const t of terms || []) s = s.split(Markdown.escapeHtml(t)).join('<mark>' + Markdown.escapeHtml(t) + '</mark>');
      snip = `<div class="snippet">${s}</div>`;
    } else {
      snip = `<div class="snippet">${Markdown.escapeHtml((n.content || '').replace(/[#>*`\[\]-]/g, '').trim().slice(0, 60))}</div>`;
    }
    const inTrash = state.view === 'trash';
    const btns = inTrash
      ? `<span class="nb restore" data-id="${n.id}">恢复</span><span class="nb purge" data-id="${n.id}">彻底删除</span>`
      : `<span class="nb fav" data-id="${n.id}">${n.favorite ? '★' : '☆'}</span><span class="nb del" data-id="${n.id}">🗑</span>`;
    return `<div class="note-item${n.id === state.currentId && !inTrash ? ' active' : ''}" data-id="${n.id}">
      <div class="ni-row"><span class="ni-title">${n.favorite && !inTrash ? '⭐ ' : ''}${Markdown.escapeHtml(n.title)}</span>
      <span class="ni-actions">${btns}</span></div>
      <div class="ni-meta">${date}${n.tags.length ? ' · ' + n.tags.slice(0, 3).map(t => '#' + Markdown.escapeHtml(t)).join(' ') : ''}</div>
      ${snip}</div>`;
  }

  function bindItems(list) {
    list.querySelectorAll('.note-item').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('.nb')) return;
        if (state.view === 'trash') return;
        openNote(el.dataset.id);
      };
    });
    list.querySelectorAll('.nb.fav').forEach(el => el.onclick = async (e) => {
      e.stopPropagation();
      const n = state.notes.find(x => x.id === el.dataset.id);
      n.favorite = !n.favorite; await Store.put(n); renderList();
    });
    list.querySelectorAll('.nb.del').forEach(el => el.onclick = async (e) => {
      e.stopPropagation();
      await deleteNote(el.dataset.id);
    });
    list.querySelectorAll('.nb.restore').forEach(el => el.onclick = async (e) => {
      e.stopPropagation();
      const n = state.notes.find(x => x.id === el.dataset.id);
      n.deleted = false; n.deletedAt = null; await Store.put(n);
      renderTree(); renderList(); setStatus('已恢复「' + n.title + '」');
    });
    list.querySelectorAll('.nb.purge').forEach(el => el.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm('彻底删除后无法恢复，确认？')) return; // FR-14 二次确认
      await Store.remove(el.dataset.id);
      state.notes = state.notes.filter(x => x.id !== el.dataset.id);
      renderTree(); renderList();
    });
  }

  // FR-14：删除 → 回收站（软删除，不直接删数据）
  async function deleteNote(id) {
    const n = state.notes.find(x => x.id === id);
    if (!n) return;
    n.deleted = true; n.deletedAt = Date.now();
    await Store.put(n);
    if (state.currentId === id) { state.currentId = null; $('#editor').value = ''; $('#editor').disabled = true; $('#title-input').value = ''; renderPreview(); }
    renderTree(); renderList();
    setStatus('「' + n.title + '」已移入回收站');
  }

  async function createNote() {
    const n = await Store.create('未命名', state.folder);
    state.notes.push(n);
    state.view = 'notes'; state.searchQuery = ''; $('#btn-search').value = '';
    renderTree(); renderTags(); renderList();
    openNote(n.id);
    $('#title-input').focus(); $('#title-input').select();
  }

  function renderPreview() {
    const n = state.notes.find(x => x.id === state.currentId);
    const src = n ? $('#editor').value || n.content : '';
    $('#preview').innerHTML = n ? Markdown.render(src) : '<div class="hint">选择或创建一篇笔记</div>';
    // FR-09：wiki-link 点击导航（虚链点击即创建）
    $('#preview').querySelectorAll('.wiki-link').forEach(el => {
      el.onclick = async () => {
        const title = el.dataset.note;
        let target = byTitle(title);
        if (!target) { target = await Store.create(title, state.folder); state.notes.push(target); renderTree(); renderTags(); }
        openNote(target.id);
      };
    });
  }

  // FR-09：反向链接区块
  function renderBacklinks() {
    const n = state.notes.find(x => x.id === state.currentId);
    const box = $('#backlinks');
    if (!n) { box.innerHTML = ''; box.style.display = 'none'; return; }
    const links = Store.backlinks(state.notes, n.title)
      .map(m => ({ note: m, ctx: excerpt(m.content, '[[' + n.title + ']]') }));
    box.style.display = links.length ? 'block' : 'none';
    box.innerHTML = '<div class="bl-head">🔗 反向链接（' + links.length + '）</div>' +
      links.map(l => `<div class="bl-item" data-id="${l.note.id}"><b>${Markdown.escapeHtml(l.note.title)}</b><div class="snippet">${Markdown.escapeHtml(l.ctx)}</div></div>`).join('');
    box.querySelectorAll('.bl-item').forEach(el => el.onclick = () => openNote(el.dataset.id));
  }
  function excerpt(content, needle) {
    const i = content.indexOf(needle);
    if (i < 0) return content.slice(0, 60);
    const s = Math.max(0, i - 30);
    return (s > 0 ? '…' : '') + content.slice(s, i + needle.length + 30) + '…';
  }

  /* ---------- 导出（FR-12）---------- */
  function download(name, mime, data) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([data], { type: mime }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }
  function exportCurrent(fmt) {
    const n = state.notes.find(x => x.id === state.currentId);
    if (!n) return setStatus('请先选择一篇笔记');
    if (fmt === 'md') download(n.title + '.md', 'text/markdown', n.content);
    else download(n.title + '.html', 'text/html',
      '<!doctype html><meta charset="utf-8"><title>' + Markdown.escapeHtml(n.title) + '</title><body style="max-width:720px;margin:40px auto;font-family:sans-serif;line-height:1.7">' + Markdown.render(n.content) + '</body>');
    setStatus('已导出 ' + n.title + '.' + fmt);
  }
  function exportAllMd() {
    const live = state.notes.filter(n => !n.deleted);
    const pack = live.map(n => '# ' + n.title + '\n\n' + n.content).join('\n\n---\n\n');
    download('markhub-export-' + new Date().toISOString().slice(0, 10) + '.md', 'text/markdown', pack);
    setStatus('已导出全部 ' + live.length + ' 篇笔记');
  }

  /* 预览区点击任务列表可切换勾选（写回源码） */
  $('#preview') && null;
  document.addEventListener('click', async (e) => {
    const li = e.target.closest('#preview li.task');
    if (!li) return;
    const n = state.notes.find(x => x.id === state.currentId);
    if (!n) return;
    const items = [...$('#preview').querySelectorAll('li.task')];
    const idx = items.indexOf(li);
    const lines = $('#editor').value.split('\n');
    let seen = -1;
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(/^\s*[-*+]\s+\[([ xX])\]/);
      if (m) {
        seen++;
        if (seen === idx) { lines[i] = lines[i].replace(/\[([ xX])\]/, m[1] === ' ' ? '[x]' : '[ ]'); break; }
      }
    }
    $('#editor').value = lines.join('\n');
    onInput();
  });

  document.addEventListener('DOMContentLoaded', init);
})();
