/* ============================================================
   Tools-X · Postman（HTTP 请求调试）
============================================================ */
/* ---------- postman / HTTP 请求 ---------- */
let apiState=null, apiTab='params', apiRespTab='body', apiPretty=true, apiRespData=null, apiBusy=null, apiReqSeq=0, apiLocalCtl=null, apiDrag=null;
function apiRow(){return{on:true,k:'',v:''}}
function apiDefault(){return{method:'GET',url:'',name:'',params:[apiRow()],headers:[apiRow()],bodyType:'none',body:'',form:[apiRow()],folders:[],activeFolder:null,cur:null,tab:'params',respTab:'body',pretty:true}}
function apiNormRows(a){const rows=(Array.isArray(a)?a:[]).map(r=>({on:(r&&r.on)!==false,k:String((r&&r.k)||''),v:String((r&&r.v)||'')}));return rows.length?rows:[apiRow()]}
function apiNormExamples(a){
  return (Array.isArray(a)?a:[]).map(e=>({id:String((e&&e.id)||uid()),name:String((e&&e.name)||'Example'),ts:(e&&e.ts)||0,status:Number(e&&e.status)||0,statusText:String((e&&e.statusText)||''),headers:(e&&Array.isArray(e.headers))?e.headers:[],body:String((e&&e.body)||''),duration:Number(e&&e.duration)||0,size:Number(e&&e.size)||0,truncated:!!(e&&e.truncated)}));
}
function apiNormFolders(a, examplesByKey){
  return (Array.isArray(a)?a:[]).map(f=>({id:String((f&&f.id)||uid()),name:String((f&&f.name)||'Untitled folder'),open:(f&&f.open)!==false,requests:(f&&Array.isArray(f.requests)?f.requests:[]).map(r=>{
    const rid=String((r&&r.id)||uid());
    const stored=examplesByKey?examplesByKey[STORE.apiExamples(rid)]:undefined;
    return {id:rid,name:String((r&&r.name)||'Untitled request'),ts:(r&&r.ts)||0,open:!!(r&&r.open),request:(r&&r.request)||null,examples:apiNormExamples(stored!==undefined?stored:(r&&r.examples))};
  })}));
}
/* ---------- 存储：index（文件夹+请求定义）/ examples（每请求一份）/ session / draft 分开 ---------- */
let apiIdxT=0, apiSessT=0, apiDraftT=0;
function apiFoldersForIndex(){return {folders:(apiState.folders||[]).map(f=>({
    id:f.id,name:f.name,open:f.open!==false,
    requests:(f.requests||[]).map(r=>({id:r.id,name:r.name,ts:r.ts,open:!!r.open,request:r.request||null}))
  }))};}
function apiDraftForStore(){
  return {method:apiState.method,url:apiState.url,params:apiState.params,headers:apiState.headers,bodyType:apiState.bodyType,body:apiState.body,form:apiState.form};
}
function apiSessionForStore(){
  return {activeFolder:apiState.activeFolder||null,tab:apiTab,respTab:apiRespTab,pretty:apiPretty};
}
function apiSaveIndex(){
  clearTimeout(apiIdxT);
  apiIdxT=setTimeout(()=>{apiIdxT=0;patch({[STORE.apiIndex]:apiFoldersForIndex()})},300);
}
function apiSaveDraft(){
  clearTimeout(apiDraftT);
  apiDraftT=setTimeout(()=>{apiDraftT=0;patch({[STORE.apiDraft]:apiDraftForStore()})},150);
}
function apiSaveSession(){
  clearTimeout(apiSessT);
  apiSessT=setTimeout(()=>{apiSessT=0;patch({[STORE.apiSession]:apiSessionForStore()})},150);
}
/* 单个请求的响应示例：只有增删 / 复制 / 导入 / 删除请求时才写，避免打字时重复写大对象 */
function apiSaveExamples(rid){
  const key=STORE.apiExamples(rid);
  const f=(apiState.folders||[]).find(x=>(x.requests||[]).some(r=>r.id===rid));
  const r=f&&(f.requests||[]).find(x=>x.id===rid);
  if(!r){removeKeys([key]);return}
  patch({[key]:JSON.parse(JSON.stringify(r.examples||[]))});
}
function apiRemoveExamples(rids){removeKeys(rids.map(r=>STORE.apiExamples(r)))}
function saveState(){apiSaveIndex();apiSaveDraft();apiSaveSession()}
function apiFlush(){
  if(!apiState)return;
  clearTimeout(apiIdxT);apiIdxT=0;
  clearTimeout(apiDraftT);apiDraftT=0;
  clearTimeout(apiSessT);apiSessT=0;
  patch({[STORE.apiIndex]:apiFoldersForIndex(),[STORE.apiDraft]:apiDraftForStore(),[STORE.apiSession]:apiSessionForStore()});
}
function apiInit(stored){
  const st=stored&&typeof stored==='object'?stored:{};
  const idxRaw=st.index;
  const idx=Array.isArray(idxRaw)?{folders:idxRaw}:(idxRaw&&typeof idxRaw==='object'?idxRaw:{});
  const draft=st.draft&&typeof st.draft==='object'?st.draft:{};
  const sess=st.session&&typeof st.session==='object'?st.session:{};
  apiState={
    method:draft.method||'GET',url:String(draft.url||''),name:String(draft.name||''),
    params:apiNormRows(draft.params),headers:apiNormRows(draft.headers),
    bodyType:draft.bodyType||'none',body:String(draft.body||''),form:apiNormRows(draft.form),
    folders:apiNormFolders(idx.folders,st.examples||{}),
    activeFolder:sess.activeFolder||null,cur:null,
    tab:sess.tab||'params',respTab:sess.respTab||'body',pretty:sess.pretty!==false
  };
  apiTab=apiState.tab;apiRespTab=apiState.respTab;apiPretty=apiState.pretty;
}
function apiTouch(){if(!apiState)return;apiState.tab=apiTab;apiState.respTab=apiRespTab;apiState.pretty=apiPretty;saveState();apiAutoSave()}
function apiCls(st){return st>=200&&st<300?'ok':st>=300&&st<400?'warn':st>=400?'bad':'warn'}
function apiCur(){
  if(!apiState||!apiState.cur)return null;
  const f=(apiState.folders||[]).find(x=>x.id===apiState.cur.fid);
  const r=f&&(f.requests||[]).find(x=>x.id===apiState.cur.rid);
  return (f&&r)?{f,r}:null;
}
function apiNameInput(v){
  if(!apiState)return;
  apiState.name=v;
  const cur=apiCur();
  if(cur&&String(v||'').trim()){cur.r.name=v;cur.r.ts=Date.now();renderApiFolders()}
  saveState();
}
function apiNameBlur(){
  if(!apiState)return;
  if(!String(apiState.name||'').trim()){
    const cur=apiCur();
    if(cur&&cur.r.name)apiState.name=cur.r.name;
  }
  const inp=document.getElementById('apiName');
  if(inp)inp.value=apiState.name||'';
}
/* 详情页修改后自动保存到当前打开的请求（编辑态都在内存里，这里做防抖落库） */
let apiSaveTimer=0;
function apiPersistCurrent(){
  if(!apiState)return false;
  const cur=apiCur();
  if(!cur)return false;
  const snap=apiSnapshot();
  const prevUrl=String((cur.r.request&&cur.r.request.url)||'').trim();
  if(!String(snap.url||'').trim()&&prevUrl)return false; // 地址被清空时不覆盖已保存内容
  const name=String(apiState.name||'').trim()||cur.r.name||apiReqName(snap);
  cur.r.name=name;cur.r.request=snap;cur.r.ts=Date.now();
  if(!String(apiState.name||'').trim()){
    apiState.name=name;
    const inp=document.getElementById('apiName');
    if(inp&&document.activeElement!==inp)inp.value=name;
  }
  saveState();
  return true;
}
function apiAutoSave(){
  if(!apiState)return;
  clearTimeout(apiSaveTimer);
  apiSaveTimer=setTimeout(()=>{
    apiSaveTimer=0;
    if(apiPersistCurrent())renderApiFolders();
  },400);
}
function apiUniqueFolderName(name){
  const base=String(name||'Imported request').trim()||'Imported request';
  const names=(apiState.folders||[]).map(f=>f.name);
  if(!names.includes(base))return base;
  let i=2;
  while(names.includes(base+' '+i))i++;
  return base+' '+i;
}
function apiSnapUrl(q){
  let base=String((q&&q.url)||'').trim();
  if(!base)return null;
  if(!/^https?:\/\//i.test(base)){
    if(/^(localhost|127\.0\.0\.1|0\.0\.0\.0)/.test(base))base='http://'+base;
    else if(!/^[a-z][a-z0-9+.-]*:/i.test(base))base='https://'+base;
  }
  let u;try{u=new URL(base)}catch(e){return null}
  ((q&&q.params)||[]).forEach(r=>{if(r.on!==false&&String(r.k||'').trim())u.searchParams.append(r.k.trim(),String(r.v||''))});
  return u.toString();
}
function apiSnapHeaders(q){
  const h={};
  ((q&&q.headers)||[]).forEach(r=>{if(r.on!==false&&String(r.k||'').trim())h[r.k.trim()]=String(r.v||'')});
  const hasCT=Object.keys(h).some(k=>k.toLowerCase()==='content-type');
  if(!hasCT&&q){
    if(q.bodyType==='json')h['Content-Type']='application/json';
    else if(q.bodyType==='text')h['Content-Type']='text/plain;charset=UTF-8';
    else if(q.bodyType==='form')h['Content-Type']='application/x-www-form-urlencoded;charset=UTF-8';
  }
  return h;
}
function apiSnapBody(q){
  if(!q)return null;
  if(q.bodyType==='form'){
    const p=new URLSearchParams();
    (q.form||[]).forEach(r=>{if(r.on!==false&&String(r.k||'').trim())p.append(r.k.trim(),String(r.v||''))});
    return p.toString();
  }
  if(q.bodyType==='json'||q.bodyType==='text')return String(q.body||'');
  return null;
}
function apiStamp(){
  const d=new Date(),p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+p(d.getMonth()+1)+p(d.getDate())+'-'+p(d.getHours())+p(d.getMinutes());
}
/* 自定义下拉：通用组件在 core/ui.js，这里只做请求相关的联动 */
function cselPick(id,value){
  const root=document.getElementById(id);if(!root)return;
  cselSelect(id,value);
  if(id==='apiMethodSel')apiMethodChange(value);
  else if(id==='apiBodyTypeSel')setApiBodyType(value);
}

