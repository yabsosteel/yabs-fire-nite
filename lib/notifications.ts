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

export async function registerForPushNotificationsAsync(
  savedFirstName?: string | null,
  savedLastName?: string | null
) {
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
    first_name: savedFirstName,
    last_name: savedLastName,
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
export async function sendFireChatNotification(
  eventId: string,
  eventTitle: string,
  senderName: string,
  senderFirstName: string,
  senderLastName: string,
  message: string
) {
  const { data: attendees, error: attendeeError } = await supabase
  .from("rsvps")
  .select("first_name,last_name")
  .eq("event_id", eventId)
  .in("response_status", ["going", "maybe"]);

if (attendeeError) {
  console.log("Error loading attendees:", attendeeError.message);
  return;
}

const attendeeNames =
  attendees?.map(
    (person) => `${person.first_name} ${person.last_name}`
  ) ?? [];

const { data, error } = await supabase
  .from("push_tokens")
  .select("token,first_name,last_name");

if (error) {
  console.log("Error loading push tokens:", error.message);
  return;
}

const filteredTokens =
  data?.filter((item) => {
    const fullName = `${item.first_name} ${item.last_name}`;

    const isAttending = attendeeNames.includes(fullName);

    const isSender =
      item.first_name === senderFirstName &&
      item.last_name === senderLastName;

    return isAttending && !isSender;
  }) ?? [];

const messages = filteredTokens.map((item) => ({
  to: item.token,
  sound: "default",
  title: `${senderName} posted in ${eventTitle}`,
  body: message,
  data: {
    screen: "home",
    eventId,
  },
}));

for (const notification of messages) {
  await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(notification),
  });
}
}