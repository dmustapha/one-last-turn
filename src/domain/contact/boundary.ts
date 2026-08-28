export type ContactBoundary = Readonly<{
  contactChannelAllowed: "project_room_text";
  expiresAt: string;
  freeTextNote?: string;
  maximumTurns: 1;
  prohibitedTopicCategory: string;
  responseAllowed: boolean;
}>;
