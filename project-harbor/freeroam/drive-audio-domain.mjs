export function driveAudioTargets({driving=false,speed=0,steering=0,dt=.1,previousSpeed=0,volume=.45,muted=false,playing=true}={}){
 const finite=(v,fallback=0)=>Number.isFinite(v)?v:fallback;
 const clamp=(n,min,max)=>Math.min(max,Math.max(min,n));
 const s=clamp(Math.abs(finite(speed)),0,85),turn=clamp(Math.abs(finite(steering)),0,1);
 const a=clamp((s-Math.abs(finite(previousSpeed)))/Math.max(.04,finite(dt,.1)), -25,25);
 const level=driving&&playing&&!muted?clamp(finite(volume,.45),0,1):0;
 const rpm=clamp(780+s*116+Math.max(0,a)*58,780,6800);
 const brake=clamp(-a/12,0,1), slip=clamp(turn*(s/22)**2 + brake*s/45-.32,0,1);
 return {rpm,frequency:rpm/60*2,engine:level*(.035+s*.0012+Math.max(0,a)*.0014),road:level*clamp(s/40,0,1)*.08,skid:level*slip*.10,cutoff:350+rpm*.37};
}
