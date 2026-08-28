type TimingInput = {
  measuredFirstReplyMs: number;
  measuredSecondReplyMs: number;
  cachedOutputLabeledLive?: boolean;
};

export function buildTruthfulDemoTimeline(input: TimingInput) {
  if (input.cachedOutputLabeledLive) {
    throw new Error("Cached output cannot be labeled live");
  }
  const beats = [
    { label: "consent receipt", seconds: 12 },
    { label: "process A evidence", seconds: 13 },
    { label: "disclosed provider-wait cut", seconds: 5 },
    { label: "process B live call and recalled rule", seconds: 25 },
    { label: "permissioned email receipt and replay", seconds: 18 },
    { label: "expiry and COOLING branch", seconds: 14 },
    { label: "evidence manifest", seconds: 10 },
  ];
  return {
    beats,
    totalSeconds: beats.reduce((sum, beat) => sum + beat.seconds, 0),
    liveCallCount: 1,
    usesDisclosedTimeCut: true,
    measuredReplyMs: [input.measuredFirstReplyMs, input.measuredSecondReplyMs],
  };
}

