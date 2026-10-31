/* ============================================================
   Tools-X · Docs（多级目录笔记 + JSON 文档编辑器）
============================================================ */
/* ---------- docs: 目录树 ---------- */
let selDoc=null, docMode='view', dragId=null, docUnlocked=false, editingIdx=null, pendingIdx=null, curBlocks=null;
const docCache={};
function dState(id){return docCache[id]||(docCache[id]={content:'',comments:{},cMt:0,mMt:0,loaded:false,loading:false,dirtyC:false,dirtyM:false,forceC:false,forceM:false,resolving:false})}
function docText(note){const c=docCache[note.id];if(c&&c.loaded)return c.content;const s=get(STORE.docNote(note.id));return (s&&typeof s.content==='string')?s.content:''}
function docComments(note){const c=docCache[note.id];if(c&&c.loaded)return c.comments;const s=get(STORE.docNote(note.id));return (s&&s.comments)||{}}
let jMode='view', jUnlocked=false, jExpand={}, jAddSegs=null;
function jCur(){const n=currentNote();return n&&n.fmt==='json'?n:null}
function setJMode(m){jMode=m;renderDocs()}
let docSearchSeq=0;
function renderDocs(){
  if(!selDoc){selDoc=(function f(l){for(const n of l){if(n.type==='note')return n.id;const r=f(n.children||[]);if(r)return r}return null})(DB.docs)}
  const tree=document.getElementById('docTree');
  const bindRows=()=>tree.querySelectorAll('.tree-row').forEach(row=>{
    row.addEventListener('dragstart',e=>{dragId=row.dataset.id;e.dataTransfer.effectAllowed='move'});
    row.addEventListener('dragend',()=>{dragId=null;renderDocs()});
    row.addEventListener('dragover',e=>{if(!dragId||dragId===row.dataset.id)return;e.preventDefault();row.classList.add('drop')});
    row.addEventListener('dragleave',()=>row.classList.remove('drop'));
    row.addEventListener('drop',e=>{e.preventDefault();e.stopPropagation();row.classList.remove('drop');const src=dragId;dragId=null;moveNode(src,row.dataset.id)});
  });
  if(query){
    const hits=[];
    (function walk(list){list.forEach(n=>{
      if(n.type==='folder')walk(n.children||[]);
      else{const text=docText(n);
        if(n.name.toLowerCase().includes(query)||text.toLowerCase().includes(query))hits.push(n)}
    })})(DB.docs);
    tree.innerHTML=hits.length?hits.map(n=>noteRow(n)).join(''):'<div class="empty" style="padding:26px 8px"><p>无匹配笔记</p></div>';
    bindRows();
  }else{
    docSearchSeq++;
    tree.innerHTML=DB.docs.length?DB.docs.map(n=>treeHtml(n)).join(''):'<div class="empty" style="padding:26px 8px"><p>空空如也，新建一条笔记吧</p></div>';
    bindRows();
  }
  updateDocsTools();
  renderDocEditor();
}
function noteRow(n){
  return `<div class="tree-row ${selDoc===n.id?'sel':''}" draggable="true" data-id="${n.id}" onclick="selectNote('${n.id}')">
    <span class="tw"></span>${n.fmt==='json'?ICO_JSON:ICO_DOC}
    <span class="t-name">${esc(n.name)}</span>
    <span class="t-acts">
      <button class="icon-btn" title="重命名" onclick="event.stopPropagation();renameNode('${n.id}')">${ICO_EDIT}</button>
      <button class="icon-btn danger" title="删除" onclick="event.stopPropagation();delNode('${n.id}')">${ICO_TRASH}</button>
    </span>
  </div>`;
}
async function selectNote(id){
  if(selDoc===id)return;
  await flushDocSaves();
  const r=findNode(DB.docs,id);
  if(r&&r.n.type==='note'&&r.n.fmt==='json')jMode='view';
  selDoc=id;renderDocs();
  const c=await loadDoc(id);
  if(selDoc===id&&c.loaded)renderDocs();
}
function treeHtml(n){
  if(n.type==='folder'){
    const open=n.open!==false;
    return `<div class="tree-row ${open?'open':''}" draggable="true" data-id="${n.id}" onclick="toggleFolder('${n.id}')">
      <span class="tw"><svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></span>
      ${ICO_FOLDER}
      <span class="t-name">${esc(n.name)}</span>
      <span class="t-acts">
        <button class="icon-btn" title="新建笔记" onclick="event.stopPropagation();newNote('${n.id}')">${ICO_PLUS}</button>
        <button class="icon-btn" title="新建子文件夹" onclick="event.stopPropagation();newFolder('${n.id}')">${ICO_FOLDER}</button>
        <button class="icon-btn" title="重命名" onclick="event.stopPropagation();renameNode('${n.id}')">${ICO_EDIT}</button>
        <button class="icon-btn danger" title="删除" onclick="event.stopPropagation();delNode('${n.id}')">${ICO_TRASH}</button>
      </span>
    </div>`+(open?`<div class="tree-kids">${(n.children||[]).map(c=>treeHtml(c)).join('')}</div>`:'');
  }
  return noteRow(n);
}
function toggleFolder(id){const r=findNode(DB.docs,id);if(r){r.n.open=r.n.open===false;save();renderDocs()}}
/* ---------- 目录面板折叠 / 全部折叠（偏好存服务端） ---------- */
let treeCollapsed=false;
function anyFolderOpen(list){return list.some(n=>n.type==='folder'&&(n.open!==false||anyFolderOpen(n.children||[])))}
function updateDocsTools(){
  const b=document.getElementById('foldAllBtn');if(!b)return;
  const open=anyFolderOpen(DB.docs);
  b.innerHTML=open?ICO_CHEV_UP:ICO_CHEV_DOWN;
  b.title=open?'全部折叠':'全部展开';
}
function applyTreeCollapsed(){
  const L=document.getElementById('docsLayout');if(!L)return;
  L.classList.toggle('tree-collapsed',treeCollapsed);
  prefs.docsTree=treeCollapsed;savePrefs();
  updateDocsTools();
}
function toggleDocsTree(){treeCollapsed=!treeCollapsed;applyTreeCollapsed();toast(treeCollapsed?'已收起目录':'已展开目录')}
function setAllOpen(list,open){list.forEach(n=>{if(n.type==='folder'){n.open=open;setAllOpen(n.children||[],open)}})}
function toggleAllFolders(){
  const open=anyFolderOpen(DB.docs);
  setAllOpen(DB.docs,!open);
  save();renderDocs();toast(open?'已全部折叠':'已全部展开');
}
function moveNode(srcId,targetId){
  if(!srcId||srcId===targetId)return;
  const s=findNode(DB.docs,srcId);if(!s)return;
  if(s.n.type==='folder'&&isAncestor(s.n,targetId))return;
  const t=findNode(DB.docs,targetId);if(!t)return;
  let destList,destFolder=null;
  if(t.n.type==='folder'){if(!t.n.children)t.n.children=[];destList=t.n.children;destFolder=t.n}
  else destList=t.list;
  if(destList===s.list&&destFolder===s.parent)return;
  s.list.splice(s.list.indexOf(s.n),1);
  destList.push(s.n);
  if(destFolder)destFolder.open=true;
  save();renderDocs();toast('已移动');
}
/* ---------- docs: 编辑器（含块级所见即所得） ---------- */
function setDocMode(m){docMode=m;renderDocs()}
function currentNote(){const r=selDoc?findNode(DB.docs,selDoc):null;return r&&r.n.type==='note'?r.n:null}
function toggleLive(){
  if(docUnlocked&&editingIdx!==null){const ta=document.querySelector('.blk-edit');if(ta)ta.blur()}
  docUnlocked=!docUnlocked;
  renderDocs();
  toast(docUnlocked?'已解锁：点击任意区块即可编辑':'预览已锁定');
}
function splitBlocks(src){
  const lines=(src||'').split('\n');
  const blocks=[];let i=0;
  const blank=l=>/^\s*$/.test(l);
  const fence=l=>/^\s*(```|~~~)/.test(l);
  const headOrHr=l=>/^\s*#{1,6}\s/.test(l)||/^(-{3,}|\*{3,})\s*$/.test(l.trim());
  const quote=l=>/^\s*>/.test(l);
  const list=l=>/^\s*([-*+]|\d+\.)\s+/.test(l);
  const push=(s,e)=>blocks.push({start:s,end:e,src:lines.slice(s,e).join('\n')});
  while(i<lines.length){
    if(blank(lines[i])){i++;continue}
    const start=i;
    if(i===0&&lines[0].trim()==='---'){
      let j=1;
      while(j<lines.length&&lines[j].trim()!=='---')j++;
      if(j<lines.length){push(start,j+1);blocks[blocks.length-1].type='fm';i=j+1;continue}
    }
    if(fence(lines[i])){i++;while(i<lines.length&&!/^\s*(```|~~~)\s*$/.test(lines[i]))i++;if(i<lines.length)i++;push(start,i);continue}
    if(headOrHr(lines[i])){i++;push(start,i);continue}
    if(quote(lines[i])){while(i<lines.length&&quote(lines[i]))i++;push(start,i);continue}
    if(lines[i].includes('|')&&lines[i+1]&&/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i+1])){
      while(i<lines.length&&!blank(lines[i])&&lines[i].includes('|'))i++;push(start,i);continue}
    if(list(lines[i])){i++;while(i<lines.length&&!blank(lines[i])&&!fence(lines[i])&&!headOrHr(lines[i])&&!quote(lines[i]))i++;push(start,i);continue}
    while(i<lines.length&&!blank(lines[i])&&!fence(lines[i])&&!headOrHr(lines[i])&&!quote(lines[i])&&!list(lines[i]))i++;
    push(start,i);
  }
  return blocks;
}
function renderFm(src){
  const rows=src.split('\n').slice(1,-1).map(l=>{
    const i=l.indexOf(':');
    if(i<0)return '';
    const k=l.slice(0,i).trim(),v=l.slice(i+1).trim();
    if(!k)return '';
    const ev=esc(v);
    return '<div class="fm-row"><span class="fm-k">'+esc(k)+'</span><span class="fm-v">'+(ev||'<span style="opacity:.35">未填写</span>')+'</span></div>';
  }).join('');
  return '<div class="fm-card">'+(rows||'<span style="opacity:.35">frontmatter</span>')+'</div>';
}
function buildPreviewInto(pv,content){
  curBlocks=splitBlocks(content);
  pv.classList.toggle('editable',docUnlocked);
  pv.innerHTML=curBlocks.length
    ?curBlocks.map((b,i)=>'<div class="blk" data-i="'+i+'">'+(b.type==='fm'?renderFm(b.src):mdRender(b.src))+'</div>').join('')
    :'<p style="color:var(--ink-3)">（空笔记'+(docUnlocked?' — 点击此处开始编辑）':'）')+'</p>';
  pv.querySelectorAll('.blk').forEach(blk=>{
    const bi=+blk.dataset.i;
    blk.querySelectorAll('.task input').forEach((inp,k)=>inp.dataset.k=k);
    if(docUnlocked&&blk.querySelector('table')&&!(curBlocks[bi]&&curBlocks[bi].type==='fm')){
      blk.insertAdjacentHTML('beforeend','<div class="tbl-bar">'+[['+row','＋行'],['+col','＋列'],['-row','－行'],['-col','－列']].map(o=>'<button data-op="'+o[0]+'">'+o[1]+'</button>').join('')+'</div>');
      if(selCell&&selCell.blk===bi)blk.classList.add('has-sel');
    }
  });
  pv.onclick=e=>{
    if(!docUnlocked||editingIdx!==null)return;
    const bar=e.target.closest('.tbl-bar button');
    if(bar){tblOp(+bar.closest('.blk').dataset.i,bar.dataset.op);return}
    const cb=e.target.closest('.task input');
    if(cb){toggleTask(+cb.closest('.blk').dataset.i,+cb.dataset.k||0);return}
    const tc=e.target.closest('th[data-c],td[data-c]');
    if(tc){startCellEdit(tc);return}
    const blk=e.target.closest('.blk');
    if(blk&&blk.dataset.i!==undefined)startEdit(+blk.dataset.i,e);
    else if(!curBlocks.length)startEdit(0,e);
  };
  pv.onmousedown=e=>{
    if(docUnlocked&&editingIdx!==null){const blk=e.target.closest('.blk');if(blk&&+blk.dataset.i!==editingIdx)pendingIdx=+blk.dataset.i}
  };
  buildDocToc();
}
/* ---------- docs: 标题树 ---------- */
function buildDocToc(){
  const toc=document.getElementById('docToc');
  const list=document.getElementById('docTocList');
  const pv=document.getElementById('docPreview');
  if(!toc||!list||!pv)return;
  const items=mdOutline(pv,'doc-h-');
  toc.classList.toggle('hide',!items.length||docMode==='edit');
  toc.classList.toggle('collapsed',!!prefs.tocCollapsed);
  list.innerHTML=items.length?tocHtml(items):'';
}
function bindDocToc(){
  const toc=document.getElementById('docToc');
  if(!toc)return;
  toc.addEventListener('click',e=>{
    if(e.target.closest('[data-act="toc-toggle"]')){
      prefs.tocCollapsed=!prefs.tocCollapsed;saveState();buildDocToc();return;
    }
    const it=e.target.closest('.toc-item');
    if(it){const el=document.getElementById(it.dataset.h);if(el)el.scrollIntoView({behavior:'smooth',block:'start'})}
  });
}
function renderDocEditor(){
  if(editingIdx!==null&&curBlocks&&curBlocks[editingIdx]){const ta=document.querySelector('.blk-edit');commitEdit(ta?ta.value:curBlocks[editingIdx].src,true)}
  const panel=document.getElementById('docEditorPanel');
  const note=currentNote();
  if(!note){
    panel.innerHTML='<div class="empty" style="margin:auto;padding:70px 20px"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" style="width:36px;height:36px;opacity:.4;margin-bottom:10px"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg><p>左侧选择或新建一条笔记</p></div>';
    return;
  }
  if(note.fmt==='json'){renderJEditor(note);return}
  const dc=dState(note.id);
  if(!dc.loaded){
    panel.innerHTML='<div class="empty" style="margin:auto;padding:70px 20px"><p>加载中…</p></div>';
    loadDoc(note.id).then(c=>{if(selDoc===note.id&&c.loaded)renderDocs()});
    return;
  }
  panel.innerHTML=`
    <div class="de-head">
      <span class="de-title">${esc(note.name)}</span>
      <span class="de-meta">${fmtTime(note.updatedAt)}</span>
      <div class="seg">${[['edit','源码'],['view','预览']].map(([m,t])=>`<button class="${docMode===m?'on':''}" onclick="setDocMode('${m}')">${t}</button>`).join('')}</div>
      ${docMode!=='edit'?`<button class="icon-btn" id="liveToggle" title="${docUnlocked?'锁定预览（只读）':'解锁预览（点击区块编辑）'}" style="${docUnlocked?'color:var(--accent-deep);background:var(--accent-soft)':''}">${docUnlocked?ICO_EDIT:ICO_LOCK}</button>`:''}
    </div>
    <div class="de-body">
      <textarea id="docEditor" class="${docMode==='view'?'hide':''}" placeholder="# 开始书写 Markdown …"></textarea>
      <div id="docPreview" class="md ${docMode==='edit'?'hide':''}"></div>
      <aside class="doc-toc hide" id="docToc">
        <button class="toc-rail" data-act="toc-toggle" title="展开目录">${ICO_CHEV_L}<span>目录</span></button>
        <div class="toc-panel">
          <div class="toc-head"><span>目录</span><button class="icon-btn" data-act="toc-toggle" title="收起目录">${ICO_CHEV_R}</button></div>
          <div class="toc-list" id="docTocList"></div>
        </div>
      </aside>
    </div>`;
  bindDocToc();
  const lt=document.getElementById('liveToggle');if(lt)lt.onclick=toggleLive;
  const ta=document.getElementById('docEditor');
  ta.value=dc.content||'';
  let t;
  ta.addEventListener('input',()=>{
    const val=ta.value;
    dc.content=val;
    if(!dc.resolving){dc.dirtyC=true;scheduleDocSave()}
    note.updatedAt=Date.now();save();
    clearTimeout(t);
    t=setTimeout(()=>{
      const pv=document.getElementById('docPreview');
      if(pv)buildPreviewInto(pv,val);
      const meta=panel.querySelector('.de-meta');
      if(meta)meta.textContent=fmtTime(note.updatedAt);
    },300);
  });
  ta.addEventListener('blur',()=>flushDocSaves());
  ta.addEventListener('keydown',ev=>{if(ev.key==='Enter')smartEnter(ta,ev)});
  const pv=document.getElementById('docPreview');
  if(pv)buildPreviewInto(pv,dc.content||'');
}
function startEdit(idx,e){
  if(editingIdx!==null)return;
  const pv=document.getElementById('docPreview');if(!pv)return;
  let blk=pv.querySelector('.blk[data-i="'+idx+'"]');
  if(!blk){
    if(curBlocks.length)return;
    curBlocks=[{src:'',start:0,end:0}];
    pv.innerHTML='<div class="blk" data-i="0"></div>';
    blk=pv.querySelector('.blk');
  }
  editingIdx=idx;
  blk.classList.add('editing');
  const src=curBlocks[idx].src;
  blk.innerHTML='<textarea class="blk-edit" spellcheck="false"></textarea>';
  const ta=blk.querySelector('textarea');
  ta.value=src;
  const fit=()=>{ta.style.height='auto';ta.style.height=Math.max(ta.scrollHeight,44)+'px'};
  fit();
  ta.addEventListener('input',fit);
  ta.addEventListener('keydown',ev=>{
    if(ev.key==='Escape'||((ev.metaKey||ev.ctrlKey)&&ev.key==='Enter')){ev.preventDefault();ta.blur();return}
    if(ev.key==='Enter')smartEnter(ta,ev);
  });
  ta.addEventListener('blur',()=>{if(editingIdx===idx)commitEdit(ta.value)});
  let ratio=.5;
  if(e&&e.clientY){const r=blk.getBoundingClientRect();ratio=Math.min(.95,Math.max(0,(e.clientY-r.top)/Math.max(r.height,1)))}
  ta.focus();
  const pos=Math.min(src.length,Math.floor(src.length*ratio));
  const ls=src.slice(0,pos).lastIndexOf('\n');
  const p=ls===-1?pos:ls+1;
  ta.setSelectionRange(p,p);
}
function commitEdit(val,skipRender){
  const idx=editingIdx;
  editingIdx=null;
  const chain=pendingIdx;pendingIdx=null;
  if(idx===null||!curBlocks||!curBlocks[idx])return;
  if(!currentNote())return;
  replaceBlock(idx,val);
  if(skipRender)return;
  if(chain!==null&&chain!==idx)requestAnimationFrame(()=>startEdit(chain,null));
}
/* ---------- docs: 可编辑增强（任务勾选 / 表格编辑 / 智能换行） ---------- */
let cellEdit=null,selCell=null;
// 将 idx 号块整体替换为 newSrc 并刷新预览与源码视图
function replaceBlock(idx,newSrc){
  const note=currentNote();if(!note||!curBlocks||!curBlocks[idx])return;
  const b=curBlocks[idx];
  const lines=docText(note).split('\n');
  const nl=(newSrc||'').replace(/\n+$/,'').split('\n');
  lines.splice(b.start,b.end-b.start,...nl);
  const text=lines.join('\n');
  setDocContent(note,text);
  const pv=document.getElementById('docPreview');
  if(pv)buildPreviewInto(pv,text);
  const ta0=document.getElementById('docEditor');
  if(ta0)ta0.value=text;
  const meta=document.querySelector('#docEditorPanel .de-meta');
  if(meta)meta.textContent=fmtTime(note.updatedAt);
}
// 切换块内第 k 个任务勾选框
function toggleTask(idx,k){
  const lines=curBlocks[idx].src.split('\n');let n=0;
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/^(\s*[-*]\s+\[)([ xX])(\].*)$/);
    if(m){if(n===k){lines[i]=m[1]+(m[2]===' '?'x':' ')+m[3];replaceBlock(idx,lines.join('\n'));return}n++}
  }
}
function tblRow(line){return line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|').map(c=>c.trim())}
function tblLine(cells){return '| '+cells.join(' | ')+' |'}
function tblCellSet(lines,r,c,val){
  const cells=tblRow(lines[r]);while(cells.length<=c)cells.push('');
  cells[c]=String(val).replace(/\|/g,' ');lines[r]=tblLine(cells);
}
// 单元格就地编辑
function startCellEdit(td){
  if(cellEdit)return;
  const blk=td.closest('.blk');const tr=td.closest('tr');
  const r=+tr.dataset.r,c=+td.dataset.c;
  selCell={blk:+blk.dataset.i,r,c};
  document.querySelectorAll('.blk.has-sel').forEach(b=>b.classList.remove('has-sel'));
  blk.classList.add('has-sel');
  const input=document.createElement('input');input.className='cell-edit';input.value=td.dataset.raw||'';
  td.textContent='';td.appendChild(input);
  cellEdit={blk:+blk.dataset.i,r,c,input};
  input.focus();input.select();
  input.onkeydown=ev=>{
    ev.stopPropagation();
    if(ev.key==='Escape'){ev.preventDefault();const ce=cellEdit;cellEdit=null;replaceBlock(ce.blk,curBlocks[ce.blk].src);return}
    if(ev.key==='Enter'){ev.preventDefault();commitCell(0);return}
    if(ev.key==='Tab'){ev.preventDefault();commitCell(ev.shiftKey?-1:1)}
  };
  input.onblur=()=>commitCell(0);
  input.onclick=ev=>ev.stopPropagation();
}
function commitCell(move){
  const ce=cellEdit;if(!ce)return;cellEdit=null;
  const src=curBlocks[ce.blk].src.split('\n');
  tblCellSet(src,ce.r,ce.c,ce.input.value);
  replaceBlock(ce.blk,src.join('\n'));
  if(move)requestAnimationFrame(()=>{
    const pv=document.getElementById('docPreview');if(!pv)return;
    const blk=pv.querySelector('.blk[data-i="'+ce.blk+'"]');if(!blk)return;
    const tds=[...blk.querySelectorAll('th[data-c],td[data-c]')];
    const i=tds.findIndex(t=>+t.closest('tr').dataset.r===ce.r&&+t.dataset.c===ce.c);
    const nx=tds[i+move];if(nx)startCellEdit(nx);
  });
}
// 表格结构操作：+row / -row / +col / -col（基于最近点选的单元格）
function tblOp(idx,op){
  if(cellEdit)commitCell(0);   // 先提交未完成的单元格编辑，再改结构
  const lines=curBlocks[idx].src.split('\n');
  const head=tblRow(lines[0]);
  const cols=head.length;
  const sep=tblRow(lines[1]).slice(0,cols);while(sep.length<cols)sep.push('---');
  const sel=(selCell&&selCell.blk===idx)?selCell:null;
  selCell=null;
  if(op==='+row')lines.splice(Math.min(Math.max((sel?sel.r:lines.length-1)+1,2),lines.length),0,tblLine(Array(cols).fill('')));
  else if(op==='-row'){const r=(sel&&sel.r>=2)?sel.r:lines.length-1;if(lines.length>3)lines.splice(r,1)}
  else if(op==='+col'){head.push('新列');sep.push('---');lines[0]=tblLine(head);lines[1]=tblLine(sep);for(let r=2;r<lines.length;r++){const cs=tblRow(lines[r]);while(cs.length<cols)cs.push('');cs.push('');lines[r]=tblLine(cs)}}
  else if(op==='-col'){if(cols<=1)return;const ci=(sel&&sel.c<cols)?sel.c:cols-1;head.splice(ci,1);sep.splice(Math.min(ci,sep.length-1),1);lines[0]=tblLine(head);lines[1]=tblLine(sep);for(let r=2;r<lines.length;r++){const cs=tblRow(lines[r]);cs.splice(Math.min(ci,cs.length-1),1);lines[r]=tblLine(cs)}}
  else return;
  replaceBlock(idx,lines.join('\n'));
}
// 智能换行：列表/任务/序号自动续行，空项回车退出列表，引用续行；代码围栏内不干预
function smartEnter(ta,ev){
  if(ev.shiftKey||ev.metaKey||ev.ctrlKey||ev.altKey)return;
  const s=ta.selectionStart;
  if(ta.selectionEnd!==s)return;
  const v=ta.value;
  const ls=v.lastIndexOf('\n',s-1)+1;
  let le=v.indexOf('\n',s);if(le===-1)le=v.length;
  const fences=v.slice(0,ls).match(/^[ \t]*(?:```|~~~)/gm);
  if(fences&&fences.length%2)return;
  const up=v.slice(ls,s),after=v.slice(s,le);
  const tail=v.slice(le);
  // 续行：保留当前行内容（到光标为止），下一行接新标记；空项回车：仅去掉标记
  const putCont=txt=>{ta.value=v.slice(0,s)+txt+tail;const p=v.slice(0,s).length+txt.length;ta.setSelectionRange(p,p);ta.dispatchEvent(new Event('input',{bubbles:true}))};
  const putExit=txt=>{ta.value=v.slice(0,ls)+txt+tail;const p=v.slice(0,ls).length+txt.length;ta.setSelectionRange(p,p);ta.dispatchEvent(new Event('input',{bubbles:true}))};
  let m;
  if(m=up.match(/^(\s*)([-*])\s+(\[[ xX]\]\s+)?(.*)$/)){
    if(!m[4].trim()&&!after.trim())putExit(m[1]);
    else putCont('\n'+m[1]+(m[3]?'- [ ] ':m[2]+' '));
  }else if(m=up.match(/^(\s*)(\d+)\.\s+(.*)$/)){
    if(!m[3].trim()&&!after.trim())putExit(m[1]);
    else putCont('\n'+m[1]+(parseInt(m[2],10)+1)+'. ');
  }else if(m=up.match(/^(\s*)>\s?(.*)$/)){
    if(!m[2].trim()&&!after.trim())putExit(m[1]);
    else putCont('\n'+m[1]+'> ');
  }else return;
  ev.preventDefault();
}
/* ---------- docs: 增删改 ---------- */
function askName(title,val,cb){promptText({title,label:'名称',value:val,placeholder:'输入名称',ok:'确定',cancel:'取消',empty:'请填写名称'},cb)}
function newNote(folderId){
  const fid=folderId||'';
  openModal(`
    <div class="modal-head"><h3>新建笔记</h3><button class="icon-btn" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
    <div class="modal-body"><div class="fmt-pick">
      <button class="fmt-opt" onclick="createNote('md','${fid}')">${ICO_DOC}<span><b>Markdown 笔记</b><p>标题 / 列表 / 代码块 / 表格，支持块级所见即所得编辑，自动生成 frontmatter 模板</p></span></button>
      <button class="fmt-opt" onclick="createNote('json','${fid}')">${ICO_JSON}<span><b>JSON 文档</b><p>源码语法高亮、粘贴自动格式化、树形预览、节点编辑与注释</p></span></button>
    </div></div>`);
}
function newFolder(folderId){askName('新建文件夹','',name=>{
  const node={id:uid(),name,type:'folder',open:true,children:[]};
  if(folderId){const f=findNode(DB.docs,folderId);if(f){(f.n.children=f.n.children||[]).push(node);f.n.open=true}else DB.docs.push(node)}
  else DB.docs.push(node);
  save();if(view==='docs')renderDocs();toast('已创建')})}
function renameNode(id){const r=findNode(DB.docs,id);if(!r)return;askName('重命名',r.n.name,v=>{r.n.name=v;save();render()})}
function copyJ(){const d=jCur();if(d)copy(docText(d),'原始 JSON 已复制')}
/* Docs 视图 + 当前为 JSON 文档时：页面内直接粘贴即写入当前文档并自动格式化 */
document.addEventListener('paste',e=>{
  if(view!=='docs')return;
  const doc=jCur();if(!doc)return;
  const ae=document.activeElement;
  if(ae&&ae!==document.body&&(ae.tagName==='INPUT'||ae.tagName==='TEXTAREA'||ae.isContentEditable))return;
  const txt=(e.clipboardData||window.clipboardData)?.getData('text');
  if(!txt||!txt.trim())return;
  let obj;try{obj=JSON.parse(txt)}catch(err){toast('剪贴板不是合法 JSON');return}
  const cur=(docText(doc)||'').trim();
  if(cur&&cur!=='{\n  "key": "value"\n}'&&!confirm('文档「'+doc.name+'」已有内容，粘贴将替换全部内容，继续？'))return;
  e.preventDefault();
  setDocContent(doc,JSON.stringify(obj,null,2));jExpand={};
  renderDocs();toast('已自动格式化');
});
function getIn(o,segs){return segs.reduce((v,s)=>v==null?v:v[s],o)}
function setIn(o,segs,v){const p=getIn(o,segs.slice(0,-1));const last=segs[segs.length-1];if(Array.isArray(p))p[Number(last)]=v;else p[last]=v}
function delIn(o,segs){const p=getIn(o,segs.slice(0,-1));const last=segs[segs.length-1];if(Array.isArray(p))p.splice(Number(last),1);else delete p[last]}
function cleanComments(doc,segs){
  const cm=docComments(doc);
  const rm=Object.keys(cm).filter(k=>{try{const a=JSON.parse(k);return a.length>=segs.length&&segs.every((s,i)=>a[i]===s)}catch(e){return false}});
  if(rm.length){rm.forEach(k=>delete cm[k]);setDocComments(doc,cm)}
}
function jIsOpen(pathStr,depth){return pathStr in jExpand?jExpand[pathStr]:depth<2}
function jNode(val,key,segs,depth){
  const pathStr=JSON.stringify(segs);
  const t=jType(val);
  const isContainer=t==='object'||t==='array';
  const kids=isContainer?(t==='object'?Object.keys(val):val.map((_,i)=>i)):[];
  const open=isContainer&&jIsOpen(pathStr,depth);
  const cmt=docComments(jCur())[pathStr]||'';
  const kind=isContainer?(t==='object'?'obj':'arr'):'val';
  let row='<div class="jn-row '+(open?'open':'')+'" data-kind="'+kind+'" data-path=\''+esc(pathStr)+'\'>';
  row+='<span class="jn-tw">'+(isContainer?'<svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>':'<span style="width:3px;height:3px;border-radius:50%;background:var(--line-2)"></span>')+'</span>';
  if(key!==null)row+='<span class="jn-key">'+esc(key)+'</span><span class="jn-colon">:</span>';
  if(!isContainer){
    const cls=t==='string'?'jn-str':t==='number'?'jn-num':(t==='boolean'?'jn-bool':'jn-null');
    const vs=t==='string'?'"'+esc(val)+'"':esc(String(val));
    row+='<span class="jn-val '+cls+'">'+vs+'</span>';
  }else{
    row+='<span class="jn-val jn-sum">'+(t==='object'?'{':'[')+(open?'':' '+kids.length+' 项 '+(t==='object'?'}':']'))+'</span>';
  }
  if(cmt)row+='<span class="jn-cmt" data-cmtpath=\''+esc(pathStr)+'\' title="'+esc(cmt)+'">💬 '+esc(cmt)+'</span>';
  if(jUnlocked){
    row+='<span class="jn-acts">'
      +'<button class="icon-btn" data-act="edit" title="编辑值">'+ICO_EDIT+'</button>'
      +(isContainer?'<button class="icon-btn" data-act="add" title="添加子节点">'+ICO_PLUS+'</button>':'')
      +(depth>0?'<button class="icon-btn danger" data-act="del" title="删除节点">'+ICO_TRASH+'</button>':'')
      +'<button class="icon-btn" data-act="cmt" title="'+(cmt?'编辑注释':'添加注释')+'">'+ICO_MSG+'</button>'
      +'</span>';
  }
  row+='</div>';
  if(isContainer&&open){
    row+='<div class="jn-kids">'+(t==='object'
      ?kids.map(k=>jNode(val[k],k,[...segs,k],depth+1)).join('')
      :kids.map(i=>jNode(val[i],i,[...segs,i],depth+1)).join(''))+'</div>';
  }
  return row;
}
function renderJEditor(doc){
  const panel=document.getElementById('docEditorPanel');
  const dc=dState(doc.id);
  if(!dc.loaded){
    panel.innerHTML='<div class="empty" style="margin:auto;padding:70px 20px"><p>加载中…</p></div>';
    loadDoc(doc.id).then(c=>{if(selDoc===doc.id&&c.loaded)renderDocs()});
    return;
  }
  panel.innerHTML=`
    <div class="de-head">
      <span class="de-title">${esc(doc.name)}</span>
      <span class="de-meta">${fmtTime(doc.updatedAt)}</span>
      <div class="seg">${[['source','源码'],['view','预览']].map(([m,t])=>`<button class="${jMode===m?'on':''}" onclick="setJMode('${m}')">${t}</button>`).join('')}</div>
      ${jMode==='view'?`<button class="icon-btn" id="jLiveToggle" title="${jUnlocked?'锁定（只读预览）':'解锁（点击节点编辑）'}" style="${jUnlocked?'color:var(--accent-deep);background:var(--accent-soft)':''}">${jUnlocked?ICO_EDIT:ICO_LOCK}</button>`:''}
      <button class="icon-btn" id="jCopyBtn" title="复制原始 JSON">${ICO_COPY}</button>
    </div>
    <div class="de-body">`+(jMode==='source'
      ?'<div class="jsrc-wrap"><pre class="json-hi" id="jsonHi" aria-hidden="true"></pre><textarea id="jsonSrc" class="json-src" spellcheck="false" placeholder=\'{ "key": "value" }\'></textarea></div>'
      :'<div id="jsonTreeWrap" class="jtree '+(jUnlocked?'jun':'')+'"></div>')+`</div>`;
  document.getElementById('jLiveToggle')?.addEventListener('click',()=>{jUnlocked=!jUnlocked;renderDocs();toast(jUnlocked?'已解锁：点击节点编辑，悬停显示操作':'预览已锁定')});
  document.getElementById('jCopyBtn')?.addEventListener('click',copyJ);
  if(jMode==='source'){
    const ta=document.getElementById('jsonSrc');
    const hi=document.getElementById('jsonHi');
    const syncHi=()=>{hi.innerHTML=jsonHi(ta.value)+'\n'};
    ta.value=dc.content||'';
    syncHi();
    ta.addEventListener('input',syncHi);
    ta.addEventListener('scroll',()=>{hi.scrollTop=ta.scrollTop;hi.scrollLeft=ta.scrollLeft});
    let t;
    ta.addEventListener('input',()=>{
      dc.content=ta.value;
      if(!dc.resolving){dc.dirtyC=true;scheduleDocSave()}
      doc.updatedAt=Date.now();save();
      clearTimeout(t);t=setTimeout(()=>{const meta=panel.querySelector('.de-meta');if(meta)meta.textContent=fmtTime(doc.updatedAt)},300);
    });
    ta.addEventListener('blur',()=>flushDocSaves());
    // 初次粘贴（空文档或默认模板）时自动快速格式化
    ta.addEventListener('paste',e=>{
      const txt=(e.clipboardData||window.clipboardData).getData('text');
      if(!txt)return;
      const cur=ta.value.trim();
      if(cur&&cur!=='{\n  "key": "value"\n}')return;
      let obj;try{obj=JSON.parse(txt)}catch(err){return}
      e.preventDefault();
      const f=JSON.stringify(obj,null,2);
      ta.value=f;syncHi();
      setDocContent(doc,f);
      const meta=panel.querySelector('.de-meta');if(meta)meta.textContent=fmtTime(doc.updatedAt);
      ta.setSelectionRange(f.length,f.length);
      toast('已自动格式化');
    });
  }else{
    renderJTree(panel.querySelector('#jsonTreeWrap'),doc);
  }
}
function renderJTree(wrap,doc){
  let obj;
  try{obj=JSON.parse(docText(doc)||'null')}
  catch(e){wrap.innerHTML='<div class="json-err">JSON 解析失败：'+esc(e.message)+'<br><br>请切换到「源码」模式修复语法。</div>';return}
  wrap.innerHTML=jNode(obj,null,[],0);
  wrap.querySelectorAll('.jn-row').forEach(row=>{
    const segs=JSON.parse(row.dataset.path);
    row.addEventListener('click',e=>{
      if(e.target.closest('[data-act]'))return;
      const cmtEl=e.target.closest('.jn-cmt');
      if(cmtEl){if(jUnlocked)editJComment(row.dataset.path);return}
      if(row.dataset.kind!=='val'){const p=row.dataset.path;jExpand[p]=!row.classList.contains('open');renderJEditor(jCur())}
      else if(jUnlocked)editJValue(segs,row);
    });
    row.querySelectorAll('[data-act]').forEach(btn=>btn.addEventListener('click',e=>{
      e.stopPropagation();
      const act=btn.dataset.act;
      if(act==='edit')editJValue(segs,row);
      else if(act==='add')addJChild(row.dataset.path);
      else if(act==='del')delJNode(row.dataset.path);
      else if(act==='cmt')editJComment(row.dataset.path);
    }));
  });
}
function editJValue(segs,row){
  const doc=jCur();let obj;try{obj=JSON.parse(docText(doc))}catch(e){return toast('JSON 不合法，请到源码模式修复')}
  const cur=getIn(obj,segs);
  const span=row.querySelector('.jn-val');if(!span)return;
  const inp=document.createElement('input');inp.className='jn-edit';
  inp.value=typeof cur==='string'?cur:JSON.stringify(cur);
  span.replaceWith(inp);inp.focus();inp.select();
  inp.addEventListener('keydown',e=>{if(e.key==='Enter')inp.blur();if(e.key==='Escape'){inp.dataset.cancel='1';inp.blur()}});
  inp.addEventListener('blur',()=>{
    if(inp.dataset.cancel){renderJEditor(jCur());return}
    let v;const txt=inp.value.trim();
    try{v=JSON.parse(txt)}catch(e){v=inp.value}
    try{setIn(obj,segs,v)}catch(e){toast('设置失败');renderJEditor(jCur());return}
    setDocContent(doc,JSON.stringify(obj,null,2));
    renderJEditor(jCur());
  });
}
function addJChild(pathStr){
  const doc=jCur();let obj;try{obj=JSON.parse(docText(doc))}catch(e){return toast('JSON 不合法，请到源码模式修复')}
  const segs=JSON.parse(pathStr);
  const parent=getIn(obj,segs);
  if(jType(parent)!=='object'&&jType(parent)!=='array')return toast('只能向对象或数组添加子节点');
  jAddSegs=segs;
  const isArr=Array.isArray(parent);
  openModal(`
    <div class="modal-head"><h3>${isArr?'添加数组项':'添加子节点'}</h3><button class="icon-btn" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
    <div class="modal-body">
      ${isArr?'':'<div class="field"><label>键名</label><input id="f-jkey" placeholder="myKey"></div>'}
      <div class="field"><label>值（支持 JSON：123 / "文本" / true / {"a":1}；纯文本将按字符串处理）</label><textarea id="f-jval" style="min-height:90px" placeholder='"hello" 或 123 或 { "a": 1 }'></textarea></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-accent" onclick="addJChildSave()">添加</button></div>`);
}
function addJChildSave(){
  const doc=jCur();let obj;try{obj=JSON.parse(docText(doc))}catch(e){return toast('JSON 不合法')}
  const parent=getIn(obj,jAddSegs);
  let v;const t=document.getElementById('f-jval').value.trim();
  try{v=JSON.parse(t)}catch(e){v=document.getElementById('f-jval').value}
  if(Array.isArray(parent))parent.push(v);
  else{
    const k=document.getElementById('f-jkey').value.trim();
    if(!k){toast('请填写键名');return}
    parent[k]=v;
  }
  setDocContent(doc,JSON.stringify(obj,null,2));
  jExpand[JSON.stringify(jAddSegs)]=true;
  closeModal();renderDocs();toast('已添加');
}
function delJNode(pathStr){
  const segs=JSON.parse(pathStr);
  if(!segs.length)return toast('不能删除根节点');
  if(!confirm('删除该节点及其子节点？'))return;
  const doc=jCur();let obj;try{obj=JSON.parse(docText(doc))}catch(e){return toast('JSON 不合法')}
  delIn(obj,segs);cleanComments(doc,segs);
  setDocContent(doc,JSON.stringify(obj,null,2));
  renderDocs();toast('已删除');
}
function editJComment(pathStr){
  const doc=jCur();
  const cur=docComments(doc)[pathStr]||'';
  openModal(`
    <div class="modal-head"><h3>节点注释</h3><button class="icon-btn" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
    <div class="modal-body"><div class="field"><label>注释内容（留空则删除注释，不影响原始 JSON）</label><textarea id="f-jcmt" style="min-height:90px">${esc(cur)}</textarea></div></div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">取消</button><button class="btn btn-accent" onclick="saveJComment('${esc(pathStr).replace(/'/g,"\\'")}')">保存</button></div>`);
}
function saveJComment(pathStr){
  const doc=jCur();
  const v=document.getElementById('f-jcmt').value.trim();
  const cm=docComments(doc);
  if(v)cm[pathStr]=v;else delete cm[pathStr];
  setDocComments(doc,cm);
  closeModal();renderDocs();toast(v?'注释已保存':'注释已删除');
}
/* ---------- 存储：目录树（toolsx.docs.index）与单篇正文（toolsx.docs.note.<id>）分开 ---------- */
let docTreeT=0;
const docSaveT={};
function save(){                    /* 目录树：名称 / 层级 / 折叠 / 时间戳 */
  clearTimeout(docTreeT);
  docTreeT=setTimeout(()=>{docTreeT=0;patch({[STORE.docsIndex]:stripDocs(DB.docs)})},250);
}
function flushDocTree(){
  clearTimeout(docTreeT);docTreeT=0;
  if(DB.docs.length||get(STORE.docsIndex)!==undefined)patch({[STORE.docsIndex]:stripDocs(DB.docs)});
}
async function loadDoc(id,force){
  const c=dState(id);
  if(c.loaded&&!force)return c;
  const stored=get(STORE.docNote(id));
  c.content=(stored&&typeof stored.content==='string')?stored.content:'';
  c.comments=(stored&&typeof stored.comments==='object'&&stored.comments)?Object.assign({},stored.comments):{};
  c.loaded=true;
  return c;
}
function setDocContent(note,text){
  const c=dState(note.id);c.content=text;c.loaded=true;c.dirtyC=true;
  note.updatedAt=Date.now();
  save();scheduleDocSave();
}
function setDocComments(note,obj){
  const c=dState(note.id);c.comments=obj||{};c.loaded=true;c.dirtyM=true;
  note.updatedAt=Date.now();
  save();scheduleDocSave();
}
function scheduleDocSave(){
  const id=selDoc||Object.keys(docCache).find(k=>docCache[k].dirtyC||docCache[k].dirtyM);
  if(!id)return;
  clearTimeout(docSaveT[id]);
  docSaveT[id]=setTimeout(()=>{delete docSaveT[id];flushDocSaves()},300);
}
/* 把内存中改动过的正文 / 注释逐篇写入各自的 key */
function flushDocSaves(){
  Object.keys(docCache).forEach((id)=>{
    const c=docCache[id];
    if(!c||!c.loaded)return;
    if(!c.dirtyC&&!c.dirtyM)return;
    clearTimeout(docSaveT[id]);delete docSaveT[id];
    c.dirtyC=false;c.dirtyM=false;
    const r=findNode(DB.docs,id);
    patch({[STORE.docNote(id)]:{content:String(c.content||''),comments:Object.assign({},c.comments||{}),updatedAt:(r&&r.n.updatedAt)||Date.now()}});
  });
  return Promise.resolve();
}

function createNote(fmt,folderId){
  closeModal();
  askName(fmt==='json'?'新建 JSON 文档':'新建 Markdown 笔记','',name=>{
    const id=uid();
    let initial;
    if(fmt==='json'){
      initial='{\n  "key": "value"\n}';
    }else{
      const d=new Date(),p=n=>String(n).padStart(2,'0');
      const now=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
      initial='---\ndescription: \ntags: \ncreated: '+now+'\n---\n\n# '+name+'\n\n';
    }
    const note={id,name,type:'note',fmt,updatedAt:Date.now()};
    if(folderId){const f=findNode(DB.docs,folderId);if(f){(f.n.children=f.n.children||[]).push(note);f.n.open=true}else DB.docs.push(note)}
    else DB.docs.push(note);
    const c=dState(id);c.content=initial;c.comments={};c.loaded=true;c.dirtyC=true;
    selDoc=id;
    if(fmt==='json'){jMode='source';jExpand={};jUnlocked=false}
    save();flushDocSaves();
    if(view==='docs')renderDocs();else switchView('docs');
    if(fmt==='json')requestAnimationFrame(()=>document.getElementById('jsonSrc')?.focus());
    toast('已创建'+(fmt==='json'?'，直接粘贴 JSON 即可自动格式化':''));
  });
}
function delNode(id){
  const r=findNode(DB.docs,id);if(!r)return;
  const cnt=r.n.type==='folder'?countNotes(r.n):1;
  if(!confirm(r.n.type==='folder'?`删除文件夹「${r.n.name}」及其 ${cnt} 条笔记？`:`删除笔记「${r.n.name}」？`))return;
  const removed=[];
  (function collect(n){if(n.type==='note')removed.push(n.id);else (n.children||[]).forEach(collect)})(r.n);
  r.list.splice(r.list.indexOf(r.n),1);
  if(selDoc===id||isAncestor(r.n,selDoc))selDoc=null;
  removed.forEach(x=>{delete docCache[x];clearTimeout(docSaveT[x]);delete docSaveT[x]});
  removeKeys(removed.map(x=>STORE.docNote(x)));
  save();render();toast('已删除');
}

/* ---------- 种子数据 ---------- */
const SEED_DOCS=[
      {
            "id": "seed-welcome",
            "name": "欢迎",
            "type": "folder",
            "open": true,
            "children": [
                  {
                        "id": "seed-guide",
                        "name": "使用指南",
                        "type": "note",
                        "fmt": "md",
                        "updatedAt": 0,
                        "content": "# 欢迎使用 Docs\n\n这里是 Tools-X 的本地笔记，支持 **多级目录** 与 Markdown 书写。\n\n## 基本操作\n\n- 左侧目录树支持 **拖拽** 整理\n- 悬停文件夹行可新建子笔记 / 子文件夹\n- 编辑自动保存，右上角可切换 源码 / 预览\n- 预览解锁后，点击任意区块即可就地编辑\n\n## Markdown 支持\n\n1. 行内语法：**加粗**、*斜体*、~~删除线~~、`行内代码`\n2. 任务清单：\n   - [x] 多级目录\n   - [x] Markdown 渲染\n   - [ ] 你的第一条笔记\n3. 代码块、表格、引用\n\n> 提示：顶部搜索框可以直接搜笔记名称与内容。\n\n```js\nconsole.log(\"Hello Tools-X\");\n```\n\n| 语法 | 说明 |\n| --- | --- |\n| # | 标题 |\n| - / 1. | 列表 |\n| > | 引用 |\n"
                  },
                  {
                        "id": "seed-json",
                        "name": "示例配置",
                        "type": "note",
                        "fmt": "json",
                        "updatedAt": 0,
                        "content": "{\n  \"name\": \"ai-hub-tools\",\n  \"version\": \"1.0.0\",\n  \"features\": {\n    \"docs\": true,\n    \"json\": true,\n    \"backend\": false\n  },\n  \"tags\": [\n    \"local\",\n    \"chrome-extension\"\n  ]\n}",
                        "comments": {
                              "[\"features\"]": "核心功能开关"
                        }
                  }
            ]
      },
      {
            "id": "seed-notes",
            "name": "JSON 笔记",
            "type": "folder",
            "open": true,
            "children": [
                  {
                        "id": "seed-json-tips",
                        "name": "JSON 使用技巧",
                        "type": "note",
                        "fmt": "md",
                        "updatedAt": 0,
                        "content": "# JSON 使用技巧\n\n- 新建 JSON 文档后，直接粘贴合法 JSON 会自动格式化并高亮。\n- 切换到「预览」并点击右上角锁图标解锁，可以树形浏览、编辑节点与添加注释。\n- 注释独立保存，不会写入原始 JSON。\n- 「JSON 工具」页提供快速格式化、压缩、转义与两份 JSON 的比对。\n"
                  }
            ]
      }
];
function buildSeed(){
  const docs=JSON.parse(JSON.stringify(SEED_DOCS));
  (function fix(list){list.forEach(n=>{n.updatedAt=n.updatedAt||Date.now();if(n.children)fix(n.children)})})(docs);
  return docs;
}
/* 首次运行：把种子笔记的正文写进各自的 note key */
function seedNotes(docs){
  const map={};
  (function walk(list){list.forEach(n=>{
    if(n.type==='folder'){walk(n.children||[]);return}
    map[STORE.docNote(n.id)]={content:String(n.content||''),comments:n.comments||{},updatedAt:n.updatedAt||Date.now()};
  })})(docs);
  patch(map);
}
function docsInit(index){
  if(Array.isArray(index)){
    DB={docs:stripDocs(index)};
  }else{
    const seed=buildSeed();
    DB={docs:stripDocs(seed)};
    seedNotes(seed);
    patch({[STORE.docsIndex]:stripDocs(seed)});
  }
}

