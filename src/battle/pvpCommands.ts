import { trainSquad, upgrade, research, captureOrder, order, setPolicy, setReserve, type War, type UnitKind, type Upgrade, type Research, type EconomyPolicy } from './war';
import { autoBuildFacility,buildFacility,buildInterior,type InteriorKind, type FacilityKind } from './facilities';
import { exportFood,acceptContract,deliverContract,develop,assignWorker,type ContractKind,type Development } from './economy';
export interface PlayerCommand {type:string;key?:string;amount?:number;target?:number|null;x?:number;z?:number;baseId?:number;col?:number;row?:number;}
export function applyPlayerCommand(w:War,faction:number,c:PlayerCommand):boolean {
 if(!Number.isInteger(faction)||faction<0||faction>3||!c||typeof c!=='object'||!w.humanFactions?.includes(faction))return false;
 switch(c.type){
  case 'train':return trainSquad(w,faction,c.key as UnitKind,c.amount??1);
  case 'upgrade':return upgrade(w,faction,c.key as Upgrade);
  case 'research':return research(w,faction,c.key as Research);
  case 'capture':return captureOrder(w,faction,c.target as number);
  case 'attack':return order(w,faction,c.target??null);
  case 'policy':return setPolicy(w,faction,c.key as EconomyPolicy);
  case 'reserve':return setReserve(w,faction,c.amount??0);
  case 'build':return c.x!==undefined&&c.z!==undefined?buildFacility(w,faction,c.key as FacilityKind,c.x,c.z):autoBuildFacility(w,faction,c.key as FacilityKind);
  case 'interior':return buildInterior(w,faction,c.key as InteriorKind,c.baseId??0,c.col??-1,c.row??-1);
  case 'export':return exportFood(w,faction);
  case 'contract':return acceptContract(w,faction,c.key as ContractKind);
  case 'deliver':return deliverContract(w,faction);
  case 'develop':return develop(w,faction,c.key as Development);
  case 'worker':return assignWorker(w,faction,c.key as 'miners'|'farmers',c.amount??0);
  default:return false;
 }
}
