import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { supabase } from "./supabase";

const HOST_FIRST_NAME = "rian";
const HOST_LAST_NAME = "yablun";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function isHardCodedHost(firstName?: string | null, lastName?: string | null) {
  return (
    firstName?.trim().toLowerCase() === HOST_FIRST_NAME &&
    lastName?.trim().toLowerCase() === HOST_LAST_NAME
  );
}

async function sendExpoPushMessages(messages: any[]) {
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
      is_host: isHardCodedHost(savedFirstName, savedLastName),
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

  await sendExpoPushMessages(messages);
}

export async function sendPushNotificationToHosts(
  title: string,
  body: string
) {
  const { data, error } = await supabase
    .from("push_tokens")
    .select("token,first_name,last_name,is_host");

  if (error) {
    console.log("Error loading host push tokens:", error.message);
    return;
  }

  const hostTokens =
    data?.filter((item) => {
      return (
        item.is_host === true ||
        isHardCodedHost(item.first_name, item.last_name)
      );
    }) ?? [];

  const uniqueTokens = Array.from(new Set(hostTokens.map((item) => item.token)));

  const messages = uniqueTokens.map((token) => ({
    to: token,
    sound: "default",
    title,
    body,
    data: {
      screen: "host",
    },
  }));

  await sendExpoPushMessages(messages);
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

  const uniqueTokens = Array.from(
    new Set(filteredTokens.map((item) => item.token))
  );

  const messages = uniqueTokens.map((token) => ({
    to: token,
    sound: "default",
    title: `${senderName} posted in ${eventTitle}`,
    body: message,
    data: {
      screen: "fire-details",
      eventId,
    },
  }));

  await sendExpoPushMessages(messages);
}


export async function sendRSVPNotificationToAttendees(
  eventId: string,
  senderFirstName: string,
  senderLastName: string,
  notificationTitle: string
) {
  const { data: attendees, error: attendeeError } = await supabase
    .from("rsvps")
    .select("first_name,last_name")
    .eq("event_id", eventId)
    .in("response_status", ["going", "maybe"]);

  if (attendeeError) {
    console.log("Error loading RSVP attendees:", attendeeError.message);
    return;
  }

  const attendeeKeys =
    attendees?.map(
      (person) =>
        `${person.first_name || ""} ${person.last_name || ""}`
          .toLowerCase()
          .trim()
    ) ?? [];

  const senderKey = `${senderFirstName || ""} ${senderLastName || ""}`
    .toLowerCase()
    .trim();

  const { data: pushTokens, error: tokenError } = await supabase
    .from("push_tokens")
    .select("token,first_name,last_name");

  if (tokenError) {
    console.log("Error loading push tokens:", tokenError.message);
    return;
  }

  const matchingTokens =
    pushTokens?.filter((item) => {
      const tokenOwnerKey = `${item.first_name || ""} ${item.last_name || ""}`
        .toLowerCase()
        .trim();

      return attendeeKeys.includes(tokenOwnerKey) && tokenOwnerKey !== senderKey;
    }) ?? [];

  const uniqueTokens = Array.from(
    new Set(matchingTokens.map((item) => item.token))
  );

  const messages = uniqueTokens.map((token) => ({
    to: token,
    sound: "default",
    title: notificationTitle,
    body: "",
    data: {
      screen: "fire-details",
      eventId,
    },
  }));

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

