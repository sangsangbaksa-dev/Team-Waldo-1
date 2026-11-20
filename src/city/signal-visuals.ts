/** Visual-only cycle: traffic AI and collision rules remain unchanged. */
export function signalPhase(seconds:number):0|1{
  return (Math.floor(Math.max(0,seconds)/10)%2) as 0|1;
}
