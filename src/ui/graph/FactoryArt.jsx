import React,{memo} from 'react';
import sheet from './factory-sprites.svg?raw';
import {definition} from '../../data/machines';
export const SpriteLibrary=memo(function SpriteLibrary(){return <div className="sprite-library" aria-hidden dangerouslySetInnerHTML={{__html:sheet}}/>});
export function MachineArt({id,working}){
 const group=definition(id).group;
 return <svg aria-hidden className={'factory-art '+(working?'working':'')} viewBox="0 0 160 119">
 <ellipse cx="82" cy="91" rx="68" ry="16" fill="#0a1517" opacity=".34"/>
 <g className="machine-body"><use href={'#factory-'+id} width="160" height="112"/></g>
 {working&&group==='smelting'&&<g className="steam" fill="#ddd8bd"><circle cx="85" cy="10" r="3"/><circle cx="89" cy="5" r="2"/></g>}
 {working&&group!=='smelting'&&<g className="drive-light"><circle cx="45" cy="78" r="4" fill="#34483d"/><circle cx="45" cy="78" r="2.5" fill="#c4df90"/></g>}
 </svg>;
}
export function Cargo({item,...props}){return <use href={'#factory-cargo-'+item} {...props}/>;}

