import { Ionicons } from "@expo/vector-icons";
import * as Notifications from "expo-notifications";
import { Tabs, useRouter } from "expo-router";
import { useEffect } from "react";

export default function TabLayout() {
  const router = useRouter();

  useEffect(() => {
    async function handleLastNotificationResponse() {
      const response = await Notifications.getLastNotificationResponseAsync();

      if (!response) return;

      const data = response.notification.request.content.data;

      if (data?.eventId) {
        router.push({
          pathname: "/fire-details",
          params: { eventId: String(data.eventId) },
        });
        return;
      }

      if (data?.screen === "host") {
        router.push("/host");
        return;
      }

      router.push("/");
    }

    handleLastNotificationResponse();

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;

        if (data?.eventId) {
          router.push({
            pathname: "/fire-details",
            params: { eventId: String(data.eventId) },
          });
          return;
        }

        if (data?.screen === "host") {
          router.push("/host");
          return;
        }

        router.push("/");
      });

    return () => {
      responseSubscription.remove();
    };
  }, [router]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#f97316",
        tabBarInactiveTintColor: "#888",
        tabBarStyle: {
          backgroundColor: "#0f0f10",
          borderTopColor: "#2f2f35",
        },
        headerStyle: {
          backgroundColor: "#0f0f10",
        },
        headerTintColor: "#fff",
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="flame" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="history"
        options={{
          title: "History",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="time" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="host"
        options={{
          title: "Host",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bonfire" size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="explore"
        options={{
          title: "Explore",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="compass" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
