/* ============================================================
   Tools-X · JSON 工具（格式化 / 压缩 / 转义 / 比对）
============================================================ */
let jTab='format', jfRaw='';
const JTABS=[['format','快速格式化'],['diff','比对']];
function renderJson(){
  document.getElementById('jsonTabs').innerHTML=JTABS.map(([k,t])=>`<span class="chip ${jTab===k?'on':''}" data-jtab="${k}">${t}</span>`).join('');
  document.querySelectorAll('[data-jtab]').forEach(c=>c.onclick=()=>{jTab=c.dataset.jtab;renderJson()});
  document.getElementById('jsonFormat').classList.toggle('hide',jTab!=='format');
  document.getElementById('jsonDiff').classList.toggle('hide',jTab!=='diff');
}
/* JSON 语法高亮：键 k / 字符串 s / 数字 n / 布尔与 null b */
function jfmt(space){
  const msg=document.getElementById('jfMsg');
  try{const o=JSON.parse(document.getElementById('jfIn').value);
    jfRaw=JSON.stringify(o,null,space);
    document.getElementById('jfOut').innerHTML=space?jTree(o,0):jsonHi(jfRaw);
    jfSearch();
    msg.textContent='✓ 合法 JSON，已'+(space?'格式化':'压缩');msg.className='json-msg ok';
  }catch(e){msg.textContent='✗ 不是合法 JSON：'+e.message;msg.className='json-msg err'}
}
function jesc(){jfRaw=JSON.stringify(document.getElementById('jfIn').value);
  document.getElementById('jfOut').innerHTML=jsonHi(jfRaw);
  jfSearch();
  const msg=document.getElementById('jfMsg');msg.textContent='✓ 已转义为 JSON 字符串';msg.className='json-msg ok'}
