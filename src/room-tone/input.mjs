export function createPointerOwner() {
  let owner=null;
  return {
    claim(id) {
      if(owner!==null || !Number.isInteger(id) || id<0) return false;
      owner=id;return true;
    },
    owns(id) { return owner!==null && owner===id; },
    release(id) {
      if(owner===null || owner!==id) return false;
      owner=null;return true;
    },
    clear() { owner=null; },
  };
}
export function tryCapture(element,id) {
  try { element.setPointerCapture(id);return true; }
  catch { return false; }
}
