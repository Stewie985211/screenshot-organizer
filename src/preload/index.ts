import { contextBridge, ipcRenderer } from 'electron';
import type { ScreenshotAPI, Progress } from '../shared/types.js';
const call=(name:string,...args:unknown[])=>ipcRenderer.invoke(`screenshots:${name}`,...args);
const api:ScreenshotAPI={
  getState:()=>call('getState'), chooseFolders:kind=>call('chooseFolders',kind),saveSettings:settings=>call('saveSettings',settings),
  scan:()=>call('scan'),analyze:(ids,force)=>call('analyze',ids,force),buildPlan:choices=>call('buildPlan',choices),
  applyPlan:id=>call('applyPlan',id),undoBatch:id=>call('undoBatch',id),recover:(id,action)=>call('recover',id,action),
  stop:()=>call('stop'),prepareModel:()=>call('prepareModel'),runtimeStatus:()=>call('runtimeStatus'),reveal:id=>call('reveal',id),
  onProgress:callback=>{const listener=(_event:Electron.IpcRendererEvent,progress:Progress)=>callback(progress);ipcRenderer.on('screenshots:progress',listener);return()=>ipcRenderer.removeListener('screenshots:progress',listener);}
};
contextBridge.exposeInMainWorld('screenshots',api);
