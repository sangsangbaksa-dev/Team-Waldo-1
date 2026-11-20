export interface RoomStorage { read(key:string):unknown; write(key:string,value:unknown):boolean; remove(key:string):boolean }
export function createRoomStorage(getStorage:()=>Pick<Storage,"getItem"|"setItem"|"removeItem">):RoomStorage;
