/* ============================================================
   Tools-X · Markdown 渲染核心（零依赖）
   Docs 编辑器与本地 .md 文件预览页共用此文件。
============================================================ */
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}

function unesc(s){return s.replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&amp;/g,'&')}
const CK_RULES={
  clike:[
    [/\/\*[\s\S]*?\*\/|\/\/[^\n]*/y,'ck-c'],
    [/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'|`(?:\\.|[^`\\])*`/y,'ck-s'],
    [/\b(?:0[xX][\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/y,'ck-n'],
    [/\b(?:true|false|null|nil|None|undefined|NaN)\b/y,'ck-b'],
    [/\b(?:const|let|var|function|return|if|else|for|while|do|switch|case|default|break|continue|new|class|struct|enum|interface|implements|extends|super|this|self|typeof|instanceof|in|of|try|catch|except|finally|throw|throws|import|package|from|export|async|await|yield|static|public|private|protected|type|typedef|func|fn|impl|trait|use|pub|mut|defer|chan|select|range|map|make|go|end|then|elif|lambda|pass|with|as|is|not|and|or)\b/y,'ck-k']
  ],
  json:[
    [/\/\/[^\n]*|\/\*[\s\S]*?\*\//y,'ck-c'],
    [/"(?:\\.|[^"\\])*"(?=\s*:)/y,'ck-k'],
    [/"(?:\\.|[^"\\])*"/y,'ck-s'],
    [/\b(?:true|false|null)\b/y,'ck-b'],
    [/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/y,'ck-n']
  ],
  py:[
    [/#[^\n]*/y,'ck-c'],
    [/"""[\s\S]*?"""|'''[\s\S]*?'''/y,'ck-s'],
    [/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y,'ck-s'],
    [/\b(?:True|False|None)\b/y,'ck-b'],
    [/\b(?:0[xX][\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/y,'ck-n'],
    [/\b(?:def|class|return|if|elif|else|for|while|in|not|and|or|import|from|as|try|except|finally|raise|with|lambda|pass|break|continue|global|nonlocal|yield|async|await|assert|del|is)\b/y,'ck-k']
  ],
  sh:[
    [/#[^\n]*/y,'ck-c'],
    [/"(?:\\.|[^"\\\n])*"|'[^']*'/y,'ck-s'],
    [/\$\{[^}\n]*\}|\$[\w@#?*]+/y,'ck-n'],
    [/\b(?:if|then|else|elif|fi|for|while|do|done|case|esac|function|in|select|until|return|exit|local|export|readonly|declare|set|shift|trap|unset|eval|exec|source|alias|sudo|cd|echo|printf|read|npm|go|git|curl|python3?|node)\b/y,'ck-k']
  ],
  sql:[
    [/--[^\n]*|\/\*[\s\S]*?\*\//y,'ck-c'],
    [/'(?:''|[^'])*'/y,'ck-s'],
    [/\b(?:select|from|where|insert|into|values|update|set|delete|create|table|alter|drop|index|view|join|left|right|full|inner|outer|on|group|by|order|having|limit|offset|union|as|and|or|not|null|is|in|like|between|distinct|count|sum|avg|min|max|primary|key|foreign|references|default|unique|check|begin|commit|rollback|transaction|exists|case|when|then|else|end|asc|desc)\b/iy,'ck-k'],
    [/\b\d+(?:\.\d+)?\b/y,'ck-n']
  ],
  html:[
    [/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>/iy,'ck-c'],
    [/<\/?[\w-]+|\/?>|</y,'ck-k'],
    [/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y,'ck-s'],
    [/[\w-]+(?==)/y,'ck-n']
  ],
  css:[
    [/\/\*[\s\S]*?\*\//y,'ck-c'],
    [/"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*'/y,'ck-s'],
    [/--[\w-]+/y,'ck-b'],
    [/@[\w-]+|!important/y,'ck-k'],
    [/#[\da-fA-F]{3,8}\b/y,'ck-n'],
    [/\b\d+(?:\.\d+)?(?:px|em|rem|vh|vw|vmin|vmax|%|s|ms|pt|fr|deg|ch|ex)?\b/y,'ck-n'],
    [/[\w-]+(?=\s*:)/y,'ck-k']
  ],
  yaml:[
    [/#[^\n]*/y,'ck-c'],
    [/(?<=^|\n)[ \t]*[\w./-]+(?=\s*:(?:\s|$))/y,'ck-k'],
    [/"(?:\\.|[^"\\\n])*"|'[^']*'/y,'ck-s'],
    [/\b(?:true|false|null|yes|no|on|off)\b/iy,'ck-b'],
    [/\b\d+(?:\.\d+)?\b/y,'ck-n']
  ],
  diff:[]
};
function ckFamily(lang){
  const l=(lang||'').toLowerCase();
  if(['js','javascript','ts','typescript','jsx','tsx','mjs','cjs'].includes(l))return'clike';
  if(['java','kt','kotlin','cs','csharp','c','cpp','c++','h','hpp','go','golang','rust','rs','swift','dart','scala','groovy'].includes(l))return'clike';
  if(['json','jsonc','json5'].includes(l))return'json';
  if(['py','python','ruby','rb','perl','php'].includes(l))return'py';
  if(['sh','bash','shell','zsh','console','ps1'].includes(l))return'sh';
  if(l==='sql')return'sql';
  if(['html','xml','svg','vue','svelte'].includes(l))return'html';
  if(['css','scss','less'].includes(l))return'css';
  if(['yaml','yml','toml','ini','conf','properties'].includes(l))return'yaml';
  if(['diff','patch'].includes(l))return'diff';
  return null;
}
function hiCode(code,lang){
  const fam=ckFamily(lang);
  if(!fam)return esc(code);
  if(fam==='diff')return code.split('\n').map(l=>{const c=l[0]==='+'?'ck-add':l[0]==='-'?'ck-del':l.startsWith('@@')?'ck-meta':'';return c?'<span class="'+c+'">'+esc(l)+'</span>':esc(l)}).join('\n');
  const rules=CK_RULES[fam];let out='',plain='',i=0;
  while(i<code.length){
    let hit=null;
    for(const r of rules){r[0].lastIndex=i;const m=r[0].exec(code);if(m&&m.index===i){hit=[m[0],r[1]];break}}
    if(hit){if(plain){out+=esc(plain);plain=''}out+='<span class="'+hit[1]+'">'+esc(hit[0])+'</span>';i+=hit[0].length}
    else plain+=code[i++];
  }
  return out+esc(plain);
}
/* ---------- docs: markdown 渲染 ---------- */
function mdRender(src){
  const codes=[];
  const fence=(m,lang,code)=>{
    const raw=unesc(code);
    if(/^(puml|plantuml|uml)$/i.test(lang)&&typeof renderPuml==='function'){
      const svg=renderPuml(raw);
      if(svg){codes.push('<div class="puml-block">'+svg+'</div>');return '\u0000'+(codes.length-1)+'\u0000'}
    }
    codes.push('<pre><code>'+hiCode(raw,lang)+'</code></pre>');
    return '\u0000'+(codes.length-1)+'\u0000'
  };
  let s=esc(src).replace(/```(\w*)\n?([\s\S]*?)```/g,fence);
  const inline=t=>t
    .replace(/`([^`]+)`/g,'<code>$1</code>')
    .replace(/\*\*\*([^*]+)\*\*\*/g,'<strong><em>$1</em></strong>')
    .replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>')
    .replace(/\*([^*\n]+)\*/g,'<em>$1</em>')
    .replace(/~~([^~]+)~~/g,'<del>$1</del>')
    .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g,'<img src="$2" alt="$1" loading="lazy">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
  const blockStart=/^(#{1,6})\s|^&gt;|^(-{3,}|\*{3,})\s*$|^\s*([-*]|\d+\.)\s+|^\u0000\d+\u0000$/;
  const lines=s.split('\n');const out=[];let i=0,m;
  while(i<lines.length){
    const l=lines[i];
    if(/^\s*$/.test(l)){i++;continue}
    if(m=l.match(/^\u0000(\d+)\u0000$/)){out.push(codes[+m[1]]);i++;continue}
    if(/^(-{3,}|\*{3,})\s*$/.test(l.trim())){out.push('<hr>');i++;continue}
    if(m=l.match(/^(#{1,6})\s+(.*)/)){const h=m[1].length;out.push('<h'+h+'>'+inline(m[2])+'</h'+h+'>');i++;continue}
    if(/^&gt;\s?/.test(l)){const buf=[];while(i<lines.length&&/^&gt;\s?/.test(lines[i])){buf.push(lines[i].replace(/^&gt;\s?/,''));i++}out.push('<blockquote><p>'+buf.map(inline).join('<br>')+'</p></blockquote>');continue}
    if(l.includes('|')&&lines[i+1]&&/^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i+1])&&/[\s:|-]/.test(lines[i+1].replace(/\|/g,''))){
      const parse=r=>r.replace(/^\s*\|/,'').replace(/\|\s*$/,'').split('|').map(c=>c.trim());
      const head=parse(l);i+=2;const rows=[];
      while(i<lines.length&&lines[i].includes('|')&&!/^\s*$/.test(lines[i])){rows.push(parse(lines[i]));i++}
      out.push('<table><thead><tr data-r="0">'+head.map((c,ci)=>'<th data-c="'+ci+'" data-raw="'+esc(unesc(c))+'">'+inline(c)+'</th>').join('')+'</tr></thead><tbody>'+rows.map((r,ri)=>'<tr data-r="'+(ri+2)+'">'+r.map((c,ci)=>'<td data-c="'+ci+'" data-raw="'+esc(unesc(c))+'">'+inline(c)+'</td>').join('')+'</tr>').join('')+'</tbody></table>');
      continue;
    }
    if(/^\s*([-*]|\d+\.)\s+/.test(l)){
      const items=[];
      while(i<lines.length&&/^\s*([-*]|\d+\.)\s+/.test(lines[i])){
        const mm=lines[i].match(/^\s*([-*]|\d+\.)\s+(.*)/);
        let task=null,text=mm[2];
        if(/^\[( |x|X)\]\s*/.test(text)){task=text[1]!==' ';text=text.replace(/^\[( |x|X)\]\s*/,'')}
        items.push({indent:lines[i].match(/^\s*/)[0].length,task,text,ordered:/\d/.test(mm[1])});
        i++;
      }
      const build=arr=>{
        if(!arr.length)return'';
        const lvl=arr[0].indent,ordered=arr[0].ordered;
        let html='<'+(ordered?'ol':'ul')+'>';
        let k=0;
        while(k<arr.length){
          const it=arr[k];const kids=[];let j=k+1;
          while(j<arr.length&&arr[j].indent>lvl){kids.push(arr[j]);j++}
          const inner=it.task!==null?'<span class="task"><input type="checkbox" '+(it.task?'checked':'')+'>'+inline(it.text)+'</span>':inline(it.text);
          html+='<li>'+inner+(kids.length?build(kids):'')+'</li>';
          k=j;
        }
        return html+'</'+(ordered?'ol':'ul')+'>';
      };
      out.push(build(items));continue;
    }
    const buf=[l];i++;
    while(i<lines.length&&!/^\s*$/.test(lines[i])&&!blockStart.test(lines[i])&&!lines[i].includes('|')){buf.push(lines[i]);i++}
    out.push('<p>'+buf.map(inline).join('<br>')+'</p>');
  }
  return out.join('\n');
}
/* ---------- docs / 预览：标题树（目录） ---------- */
/* 为容器内的标题补上锚点 id，并按文档顺序返回标题树数据 */
function mdOutline(root,prefix){
  if(!root)return [];
  const hs=[...root.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  return hs.map((h,i)=>{
    if(!h.id)h.id=(prefix||'md-h-')+i;
    return {id:h.id,level:+h.tagName.slice(1),text:h.textContent.replace(/\s+/g,' ').trim()};
  }).filter(it=>it.text);
}
function tocHtml(items){
  if(!items.length)return '';
  const base=Math.min(...items.map(it=>it.level));
  return items.map(it=>{
    const d=Math.max(0,Math.min(it.level-base,3));
    return '<button type="button" class="toc-item" data-h="'+esc(it.id)+'" style="--toc-d:'+d+'"><span class="toc-item-txt">'+esc(it.text)+'</span></button>';
  }).join('');
}
/* ---------- Markdown 打印 / 导出 PDF ---------- */
/* 把渲染后的正文临时挂到 body 顶层：打印时隐藏应用外壳、强制浅色，
   由浏览器打印对话框另存为 PDF。版式规则见 core/markdown.css 的 @media print。 */
function mdPrintHtml(html){
  if(!html)return false;
  document.querySelectorAll('.print-doc').forEach(el=>el.remove());
  const wrap=document.createElement('div');
  wrap.className='md print-doc';
  wrap.innerHTML=html;
  document.body.appendChild(wrap);
  const root=document.documentElement;
  const prevTheme=root.dataset.theme;
  root.classList.add('print-md');
  if(prevTheme==='dark')root.dataset.theme='light';
  const done=()=>{
    root.classList.remove('print-md');
    if(prevTheme==='dark')root.dataset.theme='dark';
    if(wrap.parentNode)wrap.parentNode.removeChild(wrap);
    window.removeEventListener('afterprint',done);
  };
  window.addEventListener('afterprint',done);
  try{window.print()}catch(e){done();return false}
  return true;
}
