/** Offline purchases must be persisted only after an actual state change.
 * Casino wagers are tracked even if a same-frame payout balances cash out. */
export function transactionChanged(beforeCash: number, afterCash: number, beforeWagered: number, afterWagered: number): boolean {
  return beforeCash !== afterCash || beforeWagered !== afterWagered;
}
