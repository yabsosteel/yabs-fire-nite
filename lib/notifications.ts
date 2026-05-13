import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    console.log("Push notifications only work on a physical device.");
    return null;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "default",
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const existingPermission: any = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status ?? existingPermission.granted;

  if (finalStatus !== "granted" && finalStatus !== true) {
    const requestedPermission: any =
      await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status ?? requestedPermission.granted;
  }

  if (finalStatus !== "granted" && finalStatus !== true) {
    console.log("Notification permission not granted.");
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;

  const token = (
    await Notifications.getExpoPushTokenAsync({
      projectId,
    })
  ).data;

  const { error } = await supabase.from("push_tokens").upsert(
    {
      token,
      device_name: Device.deviceName ?? "Unknown device",
    },
    { onConflict: "token" }
  );

  if (error) {
    console.log("Error saving push token:", error.message);
  }

  return token;
}

export async function sendPushNotificationToAll(title: string, body: string) {
  const { data, error } = await supabase.from("push_tokens").select("token");

  if (error) {
    console.log("Error loading push tokens:", error.message);
    return;
  }

  const messages =
    data?.map((item) => ({
      to: item.token,
      sound: "default",
      title,
      body,
      data: {
        screen: "home",
      },
    })) ?? [];

  for (const message of messages) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });
  }
}
export async function sendPushNotificationToHosts(
  title: string,
  body: string
) {
  const { data, error } = await supabase
    .from("push_tokens")
    .select("token")
    .eq("is_host", true);

  if (error) {
    console.log("Error loading host push tokens:", error.message);
    return;
  }

  const messages =
    data?.map((item) => ({
      to: item.token,
      sound: "default",
      title,
      body,
      data: {
        screen: "host",
      },
    })) ?? [];

  for (const message of messages) {
    await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-Encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(message),
    });
  }
}
export function formatFireDate(dateString: string) {
  if (!dateString) return "";

  const date = new Date(`${dateString}T00:00:00`);

  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatFireTime(timeString: string) {
  if (!timeString) return "";

  const [hours, minutes] = timeString.split(":").map(Number);
  const date = new Date();

  date.setHours(hours);
  date.setMinutes(minutes);

  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatFireDateTime(dateString: string, timeString: string) {
  return `${formatFireDate(dateString)} at ${formatFireTime(timeString)}`;
}