/** Small original synthesized UI/siege effects with no external audio assets. */
export type WarSfx='command'|'train'|'upgrade'|'capture'|'loss'|'victory';
interface Note {frequency:number;start:number;duration:number;volume:number;}
const SFX: Record<WarSfx,{wave:OscillatorType;notes:Note[]}> = {
 command:{wave:'triangle',notes:[{frequency:430,start:0,duration:.09,volume:.022}]},
 train:{wave:'square',notes:[
  {frequency:294,start:0,duration:.08,volume:.012},
  {frequency:392,start:.09,duration:.12,volume:.011},
 ]},
 upgrade:{wave:'triangle',notes:[
  {frequency:330,start:0,duration:.11,volume:.03},
  {frequency:440,start:.1,duration:.16,volume:.025},
 ]},
 capture:{wave:'triangle',notes:[
  {frequency:392,start:0,duration:.26,volume:.024},
  {frequency:523.25,start:.13,duration:.32,volume:.028},
  {frequency:659.25,start:.26,duration:.43,volume:.02},
 ]},
 loss:{wave:'sawtooth',notes:[
  {frequency:196,start:0,duration:.38,volume:.013},
  {frequency:155.56,start:.18,duration:.45,volume:.013},
  {frequency:110,start:.4,duration:.58,volume:.013},
 ]},
 victory:{wave:'triangle',notes:[
  {frequency:392,start:0,duration:.28,volume:.03},
  {frequency:523.25,start:.19,duration:.3,volume:.03},
  {frequency:659.25,start:.38,duration:.3,volume:.032},
  {frequency:783.99,start:.58,duration:.52,volume:.035},
 ]},
};
export interface WarAudio {
 play(effect:WarSfx):void;
 getMuted():boolean;
 toggle():boolean;
 dispose():void;
}
export function createWarAudio():WarAudio {
 let context:AudioContext|null=null;
 let muted=false;
 const getContext=():AudioContext|null=>{
  if(typeof AudioContext==='undefined')return null;
  try{
   if(!context)context=new AudioContext();
   if(context.state==='suspended')void context.resume().catch(()=>{});
   return context;
  }catch{return null;}
 };
 const play=(effect:WarSfx)=>{
  if(muted)return;
  const ctx=getContext();
  if(!ctx)return;
  const info=SFX[effect],base=ctx.currentTime;
  for(const n of info.notes){
   try{
    const osc=ctx.createOscillator(),gain=ctx.createGain();
    osc.type=info.wave;osc.frequency.setValueAtTime(n.frequency,base+n.start);
    gain.gain.setValueAtTime(.0001,base+n.start);
    gain.gain.exponentialRampToValueAtTime(n.volume,base+n.start+.018);
    gain.gain.exponentialRampToValueAtTime(.0001,base+n.start+n.duration);
    osc.connect(gain);gain.connect(ctx.destination);
    osc.start(base+n.start);osc.stop(base+n.start+n.duration+.025);
    osc.onended=()=>{osc.disconnect();gain.disconnect();};
   }catch{ /* Unavailable audio never interrupts the game. */ }
  }
 };
 return {
  play,
  getMuted:()=>muted,
  toggle:()=>{muted=!muted;return muted;},
  dispose:()=>{if(context){void context.close().catch(()=>{});context=null;}},
 };
}
