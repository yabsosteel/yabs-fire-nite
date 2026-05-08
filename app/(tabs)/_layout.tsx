import { Tabs } from "expo-router";

export default function TabLayout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="index"
        options={{ title: "Home" }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: "History" }}
      />
      <Tabs.Screen
        name="host"
        options={{ title: "Host" }}
      />
    </Tabs>
  );
}