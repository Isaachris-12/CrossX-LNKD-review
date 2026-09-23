export type AuthStackParamList = {
  Login: undefined;
  Signup: undefined;
};

export type MainTabParamList = {
  Hub: undefined;
  "Post+": undefined;
  Analytics: undefined;
};

// Wraps MainTabs so any tab screen can navigate to the paywall (e.g. from an
// "Upgrade" prompt on the Hub or Post+ screens) without the tabs themselves
// needing to be a stack.
export type RootStackParamList = {
  Tabs: undefined;
  Paywall: undefined;
};
