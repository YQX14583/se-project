'use strict';
const $ = id => document.getElementById(id);
const state = {notes:[], current:null, view:'all', tag:'', query:'', mode:'split', dirty:false, timer:null, serial:0, pending:null};
const escapeHTML = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(message) { $('toast').textContent=message; $('toast').classList.remove('hidden'); clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('toast').classList.add('hidden'),6000); }
function status(message,error=false) { $('status').textContent=message; $('status').classList.toggle('error',error); }
async function api(path, method='GET', body) {
  const r=await fetch(path,{method,headers:{'Content-Type':'application/json','X-Mojian-Request':'1'},body:body===undefined?undefined:JSON.stringify(body)});
  const data=await r.json(); if(!r.ok) throw new Error(data.error||'请求失败'); return data;
}
function draft() { return {...state.current,title:$('title').value,body:$('body').value,tags:$('tags').value.split(/[,，]/).map(s=>s.trim()).filter(Boolean)}; }
async function save() {
  clearTimeout(state.timer);
  if(state.pending) { await state.pending; return state.dirty ? save() : true; }
  if(!state.current || !state.dirty) return true;
  const data=draft(), serial=state.serial;
  status('正在保存…');
  state.pending=(async()=>{
    try {
      const note=await api('/api/notes/'+data.id,'PUT',data);
      state.notes=state.notes.map(n=>n.id===note.id?note:n);
      state.current=note;
      if(serial===state.serial) state.dirty=false;
      status(state.dirty?'有新修改待保存':'✓ 已保存到本机 · '+new Date().toLocaleTimeString('zh-CN',{hour12:false}));
      renderList(); renderConnections(); return true;
    } catch(e) {status('保存失败 · '+e.message,true); toast(e.message);return false;}
    finally {state.pending=null;}
  })();
  return state.pending;
}
async function leaveCurrent() { return await save(); }
function changed() {state.dirty=true;state.serial++;status('有未保存修改');renderPreview();clearTimeout(state.timer);state.timer=setTimeout(save,800);}
function resolveTitle(title) {return state.notes.filter(n=>!n.deleted&&n.title===title);}
function wikiTitles(body) { return [...new Set([...body.replace(/```[\s\S]*?```/g,'').replace(/`[^`\n]+`/g,'').matchAll(/\[\[([^\]\n]{1,80})\]\]/g)].map(m=>m[1]))]; }
function inline(text) {
  const tokens=[];
  const stash=html=>{tokens.push(html);return '\u0000'+(tokens.length-1)+'\u0000';};
  text=escapeHTML(text.replace(/\u0000/g,''));
  text=text.replace(/`([^`]+)`/g,(_,s)=>stash('<code>'+s+'</code>'));
  text=text.replace(/\[\[([^\]\n]{1,80})\]\]/g,(_,title)=>{
    const decoded=document.createElement('textarea');decoded.innerHTML=title;const hits=resolveTitle(decoded.value);
    return stash('<a href="#" class="wiki-link '+(hits.length===1?'':'broken')+'" data-wiki="'+title+'">'+title+(hits.length>1?'（歧义）':hits.length===0?'（未创建）':'')+'</a>');
  });
  text=text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,(_,label,url)=>stash('<a href="'+url+'" target="_blank" rel="noopener noreferrer">'+label+'</a>'));
  text=text.replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>');
  return text.replace(/\u0000(\d+)\u0000/g,(_,i)=>tokens[Number(i)]);
}
function markdown(body) {
  const lines=body.replace(/\r\n?/g,'\n').split('\n');let html='',code=null,list=null;
  function closeList(){if(list){html+='</'+list+'>';list=null;}}
  for(const line of lines) {
    if(line.startsWith('```')) { closeList();if(code!==null){html+='<pre><code>'+escapeHTML(code.join('\n'))+'</code></pre>';code=null;}else code=[];continue; }
    if(code!==null){code.push(line);continue;}
    const item=line.match(/^\s*(?:([-*])|\d+\.)\s+(.*)$/);
    if(item){const kind=item[1]?'ul':'ol';if(list!==kind){closeList();html+='<'+kind+'>';list=kind;}html+='<li>'+inline(item[2])+'</li>';continue;}
    closeList();const h=line.match(/^(#{1,6})\s+(.*)$/);
    if(h)html+='<h'+h[1].length+'>'+inline(h[2])+'</h'+h[1].length+'>';
    else if(line.startsWith('> '))html+='<blockquote>'+inline(line.slice(2))+'</blockquote>';
    else if(line.trim())html+='<p>'+inline(line)+'</p>';
  }
  closeList();if(code!==null)html+='<pre><code>'+escapeHTML(code.join('\n'))+'</code></pre>';return html;
}
function renderPreview() {const body=$('body').value;$('preview').innerHTML=markdown(body);$('word-count').textContent=Array.from(body).length+' 字符';renderConnections();}
function linkChip(note) { const b=document.createElement('button');b.textContent='↗ '+note.title;b.onclick=()=>selectNote(note.id);return b; }
function renderConnections() {
  if(!state.current)return;
  const body=$('body').value,title=$('title').value.trim();const links=wikiTitles(body),backs=state.notes.filter(n=>!n.deleted&&n.id!==state.current.id&&wikiTitles(n.body).includes(title));
  $('outlinks').replaceChildren();$('backlinks').replaceChildren();
  for(const t of links){const hits=resolveTitle(t);if(hits.length===1)$('outlinks').append(linkChip(hits[0]));else{const s=document.createElement('small');s.textContent=t+(hits.length?'（同名歧义）':'（未创建）')+'　';$('outlinks').append(s);}}
  for(const n of backs)$('backlinks').append(linkChip(n));
  if(!links.length)$('outlinks').innerHTML='<small>用 [[标题]] 建立第一条连接</small>';
  if(!backs.length)$('backlinks').innerHTML='<small>还没有其他笔记引用这篇</small>';
  $('link-summary').textContent=links.length+' 条出链 · '+backs.length+' 条引用';
}
function renderList() {
  const alive=state.notes.filter(n=>!n.deleted);
  $('count-all').textContent=alive.length;$('count-starred').textContent=alive.filter(n=>n.starred).length;$('count-trash').textContent=state.notes.length-alive.length;
  const tags=new Map();for(const n of alive)for(const t of n.tags)tags.set(t,(tags.get(t)||0)+1);
  $('tag-count').textContent=tags.size;$('tag-list').replaceChildren();
  for(const [t,count]of [...tags].sort((a,b)=>a[0].localeCompare(b[0],'zh-CN'))){const b=document.createElement('button');b.className='tag-filter'+(state.tag===t?' active':'');b.innerHTML='<span><span class="hash">#</span>'+escapeHTML(t)+'</span><span>'+count+'</span>';b.onclick=async()=>{if(!await leaveCurrent())return;state.tag=state.tag===t?'':t;state.view='all';renderList();};$('tag-list').append(b);}
  let notes=state.notes.filter(n=>state.view==='trash'?n.deleted:!n.deleted&&(state.view!=='starred'||n.starred));
  if(state.tag)notes=notes.filter(n=>n.tags.includes(state.tag));
  const query=state.query.trim().toLocaleLowerCase();if(query)notes=notes.filter(n=>[n.title,n.body,...n.tags].some(s=>s.toLocaleLowerCase().includes(query)));
  notes.sort($('sort').value==='title'?(a,b)=>a.title.localeCompare(b.title,'zh-CN'):(a,b)=>b.updated_at.localeCompare(a.updated_at));
  const label=state.tag?'# '+state.tag:({all:'全部笔记',starred:'星标收藏',trash:'回收站'})[state.view];$('list-title').textContent=label;$('view-label').textContent=label;$('list-count').textContent=notes.length+' 篇';
  document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view&&!state.tag));
  $('note-list').replaceChildren();
  for(const n of notes){const b=document.createElement('button');b.className='note-card'+(state.current?.id===n.id?' active':'');b.innerHTML='<h2>'+escapeHTML(n.title)+(n.starred?'<span>☆</span>':'')+'</h2><p>'+escapeHTML(n.body.replace(/[#*`>\[\]]/g,'').trim().slice(0,130)||'还没有正文，写下第一个想法。')+'</p><div class="card-foot"><span class="pill">'+escapeHTML(n.tags[0]||'未分类')+'</span><span>'+new Date(n.updated_at).toLocaleDateString('zh-CN',{month:'2-digit',day:'2-digit'})+'</span></div>';b.onclick=()=>selectNote(n.id);$('note-list').append(b);}
  if(!notes.length)$('note-list').innerHTML='<div class="empty"><p>'+(query?'没有匹配结果，试试更短的关键词。':'这里还没有笔记。')+'</p></div>';
}
async function selectNote(id) {
  if(!await leaveCurrent())return;
  const n=state.notes.find(n=>n.id===id);if(!n)return;
  state.current={...n};state.dirty=false;$('empty').classList.add('hidden');$('note-workspace').classList.remove('hidden');
  $('title').value=n.title;$('body').value=n.body;$('tags').value=n.tags.join(', ');$('created').textContent='创建于 '+new Date(n.created_at).toLocaleDateString('zh-CN');
  for(const id of ['title','body','tags','save','star'])$(id).disabled=n.deleted;
  $('star').textContent=n.starred?'★':'☆';$('delete-note').classList.toggle('hidden',n.deleted);$('restore-note').classList.toggle('hidden',!n.deleted);$('purge-note').classList.toggle('hidden',!n.deleted);
  status(n.deleted?'回收站 · 恢复后可继续编辑':'✓ 已保存到本机');renderList();renderPreview();
}
function showEmpty(){state.current=null;state.dirty=false;$('note-workspace').classList.add('hidden');$('empty').classList.remove('hidden');renderList();}
async function refresh(selectId){const data=await api('/api/notes');state.notes=data.notes;if(selectId&&state.notes.some(n=>n.id===selectId))await selectNote(selectId);else showEmpty();}
async function createNote(){if(!await leaveCurrent())return;try{let title='未命名笔记',i=2;while(state.notes.some(n=>!n.deleted&&n.title===title))title='未命名笔记 '+i++;const n=await api('/api/notes','POST',{title,body:'',tags:[]});state.notes.unshift(n);state.view='all';state.tag='';state.query='';$('search').value='';await selectNote(n.id);$('title').focus();$('title').select();}catch(e){toast(e.message);}}
function download(name,text,type){const url=URL.createObjectURL(new Blob([text],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function safeFilename(title){return title.replace(/[\\/:*?"<>|\u0000-\u001f]/g,'_').slice(0,80)||'note';}
$('new-note').onclick=$('empty-new').onclick=createNote;
for(const id of ['title','body','tags'])$(id).addEventListener('input',changed);
$('save').onclick=save;
$('search').oninput=()=>{state.query=$('search').value;renderList();};$('sort').onchange=renderList;
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=async()=>{if(!await leaveCurrent())return;state.view=b.dataset.view;state.tag='';renderList();});
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{state.mode=b.dataset.mode;$('writing').className='writing '+state.mode;document.querySelectorAll('[data-mode]').forEach(x=>x.classList.toggle('selected',x===b));});
$('star').onclick=async()=>{state.current.starred=!state.current.starred;$('star').textContent=state.current.starred?'★':'☆';changed();await save();};
$('delete-note').onclick=async()=>{if(!await leaveCurrent()||!confirm('将「'+state.current.title+'」移入回收站？之后可以恢复。'))return;try{await api('/api/notes/'+state.current.id,'PUT',{...state.current,deleted:true});state.current=null;await refresh();toast('已移入回收站');}catch(e){toast(e.message);}};
$('restore-note').onclick=async()=>{try{const n=await api('/api/notes/'+state.current.id,'PUT',{...state.current,deleted:false});state.current=null;state.view='all';await refresh(n.id);toast('笔记已恢复');}catch(e){toast(e.message);}};
$('purge-note').onclick=async()=>{if(!confirm('永久删除「'+state.current.title+'」？此操作不可撤销，请先确认备份。'))return;try{await api('/api/notes/'+state.current.id,'DELETE',{version:state.current.version});state.current=null;await refresh();toast('已永久删除');}catch(e){toast(e.message);}};
$('export-md').onclick=()=>{const n=draft();download(safeFilename(n.title)+'.md',n.body,'text/markdown;charset=utf-8');toast('已导出当前正文，包括未保存修改；标签请使用 JSON 备份保存');};
$('backup').onclick=async()=>{if(!await leaveCurrent())return;try{const data=await api('/api/backup');download('mojian-backup-'+new Date().toISOString().slice(0,10)+'.json',JSON.stringify(data,null,2),'application/json');toast('备份已下载，包含全部笔记与回收站');}catch(e){toast(e.message);}};
$('import-md').onclick=()=>$('file-md').click();$('restore-backup').onclick=()=>$('file-backup').click();
$('file-md').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file||!await leaveCurrent())return;if(file.size>400000){toast('Markdown 文件不能超过 400 KB');return;}try{const bytes=await file.arrayBuffer(),body=new TextDecoder('utf-8',{fatal:true}).decode(bytes);const n=await api('/api/notes','POST',{title:file.name.replace(/\.(md|markdown)$/i,'').slice(0,80)||'导入笔记',body,tags:['导入']});state.notes.unshift(n);state.view='all';state.tag='';state.query='';$('search').value='';await selectNote(n.id);toast('Markdown 已导入');}catch(e){toast('导入失败：'+e.message);}};
$('file-backup').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file||!await leaveCurrent())return;if(file.size>16*1024*1024){toast('备份文件不能超过 16 MiB');return;}if(!confirm('合并恢复备份？新增不同 ID 的笔记，相同 ID 保留本机版本，不会覆盖现有内容。'))return;try{const result=await api('/api/restore','POST',JSON.parse(await file.text()));const id=state.current?.id;state.current=null;await refresh(id);toast('恢复完成：新增 '+result.imported+' 篇，跳过 '+result.skipped+' 篇');}catch(e){toast('恢复失败：'+e.message);}};
$('preview').onclick=async e=>{const link=e.target.closest('[data-wiki]');if(!link)return;e.preventDefault();const hits=resolveTitle(link.dataset.wiki);if(hits.length===1)await selectNote(hits[0].id);else toast(hits.length?'存在同名笔记，请使用唯一标题消除歧义':'目标笔记尚未创建，请新建相同标题的笔记');};
$('help').onclick=()=>$('help-dialog').showModal();$('close-help').onclick=()=>$('help-dialog').close();
try{document.body.classList.toggle('dark',localStorage.getItem('mojian-theme')==='dark');}catch{}
$('theme').onclick=()=>{document.body.classList.toggle('dark');try{localStorage.setItem('mojian-theme',document.body.classList.contains('dark')?'dark':'light');}catch{}};
document.addEventListener('keydown',e=>{if(e.metaKey||e.ctrlKey){if(e.key.toLowerCase()==='s'){e.preventDefault();save();}if(e.key.toLowerCase()==='k'){e.preventDefault();$('search').focus();}if(e.key.toLowerCase()==='n'){e.preventDefault();createNote();}}});
window.addEventListener('beforeunload',e=>{if(state.dirty){e.preventDefault();e.returnValue='';}});
(async()=>{try{const data=await api('/api/notes');state.notes=data.notes;const first=state.notes.find(n=>!n.deleted);if(first)await selectNote(first.id);else showEmpty();}catch(e){showEmpty();toast('连接本地服务失败：'+e.message);}})();
