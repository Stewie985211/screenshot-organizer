import React, {useEffect, useMemo, useRef, useState} from 'react';
import {createRoot} from 'react-dom/client';
import {Icon, Mark} from './icons.jsx';
import {initialImages, initialSettings, initialHistory, recoveryExample} from './demo-data.js';
import './styles.css';

const DAY = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
const TIME = new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false});
function dateOf(ms) { const p = DAY.formatToParts(new Date(ms)); return ['year','month','day'].map(k=>p.find(v=>v.type===k).value).join('-'); }
function fileName(path) { return path.split(/[\\/]/).pop(); }
function cleanTitle(raw) { return Array.from(raw.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\s+/g,' ').trim()).slice(0,40).join('').replace(/[. ]+$/g,''); }
function sizeOf(bytes) { return bytes < 1048576 ? `${Math.round(bytes/1024)} KB` : `${(bytes/1048576).toFixed(1)} MB`; }
function Check({checked, onChange, label, disabled = false}) { return <label className={`checkbox ${disabled?'disabled':''}`}><input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={label}/><span><Icon name="check" size={12}/></span></label>; }
function Badge({status, approved = false, label: customLabel}) { const label = customLabel || (approved ? '人工确认' : {ready:'已识别',review:'待确认',pending:'未识别',error:'读取失败',moved:'已整理'}[status]); return <span className={`status status-${approved?'ready':status}`}><span className="status-dot"/>{label}</span>; }
function CategoryBadge({category}) { return category ? <span className="category-badge" style={{'--cat-color':category.color,'--cat-tint':category.tint}}><Icon name={category.icon} size={12}/>{category.name}</span> : <span className="muted small">未分类</span>; }
function Button({children, icon, variant = 'secondary', className = '', ...props}) { return <button className={`button button-${variant} ${className}`} {...props}>{icon && <Icon name={icon} size={16}/>}<span>{children}</span></button>; }

