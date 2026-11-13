import type { War } from './model';

export function addEvent(w:War,text:string):void {
 w.events.unshift({time:Math.floor(w.time),text});
 if(w.events.length>8)w.events.length=8;
}
