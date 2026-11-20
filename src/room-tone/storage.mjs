// Keep the latest snapshot even if storage becomes unavailable later. Only
// failed writes/removals override an otherwise-readable persisted value.
export function createRoomStorage(getStorage) {
  const session=new Map(),pending=new Set();
  const parse=raw=>raw==null?null:JSON.parse(raw);
  return {
    read(key) {
      try {
        if(pending.has(key))return parse(session.get(key));
        const raw=getStorage().getItem(key);
        session.set(key,raw);
        return parse(raw);
      } catch {
        try{return parse(session.get(key));}catch{return null;}
      }
    },
    write(key,value) {
      let raw;
      try{raw=JSON.stringify(value);}catch{return false;}
      if(typeof raw!=="string")return false;
      session.set(key,raw);
      try{getStorage().setItem(key,raw);pending.delete(key);return true;}
      catch{pending.add(key);return false;}
    },
    remove(key) {
      session.set(key,null);
      try{getStorage().removeItem(key);pending.delete(key);return true;}
      catch{pending.add(key);return false;}
    },
  };
}