function junes(){
  const msg=document.getElementById('jfMsg');const raw=document.getElementById('jfIn').value;
  try{const o=JSON.parse(raw);
    jfRaw=typeof o==='string'?o:JSON.stringify(o,null,2);
    document.getElementById('jfOut').innerHTML=jsonHi(jfRaw);
    jfSearch();
    msg.textContent='✓ 已还原';msg.className='json-msg ok';
  }catch(e){msg.textContent='✗ 无法解析：'+e.message;msg.className='json-msg err'}
}
function copyJfOut(){if(!jfRaw)return toast('输出为空');copy(jfRaw,'输出已复制')}
/* 结果搜索：高亮全部匹配、Enter/Shift+Enter 上下跳转，自动展开含匹配的折叠节点 */
let jtHits=[],jtIdx=-1;
function jfClearHits(){
  document.querySelectorAll('#jfOut mark.jt-hit').forEach(m=>m.replaceWith(document.createTextNode(m.textContent)));
  const out=document.getElementById('jfOut');out.normalize();
  jtHits=[];jtIdx=-1;document.getElementById('jfQn').textContent='';
}
function jfSearch(){
  jfClearHits();
  const q=document.getElementById('jfQ').value.toLowerCase();
  if(!q)return;
  const out=document.getElementById('jfOut');
  const walker=document.createTreeWalker(out,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement&&n.parentElement.closest('mark')?NodeFilter.FILTER_REJECT:!n.nodeValue.toLowerCase().includes(q)?NodeFilter.FILTER_SKIP:NodeFilter.FILTER_ACCEPT});
  const targets=[];let n;
  while((n=walker.nextNode()))targets.push(n);
  targets.forEach(node=>{
    const text=node.nodeValue,low=text.toLowerCase();
    const frag=document.createDocumentFragment();
    let idx=0,pos;
    while((pos=low.indexOf(q,idx))>=0){
      if(pos>idx)frag.appendChild(document.createTextNode(text.slice(idx,pos)));
      const mk=document.createElement('mark');mk.className='jt-hit';mk.textContent=text.slice(pos,pos+q.length);
      frag.appendChild(mk);jtHits.push(mk);idx=pos+q.length;
    }
    if(idx<text.length)frag.appendChild(document.createTextNode(text.slice(idx)));
    node.replaceWith(frag);
  });
  document.querySelectorAll('#jfOut .jt-node.closed').forEach(nd=>{if(nd.querySelector('.jt-kids mark.jt-hit'))nd.classList.remove('closed')});
  if(jtHits.length){jtIdx=0;jfFocus(0)}else document.getElementById('jfQn').textContent='无匹配';
}
function jfFocus(i){
  document.getElementById('jfQn').textContent=(i+1)+'/'+jtHits.length;
  const m=jtHits[i],pre=document.getElementById('jfOut');
  m.classList.add('cur');
  const pr=pre.getBoundingClientRect(),mr=m.getBoundingClientRect();
  if(pr.height&&(mr.top<pr.top||mr.bottom>pr.bottom))pre.scrollTop+=mr.top-pr.top-pre.clientHeight/2;
}
function jfNav(d){
  if(!jtHits.length)return;
  if(jtHits[jtIdx])jtHits[jtIdx].classList.remove('cur');
  jtIdx=(jtIdx+d+jtHits.length)%jtHits.length;
  jfFocus(jtIdx);
}
const jfq=document.getElementById('jfQ');
jfq.addEventListener('input',jfSearch);
jfq.addEventListener('keydown',e=>{
  if(e.key==='Enter'){e.preventDefault();jfNav(e.shiftKey?-1:1)}
  else if(e.key==='Escape'){e.stopPropagation();jfq.value='';jfSearch()}
});
/* 快速格式化：粘贴到输入框后自动执行格式化 */
document.getElementById('jfIn').addEventListener('paste',()=>{setTimeout(()=>{if(document.getElementById('jfIn').value.trim())jfmt(2)},0)});
/* ---------- JSON 比对 ---------- */
function diffWalk(a,b,p,out){
  const ta=jType(a),tb=jType(b);
  if(ta!==tb){out.push({p,t:'chg',a,b});return}
  if(ta==='object'){
    new Set([...Object.keys(a),...Object.keys(b)]).forEach(k=>{
      const np=p+'.'+k;
      if(!(k in b))out.push({p:np,t:'del',a:a[k]});
      else if(!(k in a))out.push({p:np,t:'add',a:b[k]});
      else diffWalk(a[k],b[k],np,out)});
  }else if(ta==='array'){
    const n=Math.max(a.length,b.length);
    for(let i=0;i<n;i++){const np=p+'['+i+']';
      if(i>=b.length)out.push({p:np,t:'del',a:a[i]});
      else if(i>=a.length)out.push({p:np,t:'add',a:b[i]});
      else diffWalk(a[i],b[i],np,out)}
  }else if(a!==b)out.push({p,t:'chg',a,b});
}
function jdCompare(){
  const msg=document.getElementById('jdMsg'),box=document.getElementById('jdResult');
  let a,b;
  try{a=JSON.parse(document.getElementById('jdA').value)}catch(e){msg.textContent='✗ JSON A 不合法：'+e.message;msg.className='json-msg err';box.innerHTML='';return}
  try{b=JSON.parse(document.getElementById('jdB').value)}catch(e){msg.textContent='✗ JSON B 不合法：'+e.message;msg.className='json-msg err';box.innerHTML='';return}
  msg.textContent='';
  const out=[];diffWalk(a,b,'$',out);
  if(!out.length){box.innerHTML='<div class="json-msg ok">✓ 两个 JSON 完全一致</div>';return}
  const short=v=>{const s=JSON.stringify(v)??'undefined';return s.length>60?s.slice(0,60)+'…':s};
  box.innerHTML='<div class="json-msg" style="margin-bottom:10px">共 '+out.length+' 处差异：</div>'+out.map(r=>{
    const cls=r.t==='add'?'diff-add':r.t==='del'?'diff-del':'diff-chg';
    const badge=r.t==='add'?'只在 B':r.t==='del'?'只在 A':'值不同';
    const val=r.t==='add'?esc(short(r.a)):r.t==='del'?esc(short(r.a)):esc(short(r.a))+' <span style="opacity:.5">→</span> '+esc(short(r.b));
    return '<div class="diff-row '+cls+'"><span class="diff-badge">'+badge+'</span><span class="diff-path">'+esc(r.p)+'</span><span class="diff-val">'+val+'</span></div>';
  }).join('');
}
