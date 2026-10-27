/** How a job ends early, and why: the states it may end in, and the words its last event says. */
export class Stop extends Error {
  readonly state: "needs_information" | "unsupported" | "failed" | "cancelled";
  constructor(state: Stop["state"], message: string) {
    super(message);
    this.state = state;
  }
}
