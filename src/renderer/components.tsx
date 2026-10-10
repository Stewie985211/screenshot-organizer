import React, {useEffect, useRef} from 'react';
import {Icon} from './icons';
import type {ImageStatus} from '../shared/types';
import type {VisualCategory} from './ui';

export function Check({checked,onChange,label,disabled=false}: {checked:boolean;onChange:React.ChangeEventHandler<HTMLInputElement>;label:string;disabled?:boolean}) {
  return <label className={`checkbox ${disabled?'disabled':''}`}><input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} aria-label={label}/><span><Icon name="check" size={12}/></span></label>;
}
export function Badge({status,approved=false,label}: {status:ImageStatus;approved?:boolean;label?:string}) {
  return <span className={`status status-${approved?'ready':status}`}><span className="status-dot"/>{label||(approved?'人工确认':{ready:'已识别',review:'待确认',pending:'未识别',error:'读取失败',moved:'已整理'}[status])}</span>;
}
export function CategoryBadge({category}: {category?:VisualCategory|null}) {
  return category?<span className="category-badge" style={{'--cat-color':category.color,'--cat-tint':category.tint} as React.CSSProperties}><Icon name={category.icon} size={12}/>{category.name}</span>:<span className="muted small">未分类</span>;
}
export function Button({children,icon,variant='secondary',className='',...props}: React.ButtonHTMLAttributes<HTMLButtonElement>&{icon?:string;variant?:string}) {
  return <button className={`button button-${variant} ${className}`} {...props}>{icon&&<Icon name={icon} size={16}/>}<span>{children}</span></button>;
}
export function Modal({title,subtitle,children,onClose,wide=false,footer,locked=false}: {title:string;subtitle?:string;children:React.ReactNode;onClose:()=>void;wide?:boolean;footer?:React.ReactNode;locked?:boolean}) {
  const ref=useRef<HTMLElement>(null),closeRef=useRef(onClose),lockedRef=useRef(locked);
  closeRef.current=onClose;lockedRef.current=locked;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null,panel=ref.current!;
    panel.focus();
    function keyboard(e:KeyboardEvent) {
      if(e.key==='Escape'&&!lockedRef.current)closeRef.current();
      if(e.key!=='Tab')return;
      const nodes=[...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(n=>n.getClientRects().length>0);
      if(!nodes.length){e.preventDefault();return;}
      const first=nodes[0],last=nodes.at(-1)!;
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===panel)){e.preventDefault();last.focus();}
      else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===panel)){e.preventDefault();first.focus();}
    }
    document.addEventListener('keydown',keyboard);
    return ()=>{document.removeEventListener('keydown',keyboard);if(previous?.isConnected)previous.focus();};
  },[]);
  return <div className="modal-scrim" onMouseDown={e=>{if(e.target===e.currentTarget&&!locked)onClose();}}><section ref={ref} tabIndex={-1} className={`modal ${wide?'modal-wide':''}`} role="dialog" aria-modal="true" aria-labelledby="modal-title"><header className="modal-header"><div><h2 id="modal-title">{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" aria-label="关闭弹窗" disabled={locked} onClick={onClose}><Icon name="close"/></button></header><div className="modal-content">{children}</div>{footer&&<footer className="modal-footer">{footer}</footer>}</section></div>;
}
