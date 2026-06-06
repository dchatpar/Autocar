/**
 * (app) layout — bottom tab navigator.
 *
 * Tabs: Dashboard, Leads, Inventory, Customers, Settings.
 *
 * Why Stack INSIDE the (app) layout (and not a Tabs component)? The
 * auth-gated app has tab-rooted flows that occasionally push detail
 * screens (lead detail, vehicle detail). Nesting a Stack inside the
 * tab layout gives us back-push + native gesture by default.
 *
 * Iconography: we use the `@expo/vector-icons` Ionicons set — it's
 * a 0-dep choice (Expo includes the font assets) and reads cleanly
 * at 24px tab size.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { colors, fontSize, fontWeight } from "../../constants/theme";

type IoniconName = React.ComponentProps<typeof Ionicons>["name"];

interface TabIconProps {
  name: IoniconName;
  label: string;
  focused: boolean;
}

function TabIcon({ name, label, focused }: TabIconProps): React.JSX.Element {
  return (
    <View style={styles.tabItem}>
      <Ionicons
        name={focused ? name : (`${name}-outline` as IoniconName)}
        size={24}
        color={focused ? colors.accent : colors.textMuted}
      />
      <Text
        style={[
          styles.tabLabel,
          { color: focused ? colors.accent : colors.textMuted },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

export default function AppLayout(): React.JSX.Element {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: styles.tabBar,
          tabBarItemStyle: styles.tabBarItem,
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "Dashboard",
            tabBarIcon: ({ focused }) => (
              <TabIcon name="speedometer" label="Home" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="leads/index"
          options={{
            title: "Leads",
            tabBarIcon: ({ focused }) => (
              <TabIcon name="people" label="Leads" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="inventory/index"
          options={{
            title: "Inventory",
            tabBarIcon: ({ focused }) => (
              <TabIcon name="car-sport" label="Cars" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="customers/add"
          options={{
            title: "Add Customer",
            tabBarIcon: ({ focused }) => (
              <TabIcon name="person-add" label="Add" focused={focused} />
            ),
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ focused }) => (
              <TabIcon name="settings" label="More" focused={focused} />
            ),
          }}
        />
      </Tabs>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.bgPrimary,
  },
  tabBar: {
    backgroundColor: colors.bgCard,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    height: 64,
    paddingTop: 6,
    paddingBottom: 6,
  },
  tabBarItem: {
    minHeight: 48,
    paddingVertical: 4,
  },
  tabItem: {
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minWidth: 56,
  },
  tabLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
  },
});
