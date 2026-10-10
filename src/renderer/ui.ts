import type {Category,ImageEntry,MoveRecord} from '../shared/types';

export type VisualCategory=Category&{icon:string;color:string;tint:string};
export type VisualImage=ImageEntry&{preview?:string;kind:'long'|'normal'};
const visuals:Record<string,Pick<VisualCategory,'icon'|'color'|'tint'>>={
  study:{icon:'book',color:'#8870BF',tint:'#F0EBF7'},code:{icon:'code',color:'#5483B9',tint:'#EAF1FA'},
  chat:{icon:'chat',color:'#4D957C',tint:'#EAF5EF'},shopping:{icon:'bag',color:'#BD7D61',tint:'#FCF0E9'},
  work:{icon:'work',color:'#697F9B',tint:'#EDF0F5'},life:{icon:'sun',color:'#B09149',tint:'#F7F2E6'}
};
export const visualCategory=(category:Category):VisualCategory=>({...category,...(visuals[category.id]??{icon:'folder',color:'#7885A1',tint:'#EEF0F6'})});
export const visualImage=(image:ImageEntry):VisualImage=>({...image,preview:image.width&&image.height?`shot://image/${image.id}`:undefined,kind:image.height>image.width*3?'long':'normal'});
export const TIME=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false});
const DAY=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'});
export function dateOf(ms:number){const p=DAY.formatToParts(new Date(ms));return ['year','month','day'].map(k=>p.find(v=>v.type===k)!.value).join('-');}
export function dayLabel(day:string){const today=dateOf(Date.now()),yesterday=dateOf(Date.now()-86400000);return day===today?'今天':day===yesterday?'昨天':day;}
export function fileName(path:string){return path.split(/[\\/]/).pop()??path;}
export function sizeOf(bytes:number){return bytes<1048576?`${Math.round(bytes/1024)} KB`:`${(bytes/1048576).toFixed(1)} MB`;}
export function suggestedName(img:ImageEntry,title:string){
  let name=Array.from(title.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/\s+/g,' ').trim()).slice(0,40).join('').replace(/[. ]+$/g,'');
  if(/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name))name=`_${name}`;
  return `${dateOf(img.mtimeMs)}_${name||'内容标题'}${img.originalName.match(/\.[^.]+$/)?.[0]??''}`;
}
export function recordLabel(record:MoveRecord){
  if(record.error||record.stage==='failed'||record.stage==='conflict')return '需要处理';
  return {prepared:'待恢复',copied:'待恢复',verified:'待恢复',committed:'已整理',undone:'已恢复原名',failed:'失败',conflict:'冲突'}[record.stage];
}
export function batchLabel(records:MoveRecord[]){
  if(records.some(r=>r.error||r.stage==='failed'||r.stage==='conflict'))return '需要处理';
  if(records.some(r=>['prepared','copied','verified'].includes(r.stage)))return '待恢复';
  if(records.length&&records.every(r=>r.stage==='undone'))return '已撤销';
  return records.some(r=>r.stage==='undone')?'部分撤销':'已整理';
}
