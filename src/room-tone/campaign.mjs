const SIZES=[21,23,25,27];
export function normalizeCampaign(value) {
  if(!value || typeof value !== "object" || Array.isArray(value)) return null;
  const {v,ch,found,solved,elapsed,seen}=value;
  if(v!==1 || !Number.isInteger(ch) || ch<0 || ch>=SIZES.length) return null;
  if(!Array.isArray(found) || found.length!==3 ||
      !found.every(item=>typeof item==="boolean")) return null;
  if(typeof solved!=="boolean" || (solved && !found.every(Boolean))) return null;
  if(!Number.isFinite(elapsed) || elapsed<0) return null;
  const upper=SIZES[ch]**2;
  const visited=Array.isArray(seen)
    ? [...new Set(seen.slice(0,upper).filter(id=>Number.isInteger(id)&&id>=0&&id<upper))]
    : [];
  return {v:1,ch,found:found.slice(),solved,elapsed,seen:visited};
}
