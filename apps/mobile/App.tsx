import { ActivityIndicator, StyleSheet, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { DefaultTheme, NavigationContainer } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import { AuthProvider, useAuth } from "./src/auth/AuthContext";
import type { AuthStackParamList, MainTabParamList, RootStackParamList } from "./src/navigation/types";
import HubScreen from "./src/screens/HubScreen";
import PostPlusScreen from "./src/screens/PostPlusScreen";
import AnalyticsScreen from "./src/screens/AnalyticsScreen";
import LoginScreen from "./src/screens/LoginScreen";
import SignupScreen from "./src/screens/SignupScreen";
import PaywallScreen from "./src/screens/PaywallScreen";
import { colors } from "./src/theme";

const Tab = createBottomTabNavigator<MainTabParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

// Applies the app's palette to React Navigation's own chrome (headers, tab
// bar, screen backgrounds) so those don't default back to plain black/white
// and clash with the rest of the app.
const navigationTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.textPrimary,
    border: colors.border,
  },
};

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerTitleAlign: "center",
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
      }}
    >
      <Tab.Screen name="Hub" component={HubScreen} />
      <Tab.Screen name="Post+" component={PostPlusScreen} />
      <Tab.Screen name="Analytics" component={AnalyticsScreen} />
    </Tab.Navigator>
  );
}

// Wraps the tabs so any tab screen can push the Paywall (e.g. an "Upgrade"
// prompt on Hub/Post+) without the tab navigator itself needing to be a stack.
function AuthenticatedNavigator() {
  return (
    <RootStack.Navigator screenOptions={{ headerTitleAlign: "center" }}>
      <RootStack.Screen name="Tabs" component={MainTabs} options={{ headerShown: false }} />
      <RootStack.Screen name="Paywall" component={PaywallScreen} options={{ title: "Upgrade" }} />
    </RootStack.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerTitleAlign: "center" }}>
      <AuthStack.Screen name="Login" component={LoginScreen} options={{ title: "Log in" }} />
      <AuthStack.Screen name="Signup" component={SignupScreen} options={{ title: "Create account" }} />
    </AuthStack.Navigator>
  );
}

function RootNavigator() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return user ? <AuthenticatedNavigator /> : <AuthNavigator />;
}

export default function App() {
  return (
    <AuthProvider>
      <NavigationContainer theme={navigationTheme}>
        <StatusBar style="auto" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.background },
});
