import type { Finding } from "@/lib/analytics/postTradeDiagnosis";

/** Shared with TradeReviewsPanel.tsx, so a finding kind reads the same whether it showed up from "Diagnose selected" or the auto-surfaced monthly review. */
export const findingLabel: Record<Finding["kind"], string> = {
  target_reachable_not_captured: "Target reachable, not captured",
  continued_after_exit: "Kept moving after exit",
  recovered_after_stop: "Recovered after stop",
  premature_exit_missed_target: "Exited early — target would have hit",
  premature_exit_dodged_stop: "Exited early — dodged the stop",
  premature_exit_ambiguous: "Exited early — outcome unclear",
};
