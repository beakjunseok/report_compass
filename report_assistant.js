const APP_TITLE = "보고서 작성 도우미";
let state = {
  view: 'list',        // list | new-project | detail | new-entry | report
  projects: [],
  currentProjectId: null,
  entries: [],
  reportText: '',
  reportLoading: false,
  formatMode: 'default', // default | custom
  customFormat: '',
  typeChoice: null,
  editingEntryId: null,
  newProjectName: '',
  entryForm: { date:'', title:'', summary:'', code:'', notes:'', photos:[] },
};

function uid(){ return Date.now().toString(36) + Math.random().toString(36).slice(2,7); }
function todayStr(){ const d=new Date(); return d.toISOString().slice(0,10); }
function esc(s){ return (s||'').replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast._h);
  toast._h = setTimeout(()=>t.classList.remove('show'), 2200);
}

function resizeImageFile(file, maxDim=1000, quality=0.72){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onload = (e)=>{
      const img = new Image();
      img.onload = ()=>{
        let w = img.width, h = img.height;
        if(w > maxDim || h > maxDim){
          if(w >= h){ h = Math.round(h * maxDim / w); w = maxDim; }
          else { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = ()=>reject(new Error('이미지를 불러올 수 없습니다.'));
      img.src = e.target.result;
    };
    reader.onerror = ()=>reject(new Error('파일을 읽을 수 없습니다.'));
    reader.readAsDataURL(file);
  });
}

async function loadProjects(){
  try{
    const v = localStorage.getItem('projects');
    state.projects = v ? JSON.parse(v) : [];
  }catch(e){ state.projects = []; }
}
async function saveProjects(){
  localStorage.setItem('projects', JSON.stringify(state.projects));
}
async function loadEntries(pid){
  try{
    const v = localStorage.getItem('entries:'+pid);
    state.entries = v ? JSON.parse(v) : [];
  }catch(e){ state.entries = []; }
  state.entries.sort((a,b)=> a.date < b.date ? 1 : -1);
}
async function saveEntries(pid){
  localStorage.setItem('entries:'+pid, JSON.stringify(state.entries));
}

function currentProject(){
  return state.projects.find(p=>p.id===state.currentProjectId);
}

/* ---------------- RENDER ---------------- */
function render(){
  const app = document.getElementById('app');
  app.innerHTML = `
    <header class="top">
      <div>
        <div class="title">📓 ${APP_TITLE.replace('보고서','<span>보고서</span>')}</div>
        <div class="sub">프로젝트를 날짜별로 기록하고, 마지막에 보고서로 완성합니다</div>
      </div>
    </header>
    <div id="body"></div>
  `;
  const body = document.getElementById('body');

  if(state.view === 'list') body.innerHTML = renderList();
  else if(state.view === 'new-project') body.innerHTML = renderNewProject();
  else if(state.view === 'detail') body.innerHTML = renderDetail();
  else if(state.view === 'new-entry') body.innerHTML = renderEntryForm();
  else if(state.view === 'report') body.innerHTML = renderReport();

  bindEvents();
}

function renderList(){
  const cards = state.projects.map(p=>{
    const cls = p.type === 'exp' ? 'exp' : 'code';
    const label = p.type === 'exp' ? '실험 보고서' : '코딩 발명품 보고서';
    return `
    <div class="project-card" data-open="${p.id}">
      <span class="badge ${cls}">${label}</span>
      <div class="pname">${esc(p.name)}</div>
      <div class="pmeta">생성일 ${p.createdAt}</div>
    </div>`;
  }).join('');

  return `
    <div class="project-grid">
      ${cards}
      <div class="new-card" id="btn-new-project">+ 새 프로젝트 만들기</div>
    </div>
    ${state.projects.length===0 ? `<div class="empty-hint">아직 프로젝트가 없습니다. 위 버튼을 눌러 첫 프로젝트를 시작하세요.</div>` : ''}
  `;
}

function renderNewProject(){
  return `
    <div class="breadcrumb" id="back-to-list">&larr; 프로젝트 목록</div>
    <div class="panel">
      <h3>새 프로젝트</h3>
      <label>프로젝트 이름</label>
      <input type="text" id="np-name" placeholder="예: 펀치 스피드 측정 장치" value="${esc(state.newProjectName)}">
      <label>보고서 유형</label>
      <div class="type-choice">
        <div class="type-opt ${state.typeChoice==='exp'?'selected':''}" data-type="exp">
          🧪 실험 보고서<small>가설·실험 과정·결과 중심</small>
        </div>
        <div class="type-opt ${state.typeChoice==='code'?'selected':''}" data-type="code">
          🛠 코딩 발명품(프로젝트) 보고서<small>설계·구현·코드 변경 중심</small>
        </div>
      </div>
      <div class="row" style="margin-top:18px;">
        <button class="btn primary" id="btn-create-project">만들기</button>
        <button class="btn ghost" id="btn-cancel-new">취소</button>
      </div>
    </div>
  `;
}

function renderDetail(){
  const p = currentProject();
  if(!p) return `<div>프로젝트를 찾을 수 없습니다.</div>`;
  const label = p.type === 'exp' ? '실험 보고서' : '코딩 발명품 보고서';

  const entriesHtml = state.entries.map(e=>{
    const codeBlock = e.codeChanges ? `<div class="entry-code">${esc(e.codeChanges)}</div>` : '';
    const notes = e.notes ? `<div class="entry-notes">📌 ${esc(e.notes)}</div>` : '';
    const photos = (e.photos && e.photos.length) ? `
      <div class="photo-grid">
        ${e.photos.map(src=>`<img class="photo-thumb" src="${src}" data-full="${src}">`).join('')}
      </div>` : '';
    return `
    <div class="entry">
      <div class="entry-card">
        <div class="entry-top">
          <span class="stamp mono">${e.date}</span>
          <div class="entry-actions">
            <button class="btn ghost" data-del-entry="${e.id}">삭제</button>
          </div>
        </div>
        ${e.title ? `<div class="entry-title">${esc(e.title)}</div>` : ''}
        <div class="entry-summary">${esc(e.summary)}</div>
        ${codeBlock}
        ${photos}
        ${notes}
      </div>
    </div>`;
  }).join('');

  return `
    <div class="breadcrumb" id="back-to-list">&larr; 프로젝트 목록</div>
    <div class="detail-header">
      <h2>${esc(p.name)}</h2>
      <span class="badge ${p.type==='exp'?'exp':'code'}">${label}</span>
    </div>
    <div class="row">
      <button class="btn primary" id="btn-add-entry">+ 오늘 기록 추가</button>
      <button class="btn accent" id="btn-goto-report" ${state.entries.length===0?'disabled':''}>보고서 생성 →</button>
      <button class="btn danger" id="btn-delete-project" style="margin-left:auto;">프로젝트 삭제</button>
    </div>
    <div class="section-title">기록 타임라인 (${state.entries.length}건)</div>
    ${state.entries.length ? `<div class="timeline">${entriesHtml}</div>` : `<div class="empty-hint">아직 기록이 없습니다. '오늘 기록 추가'로 첫 로그를 남겨보세요.</div>`}
  `;
}

function renderEntryForm(){
  const p = currentProject();
  const isCode = p.type === 'code';
  const f = state.entryForm;

  const photoPreview = f.photos.length ? `
    <div class="photo-grid">
      ${f.photos.map((src,i)=>`
        <div class="photo-thumb-wrap">
          <img class="photo-thumb" src="${src}">
          <button type="button" class="photo-remove" data-remove-photo="${i}">×</button>
        </div>
      `).join('')}
    </div>` : '';

  return `
    <div class="breadcrumb" id="back-to-detail">&larr; ${esc(p.name)}</div>
    <div class="panel">
      <h3>새 기록 추가</h3>
      <label>날짜</label>
      <input type="date" id="ef-date" value="${f.date || todayStr()}">
      <label>제목 (선택)</label>
      <input type="text" id="ef-title" placeholder="예: 초음파 센서 그룹 배선 완료" value="${esc(f.title)}">
      <label>내용 요약</label>
      <textarea id="ef-summary" placeholder="오늘 진행한 작업, 관찰한 내용, 겪은 문제와 해결 과정을 적어주세요.">${esc(f.summary)}</textarea>
      ${isCode ? `
      <label>코드 (선택)</label>
      <textarea id="ef-code" class="mono" placeholder="변경하거나 작성한 코드를 붙여넣으세요.">${esc(f.code)}</textarea>
      ` : ''}
      <label>${isCode ? '사진 (선택, 여러 장 가능)' : '실험 사진 (선택, 여러 장 가능)'}</label>
      <input type="file" id="ef-photos" accept="image/*" multiple>
      <small style="display:block; color:var(--ink-soft); margin-top:4px; margin-bottom:10px; font-family:'IBM Plex Sans KR',sans-serif;">* 여러 장의 이미지를 동시에 드래그하여 선택하거나, 여러 번 나누어 등록할 수 있습니다.</small>
      ${photoPreview}
      <label>비고 (선택)</label>
      <input type="text" id="ef-notes" placeholder="참고 자료, 다음에 해야 할 일 등" value="${esc(f.notes)}">
      <div class="row" style="margin-top:18px;">
        <button class="btn primary" id="btn-save-entry">저장</button>
        <button class="btn ghost" id="btn-cancel-entry">취소</button>
      </div>
    </div>
  `;
}

function renderReport(){
  const p = currentProject();
  return `
    <div class="breadcrumb" id="back-to-detail">&larr; ${esc(p.name)}</div>
    <div class="panel">
      <h3>보고서 형식</h3>
      <div class="format-toggle">
        <button class="btn ${state.formatMode==='default'?'primary':''}" id="fmt-default">기본 형식으로 작성</button>
        <button class="btn ${state.formatMode==='custom'?'primary':''}" id="fmt-custom">형식 직접 입력</button>
      </div>
      ${state.formatMode==='custom' ? `
        <textarea id="custom-format-input" placeholder="원하는 보고서 형식/목차를 붙여넣거나 설명해주세요. 예: '1. 탐구 동기 2. 탐구 과정 3. 결과 및 느낀점 순서로, 학교 생기부 제출용으로 정중한 문어체로 작성해줘'" style="min-height:100px;">${esc(state.customFormat)}</textarea>
      ` : `<div class="pmeta" style="margin-top:6px; color:var(--ink-soft);">유형에 맞는 표준 구성(동기·과정·결과·고찰)으로 자동 작성됩니다.</div>`}
      <div class="row" style="margin-top:16px;">
        <button class="btn accent" id="btn-generate" ${state.reportLoading?'disabled':''}>${state.reportLoading?'생성 중...':'보고서 생성'}</button>
      </div>
    </div>
    ${state.reportLoading ? `<div class="panel"><div class="loading">기록 ${state.entries.length}건을 바탕으로 보고서를 작성하고 있습니다...</div></div>` : ''}
    ${state.reportText ? `
      <div class="section-title">생성된 보고서</div>
      <div class="report-box" id="report-text" contenteditable="true">${esc(state.reportText)}</div>
      <div class="row" style="margin-top:12px;">
        <button class="btn primary" id="btn-copy-report">복사하기</button>
        <button class="btn" id="btn-download-report">텍스트 파일로 저장</button>
      </div>
    ` : ''}
  `;
}

/* ---------------- EVENTS ---------------- */
function bindEvents(){
  // list
  const btnNew = document.getElementById('btn-new-project');
  if(btnNew) btnNew.onclick = ()=>{ state.view='new-project'; state.typeChoice=null; state.newProjectName=''; render(); };
  document.querySelectorAll('[data-open]').forEach(el=>{
    el.onclick = async ()=>{
      state.currentProjectId = el.getAttribute('data-open');
      await loadEntries(state.currentProjectId);
      state.reportText=''; state.formatMode='default'; state.customFormat='';
      state.view='detail'; render();
    };
  });

  // new project
  const backList = document.getElementById('back-to-list');
  if(backList) backList.onclick = ()=>{ state.view='list'; render(); };
  const npNameInput = document.getElementById('np-name');
  if(npNameInput) npNameInput.oninput = (e)=>{ state.newProjectName = e.target.value; };
  document.querySelectorAll('.type-opt').forEach(el=>{
    el.onclick = ()=>{
      // capture current input value before re-rendering, so it isn't lost
      const nameField = document.getElementById('np-name');
      if(nameField) state.newProjectName = nameField.value;
      state.typeChoice = el.getAttribute('data-type');
      render();
    };
  });
  const btnCancelNew = document.getElementById('btn-cancel-new');
  if(btnCancelNew) btnCancelNew.onclick = ()=>{ state.newProjectName=''; state.typeChoice=null; state.view='list'; render(); };
  const btnCreate = document.getElementById('btn-create-project');
  if(btnCreate) btnCreate.onclick = async ()=>{
    const name = document.getElementById('np-name').value.trim();
    if(!name){ toast('프로젝트 이름을 입력해주세요.'); return; }
    if(!state.typeChoice){ toast('보고서 유형을 선택해주세요.'); return; }
    const proj = { id: uid(), name, type: state.typeChoice, createdAt: todayStr() };
    state.projects.unshift(proj);
    await saveProjects();
    state.currentProjectId = proj.id;
    state.entries = [];
    state.newProjectName = '';
    state.typeChoice = null;
    state.view = 'detail';
    render();
  };

  // detail
  const backDetail = document.getElementById('back-to-detail');
  if(backDetail) backDetail.onclick = ()=>{ state.view='detail'; render(); };
  const btnAddEntry = document.getElementById('btn-add-entry');
  if(btnAddEntry) btnAddEntry.onclick = ()=>{
    state.entryForm = { date: todayStr(), title:'', summary:'', code:'', notes:'', photos:[] };
    state.view='new-entry'; render();
  };
  const btnGotoReport = document.getElementById('btn-goto-report');
  if(btnGotoReport) btnGotoReport.onclick = ()=>{ state.view='report'; state.reportText=''; render(); };
  const btnDelProject = document.getElementById('btn-delete-project');
  if(btnDelProject) btnDelProject.onclick = async ()=>{
    if(!confirm('이 프로젝트와 모든 기록을 삭제할까요? 되돌릴 수 없습니다.')) return;
    state.projects = state.projects.filter(p=>p.id!==state.currentProjectId);
    await saveProjects();
    try{ localStorage.removeItem('entries:'+state.currentProjectId); }catch(e){}
    state.view='list'; render();
  };
  document.querySelectorAll('[data-del-entry]').forEach(el=>{
    el.onclick = async ()=>{
      const id = el.getAttribute('data-del-entry');
      state.entries = state.entries.filter(e=>e.id!==id);
      await saveEntries(state.currentProjectId);
      render();
    };
  });

  // entry form
  const btnCancelEntry = document.getElementById('btn-cancel-entry');
  if(btnCancelEntry) btnCancelEntry.onclick = ()=>{ state.view='detail'; render(); };

  const efDate = document.getElementById('ef-date');
  if(efDate) efDate.oninput = (e)=>{ state.entryForm.date = e.target.value; };
  const efTitle = document.getElementById('ef-title');
  if(efTitle) efTitle.oninput = (e)=>{ state.entryForm.title = e.target.value; };
  const efSummary = document.getElementById('ef-summary');
  if(efSummary) efSummary.oninput = (e)=>{ state.entryForm.summary = e.target.value; };
  const efCode = document.getElementById('ef-code');
  if(efCode) efCode.oninput = (e)=>{ state.entryForm.code = e.target.value; };
  const efNotes = document.getElementById('ef-notes');
  if(efNotes) efNotes.oninput = (e)=>{ state.entryForm.notes = e.target.value; };

  const efPhotos = document.getElementById('ef-photos');
  if(efPhotos) efPhotos.onchange = async (e)=>{
    const files = Array.from(e.target.files || []);
    if(!files.length) return;
    toast('사진 처리 중...');
    try{
      const dataUrls = await Promise.all(files.map(f=>resizeImageFile(f)));
      state.entryForm.photos.push(...dataUrls);
    }catch(err){
      toast('사진을 불러오지 못했습니다: ' + err.message);
    }
    render();
  };
  document.querySelectorAll('[data-remove-photo]').forEach(el=>{
    el.onclick = ()=>{
      const idx = parseInt(el.getAttribute('data-remove-photo'), 10);
      state.entryForm.photos.splice(idx, 1);
      render();
    };
  });

  const btnSaveEntry = document.getElementById('btn-save-entry');
  if(btnSaveEntry) btnSaveEntry.onclick = async ()=>{
    const f = state.entryForm;
    const date = (document.getElementById('ef-date').value || todayStr());
    const title = document.getElementById('ef-title').value.trim();
    const summary = document.getElementById('ef-summary').value.trim();
    const efCodeEl = document.getElementById('ef-code');
    const codeChanges = efCodeEl ? efCodeEl.value.trim() : '';
    const notes = document.getElementById('ef-notes').value.trim();
    if(!summary){ toast('내용 요약을 입력해주세요.'); return; }
    state.entries.push({
      id: uid(), date, title, summary, codeChanges, notes,
      photos: f.photos.slice(),
      createdAt: new Date().toISOString()
    });
    await saveEntries(state.currentProjectId);
    state.entryForm = { date:'', title:'', summary:'', code:'', notes:'', photos:[] };
    state.view='detail'; render();
  };

  document.querySelectorAll('.photo-thumb[data-full]').forEach(el=>{
    el.onclick = ()=>{
      window.open(el.getAttribute('data-full'), '_blank');
    };
  });

  // report view
  const fmtDefault = document.getElementById('fmt-default');
  if(fmtDefault) fmtDefault.onclick = ()=>{ state.formatMode='default'; render(); };
  const fmtCustom = document.getElementById('fmt-custom');
  if(fmtCustom) fmtCustom.onclick = ()=>{ state.formatMode='custom'; render(); };
  const customInput = document.getElementById('custom-format-input');
  if(customInput) customInput.oninput = (e)=>{ state.customFormat = e.target.value; };
  const btnGenerate = document.getElementById('btn-generate');
  if(btnGenerate) btnGenerate.onclick = generateReport;
  const btnCopy = document.getElementById('btn-copy-report');
  if(btnCopy) btnCopy.onclick = ()=>{
    const txt = document.getElementById('report-text').innerText;
    navigator.clipboard.writeText(txt).then(()=>toast('클립보드에 복사했습니다.'));
  };
  const btnDownload = document.getElementById('btn-download-report');
  if(btnDownload) btnDownload.onclick = ()=>{
    const txt = document.getElementById('report-text').innerText;
    const p = currentProject();
    const blob = new Blob([txt], {type:'text/plain;charset=utf-8'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (p ? p.name : 'report') + '_보고서.txt';
    a.click();
  };
}

async function generateReport(){
  const p = currentProject();
  if(!p) return;
  if(state.formatMode==='custom'){
    const el = document.getElementById('custom-format-input');
    if(el) state.customFormat = el.value.trim();
    if(!state.customFormat){ toast('원하는 형식을 입력해주세요.'); return; }
  }
  state.reportLoading = true;
  state.reportText = '';
  render();

  const typeLabel = p.type==='exp' ? '실험 보고서' : '코딩으로 만든 발명품(프로젝트) 보고서';
  const logText = state.entries.slice().reverse().map(e=>{
    let block = `[${e.date}]`;
    if(e.title) block += ` ${e.title}`;
    block += `\n내용: ${e.summary}`;
    if(p.type==='code' && e.codeChanges) block += `\n코드: ${e.codeChanges}`;
    if(e.photos && e.photos.length) block += `\n(사진 ${e.photos.length}장 첨부됨)`;
    if(e.notes) block += `\n비고: ${e.notes}`;
    return block;
  }).join('\n\n');

  const formatInstruction = state.formatMode==='custom'
    ? `사용자가 요청한 다음 형식/목차를 반드시 따라서 작성하세요:\n"""\n${state.customFormat}\n"""`
    : (p.type==='exp'
        ? '다음 표준 실험 보고서 구성으로 작성하세요: 1) 탐구 동기 및 목적, 2) 탐구(실험) 과정, 3) 결과 및 데이터 정리, 4) 결론 및 느낀점/향후 탐구 방향.'
        : '다음 표준 프로젝트 보고서 구성으로 작성하세요: 1) 프로젝트 개요 및 목적, 2) 설계 및 구현 과정(주요 기술적 의사결정 포함), 3) 주요 코드/회로 변경 내역 요약, 4) 결과 및 느낀점, 5) 향후 개선 방향.');

  const prompt = `너는 한국 고등학생의 ${typeLabel} 작성을 돕는 도우미야. 아래는 날짜별로 기록된 프로젝트 로그야. 이 로그들을 바탕으로 하나의 완성된 보고서를 한국어로 작성해줘.

프로젝트 이름: ${p.name}
보고서 유형: ${typeLabel}

${formatInstruction}

작성 시 유의사항:
- 로그에 있는 사실만 사용하고 지어내지 마.
- 문어체로, 학교 제출용 보고서에 어울리는 정중하고 간결한 문체를 사용해.
- 날짜를 나열하기보다 하나의 이어지는 이야기처럼 자연스럽게 구성해.
- 보고서 본문만 출력하고, 서두의 인사말이나 부가 설명은 하지 마.

--- 프로젝트 로그 ---
${logText}
`;

  try{
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompt }]
      })
    });
    const data = await response.json();
    const text = (data.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n').trim();
    state.reportText = text || '보고서를 생성하지 못했습니다. 다시 시도해주세요.';
  }catch(e){
    state.reportText = '오류가 발생했습니다: ' + e.message;
  }
  state.reportLoading = false;
  render();
}

/* ---------------- INIT ---------------- */
(async function init(){
  await loadProjects();
  render();
})();
