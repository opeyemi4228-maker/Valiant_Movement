/** Shared call-signaling shapes — usable from server (store/actions) and client. */

export type CallMode = "voice" | "video";
export type CallStatus = "ringing" | "accepted" | "declined" | "missed" | "ended";

export interface CallSignal {
  id: string;
  callerId: string;
  callerName: string;
  callerColor: string;
  calleeId: string;
  calleeName: string;
  mode: CallMode;
  status: CallStatus;
  at: number;
}
