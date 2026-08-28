// File: src/config/feature-flags.ts
export type FeatureFlags = Readonly<{
  authLive: boolean; contactLane: boolean; demoCase: boolean; emailLive: boolean; mindsLive: boolean;
}>;

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = Object.freeze({
  authLive: false, contactLane: false, demoCase: false, emailLive: false, mindsLive: false,
});