function apiMethodChange(v){
  if(!apiState)return;
  const root=document.getElementById('apiMethodSel');
  const val=String(v||(root&&root.dataset.value)||'GET').toUpperCase();
  apiState.method=val;
  cselValue('apiMethodSel',val);
  apiTouch();
}
function apiUrlInput(v){if(!apiState)return;apiState.url=v;apiTouch()}
function apiBodyInput(v){if(!apiState)return;apiState.body=v;apiTouch();updateApiCounts()}
function updateApiCounts(){
  if(!apiState)return;
  const cnt=a=>(a||[]).filter(r=>r.on!==false&&String(r.k||'').trim()).length;
  document.getElementById('apiParamsN').textContent=cnt(apiState.params)||'';
  document.getElementById('apiHeadersN').textContent=cnt(apiState.headers)||'';
  const b=document.getElementById('apiBodyN');
  b.textContent=apiState.bodyType==='none'?'':apiState.bodyType==='json'?'JSON':apiState.bodyType==='text'?'Text':('Form '+(cnt(apiState.form)||0));
}
function renderKv(kind){
  const el=document.getElementById(kind==='params'?'apiParams':kind==='headers'?'apiHeaders':'apiForm');
  if(!el||!apiState)return;
  const arr=apiState[kind]||(apiState[kind]=[apiRow()]);
  el.innerHTML='';
  arr.forEach(row=>{
    const wrap=document.createElement('div');wrap.className='kv-row';
    const cb=document.createElement('input');cb.type='checkbox';cb.className='kv-on';cb.title='Enable';cb.checked=row.on!==false;
    cb.addEventListener('change',()=>{row.on=cb.checked;apiTouch();updateApiCounts()});
    const k=document.createElement('input');k.type='text';k.className='kv-k';k.spellcheck=false;k.placeholder='key';k.value=row.k||'';
    k.addEventListener('input',()=>{row.k=k.value;apiTouch();updateApiCounts()});
    const v=document.createElement('input');v.type='text';v.className='kv-v';v.spellcheck=false;v.placeholder='value';v.value=row.v||'';
    v.addEventListener('input',()=>{row.v=v.value;apiTouch()});
    const del=document.createElement('button');del.type='button';del.className='kv-del';del.title='Delete';del.textContent='×';
    del.addEventListener('click',()=>{
      const idx=apiState[kind].indexOf(row);if(idx>-1)apiState[kind].splice(idx,1);
      if(!apiState[kind].length)apiState[kind].push(apiRow());
      renderKv(kind);apiTouch();updateApiCounts();
    });
    wrap.append(cb,k,v,del);
    el.appendChild(wrap);
  });
  updateApiCounts();
}
function apiAddRow(kind){
  if(!apiState)return;
  apiState[kind].push(apiRow());
  renderKv(kind);apiTouch();
  const el=document.getElementById(kind==='params'?'apiParams':kind==='headers'?'apiHeaders':'apiForm');
  const last=el&&el.lastElementChild;
  if(last){const inp=last.querySelector('.kv-k');if(inp)inp.focus()}
}
function setApiTab(t){
  apiTab=t;if(apiState)apiState.tab=t;
  document.querySelectorAll('#apiReqTabs button').forEach(b=>b.classList.toggle('on',b.dataset.atab===t));
  ['params','headers','body'].forEach(k=>{const p=document.getElementById('apiPane-'+k);if(p)p.classList.toggle('hide',k!==t)});
  apiTouch();
}
function setApiBodyType(t){
  if(!apiState)return;
  apiState.bodyType=t;
  cselValue('apiBodyTypeSel',t);
  const ta=document.getElementById('apiBody');
  ta.classList.toggle('hide',t==='none'||t==='form');
  document.getElementById('apiFormWrap').classList.toggle('hide',t!=='form');
  document.getElementById('apiBodyFmt').classList.toggle('hide',t!=='json');
  updateApiCounts();apiTouch();
}
function formatApiBody(){
  if(!apiState)return;
  try{const o=JSON.parse(apiState.body||'');apiState.body=JSON.stringify(o,null,2);document.getElementById('apiBody').value=apiState.body;updateApiCounts();apiTouch();toast('Formatted JSON')}
  catch(e){toast('Invalid JSON: '+e.message)}
}
function apiBuildUrl(){return apiSnapUrl(apiState)}
function apiSnapshot(){
  return JSON.parse(JSON.stringify({method:apiState.method,url:apiState.url,params:apiState.params,headers:apiState.headers,bodyType:apiState.bodyType,body:apiState.body,form:apiState.form}));
}
function setApiLoading(on){
  const b=document.getElementById('apiSend'),l=document.getElementById('apiSendLabel');
  b.classList.toggle('btn-accent',!on);b.classList.toggle('btn-ghost',on);
  l.textContent=on?'Cancel':'Send';
}
function abortApiReq(){
  if(!apiBusy)return;
  if(EMBEDDED){try{window.parent.postMessage({type:'TOOLSX_HTTP_ABORT',id:apiBusy.id},'*')}catch(e){}}
  else if(apiLocalCtl)apiLocalCtl.abort();
}
function sendApiReq(){
  if(apiBusy){abortApiReq();return}
  if(!apiState)return;
  const url=apiBuildUrl();
  if(!url){toast('Enter a valid request URL');return}
  const headers=apiSnapHeaders(apiState);
  let body=apiSnapBody(apiState);
  const method=apiState.method||'GET';
  if(method==='GET'||method==='HEAD')body=null;
  const busy={id:++apiReqSeq,start:performance.now(),method,url,headers,body,request:apiSnapshot()};
  apiBusy=busy;apiRespData=null;apiRespTab='body';apiPretty=true;
  document.querySelectorAll('#apiRespSeg [data-rtab]').forEach(b=>b.classList.toggle('on',b.dataset.rtab==='body'));
  setApiLoading(true);renderApiResp();
  if(EMBEDDED){
    try{window.parent.postMessage({type:'TOOLSX_HTTP',id:busy.id,req:{method,url,headers,body}},'*')}
    catch(e){apiHandleRes({id:busy.id,error:'Unable to send request'})}
  }else apiDirectFetch(busy);
}
function apiDirectFetch(busy){
  apiLocalCtl=new AbortController();const ctl=apiLocalCtl;
  fetch(busy.url,{method:busy.method,headers:busy.headers,body:busy.body==null?undefined:busy.body,redirect:'follow',signal:ctl.signal})
    .then(async r=>{
      const text=await r.text();
      const headers=[];r.headers.forEach((v,k)=>headers.push([k,v]));
      if(!apiBusy||apiBusy.id!==busy.id)return;
      apiHandleRes({id:busy.id,status:r.status,statusText:r.statusText,headers,body:text,duration:Math.round(performance.now()-busy.start)});
    })
    .catch(e=>{
      if(!apiBusy||apiBusy.id!==busy.id)return;
      apiHandleRes({id:busy.id,error:e.name==='AbortError'?'Request cancelled':e.message,cancelled:e.name==='AbortError'});
    });
}
function apiHandleRes(d){
  const busy=apiBusy;
  if(!busy||d.id!==busy.id)return;
  apiBusy=null;apiLocalCtl=null;setApiLoading(false);
  if(d.error){
    apiRespData={error:d.cancelled?'Request cancelled':(d.error||'Request failed')};
    renderApiResp();
    if(d.cancelled)toast('Request cancelled');
    return;
  }
  const body=String(d.body??'');
  let pretty=null;try{pretty=JSON.stringify(JSON.parse(body),null,2)}catch(e){}
  apiRespData={status:d.status,statusText:d.statusText||'',headers:d.headers||[],body,pretty,size:byteLen(body),duration:d.duration||0,truncated:!!d.truncated};
  renderApiResp();
}
window.addEventListener('message',e=>{
  const d=e.data||{};
  if(d.type==='TOOLSX_HTTP_RES'&&apiBusy&&d.id===apiBusy.id)apiHandleRes(d);
});
document.addEventListener('keydown',e=>{
  if(view==='api'&&(e.metaKey||e.ctrlKey)&&e.key==='Enter'){e.preventDefault();sendApiReq()}
});
function apiReqName(snap){
  let base='';
  try{
    const u=new URL(snap.url||'');
    const parts=u.pathname.replace(/\/+$/,'').split('/').filter(Boolean);
    base=parts.length?'/'+parts.slice(-2).join('/'):u.hostname;
  }catch(e){base=String(snap.url||'')}
  const name=base||'Untitled request';
  return name.length>36?name.slice(0,35)+'…':name;
}
function askApiName(title,val,cb){promptText({title,label:'Name',value:val,placeholder:'Enter a name',ok:'OK',cancel:'Cancel',empty:'Name is required'},cb)}
/* 工具栏「Add request」：添加到当前选中的文件夹 */
function apiAddRequest(){
  if(!apiState)return;
  const folders=apiState.folders||[];
  if(!folders.length){toast('Create a folder first');return}
  const fid=(apiState.activeFolder&&folders.some(f=>f.id===apiState.activeFolder))?apiState.activeFolder:folders[0].id;
  apiReqCreate(fid);
}
function apiFolderCreate(){
  askApiName('New folder','',name=>{
    const f={id:uid(),name,open:true,requests:[]};
    apiState.folders=(apiState.folders||[]).concat(f);
    apiState.activeFolder=f.id;
    saveState();renderApiFolders();
    toast('Folder "'+name+'" created');
  });
}
function apiFolderSelect(id){
  const f=(apiState.folders||[]).find(x=>x.id===id);if(!f)return;
  apiState.activeFolder=id;f.open=true;
  saveState();renderApiFolders();
}
function apiFolderToggle(id){
  const f=(apiState.folders||[]).find(x=>x.id===id);if(!f)return;
  f.open=f.open===false;
  saveState();renderApiFolders();
}
function apiFolderRename(id){
  const f=(apiState.folders||[]).find(x=>x.id===id);if(!f)return;
  askApiName('Rename folder',f.name,name=>{
    if(name===f.name)return;
    f.name=name;saveState();renderApiFolders();toast('Renamed');
  });
}
function apiFolderDelete(id){
  const f=(apiState.folders||[]).find(x=>x.id===id);if(!f)return;
  if(!confirm('Delete folder "'+f.name+'" and its '+(f.requests||[]).length+' requests?'))return;
  apiState.folders=(apiState.folders||[]).filter(x=>x.id!==id);
  if(apiState.activeFolder===id)apiState.activeFolder=null;
  if(apiState.cur&&apiState.cur.fid===id)apiState.cur=null;
  apiRemoveExamples((f.requests||[]).map(r=>r.id));
  saveState();renderApiFolders();toast('Folder deleted');
}
function apiReqTemplate(){return{method:'GET',url:'https://www.test.com/test',params:[apiRow()],headers:[apiRow()],bodyType:'none',body:'',form:[apiRow()]}}
function apiReqCreate(fid){
  const f=(apiState.folders||[]).find(x=>x.id===fid);if(!f)return;
  const name=apiUniqReqName(f,'/test');
  const r={id:uid(),name,ts:Date.now(),open:false,request:apiReqTemplate(),examples:[]};
  f.requests=(f.requests||[]).concat(r);
  f.open=true;apiState.activeFolder=fid;
  apiApplyReq(fid,r.id);
  saveState();renderApi();renderApiFolders();
  toast('Added to "'+f.name+'"');
}
/* 复制某个请求（含请求结果），插入到原请求下方并打开副本 */
function apiCopyReq(fid,rid){
  if(!apiState)return;
  const f=(apiState.folders||[]).find(x=>x.id===fid);if(!f)return;
  const idx=(f.requests||[]).findIndex(x=>x.id===rid);
  if(idx<0)return;
  if(apiState.cur&&apiState.cur.rid===rid){clearTimeout(apiSaveTimer);apiSaveTimer=0;apiPersistCurrent()}
  const src=f.requests[idx];
  const name=apiUniqReqName(f,(src.name||'Untitled request')+' copy');
  const r={id:uid(),name,ts:Date.now(),open:false,request:JSON.parse(JSON.stringify(src.request||{})),examples:JSON.parse(JSON.stringify(src.examples||[]))};
  f.requests.splice(idx+1,0,r);
  f.open=true;apiState.activeFolder=fid;
  apiApplyReq(fid,r.id);
  apiSaveExamples(r.id);
  saveState();renderApi();renderApiFolders();
  toast('Duplicated "'+name+'"');
}
function apiUniqReqName(f,base){
  const names=((f&&f.requests)||[]).map(x=>x.name);
  if(names.indexOf(base)<0)return base;
  let i=2;
  while(names.indexOf(base+' '+i)>=0)i++;
  return base+' '+i;
}
/* Share：把当前请求的方法 / 地址 / 请求头 / 请求体复制成 JSON */
function apiShareCurrent(){
  if(!apiState)return;
  clearTimeout(apiSaveTimer);apiSaveTimer=0;apiPersistCurrent();
  const cur=apiCur();
  const q=cur?cur.r.request:apiSnapshot();
  if(!q)return;
  const data={
    name:String(apiState.name||'').trim()||(cur?cur.r.name:'')||'Untitled request',
    method:String(q.method||'GET').toUpperCase(),
    url:apiSnapUrl(q)||String(q.url||''),
    headers:apiSnapHeaders(q),
    body:apiSnapBody(q),
    bodyType:q.bodyType||'none'
  };
  copy(JSON.stringify(data,null,2),'Request info copied');
}
/* 导入：粘贴一个请求的 JSON，覆盖当前请求 */
function apiImportOne(){
  if(!apiState)return;
  openModal(`
    <div class="modal-head"><h3>Import request</h3><button class="icon-btn" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>
    <div class="modal-body"><div class="field"><label>Request JSON</label><textarea id="f-apiimport" spellcheck="false" style="min-height:220px" placeholder='{"name":"Request name","method":"POST","url":"https://api.example.com/users","headers":{"Content-Type":"application/json"},"body":"{\\n  \\"a\\": 1\\n}","bodyType":"json"}'></textarea></div>
      <p class="api-import-tip">Paste a request JSON (the format copied by Share works). It overwrites the current request name, method, URL, headers and body.</p>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-accent" onclick="submitApiImportOne()">Import &amp; overwrite</button></div>`);
}
function submitApiImportOne(){
  const ta=document.getElementById('f-apiimport');
  const raw=ta?String(ta.value||'').trim():'';
  if(!raw){toast('Paste a request JSON first');return}
  let data=null;
  try{data=JSON.parse(raw)}catch(e){}
  if(!data){toast('Invalid JSON');return}
  const o=apiImportOnePick(data);
  const item=o?apiImportReq(o):null;
  if(!item){toast('No valid request found (url is required)');return}
  closeModal();
  apiOverwriteCurrent(item);
  toast('Imported and overwrote the current request');
}
function apiImportOnePick(data){
  if(Array.isArray(data))return data[0]&&typeof data[0]==='object'?data[0]:null;
  if(data&&Array.isArray(data.requests))return data.requests[0]||null;
  if(data&&Array.isArray(data.folders)){
    const f=data.folders.find(x=>x&&Array.isArray(x.requests)&&x.requests.length);
    return f?f.requests[0]:null;
  }
  return data;
}
function apiOverwriteCurrent(item){
  clearTimeout(apiSaveTimer);apiSaveTimer=0;
  const cur=apiCur();
  const q=item.request||{};
  apiState.name=item.name||apiReqName(q);
  apiState.method=q.method||'GET';apiState.url=q.url||'';
  apiState.params=apiNormRows(q.params);apiState.headers=apiNormRows(q.headers);
  apiState.bodyType=q.bodyType||'none';apiState.body=q.body||'';apiState.form=apiNormRows(q.form);
  if(cur){
    const snap=apiSnapshot();
    cur.r.name=apiState.name;cur.r.request=snap;cur.r.ts=Date.now();
  }
  saveState();renderApi();renderApiFolders();
}
function apiApplyReq(fid,rid){
  const f=(apiState.folders||[]).find(x=>x.id===fid);
  const r=f&&(f.requests||[]).find(x=>x.id===rid);
  if(!r||!r.request)return null;
  clearTimeout(apiSaveTimer);apiSaveTimer=0;apiPersistCurrent();
  const q=r.request;
  const prev=apiState.cur;
  apiState.activeFolder=fid;
  apiState.cur={fid,rid};
  if(!prev||prev.fid!==fid||prev.rid!==rid)apiRespData=null;
  apiState.name=r.name||'';
  apiState.method=q.method||'GET';apiState.url=q.url||'';
  apiState.params=apiNormRows(q.params);apiState.headers=apiNormRows(q.headers);
  apiState.bodyType=q.bodyType||'none';apiState.body=q.body||'';apiState.form=apiNormRows(q.form);
  return r;
}
function apiLoadSaved(fid,rid){
  const r=apiApplyReq(fid,rid);if(!r)return;
  apiTouch();renderApi();
  toast('Loaded "'+r.name+'"');
}
function apiDeleteSaved(fid,rid){
  const f=(apiState.folders||[]).find(x=>x.id===fid);if(!f)return;
  const r=(f.requests||[]).find(x=>x.id===rid);if(!r)return;
  const ex=(r.examples||[]).length;
  if(!confirm('Delete request "'+(r.name||'Untitled request')+'"'+(ex?' and its '+ex+' saved examples':'')+'?'))return;
  f.requests=(f.requests||[]).filter(x=>x.id!==rid);
  if(apiState.cur&&apiState.cur.rid===rid)apiState.cur=null;
  apiRemoveExamples([rid]);
  saveState();renderApiFolders();toast('Request deleted');
}
function apiReqToggle(fid,rid){
  const f=(apiState.folders||[]).find(x=>x.id===fid);if(!f)return;
  const r=(f.requests||[]).find(x=>x.id===rid);if(!r)return;
  r.open=!r.open;saveState();renderApiFolders();
}
/* 请求结果（类似 Postman 的 example）：把当前响应存到当前请求下面 */
function apiExampleAdd(){
  if(!apiState)return;
  const cur=apiCur();
  if(!cur){toast('Save the request first, then add an example');return}
  if(!apiRespData||apiRespData.error){toast('Send a request and get a response first');return}
  const res=apiRespData,r=cur.r;
  askApiName('New example','Example '+((r.examples||[]).length+1),name=>{
    r.examples=(r.examples||[]).concat({id:uid(),name,ts:Date.now(),status:res.status||0,statusText:res.statusText||'',headers:JSON.parse(JSON.stringify(res.headers||[])),body:res.body||'',duration:res.duration||0,size:res.size||byteLen(res.body||''),truncated:!!res.truncated});
    r.open=true;apiSaveExamples(r.id);saveState();renderApiFolders();
    toast('Added example "'+name+'"');
  });
}
function apiDeleteExample(fid,rid,eid){
  const f=(apiState.folders||[]).find(x=>x.id===fid);
  const r=f&&(f.requests||[]).find(x=>x.id===rid);
  const e=r&&(r.examples||[]).find(x=>x.id===eid);
  if(!e)return;
  if(!confirm('Delete example "'+e.name+'"?'))return;
  r.examples=(r.examples||[]).filter(x=>x.id!==eid);
  if(!r.examples.length)r.open=false;
  if(r.examples.length)apiSaveExamples(rid);else apiRemoveExamples([rid]);
  saveState();renderApiFolders();toast('Example deleted');
}
function apiLoadExample(fid,rid,eid){
  const f=(apiState.folders||[]).find(x=>x.id===fid);
  const r=f&&(f.requests||[]).find(x=>x.id===rid);
  const e=r&&(r.examples||[]).find(x=>x.id===eid);
  if(!e)return;
  apiApplyReq(fid,rid);
  const body=String(e.body||'');
  let pretty=null;try{pretty=JSON.stringify(JSON.parse(body),null,2)}catch(x){}
  apiRespData={status:e.status,statusText:e.statusText||'',headers:e.headers||[],body,pretty,size:e.size||byteLen(body),duration:e.duration||0,truncated:!!e.truncated};
  apiRespTab='body';apiPretty=true;
  apiTouch();renderApi();
  toast('Loaded example "'+e.name+'"');
}
function anyApiFolderOpen(){return (apiState.folders||[]).some(f=>f.open!==false)}
function toggleAllApiFolders(){
  const open=anyApiFolderOpen();
  (apiState.folders||[]).forEach(f=>f.open=!open);
  saveState();renderApiFolders();
  toast(open?'All folders collapsed':'All folders expanded');
}
function apiReqRowHtml(f,r){
  const q=r.request||{};
  const method=String(q.method||'GET');
  const ex=r.examples||[];
  const exOpen=r.open===true;
  const cur=apiState.cur&&apiState.cur.rid===r.id;
  const exKids=exOpen?'<div class="tree-kids api-ex-kids">'+(ex.length?ex.map(e=>{
    const st=Number(e.status)||0;
    return '<div class="tree-row api-ex-row" onclick="apiLoadExample(\''+f.id+'\',\''+r.id+'\',\''+e.id+'\')" title="'+esc(e.name||'')+'">'
      +'<span class="tw"></span>'
      +'<span class="api-ex-st '+apiCls(st)+'">'+(st||'ERR')+'</span>'
      +'<span class="t-name">'+esc(e.name||'Example')+'</span>'
      +'<span class="t-acts"><button class="icon-btn danger" title="Delete example" onclick="event.stopPropagation();apiDeleteExample(\''+f.id+'\',\''+r.id+'\',\''+e.id+'\')">'+ICO_TRASH+'</button></span>'
      +'</div>';
  }).join(''):'<div class="api-folder-empty">No examples yet</div>')+'</div>':'';
  return '<div class="tree-row api-req-row'+(exOpen?' open':'')+(cur?' sel':'')+'" draggable="true" data-fid="'+f.id+'" data-rid="'+r.id+'"'
    +' onclick="apiLoadSaved(\''+f.id+'\',\''+r.id+'\')"'
    +' ondragstart="apiDragStart(event)" ondragend="apiDragEnd()"'
    +' ondragover="apiReqDragOver(event)" ondragleave="apiDragLeave(event)" ondrop="apiReqDrop(event)"'
    +' title="'+esc(String(q.url||''))+'">'
    +'<span class="tw" onclick="event.stopPropagation();apiReqToggle(\''+f.id+'\',\''+r.id+'\')">'+(ex.length?ICO_CHEV_R:'')+'</span>'
    +'<span class="api-m m-'+method.toLowerCase()+'">'+esc(method)+'</span>'
    +'<span class="t-name">'+esc(r.name||'Untitled request')+'</span>'
    +'<span class="t-acts">'
    +'<button class="icon-btn" title="Duplicate request" onclick="event.stopPropagation();apiCopyReq(\''+f.id+'\',\''+r.id+'\')">'+ICO_COPY+'</button>'
    +'<button class="icon-btn danger" title="Delete" onclick="event.stopPropagation();apiDeleteSaved(\''+f.id+'\',\''+r.id+'\')">'+ICO_TRASH+'</button>'
    +'</span>'
    +'</div>'+exKids;
}
function apiReqMatch(r,q){
  const name=String((r&&r.name)||'').toLowerCase();
  const url=String((r&&r.request&&r.request.url)||'').toLowerCase();
  return name.indexOf(q)>=0||url.indexOf(q)>=0;
}
function renderApiFolders(){
  const box=document.getElementById('apiFoldList');
  if(!box||!apiState)return;
  const btn=document.getElementById('apiFoldAllBtn');
  if(btn){const open=anyApiFolderOpen();btn.innerHTML=open?ICO_CHEV_UP:ICO_CHEV_DOWN;btn.title=open?'Collapse all':'Expand all'}
  const folders=apiState.folders||[];
  const q=(query||'').trim();
  const rows=folders.map(f=>({f,reqs:(f.requests||[]).filter(r=>!q||apiReqMatch(r,q))}))
    .filter(x=>!q||x.reqs.length);
  if(!rows.length){box.innerHTML='<div class="empty" style="padding:26px 8px"><p>'+(q?'No matching requests':'No folders yet')+'</p></div>';return}
  box.innerHTML=rows.map(({f,reqs})=>{
    const on=apiState.activeFolder===f.id,open=q?true:f.open!==false;
    const kids=open?'<div class="tree-kids">'+(reqs.length?reqs.map(r=>apiReqRowHtml(f,r)).join(''):'<div class="api-folder-empty">Empty folder</div>')+'</div>':'';
    return '<div class="tree-row api-folder-row'+(open?' open':'')+(on?' sel':'')+'" draggable="true" data-fid="'+f.id+'"'
      +' onclick="apiFolderSelect(\''+f.id+'\')"'
      +' ondragstart="apiDragStart(event)" ondragend="apiDragEnd()"'
      +' ondragover="apiDragOver(event)" ondragleave="apiDragLeave(event)" ondrop="apiDrop(event)"'
      +'>'
      +'<span class="tw" onclick="event.stopPropagation();apiFolderToggle(\''+f.id+'\')">'+ICO_CHEV_R+'</span>'
      +ICO_FOLDER
      +'<span class="t-name">'+esc(f.name)+'</span>'
      +'<span class="t-acts">'
      +'<button class="icon-btn" title="Rename" onclick="event.stopPropagation();apiFolderRename(\''+f.id+'\')">'+ICO_EDIT+'</button>'
      +'<button class="icon-btn danger" title="Delete" onclick="event.stopPropagation();apiFolderDelete(\''+f.id+'\')">'+ICO_TRASH+'</button>'
      +'</span></div>'+kids;
  }).join('');
}
/* 拖拽：文件夹排序、请求排序 / 跨文件夹移动 */
function apiDragStart(e){
  const row=e.currentTarget;
  const fid=row.dataset.fid,rid=row.dataset.rid;
  if(!fid)return;
  apiDrag=rid?{type:'req',fid,rid}:{type:'folder',fid};
  row.classList.add('dragging');
  try{e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',rid||fid)}catch(x){}
}
function apiDragEnd(){
  apiDrag=null;
  document.querySelectorAll('.api-req-row.dragging,.api-folder-row.dragging').forEach(r=>r.classList.remove('dragging'));
  document.querySelectorAll('.api-req-row.drop,.api-folder-row.drop').forEach(r=>r.classList.remove('drop'));
}
function apiRowAfter(row,e){
  const r=row.getBoundingClientRect();
  return e.clientY>r.top+r.height/2;
}
/* 拖到文件夹行：文件夹拖动=排序，请求拖动=移到该文件夹末尾 */
function apiDragOver(e){
  if(!apiDrag)return;
  const fid=e.currentTarget.dataset.fid;
  if(!fid)return;
  if(apiDrag.type==='folder'&&fid===apiDrag.fid)return;
  e.preventDefault();e.stopPropagation();
  try{e.dataTransfer.dropEffect='move'}catch(x){}
  e.currentTarget.classList.add('drop');
}
/* 拖到请求行：请求排序 / 跨文件夹插入 */
function apiReqDragOver(e){
  if(!apiDrag||apiDrag.type!=='req')return;
  if(e.currentTarget.dataset.rid===apiDrag.rid)return;
  e.preventDefault();e.stopPropagation();
  try{e.dataTransfer.dropEffect='move'}catch(x){}
  e.currentTarget.classList.add('drop');
}
function apiDragLeave(e){
  const el=e.currentTarget;
  if(el.contains(e.relatedTarget))return;
  el.classList.remove('drop');
}
function apiDrop(e){
  e.preventDefault();e.stopPropagation();
  const row=e.currentTarget;
  row.classList.remove('drop');
  const d=apiDrag;apiDrag=null;
  if(!d)return;
  const fid=row.dataset.fid;
  if(!fid)return;
  if(d.type==='folder'){apiMoveFolder(d.fid,fid,apiRowAfter(row,e));return}
  apiMoveRequest(d.fid,d.rid,fid,null,false);
}
function apiReqDrop(e){
  e.preventDefault();e.stopPropagation();
  const row=e.currentTarget;
  row.classList.remove('drop');
  const d=apiDrag;apiDrag=null;
  if(!d||d.type!=='req')return;
  const fid=row.dataset.fid,rid=row.dataset.rid;
  if(!fid||!rid)return;
  apiMoveRequest(d.fid,d.rid,fid,rid,apiRowAfter(row,e));
}
function apiMoveRequest(srcFid,rid,dstFid,dstRid,after){
  const src=(apiState.folders||[]).find(x=>x.id===srcFid);
  const dst=(apiState.folders||[]).find(x=>x.id===dstFid);
  if(!src||!dst||dstRid===rid)return;
  const idx=(src.requests||[]).findIndex(x=>x.id===rid);
  if(idx<0)return;
  const r=src.requests.splice(idx,1)[0];
  let at;
  if(dstRid){
    at=(dst.requests||[]).findIndex(x=>x.id===dstRid);
    if(at<0)at=dst.requests.length;
    else if(after)at++;
  }else at=dst.requests.length;
  dst.requests=dst.requests||[];
  dst.requests.splice(at,0,r);
  dst.open=true;apiState.activeFolder=dstFid;
  if(apiState.cur&&apiState.cur.rid===rid)apiState.cur={fid:dstFid,rid};
  saveState();renderApiFolders();
  toast(srcFid===dstFid?'Request reordered':'Moved to "'+dst.name+'"');
}
function apiMoveFolder(srcFid,dstFid,after){
  const folders=apiState.folders||[];
  const si=folders.findIndex(x=>x.id===srcFid);
  if(si<0||srcFid===dstFid)return;
  const f=folders.splice(si,1)[0];
  let di=folders.findIndex(x=>x.id===dstFid);
  if(di<0)di=folders.length;
  else if(after)di++;
  folders.splice(di,0,f);
  saveState();renderApiFolders();
  toast('Folder reordered');
}
/* 选择弹窗：按文件夹勾选后再执行导入 / 导出 */
let apiSel=null;
function apiSelOpen(cfg){
  apiSel={items:(cfg.items||[]).map(x=>({key:x.key,name:x.name,count:x.count||0,on:true})),onOk:cfg.onOk};
  const rows=apiSel.items.map((it,i)=>
    '<label class="api-sel-row"><input type="checkbox" class="kv-on" checked onchange="apiSelPick('+i+',this.checked)">'
    +'<span class="api-sel-name">'+esc(it.name)+'</span><span class="api-sel-c">'+it.count+'</span></label>').join('');
  openModal(
    '<div class="modal-head"><h3>'+esc(cfg.title||'Select folders')+'</h3><button class="icon-btn" onclick="closeModal()"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg></button></div>'
    +'<div class="modal-body">'
    +'<div class="api-sel-tools"><label class="api-sel-all"><input type="checkbox" class="kv-on" id="apiSelAll" checked onchange="apiSelAllToggle(this.checked)"><span>Select all</span></label><span class="api-sel-n" id="apiSelN"></span></div>'
    +'<div class="api-sel-list" id="apiSelList">'+(rows||'<div class="api-empty">No folders</div>')+'</div>'
    +(cfg.tip?'<p class="api-import-tip">'+esc(cfg.tip)+'</p>':'')
    +'</div>'
    +'<div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal()">Cancel</button><button class="btn btn-accent" onclick="apiSelConfirm()">'+esc(cfg.ok||'OK')+'</button></div>');
  apiSelSync();
}
function apiSelSync(){
  if(!apiSel)return;
  const n=apiSel.items.filter(x=>x.on).length,total=apiSel.items.length;
  const cnt=document.getElementById('apiSelN');if(cnt)cnt.textContent=n+' of '+total+' selected';
  const all=document.getElementById('apiSelAll');
  if(all){all.checked=n===total&&total>0;all.indeterminate=n>0&&n<total}
}
function apiSelPick(i,on){
  if(!apiSel||!apiSel.items[i])return;
  apiSel.items[i].on=!!on;apiSelSync();
}
function apiSelAllToggle(on){
  if(!apiSel)return;
  apiSel.items.forEach(x=>x.on=!!on);
  document.querySelectorAll('#apiSelList .api-sel-row .kv-on').forEach(c=>{c.checked=!!on});
  apiSelSync();
}
function apiSelConfirm(){
  if(!apiSel)return;
  const picked=apiSel.items.filter(x=>x.on);
  if(!picked.length){toast('Select at least one folder');return}
  const fn=apiSel.onOk;
  apiSel=null;closeModal();
  if(fn)fn(picked.map(x=>x.key));
}
/* 导出：弹出文件夹选择，只导出勾选的文件夹 */
function apiExport(){
  if(!apiState)return;
  const folders=apiState.folders||[];
  if(!folders.length){toast('No folders to export');return}
  if(!folders.some(f=>(f.requests||[]).length)){toast('No requests to export');return}
  apiSelOpen({
    title:'Export folders',
    ok:'Export',
    tip:'Only checked folders are exported. Requests keep name, method, URL, headers and body.',
    items:folders.map(f=>({key:f.id,name:f.name,count:(f.requests||[]).length})),
    onOk:ids=>apiExportSelected(ids)
  });
}
function apiExportSelected(ids){
  if(!apiState)return;
  const keep={};ids.forEach(id=>{keep[id]=true});
  const folders=(apiState.folders||[]).filter(f=>keep[f.id]).map(f=>({
    name:f.name,
    requests:(f.requests||[]).map(r=>{
      const q=r.request||{};
      return {
        name:r.name||'Untitled request',
        method:String(q.method||'GET').toUpperCase(),
        url:apiSnapUrl(q)||String(q.url||''),
        headers:apiSnapHeaders(q),
        body:apiSnapBody(q),
        bodyType:q.bodyType||'none'
      };
    })
  }));
  const total=folders.reduce((n,f)=>n+f.requests.length,0);
  if(!total){toast('No requests to export');return}
  const data={type:'toolsx.postman',version:1,exportedAt:new Date().toISOString(),folders};
  downloadText('toolsx-postman-'+apiStamp()+'.json',JSON.stringify(data,null,2));
  toast('Exported '+total+' requests');
}
function apiImport(){
  const inp=document.getElementById('apiImportFile');
  if(inp){inp.value='';inp.click()}
}
function apiImportFileChange(e){
  const file=e.target.files&&e.target.files[0];
  e.target.value='';
  if(!file)return;
  const reader=new FileReader();
  reader.onload=()=>{
    let data=null;
    try{data=JSON.parse(String(reader.result||''))}catch(x){}
    if(!data){toast('File is not valid JSON');return}
    apiPrepareImport(data,file.name);
  };
  reader.onerror=()=>toast('Failed to read the file');
  reader.readAsText(file);
}
/* 导入：解析文件后弹出文件夹选择，勾选的追加到列表末尾 */
function apiPrepareImport(data,filename){
  const groups=apiCollectImport(data,filename);
  if(!groups.length){toast('No importable requests found');return}
  apiSelOpen({
    title:'Import folders',
    ok:'Import',
    tip:'Checked folders are appended to the end of your folder list.',
    items:groups.map((g,i)=>({key:String(i),name:g.name,count:g.requests.length})),
    onOk:keys=>apiImportSelected(groups,keys)
  });
}
function apiImportHeaders(h){
  if(Array.isArray(h)){
    const rows=h.map(x=>{
      if(!x||typeof x!=='object')return null;
      const k=String(x.key!==undefined?x.key:(x.k!==undefined?x.k:'')).trim();
      if(!k)return null;
      return {on:x.on!==false&&x.enabled!==false,k,v:String(x.value!==undefined?x.value:(x.v!==undefined?x.v:''))};
    }).filter(Boolean);
    return rows.length?rows:[apiRow()];
  }
  if(h&&typeof h==='object'){
    const rows=Object.keys(h).map(k=>({on:true,k:String(k),v:String(h[k]==null?'':h[k])}));
    return rows.length?rows:[apiRow()];
  }
  return [apiRow()];
}
function apiImportReq(o){
  if(!o||typeof o!=='object')return null;
  const url=String(o.url||o.uri||'').trim();
  if(!url)return null;
  const method=String(o.method||'GET').toUpperCase();
  const headers=apiImportHeaders(o.headers);
  const bodyStr=o.body==null?'':(typeof o.body==='string'?o.body:JSON.stringify(o.body,null,2));
  const ct=(headers.find(r=>r.k.toLowerCase()==='content-type')||{}).v||'';
  let bt=String(o.bodyType||'').toLowerCase();
  if(['json','text','form'].indexOf(bt)<0)bt='';
  if(!bt){
    if(/json/i.test(ct))bt='json';
    else if(/x-www-form-urlencoded/i.test(ct))bt='form';
    else if(bodyStr)bt='text';
  }
  if(bt==='json'&&bodyStr){try{const p=JSON.parse(bodyStr);bodyStr=JSON.stringify(p,null,2)}catch(x){}}
  if(bt==='form'){
    const rows=[];
    try{new URLSearchParams(bodyStr).forEach((v,k)=>rows.push({on:true,k,v}))}catch(x){}
    return {name:String(o.name||'').trim()||apiReqName({url}),request:{method,url,params:[apiRow()],headers,bodyType:'form',body:'',form:rows.length?rows:[apiRow()]}};
  }
  return {name:String(o.name||'').trim()||apiReqName({url}),request:{method,url,params:[apiRow()],headers,bodyType:bt||'none',body:(bt?bodyStr:''),form:[apiRow()]}};
}
function apiCollectImport(data,filename){
  let src=[];
  if(Array.isArray(data.folders))src=data.folders;
  else if(Array.isArray(data.requests))src=[{name:String((data.name||filename||'').replace(/\.json$/i,'')),requests:data.requests}];
  else if(Array.isArray(data))src=[{name:String(filename||'Imported request').replace(/\.json$/i,''),requests:data}];
  return src.map(f=>({name:String((f&&f.name)||'Imported request'),requests:((f&&f.requests)||[]).map(apiImportReq).filter(Boolean)})).filter(f=>f.requests.length);
}
function apiImportSelected(groups,keys){
  if(!apiState)return;
  const picked={};keys.forEach(k=>{picked[k]=true});
  const chosen=groups.filter((g,i)=>picked[String(i)]);
  if(!chosen.length){toast('No requests to import');return}
  let total=0;
  chosen.forEach(g=>{
    const folder={id:uid(),name:apiUniqueFolderName(g.name),open:true,requests:g.requests.map(r=>({id:uid(),name:r.name,ts:Date.now(),open:false,request:r.request,examples:[]}))};
    apiState.folders=(apiState.folders||[]).concat(folder);
    apiState.activeFolder=folder.id;
    total+=g.requests.length;
  });
  saveState();renderApiFolders();
  toast('Imported '+total+' requests into '+chosen.length+' folders');
}
function setApiRespTab(t){
  apiRespTab=t;if(apiState)apiState.respTab=t;
  document.querySelectorAll('#apiRespSeg [data-rtab]').forEach(b=>b.classList.toggle('on',b.dataset.rtab===t));
  if(apiRespData||apiBusy)apiTouch();
  renderApiResp();
}
function toggleApiPretty(){apiPretty=!apiPretty;apiTouch();renderApiResp()}
function copyApiResp(){
  if(!apiRespData||apiRespData.error)return;
  if(apiRespTab==='headers'){
    const txt=(apiRespData.headers||[]).map(([k,v])=>k+': '+v).join('\n');
    if(txt)copy(txt,'Headers copied');return;
  }
  copy(apiRespData.body||'', 'Body copied');
}
function renderApiResp(){
  const statusEl=document.getElementById('apiStatus'),metaEl=document.getElementById('apiMeta');
  const seg=document.getElementById('apiRespSeg'),fmtBtn=document.getElementById('apiFmtBtn'),copyBtn=document.getElementById('apiCopyBtn'),exBtn=document.getElementById('apiExBtn'),wrap=document.getElementById('apiRespBody');
  const show=(el,on)=>el&&el.classList.toggle('hide',!on);
  if(apiBusy){
    show(statusEl,false);show(seg,false);show(fmtBtn,false);show(copyBtn,false);show(exBtn,false);
    metaEl.textContent='';wrap.innerHTML='<div class="api-empty"><span class="api-spin"></span> Sending…</div>';return;
  }
  if(!apiRespData){
    show(statusEl,false);show(seg,false);show(fmtBtn,false);show(copyBtn,false);show(exBtn,false);
    metaEl.textContent='';wrap.innerHTML='<div class="api-empty">Send a request to see the response</div>';return;
  }
  if(apiRespData.error){
    statusEl.className='api-status err';statusEl.textContent='ERR';show(statusEl,true);
    show(seg,false);show(fmtBtn,false);show(copyBtn,false);show(exBtn,false);metaEl.textContent='';
    wrap.innerHTML='<div class="api-err">'+esc(apiRespData.error)+'</div>';return;
  }
  const st=Number(apiRespData.status)||0;
  statusEl.className='api-status '+apiCls(st);statusEl.textContent=st+' '+apiRespData.statusText;show(statusEl,true);
  metaEl.textContent=(apiRespData.duration||0)+' ms · '+formatBytes(apiRespData.size)+(apiRespData.truncated?' · truncated':'');
  show(seg,true);show(copyBtn,true);show(fmtBtn,!!apiRespData.pretty);show(exBtn,!!apiCur());
  fmtBtn.textContent=apiPretty?'Raw':'Pretty';
  document.querySelectorAll('#apiRespSeg [data-rtab]').forEach(b=>b.classList.toggle('on',b.dataset.rtab===apiRespTab));
  if(apiRespTab==='headers'){
    const rows=apiRespData.headers||[];
    wrap.innerHTML=rows.length?'<div class="api-h-list">'+rows.map(([k,v])=>'<div class="api-h-row"><span class="api-h-k">'+esc(k)+'</span><span class="api-h-v">'+esc(v)+'</span></div>').join('')+'</div>':'<div class="api-empty">No response headers</div>';
    return;
  }
  const txt=apiPretty&&apiRespData.pretty?apiRespData.pretty:apiRespData.body;
  if(!txt){wrap.innerHTML='<div class="api-empty">Empty response body</div>';return}
  let inner=esc(txt);
  if(apiPretty&&apiRespData.pretty){
    try{inner=jTree(JSON.parse(txt),0)}catch(e){inner=jsonHi(txt)}
  }
  wrap.innerHTML='<pre class="json-hi">'+inner+'</pre>';
}
function renderApi(){
  if(!apiState)apiInit();
  cselValue('apiMethodSel',apiState.method);
  cselValue('apiBodyTypeSel',apiState.bodyType);
  const nameEl=document.getElementById('apiName');if(nameEl)nameEl.value=apiState.name||'';
  const url=document.getElementById('apiUrl');if(url)url.value=apiState.url;
  renderKv('params');renderKv('headers');renderKv('form');
  const ta=document.getElementById('apiBody');if(ta)ta.value=apiState.body;
  const isForm=apiState.bodyType==='form',isNone=apiState.bodyType==='none';
  ta.classList.toggle('hide',isForm||isNone);
  document.getElementById('apiFormWrap').classList.toggle('hide',!isForm);
  document.getElementById('apiBodyFmt').classList.toggle('hide',apiState.bodyType!=='json');
  setApiTab(apiTab);
  renderApiFolders();
  renderApiResp();
}

