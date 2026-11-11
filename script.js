(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MAX_FILE = 15 * 1024 * 1024;
  const state = {};
  const fmt = n => n < 1024 ? `${n} B` : n < 1048576 ? `${(n/1024).toFixed(1)} KB` : `${(n/1048576).toFixed(2)} MB`;
  const safeText = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function loadImage(file) {
    return new Promise((resolve,reject) => {
      const url = URL.createObjectURL(file), img = new Image();
      img.onload = () => resolve({img,url});
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('This image could not be opened.')); };
      img.src = url;
    });
  }
  function canvasBlob(canvas,type,quality) {
    return new Promise((resolve,reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('Your browser could not create this image format.')),type,quality));
  }
  function setDownload(id,blob,name) {
    const a=$(id); if(a.dataset.url) URL.revokeObjectURL(a.dataset.url);
    const url=URL.createObjectURL(blob); a.href=url; a.dataset.url=url; a.download=name; a.classList.remove('disabled-link');
  }
  function resetDownload(id) { const a=$(id); if(a.dataset.url) URL.revokeObjectURL(a.dataset.url); a.removeAttribute('href'); delete a.dataset.url; a.classList.add('disabled-link'); }
  function checkFile(file) {
    if(!file) return 'Choose an image first.';
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)) return 'Please choose a JPG, PNG, or WebP image.';
    if(file.size>MAX_FILE) return 'The file is larger than the 15 MB limit.';
    return '';
  }
  function attachTool({fileId,originalId,infoId,buttonId,statusId,resetId,downloadId,resultId,resultInfoId,onFile}) {
    let current=null;
    $(fileId).addEventListener('change', async e=>{
      const f=e.target.files[0], err=checkFile(f); if(err){$(statusId).textContent=err;return;}
      try{
        if(current?.url) URL.revokeObjectURL(current.url);
        current=await loadImage(f); current.file=f;
        $(originalId).src=current.url; $(infoId).textContent=`${current.img.naturalWidth} × ${current.img.naturalHeight} · ${fmt(f.size)}`;
        $(buttonId).disabled=false; $(statusId).textContent='Image ready.';
        resetDownload(downloadId); $(resultId).removeAttribute('src'); $(resultInfoId).textContent='Your result will appear here';
        onFile?.(current);
      }catch(ex){$(statusId).textContent=ex.message;}
    });
    $(resetId).addEventListener('click',()=>{
      if(current?.url) URL.revokeObjectURL(current.url); current=null;
      $(fileId).value=''; $(originalId).removeAttribute('src'); $(infoId).textContent='No image selected';
      $(buttonId).disabled=true; $(statusId).textContent='Choose an image to begin.';
      $(resultId).removeAttribute('src'); $(resultInfoId).textContent='Your result will appear here'; resetDownload(downloadId);
      onFile?.(null);
    });
    return ()=>current;
  }
  function outputName(file,ext){return `${file.name.replace(/\.[^.]+$/,'')}-pixelcv.${ext}`;}

  // Shared navigation
  if ($('menuToggle') && $('mainNav')) {
    $('menuToggle').addEventListener('click',()=>{const nav=$('mainNav'),open=nav.classList.toggle('open');$('menuToggle').setAttribute('aria-expanded',String(open));});
    $('mainNav').addEventListener('click',e=>{if(e.target.tagName==='A'){$('mainNav').classList.remove('open');$('menuToggle').setAttribute('aria-expanded','false');}});
  }
  if ($('year')) $('year').textContent=new Date().getFullYear();

  if ($('compressFile')) {
  // Compressor: target percentage or target file size, using iterative WebP quality search.
  $('quality').addEventListener('input',()=>$('qualityValue').textContent=$('quality').value+'%');
  $('targetPercent').addEventListener('input',()=>$('targetPercentValue').textContent=$('targetPercent').value+'%');
  $('compressMode').addEventListener('change',()=>{
    const bySize=$('compressMode').value==='size';
    $('compressPercentField').hidden=bySize;
    $('compressSizeField').hidden=!bySize;
  });
  const getCompress=attachTool({fileId:'compressFile',originalId:'compressOriginal',infoId:'compressOriginalInfo',buttonId:'compressBtn',statusId:'compressStatus',resetId:'compressReset',downloadId:'compressDownload',resultId:'compressResult',resultInfoId:'compressResultInfo'});
  $('compressBtn').addEventListener('click',async()=>{
    const s=getCompress();if(!s)return;
    const target=$('compressMode').value==='size'
      ? Number($('targetSize').value)*1024
      : s.file.size*(1-Number($('targetPercent').value)/100);
    if(!Number.isFinite(target)||target<1024){$('compressStatus').textContent='Enter a valid target size (at least 1 KB).';return;}
    $('compressBtn').disabled=true;$('compressStatus').textContent='Finding the best quality for your target…';
    try{
      const c=document.createElement('canvas');c.width=s.img.naturalWidth;c.height=s.img.naturalHeight;
      c.getContext('2d').drawImage(s.img,0,0);
      const maxQ=Number($('quality').value)/100;
      let low=.05,high=maxQ,best=null;
      // WebP supports lossy compression for JPEG, PNG and WebP inputs.
      for(let i=0;i<8;i++){
        const q=(low+high)/2,blob=await canvasBlob(c,'image/webp',q);
        if(!best||Math.abs(blob.size-target)<Math.abs(best.size-target))best=blob;
        if(blob.size>target)high=q;else low=q;
      }
      // Also test the selected maximum quality and a low-quality fallback.
      const maxBlob=await canvasBlob(c,'image/webp',maxQ);
      if(Math.abs(maxBlob.size-target)<Math.abs(best.size-target))best=maxBlob;
      const diff=(1-best.size/s.file.size)*100;
      $('compressResult').src=URL.createObjectURL(best);
      $('compressResultInfo').textContent=`${fmt(best.size)} · ${diff>=0?diff.toFixed(1)+'% smaller':Math.abs(diff).toFixed(1)+'% larger'} · WebP`;
      setDownload('compressDownload',best,outputName(s.file,'webp'));
      $('compressStatus').textContent=best.size<=target
        ? 'Target reached (or better). Actual output size is shown below.'
        : 'Closest possible result created. Try a larger target size or lower maximum quality.';
    }catch(e){$('compressStatus').textContent=e.message;}finally{$('compressBtn').disabled=false;}
  });


  }

  if ($('resizeFile')) {
  // Resizer
  let resizeRatio=1,resizeCurrent=null;
  const getResize=attachTool({fileId:'resizeFile',originalId:'resizeOriginal',infoId:'resizeOriginalInfo',buttonId:'resizeBtn',statusId:'resizeStatus',resetId:'resizeReset',downloadId:'resizeDownload',resultId:'resizeResult',resultInfoId:'resizeResultInfo',onFile:s=>{resizeCurrent=s;if(s){resizeRatio=s.img.naturalWidth/s.img.naturalHeight;$('resizeWidth').value=s.img.naturalWidth;$('resizeHeight').value=s.img.naturalHeight;}}});
  $('resizeWidth').addEventListener('input',()=>{if(resizeCurrent&&$('keepRatio').checked&&$('resizeWidth').value)$('resizeHeight').value=Math.max(1,Math.round(Number($('resizeWidth').value)/resizeRatio));});
  $('resizeHeight').addEventListener('input',()=>{if(resizeCurrent&&$('keepRatio').checked&&$('resizeHeight').value)$('resizeWidth').value=Math.max(1,Math.round(Number($('resizeHeight').value)*resizeRatio));});
  $('resizeBtn').addEventListener('click',async()=>{
    const s=getResize(),w=Number($('resizeWidth').value),h=Number($('resizeHeight').value);
    if(!s)return;if(!Number.isInteger(w)||!Number.isInteger(h)||w<1||h<1||w>12000||h>12000){$('resizeStatus').textContent='Enter valid dimensions between 1 and 12,000 pixels.';return;}
    $('resizeBtn').disabled=true;
    try{const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(s.img,0,0,w,h);const blob=await canvasBlob(c,s.file.type==='image/jpeg'?'image/jpeg':s.file.type==='image/webp'?'image/webp':'image/png',.92);$('resizeResult').src=URL.createObjectURL(blob);$('resizeResultInfo').textContent=`${w} × ${h} · ${fmt(blob.size)}`;setDownload('resizeDownload',blob,outputName(s.file,'png'));$('resizeStatus').textContent='Resize complete.';}catch(e){$('resizeStatus').textContent=e.message;}finally{$('resizeBtn').disabled=false;}
  });


  }

  if ($('cropFile')) {
  // Interactive crop selection. Coordinates are stored as fractions of the displayed image.
  let cropCurrent=null, cropRect={x:.15,y:.15,w:.65,h:.65}, cropAction=null, cropStart=null;
  const cropStage=$('cropStage'),cropBox=$('cropBox'),cropImage=$('cropImage');
  function drawCropBox(){cropBox.style.left=(cropRect.x*100)+'%';cropBox.style.top=(cropRect.y*100)+'%';cropBox.style.width=(cropRect.w*100)+'%';cropBox.style.height=(cropRect.h*100)+'%';}
  function ratioValue(){const v=$('cropRatio').value;if(v==='free')return null;const [a,b]=v.split(':').map(Number);return a/b;}
  function fitRatio(){if(!cropCurrent)return;const r=ratioValue();if(!r)return;const stage=cropStage.getBoundingClientRect(),imageW=stage.width,imageH=stage.height;let w=Math.min(.75,imageH*r/imageW*.75),h=w*imageW/(r*imageH);if(h>.75){h=.75;w=h*imageH*r/imageW;}cropRect={x:(1-w)/2,y:(1-h)/2,w,h};drawCropBox();}
  $('cropFile').addEventListener('change',async e=>{
    const f=e.target.files[0],err=checkFile(f);if(err){$('cropStatus').textContent=err;return;}
    try{if(cropCurrent?.url)URL.revokeObjectURL(cropCurrent.url);cropCurrent=await loadImage(f);cropCurrent.file=f;cropImage.src=cropCurrent.url;$('cropBtn').disabled=false;$('cropStatus').textContent=`${cropCurrent.img.naturalWidth} × ${cropCurrent.img.naturalHeight}`;$('cropResult').removeAttribute('src');$('cropResultInfo').textContent='Your result will appear here';resetDownload('cropDownload');cropImage.onload=()=>{cropRect={x:.15,y:.15,w:.65,h:.65};fitRatio();};}catch(ex){$('cropStatus').textContent=ex.message;}
  });
  $('cropRatio').addEventListener('change',fitRatio);
  cropBox.addEventListener('pointerdown',e=>{if(!cropCurrent)return;e.preventDefault();cropAction=e.target.classList.contains('crop-handle')?'resize':'move';cropStart={x:e.clientX,y:e.clientY,rect:{...cropRect},bounds:cropStage.getBoundingClientRect()};cropBox.setPointerCapture(e.pointerId);});
  cropBox.addEventListener('pointermove',e=>{
    if(!cropAction||!cropStart)return;const b=cropStart.bounds,dx=(e.clientX-cropStart.x)/b.width,dy=(e.clientY-cropStart.y)/b.height,r=cropStart.rect;
    if(cropAction==='move'){cropRect.x=Math.max(0,Math.min(1-r.w,r.x+dx));cropRect.y=Math.max(0,Math.min(1-r.h,r.y+dy));}
    else{let nw=Math.max(.08,Math.min(1-r.x,r.w+dx)),nh=Math.max(.08,Math.min(1-r.y,r.h+dy));const ratio=ratioValue();if(ratio){const targetH=nw*b.width/(ratio*b.height);if(targetH<=1-r.y)nh=targetH;else{nh=Math.min(nh,1-r.y);nw=nh*b.height*ratio/b.width;}}cropRect.w=nw;cropRect.h=nh;}
    drawCropBox();
  });
  ['pointerup','pointercancel','lostpointercapture'].forEach(ev=>cropBox.addEventListener(ev,()=>{cropAction=null;cropStart=null;}));
  $('cropBtn').addEventListener('click',async()=>{
    if(!cropCurrent)return;const bounds=cropStage.getBoundingClientRect(),nw=cropCurrent.img.naturalWidth,nh=cropCurrent.img.naturalHeight;
    const sx=Math.round(cropRect.x*nw),sy=Math.round(cropRect.y*nh),sw=Math.max(1,Math.round(cropRect.w*nw)),sh=Math.max(1,Math.round(cropRect.h*nh));
    $('cropBtn').disabled=true;
    try{const c=document.createElement('canvas');c.width=sw;c.height=sh;c.getContext('2d').drawImage(cropCurrent.img,sx,sy,sw,sh,0,0,sw,sh);const blob=await canvasBlob(c,cropCurrent.file.type,.92);$('cropResult').src=URL.createObjectURL(blob);$('cropResultInfo').textContent=`${sw} × ${sh} · ${fmt(blob.size)}`;setDownload('cropDownload',blob,outputName(cropCurrent.file,'png'));$('cropStatus').textContent='Crop complete.';}catch(e){$('cropStatus').textContent=e.message;}finally{$('cropBtn').disabled=false;}
  });
  $('cropReset').addEventListener('click',()=>{if(cropCurrent?.url)URL.revokeObjectURL(cropCurrent.url);cropCurrent=null;$('cropFile').value='';cropImage.removeAttribute('src');cropBox.style.display='none';$('cropBtn').disabled=true;$('cropStatus').textContent='Choose an image to begin.';$('cropResult').removeAttribute('src');$('cropResultInfo').textContent='Your result will appear here';resetDownload('cropDownload');});
  const cropBoxObserver=new MutationObserver(()=>{cropBox.style.display=cropCurrent?'block':'none';});cropBoxObserver.observe(cropImage,{attributes:true,attributeFilter:['src']});


  }

  if ($('convertFile')) {
  // Converter
  const getConvert=attachTool({fileId:'convertFile',originalId:'convertOriginal',infoId:'convertOriginalInfo',buttonId:'convertBtn',statusId:'convertStatus',resetId:'convertReset',downloadId:'convertDownload',resultId:'convertResult',resultInfoId:'convertResultInfo'});
  $('convertFormat').addEventListener('change',()=>{$('bgField').hidden=$('convertFormat').value!=='image/jpeg';});
  $('convertBtn').addEventListener('click',async()=>{
    const s=getConvert();if(!s)return;$('convertBtn').disabled=true;
    try{const type=$('convertFormat').value,c=document.createElement('canvas');c.width=s.img.naturalWidth;c.height=s.img.naturalHeight;const ctx=c.getContext('2d');if(type==='image/jpeg'){ctx.fillStyle=$('jpegBg').value;ctx.fillRect(0,0,c.width,c.height);}ctx.drawImage(s.img,0,0);const blob=await canvasBlob(c,type,.92);if(blob.type!==type)throw new Error('Your browser does not support this output format.');$('convertResult').src=URL.createObjectURL(blob);const ext=type==='image/jpeg'?'jpg':type.split('/')[1];$('convertResultInfo').textContent=`${ext.toUpperCase()} · ${fmt(blob.size)}`;setDownload('convertDownload',blob,outputName(s.file,ext));$('convertStatus').textContent='Conversion complete.';}catch(e){$('convertStatus').textContent=e.message;}finally{$('convertBtn').disabled=false;}
  });


  }

  if ($('resumeForm')) {
  // Resume builder
  const repeatConfig={
    education:{container:'educationFields',fields:[['degree','Degree / qualification'],['institution','Institution name'],['year','Passing year'],['result','Result / CGPA']]},
    experience:{container:'experienceFields',fields:[['job','Job title'],['company','Company name'],['start','Start date'],['end','End date'],['description','Job description','textarea']]},
    project:{container:'projectFields',fields:[['name','Project name'],['description','Project description','textarea'],['tech','Technologies used']]},
    certification:{container:'certificationFields',fields:[['name','Certification name'],['org','Issuing organization'],['year','Year']]}
  };
  const repeatData={education:[],experience:[],project:[],certification:[]};
  let resumePhotoUrl='';
  $('resumePhoto').addEventListener('change',e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    if(!/^image\/(jpeg|png|webp)$/.test(file.type)){ $('resumePhoto').value=''; alert('Choose a JPG, PNG or WebP photo.'); return; }
    if(resumePhotoUrl)URL.revokeObjectURL(resumePhotoUrl);
    resumePhotoUrl=URL.createObjectURL(file);
    renderResume();
  });
  function addRepeat(type,values={}) {
    const cfg=repeatConfig[type],idx=repeatData[type].length;repeatData[type].push(values);
    const wrap=document.createElement('div');wrap.className='repeat-item';wrap.dataset.type=type;wrap.dataset.index=idx;
    const grid=document.createElement('div');grid.className='repeat-grid';
    cfg.fields.forEach(([key,label,kind])=>{const lab=document.createElement('label');lab.textContent=label;const el=document.createElement(kind==='textarea'?'textarea':'input');el.value=values[key]||'';el.dataset.key=key;el.placeholder=label;el.addEventListener('input',()=>{repeatData[type][idx][key]=el.value;renderResume();});lab.appendChild(el);grid.appendChild(lab);});
    const remove=document.createElement('button');remove.type='button';remove.className='remove-entry';remove.textContent='Remove';remove.addEventListener('click',()=>{repeatData[type].splice(idx,1);renderRepeat(type);renderResume();});
    wrap.append(grid,remove);$(cfg.container).appendChild(wrap);renderResume();
  }
  function renderRepeat(type){$(repeatConfig[type].container).innerHTML='';const old=repeatData[type].slice();repeatData[type].length=0;old.forEach(v=>addRepeat(type,v));}
  $('addEducation').onclick=()=>addRepeat('education');$('addExperience').onclick=()=>addRepeat('experience');$('addProject').onclick=()=>addRepeat('project');$('addCertification').onclick=()=>addRepeat('certification');
  const defaultData={name:'Your Name',title:'Professional Title',email:'email@example.com',phone:'Phone number',address:'City, Country',linkedin:'',portfolio:'',summary:'Write a short summary about your experience, strengths, and career goals.',skills:'Communication, Problem Solving, Teamwork',languages:'English, Bengali'};
  function getBasic(){const d={};document.querySelectorAll('[data-bind]').forEach(el=>d[el.dataset.bind]=el.value.trim());return d;}
  function section(title,html){return html?`<section><h2>${title}</h2>${html}</section>`:'';}
  function entries(items,fn){return items.map(fn).join('');}
  function renderResume(){
    const d=getBasic(), contact=[d.email,d.phone,d.address,d.linkedin,d.portfolio].filter(Boolean).map(safeText).join(' &nbsp; | &nbsp;');
    const edu=entries(repeatData.education,v=>`<div class="cv-entry"><strong>${safeText(v.degree||'')}</strong><p>${safeText(v.institution||'')} ${v.year?'· '+safeText(v.year):''}</p>${v.result?`<p class="cv-muted">${safeText(v.result)}</p>`:''}</div>`);
    const exp=entries(repeatData.experience,v=>`<div class="cv-entry"><strong>${safeText(v.job||'')}</strong><p>${safeText(v.company||'')} ${v.start||v.end?'· '+safeText(v.start||'')+' – '+safeText(v.end||''):''}</p>${v.description?`<p>${safeText(v.description)}</p>`:''}</div>`);
    const projects=entries(repeatData.project,v=>`<div class="cv-entry"><strong>${safeText(v.name||'')}</strong>${v.description?`<p>${safeText(v.description)}</p>`:''}${v.tech?`<p class="cv-muted">${safeText(v.tech)}</p>`:''}</div>`);
    const certs=entries(repeatData.certification,v=>`<div class="cv-entry"><strong>${safeText(v.name||'')}</strong><p>${safeText(v.org||'')} ${v.year?'· '+safeText(v.year):''}</p></div>`);
    const skills=d.skills?`<ul>${d.skills.split(',').map(s=>s.trim()).filter(Boolean).map(s=>`<li>${safeText(s)}</li>`).join('')}</ul>`:'';
    const langs=d.languages?`<p>${d.languages.split(',').map(s=>safeText(s.trim())).filter(Boolean).join(' · ')}</p>`:'';
    const photo=resumePhotoUrl?`<img class="cv-photo" src="${resumePhotoUrl}" alt="Profile photo">`:'';
    const header=`<header class="cv-header">${photo}<div class="cv-heading"><h1>${safeText(d.name||'Your Name')}</h1><div class="cv-title">${safeText(d.title||'Professional Title')}</div><div class="cv-contact">${contact||'Email · Phone · Location'}</div></div></header>`;
    const main=`${section('Profile',d.summary?`<p>${safeText(d.summary)}</p>`:'')}${section('Experience',exp)}${section('Education',edu)}${section('Projects',projects)}`;
    const side=`${section('Skills',skills)}${section('Languages',langs)}${section('Certifications',certs)}`;
    const template=$('templateSelect').value;
    $('resumePreview').innerHTML=template==='executive'?`${header}<div class="cv-columns"><aside>${side}</aside><div>${main}</div></div>`:
      template==='creative'?`<div class="creative-banner">${photo}${header.replace(photo,'')}</div><div class="creative-body">${main}${side}</div>`:
      template==='compact'?`${header}<div class="cv-columns compact-columns"><div>${main}</div><aside>${side}</aside></div>`:
      `${header}${main}${side}`;
    $('resumePreview').className='resume-paper template-'+template;
  }
  document.querySelectorAll('[data-bind]').forEach(el=>el.addEventListener('input',renderResume));
  $('templateSelect').addEventListener('change',renderResume);
  $('printResume').addEventListener('click',()=>window.print());
  $('clearResume').addEventListener('click',()=>{
    if(!confirm('Clear all resume information?'))return;
    document.querySelectorAll('[data-bind]').forEach(el=>el.value='');
    Object.keys(repeatData).forEach(k=>{repeatData[k]=[];$(repeatConfig[k].container).innerHTML='';});
    $('resumePhoto').value='';
    if(resumePhotoUrl){URL.revokeObjectURL(resumePhotoUrl);resumePhotoUrl='';}
    $('templateSelect').value='modern';renderResume();
  });
  renderResume();


  }

  if ($('contactForm')) {
  // mailto-based contact form, no fake server submission
  $('contactForm').addEventListener('submit',e=>{
    e.preventDefault();const name=$('contactName').value.trim(),email=$('contactEmail').value.trim(),subject=$('contactSubject').value.trim(),message=$('contactMessage').value.trim();
    if(!name||!email||!subject||!message){$('contactStatus').textContent='Please complete all fields.';return;}
    const body=`Name: ${name}\nEmail: ${email}\n\n${message}`;
    $('contactStatus').textContent='Opening your email application. If it does not open, check your browser mail settings.';
    window.location.href=`mailto:YOUR-EMAIL@example.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  });

  }

})();