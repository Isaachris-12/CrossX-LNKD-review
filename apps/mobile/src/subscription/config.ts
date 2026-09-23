import { Platform } from "react-native";
import Constants from "expo-constants";

const extra = Constants.expoConfig?.extra ?? {};

const apiKeyIos = typeof extra.revenueCatApiKeyIos === "string" ? extra.revenueCatApiKeyIos : "";
const apiKeyAndroid =
  typeof extra.revenueCatApiKeyAndroid === "string" ? extra.revenueCatApiKeyAndroid : "";

export const REVENUECAT_API_KEY = Platform.OS === "ios" ? apiKeyIos : apiKeyAndroid;

export const REVENUECAT_ENTITLEMENT_ID =
  typeof extra.revenueCatEntitlementId === "string" ? extra.revenueCatEntitlementId : "full_access";

// True once a real RevenueCat project key has been filled into app.json's
// "extra" - until then, subscription UI shows a clear "not configured yet"
// state instead of crashing trying to initialize the SDK with an empty key.
export const IS_REVENUECAT_CONFIGURED = REVENUECAT_API_KEY.length > 0;
