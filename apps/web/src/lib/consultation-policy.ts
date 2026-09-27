export const ONLINE_CONSULTATION_CHANNELS = ["video", "audio", "chat"] as const;

export type OnlineConsultationChannel = (typeof ONLINE_CONSULTATION_CHANNELS)[number];

// Patient-facing privacy policy: never derive this label from provider city/state.
export const SPECIALIST_COUNTRY = "Nigeria";

const CHANNEL_LABELS: Record<OnlineConsultationChannel, string> = {
  video: "Video call",
  audio: "Voice call",
  chat: "Chat",
};

const CHANNEL_ACTION_LABELS: Record<OnlineConsultationChannel, string> = {
  video: "Join video",
  audio: "Join voice call",
  chat: "Open chat",
};

export function isOnlineConsultationChannel(channel: unknown): channel is OnlineConsultationChannel {
  return ONLINE_CONSULTATION_CHANNELS.includes(channel as OnlineConsultationChannel);
}

export function onlineConsultationModes(modes: readonly string[] | null | undefined): OnlineConsultationChannel[] {
  return (modes ?? []).filter(isOnlineConsultationChannel);
}

export function consultationChannelLabel(channel: OnlineConsultationChannel): string {
  return CHANNEL_LABELS[channel];
}

export function consultationActionLabel(channel: OnlineConsultationChannel): string {
  return CHANNEL_ACTION_LABELS[channel];
}
