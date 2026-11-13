import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import { createWar,stepWar,type War } from './war';
import { encodeWar,decodeWar } from './save';
import { applyPlayerCommand,type PlayerCommand } from './pvpCommands';
// Public project coordinates, never a service-role or secret key.
const URL=import.meta.env.VITE_SUPABASE_URL||'https://qgeblwepfowfswfxtemd.supabase.co';
const KEY=import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY||'sb_publishable_5J9A5uOS09eJ7gi5QJVhQg_42BOYw95';
export const pvpClient=createClient(URL,KEY);
export interface Room {id:string;code:string;host_id:string;phase:'waiting'|'playing'|'finished';snapshot:string|null;sequence:number;updated_at:string;}
export interface Player {user_id:string;faction:number;name:string;}
export interface PvpCallbacks {lobby:(room:Room,players:Player[])=>void;state:(war:War)=>void;status:(message:string)=>void;}
export class PvpSession {
 room!:Room;players:Player[]=[];userId='';faction=0;isHost=false;war:War|null=null;
 private channels:RealtimeChannel[]=[];private interval:ReturnType<typeof setInterval>|null=null;
 private stopped=false;private busy=false;private lastState=0;private lastPersist=0;private lastLoop=0;private acc=0;private sequence=0;private commandIds=new Set<number>();
 constructor(private callbacks:PvpCallbacks){}
 async enter(name:string,code?:string):Promise<void>{
  this.stopped=false;
  const {data:sessionData}=await pvpClient.auth.getSession();
  if(!sessionData.session)throw new Error('먼저 이메일로 로그인해 주세요.');
  const {data:identity,error:identityError}=await pvpClient.auth.getUser();if(identityError||!identity.user)throw identityError??new Error('로그인 실패');
  this.userId=identity.user.id;
  const {data:rid,error}=await pvpClient.rpc('waldo_enter_room',{player_name:name,room_code:code||null});if(error)throw error;
  const {data:room,error:roomError}=await pvpClient.from('waldo_rooms').select('*').eq('id',rid).single();if(roomError)throw roomError;
  this.room=room;this.isHost=this.userId===room.host_id;await this.refresh();
  this.faction=this.players.find(p=>p.user_id===this.userId)!.faction;
  await pvpClient.realtime.setAuth();
  const state=pvpClient.channel(`waldo:${room.id}`)
   .on('postgres_changes',{event:'UPDATE',schema:'public',table:'waldo_rooms',filter:`id=eq.${room.id}`},({new:row})=>{
    if(this.isHost||!row.snapshot||row.sequence<=this.sequence)return;
    const decoded=decodeWar(row.snapshot);if(!decoded)return;
    this.sequence=row.sequence;this.room.phase=row.phase;this.war=decoded;this.lastState=performance.now();this.callbacks.state(decoded);this.callbacks.status(row.phase==='finished'?'전투 종료':'실시간 연결됨');
   })
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'waldo_commands',filter:`room_id=eq.${room.id}`},({new:row})=>{
    if(this.isHost){const player=this.players.find(p=>p.user_id===row.user_id);if(player)this.receiveCommand({id:row.id,faction:player.faction,command:row.command});}
   })
   .on('postgres_changes',{event:'INSERT',schema:'public',table:'waldo_players',filter:`room_id=eq.${room.id}`},()=>{void this.refresh().catch(()=>this.callbacks.status('참가자 정보 갱신 실패'));});
  this.channels=[state];
  await Promise.all(this.channels.map(channel=>new Promise<void>((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error('실시간 연결 시간 초과')),15000);
   channel.subscribe((status)=>{if(status==='SUBSCRIBED'){clearTimeout(timeout);resolve();}else if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'){clearTimeout(timeout);this.callbacks.status('연결 끊김 · 재접속 중');}});
  })));
  this.lastLoop=performance.now();this.lastState=performance.now();
  if(room.snapshot){this.war=decodeWar(room.snapshot);this.sequence=room.sequence;if(this.war)this.callbacks.state(this.war);}
  this.interval=setInterval(()=>{void this.tick();},50);
 }
 private async refresh(){
  const {data:players,error}=await pvpClient.from('waldo_players').select('user_id,faction,name').eq('room_id',this.room.id).order('faction');if(error)throw error;
  this.players=players??[];
  const {data:room,error:roomError}=await pvpClient.from('waldo_rooms').select('*').eq('id',this.room.id).single();if(roomError)throw roomError;
  this.room=room;this.callbacks.lobby(this.room,this.players);
  if(!this.isHost&&room.snapshot&&room.sequence>this.sequence){const decoded=decodeWar(room.snapshot);if(decoded){this.sequence=room.sequence;this.war=decoded;this.lastState=performance.now();this.callbacks.state(decoded);}}
 }
 async start():Promise<void>{
  await this.refresh();if(!this.isHost||this.room.phase!=='waiting'||this.players.length<2)throw new Error('2명 이상 참가한 뒤 방장이 시작할 수 있습니다.');
  const w=createWar({grandBattle:true,difficulty:'normal'});w.humanFactions=this.players.map(p=>p.faction);
  this.war=w;this.sequence=1;this.room.phase='playing';
  const {error}=await pvpClient.from('waldo_rooms').update({phase:'playing',snapshot:encodeWar(w),sequence:this.sequence,updated_at:new Date().toISOString()}).eq('id',this.room.id);if(error){this.war=null;this.room.phase='waiting';throw error;}
  this.callbacks.state(w);this.callbacks.lobby(this.room,this.players);this.lastLoop=performance.now();
 }
 async command(command:PlayerCommand):Promise<void>{
  if(this.room.phase!=='playing'||!this.war||!this.war.factions[this.faction].alive)throw new Error('전투 시작 후 명령할 수 있습니다.');
  const {error}=await pvpClient.from('waldo_commands').insert({room_id:this.room.id,user_id:this.userId,command});if(error)throw error;
 }
 private receiveCommand(payload:{id:number;faction:number;command:PlayerCommand}){
  if(!this.war||!payload||!Number.isSafeInteger(payload.id)||this.commandIds.has(payload.id))return;
  this.commandIds.add(payload.id);applyPlayerCommand(this.war,payload.faction,payload.command);
 }
 private async tick(){
  if(this.stopped||this.busy)return;
  this.busy=true;
  try{
   const now=performance.now(),delta=Math.min((now-this.lastLoop)/1000,.15);this.lastLoop=now;
   if(this.isHost&&this.war&&this.room.phase==='playing'){
    this.acc+=delta;while(this.acc>=.05){stepWar(this.war,.05);this.acc-=.05;}
    this.callbacks.state(this.war);
    if(now-this.lastPersist>=250||this.war.over){
     this.lastPersist=now;this.sequence++;const phase=this.war.over?'finished':'playing';
     const {error}=await pvpClient.from('waldo_rooms').update({snapshot:encodeWar(this.war),sequence:this.sequence,phase,updated_at:new Date().toISOString()}).eq('id',this.room.id);if(error)throw error;
     // Durable command recovery covers a notification missed during reconnection.
     const {data,error:commandError}=await pvpClient.from('waldo_commands').select('id,user_id,command').eq('room_id',this.room.id).order('id',{ascending:false}).limit(100);if(commandError)throw commandError;
     for(const c of [...(data??[])].reverse()){const player=this.players.find(p=>p.user_id===c.user_id);if(player)this.receiveCommand({id:c.id,faction:player.faction,command:c.command});}
     if(this.war.over){this.room.phase='finished';this.callbacks.status('전투 종료');}
    }
   }else if(now-this.lastPersist>=2000){this.lastPersist=now;await this.refresh();if(this.war&&this.room.phase==='playing'&&now-this.lastState>6000)this.callbacks.status('방장 연결 대기 · 마지막 상태 유지');}
   if(this.isHost&&this.room.phase==='waiting'&&now-this.lastPersist>=1500){this.lastPersist=now;await this.refresh();}
  }catch(error){this.callbacks.status(error instanceof Error?error.message:'연결 오류 · 재시도 중');}finally{this.busy=false;}
 }
 async close(){this.stopped=true;if(this.interval)clearInterval(this.interval);await Promise.all(this.channels.map(c=>pvpClient.removeChannel(c)));this.channels=[];}
}
