/** Active-time matchmaking: a background/suspended tab must not instantly time out on return.
 * Preserve one ordinary heartbeat interval so suspending never extends the deadline indefinitely. */
export function adjustPendingSince(born:number,previousTick:number,now:number,heartbeatMs=500):number{
  if(![born,previousTick,now,heartbeatMs].every(Number.isFinite)||now<=previousTick||heartbeatMs<=0)return born;
  const elapsed=now-previousTick;
  return elapsed>2000?born+Math.max(0,elapsed-heartbeatMs):born;
}