function Modal({title, subtitle, children, onClose, wide = false, footer}) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(()=>{
    const previous = document.activeElement;
    const panel = ref.current;
    panel?.focus();
    function keyboard(e) {
      if(e.key === 'Escape') closeRef.current();
      if(e.key === 'Tab') {
        const nodes = [...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
        if(!nodes.length) return;
        const first = nodes[0], last = nodes.at(-1);
        if(e.shiftKey && (document.activeElement===first || document.activeElement===panel)) { e.preventDefault(); last.focus(); }
        else if(!e.shiftKey && document.activeElement===last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown',keyboard);
    return ()=>{document.removeEventListener('keydown',keyboard); previous?.focus();};
  },[]);
  return <div className="modal-scrim" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><section ref={ref} tabIndex={-1} className={`modal ${wide?'modal-wide':''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-header"><div><h2 id="modal-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="关闭弹窗" onClick={onClose}><Icon name="close"/></button></header><div className="modal-content">{children}</div>{footer && <footer className="modal-footer">{footer}</footer>}</section></div>;
}

function App() {
  const [images,setImages] = useState(()=>structuredClone(initialImages));
  const [settings,setSettings] = useState(()=>structuredClone(initialSettings));
  const [settingsDraft,setSettingsDraft] = useState(()=>structuredClone(initialSettings));
  const [screen,setScreen] = useState('library');
  const [categoryFilter,setCategoryFilter] = useState('all');
  const [statusFilter,setStatusFilter] = useState('all');
  const [query,setQuery] = useState('');
  const [sort,setSort] = useState('newest');
  const [view,setView] = useState('grid');
  const [selected,setSelected] = useState(new Set(['img-1','img-2','img-4']));
  const [approved,setApproved] = useState(new Set());
  const [activeId,setActiveId] = useState('img-1');
  const [drafts,setDrafts] = useState({});
  const [modal,setModal] = useState(null);
  const [toast,setToast] = useState(null);
  const [history,setHistory] = useState(()=>structuredClone(initialHistory));
  const [expandedBatch,setExpandedBatch] = useState('demo-batch-1');
  const [plan,setPlan] = useState(null);
  const [runtimeReady,setRuntimeReady] = useState(true);
  const [progress,setProgress] = useState(null);
  const [importFolders,setImportFolders] = useState([...initialSettings.sourceFolders]);
  const [folderInput,setFolderInput] = useState('');
  const [folderError,setFolderError] = useState('');
  const [settingsError,setSettingsError] = useState('');
  const [reviewAcknowledged,setReviewAcknowledged] = useState(false);
  const [recovery,setRecovery] = useState(false);
  const [menuOpen,setMenuOpen] = useState(false);
  const job = useRef(null), toastTimer = useRef(null);
  const cats = settings.categories;
  const catOf = id => cats.find(c=>c.id===id);
  const draftOf = img => drafts[img.id] || {title:img.analysis?.title || '',categoryId:img.analysis?.categoryId || cats.find(c=>c.enabled)?.id};
  const eligible = img => img.status==='ready' || (img.status==='review' && approved.has(img.id));
  const reviewCount = images.filter(i=>i.status==='review' && !approved.has(i.id)).length;
  const active = images.find(i=>i.id===activeId);
  const activeDraft = active && draftOf(active);
  const busy = !!progress?.running;
  const selectedImages = images.filter(i=>selected.has(i.id) && eligible(i));
  const counts = {all:images.filter(i=>i.status!=='moved').length,ready:images.filter(eligible).length,review:reviewCount,pending:images.filter(i=>i.status==='pending').length,error:images.filter(i=>i.status==='error').length,moved:images.filter(i=>i.status==='moved').length};

  const filtered = useMemo(()=>images.filter(img=>{
    if(screen==='review' && (img.status!=='review' || approved.has(img.id)))return false;
    if(screen==='library' && statusFilter!=='moved' && img.status==='moved')return false;
    if(categoryFilter!=='all' && (drafts[img.id]?.categoryId || img.analysis?.categoryId)!==categoryFilter)return false;
    if(statusFilter!=='all' && screen!=='review' && (statusFilter==='ready' ? !eligible(img) : statusFilter==='review' ? img.status!=='review'||approved.has(img.id) : img.status!==statusFilter))return false;
    return `${img.originalName} ${img.analysis?.title||''} ${img.analysis?.summary||''} ${drafts[img.id]?.title||''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase());
  }).sort((a,b)=>sort==='oldest'?a.mtimeMs-b.mtimeMs:sort==='name'?a.originalName.localeCompare(b.originalName,'zh-CN'):b.mtimeMs-a.mtimeMs),[images,screen,approved,categoryFilter,statusFilter,query,sort,drafts]);
  const grouped = useMemo(()=>{
    const groups = new Map();
    for(const img of filtered) {const day=dateOf(img.mtimeMs);if(!groups.has(day))groups.set(day,[]);groups.get(day).push(img);}
    return [...groups.entries()];
  },[filtered]);

  useEffect(()=>{setReviewAcknowledged(false);},[activeId]);
  useEffect(()=>()=>{clearTimeout(job.current?.timer);clearTimeout(toastTimer.current);},[]);
  useEffect(()=>{
    function focusSearch(e) {
      if(e.key!=='/' || e.ctrlKey || e.altKey || e.metaKey || modal)return;
      if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName))return;
      const input=document.querySelector('input[aria-label="搜索截图"]');
      if(input){e.preventDefault();input.focus();}
    }
    document.addEventListener('keydown',focusSearch);
    return ()=>document.removeEventListener('keydown',focusSearch);
  },[modal]);

  function notify(message, kind='success') {clearTimeout(toastTimer.current);setToast({message,kind});toastTimer.current=setTimeout(()=>setToast(null),4500);}
  function navigate(next,category='all') {setScreen(next);setCategoryFilter(category);setStatusFilter('all');setQuery('');setMenuOpen(false);if(next==='review')setActiveId(images.find(i=>i.status==='review'&&!approved.has(i.id))?.id);if(next==='settings'){setSettingsDraft(structuredClone(settings));setSettingsError('');}}
  function toggle(img) {if(!eligible(img))return;setSelected(prev=>{const next=new Set(prev);next.has(img.id)?next.delete(img.id):next.add(img.id);return next;});}
  function selectVisible() {const valid=filtered.filter(eligible);const all=valid.length>0&&valid.every(i=>selected.has(i.id));setSelected(prev=>{const next=new Set(prev);for(const img of valid)all?next.delete(img.id):next.add(img.id);return next;});}
  function updateDraft(id,key,value) {const img=images.find(i=>i.id===id);setDrafts(prev=>({...prev,[id]:{...draftOf(img),[key]:value}}));setPlan(null);}
  function newName(img,choice=draftOf(img)) {return `${dateOf(img.mtimeMs)}_${cleanTitle(choice.title)||'内容标题'}.${img.originalName.split('.').pop()}`;}

  function startJob(phase,items,onItem,onComplete,message) {
    if(busy)return;
    const session={phase,items,index:0,onComplete,onItem,timer:null};job.current=session;
    setProgress({phase,done:0,total:items.length,message,running:true});
    const step=()=>{
      if(job.current!==session)return;
      const item=items[session.index];onItem?.(item,session.index);session.index++;
      setProgress({phase,done:session.index,total:items.length,message:typeof item==='string'?item:item?.analysis?.title||item?.originalName||message,running:true});
      if(session.index>=items.length){job.current=null;setProgress(null);onComplete?.();}
      else session.timer=setTimeout(step,680);
    };
    session.timer=setTimeout(step,650);
  }
  function stopJob() {const session=job.current;if(!session)return;clearTimeout(session.timer);job.current=null;setProgress(null);notify(`已停止，完成的 ${session.index} 项已保留。`,'info');}
  function scan() {
    if(!settings.sourceFolders.length){setImportFolders([]);setModal('import');return;}
    startJob('scan',images.filter(i=>i.status!=='moved'),null,()=>notify('扫描完成：示例图库已更新。'),'正在检查来源文件夹');
  }
  function recognize(forceIds) {
    if(!runtimeReady){setModal('model');return;}
    const targets=forceIds ? images.filter(i=>forceIds.includes(i.id)&&i.status!=='moved') : selectedImages.length ? selectedImages : images.filter(i=>i.status==='pending');
    if(!targets.length){notify('请先选择截图，或扫描未识别的图片。','info');return;}
    startJob('analyze',targets,(img)=>{
      if(img.status==='error')return;
      if(img.status==='pending')setImages(prev=>prev.map(i=>i.id===img.id?{...i,status:'ready',analysis:{categoryId:'work',title:'课件打印与课程通知待办事项',summary:'便签记录打印课件、检查课程通知和整理截图的待办事项。',needsReview:false}}:i));
    },()=>notify(`识别演示完成，共处理 ${targets.length} 张截图。`),'正在本地识别截图');
  }
  function confirmReview() {
    if(!activeDraft?.title.trim()||!reviewAcknowledged)return;
    setApproved(prev=>new Set(prev).add(activeId));setSelected(prev=>new Set(prev).add(activeId));notify('已确认，加入本次整理选择。');
    if(screen==='review')setActiveId(images.find(i=>i.status==='review'&&i.id!==activeId&&!approved.has(i.id))?.id);
  }
  function buildPreview() {
    if(!selectedImages.length)return;
    const names=new Set();const items=selectedImages.map(img=>{
      const choice=draftOf(img);const title=cleanTitle(choice.title);
      if(!title)throw new Error('请为所选截图填写内容标题。');
      const category=catOf(choice.categoryId);if(!category?.enabled)throw new Error('所选截图包含已停用分类，请重新选择分类。');
      let name=newName(img);let stem=name.slice(0,name.lastIndexOf('.')),ext=name.slice(name.lastIndexOf('.')),suffix=2;
      while(names.has(`${category.id}/${name}`.toLowerCase()))name=`${stem}_${String(suffix++).padStart(2,'0')}${ext}`;
      names.add(`${category.id}/${name}`.toLowerCase());
      return {imageId:img.id,source:img.path,target:`${settings.outputFolder}\\${category.name}\\${name}`,categoryId:category.id,title};
    });
    setPlan({id:`demo-plan-${Date.now()}`,createdAt:new Date().toISOString(),outputFolder:settings.outputFolder,items});setModal('plan');
  }
  function applyPlan() {
    const batch={id:`demo-batch-${Date.now()}`,createdAt:new Date().toISOString(),kind:'organize',planId:plan.id,records:[]};
    setHistory(prev=>[batch,...prev]);setModal(null);
    startJob('apply',plan.items,(item)=>{
      const record={id:`demo-move-${item.imageId}`,batchId:batch.id,item,stage:'committed',targetOwned:true,direction:'forward'};
      setHistory(prev=>prev.map(b=>b.id===batch.id?{...b,records:[...b.records,record]}:b));
      setImages(prev=>prev.map(i=>i.id===item.imageId?{...i,status:'moved',path:item.target}:i));
      setSelected(prev=>{const next=new Set(prev);next.delete(item.imageId);return next;});
    },()=>{notify(`整理演示完成，共 ${plan.items.length} 张；可在整理记录中撤销。`);setPlan(null);},'正在整理所选截图');
  }
  function undoBatch(batch) {
    const records=batch.records.filter(r=>r.stage==='committed');setModal(null);
    startJob('undo',records,(record)=>{
      setHistory(prev=>prev.map(b=>b.id===batch.id?{...b,records:b.records.map(r=>r.id===record.id?{...r,stage:'undone',direction:'undo'}:r)}:b));
      setImages(prev=>prev.map(i=>i.id===record.item.imageId?{...i,status:i.analysis?.needsReview?'review':'ready',path:record.item.source}:i));
    },()=>notify('撤销演示完成，截图已恢复原位置与原名。'),'正在撤销本次整理');
  }
  function saveSettings() {
    const enabled=settingsDraft.categories.filter(c=>c.enabled);
    if(!enabled.length){setSettingsError('请至少启用一个分类。');return;}
    const names=settingsDraft.categories.map(c=>c.name.trim().toLowerCase());
    if(names.some(n=>!n)||new Set(names).size!==names.length){setSettingsError('分类名称不能为空或重复。');return;}
    if(settingsDraft.categories.some(c=>/[<>:"/\\|?*]/.test(c.name))){setSettingsError('分类名称不能包含文件夹名称禁用的字符。');return;}
    const root='D:\\Projects\\ScreenshotOrganizer\\output';
    const normalized=settingsDraft.outputFolder.replaceAll('/','\\').replace(/\\+$/,'');
    if(!(normalized.toLowerCase()===root.toLowerCase()||normalized.toLowerCase().startsWith(root.toLowerCase()+'\\'))||normalized.split('\\').includes('..')){setSettingsError('整理目录必须位于本项目的 output 文件夹内。');return;}
    setSettings({...settingsDraft,outputFolder:normalized});setSettingsError('');notify('设置已应用到本次原型预览。');
  }

  function renderCard(img) {
    const chosen=selected.has(img.id), focused=activeId===img.id;
    const category=catOf(draftOf(img).categoryId);
    return <article key={img.id} className={`shot-card ${chosen?'chosen':''} ${focused?'active':''} ${view==='list'?'shot-row':''}`}>
      <div className="shot-preview"><button className="shot-open" onClick={()=>setActiveId(img.id)} aria-label={`查看 ${img.analysis?.title||img.originalName}`}>{img.preview?<img src={img.preview} alt={img.analysis?.title||'截图示例'} loading="lazy"/>:<div className="broken-preview"><Icon name="image" size={35}/><span>无法读取图片</span></div>}</button><div className="shot-check"><Check checked={chosen} onChange={()=>toggle(img)} label={`选择 ${img.analysis?.title||img.originalName}`} disabled={!eligible(img)||busy}/></div>{img.kind==='long'&&<span className="long-label">长截图</span>}{focused&&<span className="active-indicator">正在查看</span>}</div>
      <button className="shot-info" onClick={()=>setActiveId(img.id)}><span className="shot-title">{draftOf(img).title||img.originalName}</span><span className="shot-meta"><CategoryBadge category={img.analysis?category:null}/><span className="shot-time">{TIME.format(new Date(img.mtimeMs))}</span></span></button>
      {(img.status==='review'||img.status==='error'||img.status==='pending'||approved.has(img.id))&&<div className="shot-status"><Badge status={img.status} approved={approved.has(img.id)}/></div>}
    </article>;
  }

  return <div className="desktop-shell">
    <header className="titlebar"><span className="titlebar-label"><Mark/><span>拾图 <span className="titlebar-sub">/ 截图整理助手</span></span></span><span className="prototype-label"><span/>交互原型 · 示例数据</span><span className="window-decoration" aria-hidden="true"><i>−</i><i>□</i><i>×</i></span></header>
    <div className="app-body">
      <aside className={`sidebar ${menuOpen?'sidebar-open':''}`}><div className="sidebar-brand"><Mark/><div><strong>拾图</strong><span>让截图各归其位</span></div></div>
        <div className="nav-label">截图库</div><nav aria-label="主导航"><button className={`nav-item ${screen==='library'&&categoryFilter==='all'?'current':''}`} onClick={()=>navigate('library')}><Icon name="grid"/><span>全部截图</span><b>{counts.all}</b></button><button className={`nav-item ${screen==='review'?'current':''}`} onClick={()=>navigate('review')}><Icon name="review"/><span>待确认</span>{reviewCount>0&&<b className="review-count">{reviewCount}</b>}</button><button className={`nav-item ${screen==='history'?'current':''}`} onClick={()=>navigate('history')}><Icon name="history"/><span>整理记录</span></button></nav>
        <div className="nav-label nav-category-label"><span>分类</span><button className="quiet-icon" aria-label="管理分类" onClick={()=>navigate('settings')}><Icon name="settings" size={14}/></button></div><nav aria-label="分类导航">{cats.filter(c=>c.enabled).map(cat=><button key={cat.id} className={`nav-item category-nav ${screen==='library'&&categoryFilter===cat.id?'current':''}`} onClick={()=>navigate('library',cat.id)}><span className="category-icon" style={{color:cat.color,background:cat.tint}}><Icon name={cat.icon} size={15}/></span><span>{cat.name}</span><b>{images.filter(i=>i.status!=='moved'&&draftOf(i).categoryId===cat.id&&i.analysis).length}</b></button>)}</nav>
        <div className="sidebar-bottom"><button className="local-card" onClick={()=>setModal('model')}><span className={`local-icon ${!runtimeReady?'not-ready':''}`}><Icon name="monitor" size={18}/></span><span><strong>{runtimeReady?'本地识别已就绪':'准备本地识别'}</strong><small>Qwen3-VL · 4B</small></span><span className={`live-dot ${!runtimeReady?'not-ready':''}`}/></button><button className={`nav-item ${screen==='settings'?'current':''}`} onClick={()=>navigate('settings')}><Icon name="settings"/><span>设置</span></button><button className="nav-item" onClick={()=>setModal('help')}><Icon name="help"/><span>使用说明</span></button><div className="privacy-note"><Icon name="shield" size={13}/><span>识别在本机完成</span><small>v0.1</small></div></div>
      </aside>
      <main className={`workspace ${screen==='history'||screen==='settings'?'workspace-full':''}`}>
        <header className="workspace-header"><div className="page-heading"><button className="icon-button mobile-menu" aria-label="展开导航" onClick={()=>setMenuOpen(!menuOpen)}><Icon name="menu"/></button><div><div className="eyebrow">{{library:"YOUR CAPTURE LIBRARY",review:"REVIEW YOUR CAPTURES",history:"ORGANIZATION HISTORY",settings:"WORKSPACE PREFERENCES"}[screen]}</div><h1>{screen==='library'?(categoryFilter==='all'?'全部截图':catOf(categoryFilter)?.name):screen==='review'?'待确认':screen==='history'?'整理记录':'设置'}{screen==='library'&&<span>{filtered.length}</span>}</h1><p>{screen==='review'?'这些截图需要你确认内容，确认后再加入整理。':screen==='history'?'每次整理都有记录，随时找回原位置与原名。':screen==='settings'?'选择来源、调整分类，让整理符合你的习惯。':'留住有用的片段，整理成找得到的文件。'}</p></div></div><div className="header-actions">{(screen==='library'||screen==='review')&&<><Button icon="folder" onClick={()=>{setImportFolders([...settings.sourceFolders]);setFolderError('');setModal('import');}} disabled={busy}>选择文件夹</Button><Button icon="sparkle" variant="primary" onClick={()=>recognize()} disabled={busy}>{selectedImages.length?'识别所选':'开始识别'}</Button></>}{screen==='settings'&&<Button variant="primary" icon="check" onClick={saveSettings} disabled={busy}>保存设置</Button>}</div></header>
        {busy&&<div className="progress-banner" role="status"><span className="spinner"/><div><strong>{{scan:'扫描截图',analyze:'本地识别',apply:'整理截图',undo:'撤销整理',setup:'准备本地模型'}[progress.phase]}</strong><span>{progress.message}</span></div><span className="progress-numbers">{progress.done} / {progress.total}</span><div className="progress-track"><i style={{width:`${progress.total?progress.done/progress.total*100:0}%`}}/></div><Button icon="stop" onClick={stopJob}>停止</Button></div>}
        {(screen==='library'||screen==='review')&&<>
          <div className="source-strip"><span className="source-folder"><Icon name="folder" size={16}/><strong>{settings.sourceFolders.length?fileName(settings.sourceFolders[0]):'未选择来源'}</strong>{settings.sourceFolders.length>1&&<span className="source-extra">+{settings.sourceFolders.length-1}</span>}<span className="source-path" title={settings.sourceFolders.join('\n')}>{settings.sourceFolders[0]||'先选择一个截图文件夹'}</span></span><button className="text-button" onClick={scan} disabled={busy}><Icon name="refresh" size={14}/><span>重新扫描</span></button></div>
          <section className="library-tools" aria-label="截图筛选"><div className="status-tabs" role="group" aria-label="按状态筛选">{(screen==='review'?[['all','待人工确认',reviewCount]]:[['all','全部',counts.all],['ready','已识别',counts.ready],['review','待确认',reviewCount],['pending','未识别',counts.pending],['error','失败',counts.error],...(counts.moved?[['moved','已整理',counts.moved]]:[])]).map(([key,label,count])=><button key={key} className={statusFilter===key?'selected':''} onClick={()=>setStatusFilter(key)}>{label}<span>{count}</span></button>)}</div><label className="search-box"><Icon name="search" size={16}/><input type="search" placeholder="搜索标题、文件名或摘要" aria-label="搜索截图" value={query} onChange={e=>setQuery(e.target.value)}/><kbd>/</kbd></label></section>
          <div className="gallery-heading"><div><Check checked={filtered.filter(eligible).length>0&&filtered.filter(eligible).every(i=>selected.has(i.id))} onChange={selectVisible} label="选择当前筛选中的可整理截图" disabled={busy||!filtered.some(eligible)}/><span>{selectedImages.length?`已选择 ${selectedImages.length} 张`:'选择要整理的截图'}</span>{screen==='review'&&<span className="review-explanation"><Icon name="shield" size={13}/>待确认截图不会自动选中</span>}</div><div className="gallery-options"><select value={sort} onChange={e=>setSort(e.target.value)} aria-label="截图排序"><option value="newest">最新在前</option><option value="oldest">最早在前</option><option value="name">按文件名</option></select><span className="option-divider"/><div className="view-toggle"><button className={view==='grid'?'selected':''} onClick={()=>setView('grid')} aria-label="网格视图" aria-pressed={view==='grid'}><Icon name="grid" size={15}/></button><button className={view==='list'?'selected':''} onClick={()=>setView('list')} aria-label="列表视图" aria-pressed={view==='list'}><Icon name="list" size={16}/></button></div></div></div>
          <div className="gallery-scroll">{filtered.length?grouped.map(([day,entries])=><section className="date-group" key={day}><header><h2>{day==='2026-10-09'?'今天':day==='2026-10-08'?'昨天':day}<span>{day}</span></h2><span>{entries.length} 张</span><div/></header><div className={`shot-grid ${view==='list'?'list-view':''}`}>{entries.map(renderCard)}</div></section>):<div className="empty-state"><span><Icon name={screen==='review'?'check':'search'} size={30}/></span><h2>{screen==='review'?'待确认截图都处理好了':query?'没有找到匹配的截图':'这里还没有截图'}</h2><p>{screen==='review'?'回到截图库，预览这次的整理结果。':query?'试试简短的标题关键词，或清除筛选条件。':'选择来源文件夹，再扫描图片。'}</p><Button icon={screen==='review'?'grid':'refresh'} onClick={()=>{navigate('library');if(!images.length)scan();}}>{screen==='review'?'返回截图库':'清除筛选'}</Button></div>}</div>
          <footer className="selection-bar"><div><span className="selection-symbol"><Icon name="check" size={17}/></span><span><strong>{selectedImages.length?`已选择 ${selectedImages.length} 张截图`:'选择截图后，预览整理结果'}</strong><small>{selectedImages.length?`${sizeOf(selectedImages.reduce((sum,i)=>sum+i.bytes,0))} · 核对文件名后再移动`:'可在右侧修改标题与分类'}</small></span>{selectedImages.length>0&&<button className="text-button selection-clear" onClick={()=>setSelected(new Set())} disabled={busy}>取消选择</button>}</div><Button icon="arrow" variant="primary" className="preview-button" disabled={!selectedImages.length||busy} onClick={()=>{try{buildPreview();}catch(e){notify(e.message,'error');}}}>整理预览<span className="button-count">{selectedImages.length}</span></Button></footer>
        </>}
        {screen==='history'&&<div className="content-scroll history-page"><div className="history-summary"><span><Icon name="history" size={22}/></span><div><h2>每一步，都有迹可循</h2><p>整理记录保留原文件名和路径。撤销前会检查文件与路径是否发生变化。</p></div><div className="history-demo-actions"><Button icon="undo" onClick={()=>setModal('conflict')} disabled={busy}>撤销冲突示例</Button><Button icon="warning" onClick={()=>{setRecovery(true);setModal('recovery');}} disabled={busy}>查看恢复示例</Button></div></div>{history.length?history.map(batch=>{
          const completed=batch.records.filter(r=>r.stage==='committed').length,undone=batch.records.filter(r=>r.stage==='undone').length;
          return <section key={batch.id} className="batch-card"><header><button className="batch-expand" onClick={()=>setExpandedBatch(expandedBatch===batch.id?null:batch.id)} aria-expanded={expandedBatch===batch.id}><span className="batch-symbol"><Icon name="folder" size={21}/></span><span><strong>整理 {batch.records.length} 张截图</strong><small>{dateOf(Date.parse(batch.createdAt))} · {TIME.format(new Date(batch.createdAt))}</small></span></button><Badge status={undone===batch.records.length&&undone>0?'pending':'moved'} label={undone===batch.records.length&&undone>0?'已撤销':'已整理'}/><span className="batch-result">{undone?`${undone} 张已撤销`:`${completed} 张完成`}</span><Button icon="undo" disabled={busy||!completed} onClick={()=>setModal({type:'undo',batch})}>撤销本次整理</Button></header>{expandedBatch===batch.id&&<div className="batch-records">{batch.records.map(record=><div key={record.id} className="history-record"><CategoryBadge category={catOf(record.item.categoryId)}/><div><strong>{fileName(record.item.target)}</strong><small><Icon name="undo" size={11}/>{record.item.source}</small></div><span className={`record-state ${record.stage==='undone'?'undone':''}`}>{record.stage==='undone'?'已恢复原名':'整理完成'}</span></div>)}</div>}</section>;
        }):<div className="empty-state"><Icon name="history" size={30}/><h2>还没有整理记录</h2><p>整理一批截图后，可以在这里查看和撤销。</p><Button onClick={()=>navigate('library')}>返回截图库</Button></div>}<div className="info-note"><Icon name="shield" size={17}/><span>原位置已有文件或整理后的内容发生变化时，撤销会提示冲突，由你核对处理。</span></div></div>}
        {screen==='settings'&&<div className="content-scroll settings-page">{settingsError&&<div className="error-note" role="alert"><Icon name="warning" size={17}/>{settingsError}</div>}
          <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Icon name="folder" size={21}/></span><div><h2>来源与整理位置</h2><p>从选定文件夹读取截图，将确认后的文件整理到新位置。</p></div></div><div className="settings-field"><label>截图来源</label><div>{settingsDraft.sourceFolders.map((folder,i)=><div key={i} className="folder-field"><Icon name="folder" size={17}/><span>{folder}</span><button className="icon-button" aria-label={`移除来源 ${folder}`} onClick={()=>setSettingsDraft({...settingsDraft,sourceFolders:settingsDraft.sourceFolders.filter((_,j)=>j!==i)})} disabled={busy}><Icon name="close" size={15}/></button></div>)}<button className="text-button" onClick={()=>{setImportFolders([...settingsDraft.sourceFolders]);setFolderError('');setModal('import-settings');}} disabled={busy}><Icon name="plus" size={15}/>添加来源文件夹</button><label className="setting-check"><Check checked={settingsDraft.recursive} onChange={e=>setSettingsDraft({...settingsDraft,recursive:e.target.checked})} label="包含子文件夹" disabled={busy}/><span>包含子文件夹</span></label></div></div><div className="settings-field"><label htmlFor="output-folder">整理到</label><div><input id="output-folder" className="text-input path-input" value={settingsDraft.outputFolder} onChange={e=>setSettingsDraft({...settingsDraft,outputFolder:e.target.value})} disabled={busy}/><p className="field-hint">位于本项目 output 文件夹内。每个分类会使用单独的子文件夹。</p></div></div></section>
          <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Icon name="grid" size={21}/></span><div><h2>分类规则</h2><p>分类描述帮助本地模型理解哪些截图属于这一类。</p></div><Button icon="plus" disabled={busy||settingsDraft.categories.length>=40} onClick={()=>setSettingsDraft({...settingsDraft,categories:[...settingsDraft.categories,{id:`custom_${Date.now()}`,name:'新分类',description:'',enabled:true,icon:'folder',color:'#7885A1',tint:'#EEF0F6'}]})}>添加分类</Button></div><div className="category-editor">{settingsDraft.categories.map((cat,i)=><div className="category-edit-row" key={cat.id}><span className="category-icon" style={{color:cat.color,background:cat.tint}}><Icon name={cat.icon} size={18}/></span><input aria-label={`分类名称 ${cat.name}`} maxLength={30} className="text-input category-name-input" value={cat.name} disabled={busy} onChange={e=>setSettingsDraft({...settingsDraft,categories:settingsDraft.categories.map((c,j)=>j===i?{...c,name:e.target.value}:c)})}/><input aria-label={`分类描述 ${cat.name}`} maxLength={300} className="text-input category-description-input" value={cat.description} placeholder="描述这一类截图的内容" disabled={busy} onChange={e=>setSettingsDraft({...settingsDraft,categories:settingsDraft.categories.map((c,j)=>j===i?{...c,description:e.target.value}:c)})}/><label className="switch"><input type="checkbox" checked={cat.enabled} disabled={busy} aria-label={`启用 ${cat.name}`} onChange={e=>setSettingsDraft({...settingsDraft,categories:settingsDraft.categories.map((c,j)=>j===i?{...c,enabled:e.target.checked}:c)})}/><span/></label></div>)}</div></section>
          <section className="settings-section"><div className="settings-section-heading"><span className="settings-icon"><Icon name="monitor" size={21}/></span><div><h2>本地识别</h2><p>图片在本机识别，首次准备时需要下载模型。</p></div></div><div className="settings-field"><label>当前模型</label><div className="model-setting"><strong>Qwen3-VL · 4B</strong><Badge status={runtimeReady?'ready':'pending'}/><Button icon="refresh" disabled={busy} onClick={()=>setModal('model')}>管理模型</Button></div></div><div className="settings-field"><label htmlFor="timeout">单张识别超时</label><div><select id="timeout" className="text-input timeout-input" value={settingsDraft.recognitionTimeoutMs} disabled={busy} onChange={e=>setSettingsDraft({...settingsDraft,recognitionTimeoutMs:Number(e.target.value)})}>{[30000,60000,180000,300000,600000].map(n=><option key={n} value={n}>{n/1000} 秒{n===180000?'（默认）':''}</option>)}</select><p className="field-hint">遇到超时可重试。长截图通常需要更多处理时间。</p></div></div></section>
          <div className="info-note"><Icon name="image" size={17}/><span>支持 PNG、JPG / JPEG、WebP、BMP；不会扫描整理输出目录或文件夹链接。</span></div>
        </div>}
      </main>
      {(screen==='library'||screen==='review')&&<aside className={`inspector ${active?'has-active':''}`} aria-label="截图详情">{active?<>
        <header className="inspector-header"><span>截图详情</span><button className="quiet-icon" aria-label="关闭截图详情" onClick={()=>setActiveId(null)}><Icon name="close" size={16}/></button></header><div className="inspector-scroll"><button className={`detail-image ${active.kind==='long'?'detail-long':''}`} onClick={()=>active.preview&&setModal('image')} aria-label="放大查看截图" disabled={!active.preview}>{active.preview?<img src={active.preview} alt={active.analysis?.title||'截图示例'}/>:<div className="broken-preview"><Icon name="image" size={33}/><span>图片无法读取</span></div>}{active.preview&&<span className="zoom-tag"><Icon name="zoom" size={14}/>放大</span>}</button><div className="detail-meta"><span>{active.width} × {active.height}</span><span>{sizeOf(active.bytes)}</span><span>{active.originalName.split('.').pop().toUpperCase()}</span></div><div className="recognition-label"><span><Icon name="sparkle" size={15}/>{active.status==='pending'?'等待识别':'识别结果'}</span><Badge status={active.status} approved={approved.has(active.id)}/></div>
        {active.status==='error'?<div className="error-state"><Icon name="warning" size={23}/><h3>这张截图暂时无法读取</h3><p>{active.error}</p><Button icon="refresh" disabled={busy} onClick={()=>notify('重新扫描演示：此示例图片仍无法读取，请检查原文件。','error')}>重新扫描</Button></div>:active.status==='pending'?<div className="pending-state"><Icon name="scan" size={26}/><h3>还没有识别这张截图</h3><p>本地识别后，会生成分类、标题和摘要。</p><Button icon="sparkle" variant="primary" onClick={()=>recognize([active.id])} disabled={busy}>识别这张截图</Button></div>:<>
          {active.status==='review'&&!approved.has(active.id)&&<div className="review-note"><Icon name="review" size={16}/><span>内容还不够确定，请对照原图核对。</span></div>}
          <label className="detail-field"><span>内容标题 <small>可修改</small></span><textarea aria-label="内容标题" rows={2} maxLength={200} value={activeDraft.title} onChange={e=>updateDraft(active.id,'title',e.target.value)} disabled={busy||active.status==='moved'}/></label>
          <label className="detail-field"><span>分类</span><div className="category-select"><span style={{color:catOf(activeDraft.categoryId)?.color}}><Icon name={catOf(activeDraft.categoryId)?.icon||'folder'} size={17}/></span><select aria-label="截图分类" value={activeDraft.categoryId} onChange={e=>updateDraft(active.id,'categoryId',e.target.value)} disabled={busy||active.status==='moved'}>{cats.filter(c=>c.enabled).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select><Icon name="down" size={14}/></div></label>
          <div className="detail-summary"><span>内容摘要</span><p>{active.analysis?.summary}</p></div>
          <div className="naming-ticket"><div className="naming-ticket-heading"><Icon name="folder" size={14}/><span>整理后文件名</span></div><div className="naming-flow"><div><span className="flow-dot"/><small>原文件名</small><code>{active.originalName}</code></div><div><span className="flow-dot flow-dot-new"/><small>{catOf(activeDraft.categoryId)?.name} /</small><code className="new-filename">{newName(active)}</code></div></div><p>日期取自截图文件的修改时间</p></div>
          
        </>}
        </div><footer className="inspector-footer">{active.status==='review'&&!approved.has(active.id)&&<label className="review-ack"><Check checked={reviewAcknowledged} onChange={e=>setReviewAcknowledged(e.target.checked)} label="我已核对截图内容" disabled={busy}/><span>我已核对截图内容</span></label>}{active.status==='review'&&!approved.has(active.id)?<Button variant="primary" icon="check" disabled={busy||!reviewAcknowledged||!activeDraft.title.trim()} onClick={confirmReview}>确认并加入整理</Button>:<Button icon="external" onClick={()=>notify('桌面整合后，此操作会打开截图所在文件夹。','info')}>打开所在文件夹</Button>}{active.analysis&&active.status!=='moved'&&<button className="text-button" disabled={busy} onClick={()=>recognize([active.id])}><Icon name="refresh" size={13}/>重新识别</button>}</footer>
      </>:<div className="inspector-empty"><Icon name="image" size={32}/><h3>点开一张截图</h3><p>在这里核对分类与文件名。</p></div>}</aside>}
    </div>

    {(modal==='import'||modal==='import-settings')&&<Modal title="选择截图来源" subtitle="可添加多个文件夹，一起扫描和整理。" onClose={()=>setModal(null)} footer={<><span className="footer-hint">原型中输入路径即可演示</span><Button variant="primary" icon="scan" disabled={!importFolders.length||busy} onClick={()=>{if(modal==='import-settings')setSettingsDraft({...settingsDraft,sourceFolders:importFolders});else setSettings({...settings,sourceFolders:importFolders});setModal(null);notify('来源已添加到本次原型。');}}>使用这些文件夹</Button></>}><div className="import-visual"><Icon name="folder" size={35}/><div><strong>从散落的截图开始</strong><p>支持 PNG、JPG、WebP、BMP</p></div></div><div className="import-folders">{importFolders.map((folder,i)=><div className="folder-field" key={i}><Icon name="folder"/><span>{folder}</span><button className="icon-button" aria-label={`移除 ${folder}`} onClick={()=>setImportFolders(importFolders.filter((_,j)=>j!==i))}><Icon name="close" size={15}/></button></div>)}</div><label className="detail-field"><span>文件夹路径</span><div className="folder-add"><input className="text-input" aria-label="新增来源文件夹路径" placeholder="例如 D:\Pictures\Screenshots" value={folderInput} onChange={e=>setFolderInput(e.target.value)}/><Button icon="plus" onClick={()=>{const value=folderInput.trim().replaceAll('/','\\');if(!/^[A-Za-z]:\\/.test(value)){setFolderError('请输入完整的 Windows 文件夹路径。');return;}if(importFolders.some(f=>f.toLowerCase()===value.toLowerCase())){setFolderError('此文件夹已在列表中。');return;}setImportFolders([...importFolders,value]);setFolderInput('');setFolderError('');}}>添加</Button></div></label>{folderError&&<p className="form-error" role="alert">{folderError}</p>}<div className="info-note"><Icon name="shield" size={17}/><span>扫描只读取图片。确认整理预览前，不会移动文件。</span></div></Modal>}
    {modal==='plan'&&plan&&<Modal title="整理预览" subtitle={`核对这 ${plan.items.length} 张截图的分类与文件名，然后确认移动。`} wide onClose={()=>setModal(null)} footer={<><span className="footer-hint"><Icon name="undo" size={14}/>完成后可在整理记录中撤销</span><Button onClick={()=>setModal(null)}>返回修改</Button><Button variant="primary" icon="arrow" onClick={applyPlan}>确认整理 {plan.items.length} 张</Button></>}><div className="plan-destination"><span><Icon name="folder" size={21}/></span><div><small>整理到</small><code>{plan.outputFolder}</code></div></div><div className="plan-table"><div className="plan-table-head"><span>截图 / 原文件名</span><span>分类</span><span>整理后文件名</span></div>{plan.items.map(item=>{const img=images.find(i=>i.id===item.imageId);return <div className="plan-row" key={item.imageId}><div className="plan-source"><img src={img.preview} alt=""/><div><strong>{item.title}</strong><code>{img.originalName}</code></div></div><CategoryBadge category={catOf(item.categoryId)}/><div className="plan-target"><Icon name="arrow" size={14}/><div><code>{fileName(item.target)}</code><small className="complete-target">{item.target}</small></div></div></div>;})}</div><div className="plan-notes"><p><Icon name="check" size={14}/>按分类建立文件夹；文件名使用“日期_内容标题”。</p><p><Icon name="check" size={14}/>遇到重名会自动追加序号，不覆盖已有文件。</p><p><Icon name="warning" size={14}/>确认后会移动原文件。当前原型仅演示，不操作真实文件。</p></div></Modal>}
    {modal==='image'&&active&&<Modal title={activeDraft.title||active.originalName} subtitle={`${active.width} × ${active.height} · ${active.originalName}`} wide onClose={()=>setModal(null)}><div className={`full-image ${active.kind==='long'?'full-image-long':''}`}><img src={active.preview} alt={activeDraft.title||'截图示例'}/></div></Modal>}
    {modal==='model'&&<Modal title="本地识别" subtitle="第一次准备完成后，可以离线识别截图。" onClose={()=>setModal(null)} footer={<><Button onClick={()=>setModal(null)}>关闭</Button><Button variant="primary" icon="refresh" disabled={busy} onClick={()=>{setModal(null);startJob('setup',['检查运行环境','准备 Qwen3-VL · 4B','验证本地服务'],null,()=>{setRuntimeReady(true);notify('模型准备演示完成。');},'正在准备本地模型');}}>{runtimeReady?'检查本地环境':'准备本地模型'}</Button></>}><div className="model-hero"><span><Icon name="monitor" size={33}/></span><div><h3>Qwen3-VL <b>4B</b></h3><p>本地视觉模型</p></div><Badge status={runtimeReady?'ready':'pending'}/></div><div className="model-steps">{[['运行环境','Ollama 本地运行环境'],['本地服务','仅连接本机识别服务'],['视觉模型','Qwen3-VL · 4B']].map(([title,desc],i)=><div key={title}><span className={runtimeReady?'step-ready':''}><Icon name={runtimeReady?'check':'clock'} size={15}/></span><div><strong>{title}</strong><small>{desc}</small></div><span>{runtimeReady?'已就绪':'待准备'}</span></div>)}</div><div className="info-note"><Icon name="shield" size={17}/><span>图片留在本机。首次准备需要下载环境和模型；任务运行中可以停止。</span></div><button className="text-button demo-state-control" onClick={()=>setRuntimeReady(!runtimeReady)}>演示切换：{runtimeReady?'模型未准备':'模型已就绪'}</button></Modal>}
    {modal==='help'&&<Modal title="把截图整理成找得到的文件" subtitle="拾图 · 截图整理助手" onClose={()=>setModal(null)}><ol className="help-steps">{[['选择来源','添加一个或多个截图文件夹，并扫描图片。'],['本地识别','为截图生成分类、内容标题与摘要。'],['核对结果','修改标题或分类；待确认项需人工检查后加入整理。'],['预览并整理','确认新文件名与目标位置，再移动原文件。'],['需要时撤销','在整理记录中恢复原位置和原名；冲突项需先核对。']].map(([title,desc])=><li key={title}><strong>{title}</strong><p>{desc}</p></li>)}</ol><div className="info-note"><Icon name="image" size={17}/><span>这是独立交互原型，使用示例截图；所有操作均为模拟，不连接业务程序。</span></div></Modal>}
    {modal?.type==='undo'&&<Modal title="撤销这次整理？" subtitle={`将 ${modal.batch.records.filter(r=>r.stage==='committed').length} 张截图恢复到原位置与原文件名。`} onClose={()=>setModal(null)} footer={<><Button onClick={()=>setModal(null)}>保留整理结果</Button><Button variant="primary" icon="undo" onClick={()=>undoBatch(modal.batch)}>确认撤销</Button></>}><div className="info-note"><Icon name="shield" size={20}/><span>撤销前会检查原位置是否被占用、整理后的文件是否改变。遇到冲突会保留文件并提示处理。</span></div></Modal>}
    {modal==='recovery'&&recovery&&<Modal title="发现一项未完成的整理" subtitle="此示例在文件复制完成后中断，需要选择如何恢复。" onClose={()=>setModal(null)} footer={<><Button icon="undo" onClick={()=>{setRecovery(false);setModal(null);notify('回滚演示完成，原文件已保留。');}}>回滚到原位置</Button><Button icon="arrow" variant="primary" onClick={()=>{setRecovery(false);setModal(null);notify('恢复演示完成，已继续完成此项整理。');}}>继续完成整理</Button></>}><div className="recovery-phase"><Icon name="warning" size={21}/><div><strong>已完成复制与校验</strong><p>下一步：确认文件完整后完成移动。</p></div></div><div className="recovery-path"><small>原位置</small><code>{recoveryExample.item.source}</code><Icon name="arrow" size={17}/><small>整理位置</small><code>{recoveryExample.item.target}</code></div><p className="field-hint">恢复时会重新检查文件。无法确认的情况会保留两侧文件，等待人工核对。</p></Modal>}
    {modal==='conflict'&&<Modal title="这张截图暂时不能撤销" subtitle="原位置已有同名文件，需要先核对冲突。" onClose={()=>setModal(null)} footer={<><Button onClick={()=>setModal(null)}>稍后处理</Button><Button variant="primary" icon="external" onClick={()=>notify('桌面整合后会打开原位置，供你核对同名文件。','info')}>查看原位置</Button></>}><div className="recovery-phase"><Icon name="warning" size={21}/><div><strong>已保留整理后的截图</strong><p>没有覆盖原位置的同名文件。其他截图可继续撤销。</p></div></div><div className="recovery-path"><small>被占用的原位置</small><code>{recoveryExample.item.source}</code><small>当前截图位置</small><code>{recoveryExample.item.target}</code></div><div className="info-note"><Icon name="shield" size={17}/><span>核对同名文件后，修改占用文件的名称或位置，再回到整理记录重试撤销。</span></div></Modal>}
    {toast&&<div className={`toast toast-${toast.kind}`} role="status"><span><Icon name={toast.kind==='error'?'warning':toast.kind==='info'?'help':'check'} size={17}/></span><p>{toast.message}</p><button className="quiet-icon" aria-label="关闭提示" onClick={()=>setToast(null)}><Icon name="close" size={14}/></button></div>}
  </div>;
}

createRoot(document.getElementById('root')).render(<App/>);
