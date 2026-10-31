/* ============================================================
   Tools-X · JSON 展示核心（语法高亮 / 可折叠树）
   JSON 工具、Docs 的 JSON 文档、Postman 响应预览共用。
============================================================ */
function jsonHi(src){
  src=String(src??'');
  const re=/("(?:\\.|[^"\\])*")(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
  let out='',last=0,m;
  while((m=re.exec(src))){
    out+=esc(src.slice(last,m.index));
    const prev=m.index>0?src[m.index-1]:'';
    if(m[1]!==undefined){
      out+=m[2]?'<span class="k">'+esc(m[1])+'</span>'+m[2]:'<span class="s">'+esc(m[1])+'</span>';
    }else if(/[\w$]/.test(prev)){
      out+=esc(m[0]);
    }else if(m[0]==='true'||m[0]==='false'||m[0]==='null'){
      out+='<span class="b">'+m[0]+'</span>';
    }else out+='<span class="n">'+m[0]+'</span>';
    last=m.index+m[0].length;
  }
  return out+esc(src.slice(last));
}
/* 格式化输出：可折叠树（点击对象/数组的括号收起展开，默认全展开） */
function jTree(v,ind){
  if(v===null||typeof v!=='object')return jsonHi(JSON.stringify(v));
  const arr=Array.isArray(v),keys=Object.keys(v);
  if(!keys.length)return '<span class="b">'+(arr?'[]':'{}')+'</span>';
  const open=arr?'[':'{',close=arr?']':'}';
  const pad='\n'+' '.repeat(ind+2),end='\n'+' '.repeat(ind);
  const kids=keys.map((k,i)=>{
    const head=arr?'':jsonHi(JSON.stringify(k)+':')+' ';
    return pad+head+jTree(v[k],ind+2)+(i<keys.length-1?',':'');
  }).join('');
  return '<span class="jt-node"><span class="jt-h" onclick="event.stopPropagation();jToggle(this)"><span class="jt-car">▾</span>'+open+'</span><span class="jt-kids">'+kids+end+'</span><span class="jt-cl">'+close+'</span><span class="jt-ell">'+open+'…'+close+'</span></span>';
}
function jToggle(el){el.parentElement.classList.toggle('closed')}
function jType(v){return v===null?'null':Array.isArray(v)?'array':typeof v==='object'?'object':'value'}
