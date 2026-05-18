import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { registerForPushNotificationsAsync } from "../../lib/notifications";
import { loadFireWeather } from "../../lib/weather";
import Animated, { FadeInUp } from "react-native-reanimated";

export default function HomeScreen() {
  const router = useRouter();
  const eventIdRef = useRef<string | null>(null);

  const [event, setEvent] = useState<any>(null);
  const [upcomingFires, setUpcomingFires] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [status, setStatus] = useState("Loading event...");
  const [message, setMessage] = useState("");
  const [countdownText, setCountdownText] = useState("");
  const [weather, setWeather] = useState<any>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savedFirstName, setSavedFirstName] = useState<string | null>(null);
  const [savedLastName, setSavedLastName] = useState<string | null>(null);

  const [isApproved, setIsApproved] = useState(false);
  const [approvalChecked, setApprovalChecked] = useState(false);

  const [approvedGuests, setApprovedGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [latestChatCreatedAt, setLatestChatCreatedAt] = useState<string | null>(
    null,
  );
  const [latestChatSender, setLatestChatSender] = useState<string | null>(null);
  const [latestChatPreview, setLatestChatPreview] = useState<string | null>(null);

  const isHost =
    savedFirstName?.toLowerCase() === "rian" &&
    savedLastName?.toLowerCase() === "yablun";

  const latestAnnouncement = announcements[0] || null;
  const showHomeLoadingCard = loading && !event && !latestAnnouncement;

  const currentGoingList = dedupePeople(
    event?.rsvps?.filter((r: any) => r.response_status === "going") || [],
  );

  const maybeList = dedupePeople(
    event?.rsvps?.filter((r: any) => r.response_status === "maybe") || [],
  );

  const notGoingList = dedupePeople(
    event?.rsvps?.filter((r: any) => r.response_status === "not_going") || [],
  );

  const goingCount = currentGoingList.length;
  const maybeCount = maybeList.length;
  const notGoingCount = notGoingList.length;

  const respondedKeys = new Set(
    (event?.rsvps || []).map((r: any) =>
      `${r.first_name} ${r.last_name}`.toLowerCase().trim(),
    ),
  );

  const notRespondedList = dedupePeople(
    (approvedGuests || []).filter((guest: any) => {
      const key = `${guest.first_name} ${guest.last_name}`.toLowerCase().trim();

      return !respondedKeys.has(key);
    }),
  );

  useEffect(() => {
    loadEvent();
    loadAnnouncements();
    loadName();

    const announcementRefreshInterval = setInterval(() => {
      loadAnnouncements();
    }, 5000);

    const rsvpRefreshInterval = setInterval(() => {
      loadEvent();
    }, 5000);

    return () => {
      clearInterval(announcementRefreshInterval);
      clearInterval(rsvpRefreshInterval);
    };
  }, []);

  useEffect(() => {
    if (!savedFirstName || !savedLastName) return;

    setupNotifications();
  }, [savedFirstName, savedLastName]);

  useEffect(() => {
    if (event?.id) {
      scheduleFireReminderIfNeeded(event);
    }
  }, [event?.id, event?.event_date, event?.event_time]);

  useEffect(() => {
    eventIdRef.current = event?.id ? String(event.id) : null;
  }, [event?.id]);

  useEffect(() => {
    function updateCountdown() {
      if (!event?.event_date || !event?.event_time) {
        setCountdownText("");
        return;
      }

      const fireDateTime = new Date(`${event.event_date}T${event.event_time}`);
      const now = new Date();
      const differenceMs = fireDateTime.getTime() - now.getTime();

      if (differenceMs <= 0) {
        setCountdownText("Fire is starting now 🔥");
        return;
      }

      const totalMinutes = Math.floor(differenceMs / 60000);
      const days = Math.floor(totalMinutes / 1440);
      const hours = Math.floor((totalMinutes % 1440) / 60);
      const minutes = totalMinutes % 60;

      if (days > 0) {
        setCountdownText(
          `Fire starts in ${days} day${days === 1 ? "" : "s"}${
            hours > 0 ? `, ${hours} hour${hours === 1 ? "" : "s"}` : ""
          }`,
        );
        return;
      }

      if (hours > 0) {
        setCountdownText(
          `Fire starts in ${hours} hour${hours === 1 ? "" : "s"}${
            minutes > 0 ? `, ${minutes} min` : ""
          }`,
        );
        return;
      }

      setCountdownText(`Fire starts in ${minutes} min`);
    }

    updateCountdown();

    const interval = setInterval(updateCountdown, 60000);

    return () => {
      clearInterval(interval);
    };
  }, [event?.event_date, event?.event_time]);

  useEffect(() => {
    async function loadWeatherForFire() {
      if (!event?.event_date || !event?.event_time) {
        setWeather(null);
        return;
      }

      const forecast = await loadFireWeather(
        event.event_date,
        event.event_time,
      );
      setWeather(forecast);
    }

    loadWeatherForFire();
  }, [event?.event_date, event?.event_time]);

  useEffect(() => {
    const channel = supabase
      .channel("realtime-home")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          loadEvent();
          loadAnnouncements();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rsvps" },
        () => {
          loadEvent();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => {
          loadAnnouncements();
          loadEvent();
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "fire_chat" },
        (payload: any) => {
          const changedEventId = payload?.new?.event_id
            ? String(payload.new.event_id)
            : null;
          const activeEventId = eventIdRef.current;

          if (activeEventId && changedEventId === activeEventId) {
            loadUnreadChat(activeEventId);
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [event?.id]);

  useFocusEffect(
    useCallback(() => {
      loadEvent();
      loadAnnouncements();
      loadApprovedGuests();

      const activeEventId =
        eventIdRef.current || (event?.id ? String(event.id) : null);

      if (activeEventId) {
        loadUnreadChat(activeEventId);

        setTimeout(() => {
          loadUnreadChat(activeEventId);
        }, 300);

        setTimeout(() => {
          loadUnreadChat(activeEventId);
        }, 1000);
      }
    }, [event?.id, savedFirstName, savedLastName]),
  );

  useEffect(() => {
    const announcementAppStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (nextAppState === "active") {
          loadAnnouncements();
          loadEvent();

          const activeEventId = eventIdRef.current;

          if (activeEventId) {
            loadUnreadChat(activeEventId);
          }
        }
      },
    );

    return () => {
      announcementAppStateSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const rsvpChannel = supabase
      .channel("fire-rsvp-home")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rsvps",
        },
        () => {
          console.log("RSVP change detected — refreshing home screen");
          loadEvent();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(rsvpChannel);
    };
  }, []);

  useEffect(() => {
    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (nextAppState === "active") {
          loadEvent();

          const activeEventId = eventIdRef.current;

          if (activeEventId) {
            loadUnreadChat(activeEventId);
          }
        }
      },
    );

    return () => {
      appStateSubscription.remove();
    };
  }, []);

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(
      (notification) => {
        const data = notification.request.content.data;
        const notificationEventId = data?.eventId ? String(data.eventId) : null;
        const activeEventId = eventIdRef.current;
        const fireEventId = notificationEventId || activeEventId;

        if (fireEventId) {
          loadUnreadChat(fireEventId);
        }
      },
    );

    const responseSubscription =
      Notifications.addNotificationResponseReceivedListener((response) => {
        const data = response.notification.request.content.data;
        const notificationEventId = data?.eventId ? String(data.eventId) : null;
        const activeEventId = eventIdRef.current;
        const fireEventId = notificationEventId || activeEventId;

        if (fireEventId) {
          loadUnreadChat(fireEventId);
        }

        if (data?.screen === "home") {
          router.push("/");
        }
      });

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [router, savedFirstName, savedLastName]);

  useEffect(() => {
    if (!event?.id || !savedFirstName || !savedLastName) return;

    loadUnreadChat(event.id);
  }, [event?.id, savedFirstName, savedLastName]);

  useEffect(() => {
    if (!savedFirstName || !savedLastName) return;

    const refreshUnread = () => {
      const activeEventId = eventIdRef.current;

      if (activeEventId) {
        loadUnreadChat(activeEventId);
      }
    };

    refreshUnread();

    const interval = setInterval(refreshUnread, 3000);

    const appStateSubscription = AppState.addEventListener(
      "change",
      (nextAppState) => {
        if (nextAppState === "active") {
          refreshUnread();
        }
      },
    );

    return () => {
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, [savedFirstName, savedLastName]);

  function getChatSeenKey(fireEventId: string) {
    const first = savedFirstName?.trim().toLowerCase() || "unknown";
    const last = savedLastName?.trim().toLowerCase() || "unknown";

    return `last_seen_chat_${fireEventId}_${first}_${last}`;
  }

  async function loadUnreadChat(fireEventId: string) {
    if (!fireEventId || !savedFirstName || !savedLastName) return;

    const myFirstName = savedFirstName.trim().toLowerCase();
    const myLastName = savedLastName.trim().toLowerCase();

    const { data, error } = await supabase
      .from("fire_chat")
      .select("created_at, first_name, last_name, message, media_source, media_url")
      .eq("event_id", fireEventId)
      .order("created_at", { ascending: false });

    if (error) {
      console.log("Error loading unread chat status:", error.message);
      setHasUnreadChat(false);
      setUnreadChatCount(0);
      return;
    }

    if (!data || data.length === 0) {
      setLatestChatCreatedAt(null);
      setLatestChatSender(null);
      setLatestChatPreview(null);
      setHasUnreadChat(false);
      setUnreadChatCount(0);
      return;
    }

    const newestMessage = data[0];
    setLatestChatCreatedAt(newestMessage.created_at);
    setLatestChatSender(
      `${newestMessage.first_name || "Someone"}`.trim() || "Someone",
    );
    setLatestChatPreview(getLatestChatPreview(newestMessage));

    const lastSeen = await AsyncStorage.getItem(getChatSeenKey(fireEventId));

    const unreadMessages = data.filter((message: any) => {
      const messageFirstName = (message.first_name || "").trim().toLowerCase();
      const messageLastName = (message.last_name || "").trim().toLowerCase();
      const messageIsMine =
        messageFirstName === myFirstName && messageLastName === myLastName;

      if (messageIsMine) return false;

      if (!lastSeen) return true;

      return new Date(message.created_at) > new Date(lastSeen);
    });

    setUnreadChatCount(unreadMessages.length);
    setHasUnreadChat(unreadMessages.length > 0);
  }

  async function setupNotifications() {
    try {
      await registerForPushNotificationsAsync(savedFirstName, savedLastName);
    } catch (error) {
      console.log("Push registration failed:", error);
    }
  }

  async function scheduleFireReminderIfNeeded(fireEvent: any) {
    if (!fireEvent?.id || !fireEvent?.event_date || !fireEvent?.event_time) {
      return;
    }

    const fireDateTime = new Date(
      `${fireEvent.event_date}T${fireEvent.event_time}`,
    );

    const reminderTime = new Date(fireDateTime);
    reminderTime.setHours(reminderTime.getHours() - 1);

    if (reminderTime <= new Date()) {
      return;
    }

    const reminderAt = reminderTime.toISOString();
    const reminderKey = `scheduled_fire_reminder_${fireEvent.id}_${fireEvent.event_date}_${fireEvent.event_time}`;

    const alreadyScheduled = await AsyncStorage.getItem(reminderKey);

    const scheduledNotifications =
      await Notifications.getAllScheduledNotificationsAsync();

    const matchingReminderAlreadyExists = scheduledNotifications.some(
      (notification: any) =>
        notification.content?.data?.type === "fire_reminder" &&
        notification.content?.data?.eventId === fireEvent.id &&
        notification.content?.data?.reminderAt === reminderAt,
    );

    if (alreadyScheduled === "true" && matchingReminderAlreadyExists) {
      return;
    }

    for (const notification of scheduledNotifications as any[]) {
      if (notification.content?.data?.type === "fire_reminder") {
        await Notifications.cancelScheduledNotificationAsync(
          notification.identifier,
        );
      }
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "🔥 Fire reminder",
        body: `${fireEvent.title || "Yabs Fire Nite"} starts in 1 hour.`,
        data: {
          type: "fire_reminder",
          screen: "home",
          eventId: fireEvent.id,
          reminderAt,
        },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderTime,
      },
    });

    await AsyncStorage.setItem(reminderKey, "true");
  }

  async function onRefresh() {
    setRefreshing(true);

    try {
      await loadEvent();
      await loadAnnouncements();
      await loadName();
      await loadApprovedGuests();

      const activeEventId = eventIdRef.current;

      if (activeEventId) {
        await loadUnreadChat(activeEventId);
      }
    } finally {
      setRefreshing(false);
    }
  }

  function getDisplayName(person: any) {
    if (person?.first_name && person?.last_name) {
      return `${person.first_name} ${person.last_name}`;
    }

    if (person?.name) return person.name;
    if (person?.first_name) return person.first_name;
    if (person?.last_name) return person.last_name;

    return "Unknown Guest";
  }

  function getPersonKey(person: any) {
    return getDisplayName(person).trim().toLowerCase();
  }

  function dedupePeople(list: any[]) {
    const seen = new Set<string>();

    return list.filter((person: any) => {
      const key = getPersonKey(person);

      if (seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }

  function formatDisplayDate(dateString: string) {
    const date = new Date(`${dateString}T00:00:00`);
    const weekday = date.toLocaleDateString("en-US", { weekday: "long" });
    const month = date.toLocaleDateString("en-US", { month: "long" });
    const day = date.getDate();

    const suffix =
      day % 10 === 1 && day !== 11
        ? "st"
        : day % 10 === 2 && day !== 12
          ? "nd"
          : day % 10 === 3 && day !== 13
            ? "rd"
            : "th";

    return `${weekday}, ${month} ${day}${suffix}`;
  }

  function formatTime(timeString: string) {
    const date = new Date(`2000-01-01T${timeString}`);

    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function formatFireDateTime(dateString: string, timeString: string) {
    const eventDate = new Date(`${dateString}T${timeString}`);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    const eventDay = new Date(eventDate);
    eventDay.setHours(0, 0, 0, 0);

    const time = formatTime(timeString);

    if (eventDay.getTime() === today.getTime()) {
      return `Tonight at ${time}`;
    }

    if (eventDay.getTime() === tomorrow.getTime()) {
      return `Tomorrow at ${time}`;
    }

    return `${formatDisplayDate(dateString)} at ${time}`;
  }


  function formatLatestChatTime(dateString?: string | null) {
    if (!dateString) return "";

    const messageDate = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - messageDate.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return "now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;

    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;

    return messageDate.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });
  }

  function getLatestChatPreview(message: any) {
    const text = (message?.message || "").trim();

    if (text) return text.length > 54 ? `${text.slice(0, 54)}...` : text;

    if (message?.media_source === "giphy") return "Shared a GIF 🔥";
    if (message?.media_url) return "Shared a photo";

    return "New chat activity";
  }

  async function loadAnnouncements() {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      console.log("Error loading announcements:", error.message);
      setAnnouncements([]);
      return;
    }

    setAnnouncements(data ?? []);
  }

  async function loadEvent() {
    setLoading(true);

    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("events")
      .select(
        `
        *,
        rsvps (
          id,
          name,
          first_name,
          last_name,
          response_status
        )
      `,
      )
      .eq("status", "published")
      .is("deleted_at", null)
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });

    if (error || !data || data.length === 0) {
      setUpcomingFires([]);
      setEvent(null);
      setStatus("No upcoming fire found");
      setMessage("");
      setLoading(false);
      return;
    }

    setUpcomingFires(data);

    const nextFire = data[0];

    setSelectedEventId(nextFire.id);
    setEvent(nextFire);
    eventIdRef.current = String(nextFire.id);
    setStatus(nextFire.title || "Next Fire");
    setMessage(nextFire.message || "");
    setLoading(false);

    if (savedFirstName && savedLastName) {
      await loadUnreadChat(String(nextFire.id));
    }
  }

  async function loadName() {
    const storedFirstName = await AsyncStorage.getItem("first_name");
    const storedLastName = await AsyncStorage.getItem("last_name");

    if (storedFirstName && storedLastName) {
      setSavedFirstName(storedFirstName);
      setSavedLastName(storedLastName);
      await checkApproval(storedFirstName, storedLastName);
    } else {
      setApprovalChecked(true);
    }
  }

  async function checkApproval(first: string, last: string) {
    const { data, error } = await supabase
      .from("approved_users")
      .select("*")
      .eq("first_name", first)
      .eq("last_name", last)
      .eq("is_approved", true)
      .maybeSingle();

    setIsApproved(!error && !!data);
    setApprovalChecked(true);
  }

  async function saveName() {
    if (!firstName.trim() || !lastName.trim()) {
      alert("Please enter both first and last name.");
      return;
    }

    await AsyncStorage.setItem("first_name", firstName.trim());
    await AsyncStorage.setItem("last_name", lastName.trim());

    setSavedFirstName(firstName.trim());
    setSavedLastName(lastName.trim());

    await checkApproval(firstName.trim(), lastName.trim());
  }

  async function resetName() {
    await AsyncStorage.removeItem("first_name");
    await AsyncStorage.removeItem("last_name");

    setSavedFirstName(null);
    setSavedLastName(null);
    setFirstName("");
    setLastName("");
    setIsApproved(false);
    setApprovalChecked(true);
  }

  async function loadApprovedGuests() {
    const { data, error } = await supabase
      .from("approved_users")
      .select("*")
      .eq("is_approved", true)
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true });

    if (error) {
      alert(error.message);
      return;
    }

    setApprovedGuests(data ?? []);
  }

  function selectUpcomingFire(fire: any) {
    router.push({
      pathname: "/fire-details",
      params: {
        eventId: fire.id,
      },
    });
  }

  async function openFireDetails() {
    if (!event?.id) return;

    setHasUnreadChat(false);
    setUnreadChatCount(0);

    router.push({
      pathname: "/fire-details",
      params: {
        eventId: event.id,
      },
    });
  }

  return (
    <ScrollView
      contentContainerStyle={styles.screen}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor="#f97316"
          colors={["#f97316"]}
          progressBackgroundColor="#121212"
        />
      }
    >
      <View style={styles.header}>
        <Text style={styles.appTitle}>🔥 Yabs Fire Nite</Text>
        <Text style={styles.subtitle}>
          {event
            ? "The next fire is locked in."
            : latestAnnouncement
              ? "Latest host update"
              : "No fire scheduled right now."}
        </Text>
      </View>

      <Pressable
        disabled={!event || showHomeLoadingCard}
        onPress={openFireDetails}
      >
        <Animated.View
          entering={FadeInUp.duration(500)}
          style={styles.heroCard}
        >
          {showHomeLoadingCard ? (
            <>
              <Text style={styles.heroLabel}>LOADING FIRE</Text>

              <View style={styles.skeletonTitle} />
              <View style={styles.skeletonDate} />
              <View style={styles.skeletonMessageLong} />
              <View style={styles.skeletonMessageShort} />

              <View style={styles.statsRow}>
                <View style={styles.skeletonStatBox} />
                <View style={styles.skeletonStatBox} />
                <View style={styles.skeletonStatBox} />
                <View style={styles.skeletonStatBox} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.heroLabel}>
                {event
                  ? "NEXT FIRE"
                  : latestAnnouncement
                    ? "ANNOUNCEMENT"
                    : "STATUS"}
              </Text>

              <Text style={styles.heroTitle}>
                {event
                  ? status
                  : latestAnnouncement
                    ? "Fire Announcement"
                    : status}
              </Text>

              {event && (
                <Text style={styles.heroDate}>
                  {formatFireDateTime(event.event_date, event.event_time)}
                </Text>
              )}

              {event && countdownText ? (
                <Text style={styles.countdownText}>🔥 {countdownText}</Text>
              ) : null}

              {event && weather ? (
                <Text style={styles.weatherText}>
                  {weather.icon || "🌤️"} {Math.round(weather.temperature)}°F •{" "}
                  {weather.rainChance ?? 0}% rain •{" "}
                  {Math.round(weather.windSpeed)} mph wind
                </Text>
              ) : null}

              <Text style={styles.heroMessage}>
                {event
                  ? message || "No message for this fire."
                  : latestAnnouncement
                    ? latestAnnouncement.message
                    : "Check back soon."}
              </Text>

              {event && (
                <>
                  <View style={styles.statsRow}>
                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>{goingCount}</Text>
                      <Text style={styles.statLabel}>Coming</Text>
                    </View>

                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>{maybeCount}</Text>
                      <Text style={styles.statLabel}>Maybe</Text>
                    </View>

                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>{notGoingCount}</Text>
                      <Text style={styles.statLabel}>Not Coming</Text>
                    </View>

                    <View style={styles.statBox}>
                      <Text style={styles.statNumber}>
                        {notRespondedList.length}
                      </Text>
                      <Text style={styles.statLabel}>No Reply</Text>
                    </View>
                  </View>

                  {hasUnreadChat && (
                    <View style={styles.unreadChatPill}>
                      <Text style={styles.unreadChatPillTitle}>New Chat</Text>
                      <Text style={styles.unreadChatPillCount}>
                        {unreadChatCount === 1
                          ? "1 new message"
                          : `${unreadChatCount} New Messages`}
                      </Text>

                      {latestChatPreview ? (
                        <Text style={styles.unreadChatPreview} numberOfLines={1}>
                          {latestChatSender ? `${latestChatSender}: ` : ""}
                          {latestChatPreview}
                        </Text>
                      ) : null}

                      {latestChatCreatedAt ? (
                        <Text style={styles.unreadChatTime}>
                          {formatLatestChatTime(latestChatCreatedAt)}
                        </Text>
                      ) : null}
                    </View>
                  )}

                  <Text style={styles.tapHint}>
                    Tap to RSVP, view guests, and chat
                  </Text>
                </>
              )}
            </>
          )}
        </Animated.View>
      </Pressable>

      {announcements.length > 0 ? (
        <View style={styles.announcementCard}>
          <Text style={styles.announcementLabel}>Host Announcements</Text>

          {announcements.map((item: any, index: number) => (
            <View
              key={item.id || index}
              style={[
                styles.announcementItem,
                index === announcements.length - 1 &&
                  styles.lastAnnouncementItem,
              ]}
            >
              <Text style={styles.announcementMessage}>{item.message}</Text>

              {item.created_at ? (
                <Text style={styles.announcementDate}>
                  {new Date(item.created_at).toLocaleString()}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}

      {upcomingFires.length > 1 && (
        <View style={styles.upcomingCard}>
          <Text style={styles.sectionTitle}>Upcoming Fires</Text>

          {upcomingFires.map((fire: any) => (
            <Pressable
              key={fire.id}
              onPress={() => selectUpcomingFire(fire)}
              style={[
                styles.upcomingFireButton,
                selectedEventId === fire.id &&
                  styles.selectedUpcomingFireButton,
              ]}
            >
              <Text style={styles.upcomingFireTitle}>
                {formatFireDateTime(fire.event_date, fire.event_time)}
              </Text>

              <Text style={styles.upcomingFireMessage}>
                {fire.message || "No message added."}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {!savedFirstName || !savedLastName ? (
        <View style={styles.mainCard}>
          <Text style={styles.cardLabel}>Your Info</Text>

          <TextInput
            placeholder="First name"
            placeholderTextColor="#888"
            value={firstName}
            onChangeText={setFirstName}
            style={styles.nameInput}
          />

          <TextInput
            placeholder="Last name"
            placeholderTextColor="#888"
            value={lastName}
            onChangeText={setLastName}
            style={styles.nameInput}
          />

          <Pressable onPress={saveName} style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>Continue</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View style={styles.mainCard}>
            <Text style={styles.cardLabel}>Your Account</Text>

            <Text style={styles.accountName}>
              {savedFirstName} {savedLastName}
            </Text>

            {isHost && (
              <Text style={styles.hostAccess}>Host Access Enabled 🔥</Text>
            )}

            <Pressable onPress={resetName} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Reset Name</Text>
            </Pressable>
          </View>

          {event && approvalChecked && !isApproved && (
            <Text style={styles.notApprovedText}>
              You are not currently approved to access Yabs Fire Nite.
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  announcementItem: {
    borderBottomWidth: 1,
    borderBottomColor: "#333",
    paddingBottom: 10,
    marginBottom: 10,
  },
  lastAnnouncementItem: {
    borderBottomWidth: 0,
    paddingBottom: 0,
    marginBottom: 0,
  },
  announcementCard: {
    width: "100%",
    backgroundColor: "#24170f",
    borderRadius: 22,
    padding: 16,
    borderWidth: 1,
    borderColor: "#f97316",
    marginTop: 14,
    marginBottom: 8,
  },
  announcementLabel: {
    color: "#f97316",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  announcementMessage: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    lineHeight: 22,
  },
  announcementDate: {
    color: "#aaa",
    fontSize: 12,
    marginTop: 10,
  },
  screen: {
    flexGrow: 1,
    backgroundColor: "#121212",
    padding: 20,
    paddingBottom: 50,
    alignItems: "center",
  },
  header: {
    width: "100%",
    marginTop: 10,
    marginBottom: 20,
    alignItems: "center",
  },
  appTitle: {
    color: "#fff",
    fontSize: 34,
    fontWeight: "900",
    textAlign: "center",
    letterSpacing: -0.5,
  },
  subtitle: {
    color: "#b3b3ba",
    marginTop: 8,
    fontSize: 15,
    textAlign: "center",
    lineHeight: 21,
  },
  heroCard: {
    width: "100%",
    backgroundColor: "#1f1f1f",
    borderRadius: 30,
    padding: 24,
    borderWidth: 1,
    borderColor: "#333",
    marginTop: 8,
    marginBottom: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    elevation: 6,
  },
  skeletonTitle: {
    width: "78%",
    height: 30,
    backgroundColor: "#2b2b2b",
    borderRadius: 10,
    marginTop: 4,
    marginBottom: 14,
  },
  skeletonDate: {
    width: "58%",
    height: 24,
    backgroundColor: "#2b2b2b",
    borderRadius: 10,
    marginBottom: 18,
  },
  skeletonMessageLong: {
    width: "100%",
    height: 16,
    backgroundColor: "#2b2b2b",
    borderRadius: 10,
    marginBottom: 10,
  },
  skeletonMessageShort: {
    width: "72%",
    height: 16,
    backgroundColor: "#2b2b2b",
    borderRadius: 10,
    marginBottom: 20,
  },
  skeletonStatBox: {
    flex: 1,
    height: 70,
    backgroundColor: "#2b2b2b",
    borderRadius: 16,
  },
  heroLabel: {
    color: "#f97316",
    fontWeight: "900",
    marginBottom: 10,
    letterSpacing: 1,
    fontSize: 13,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 8,
  },
  heroDate: {
    color: "#facc15",
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 36,
  },
  countdownText: {
    color: "#f97316",
    fontSize: 14,
    fontWeight: "800" as const,
    marginTop: 10,
    marginBottom: 12,
  },
  weatherText: {
    color: "#b3b3ba",
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 12,
  },
  heroMessage: {
    color: "#ddd",
    marginTop: 8,
    marginBottom: 20,
    fontSize: 17,
    lineHeight: 26,
  },
  tapHint: {
    color: "#f97316",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 16,
  },
  unreadChatPill: {
    alignSelf: "center",
    marginTop: 14,
    backgroundColor: "#ef4444",
    paddingVertical: 9,
    paddingHorizontal: 22,
    borderRadius: 18,
    alignItems: "center",
    maxWidth: "92%",
  },
  unreadChatPillTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0.7,
    textAlign: "center",
  },
  unreadChatPillCount: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 2,
  },
  unreadChatPreview: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 4,
    maxWidth: 260,
  },
  unreadChatTime: {
    color: "#fee2e2",
    fontSize: 11,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 2,
  },
  mainCard: {
    width: "100%",
    backgroundColor: "#1f1f1f",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#333",
    marginTop: 16,
  },
  cardLabel: {
    color: "#f97316",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: 10,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statBox: {
    width: "48%",
    backgroundColor: "#2a2a2a",
    borderRadius: 18,
    paddingVertical: 15,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#3a3a3a",
  },
  statNumber: {
    color: "#f97316",
    fontSize: 22,
    fontWeight: "900",
  },
  statLabel: {
    color: "#bbb",
    marginTop: 4,
    fontSize: 13,
    fontWeight: "800",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 12,
  },
  emptyText: {
    color: "#888",
    marginTop: 8,
    fontSize: 15,
    lineHeight: 22,
  },
  nameInput: {
    marginTop: 10,
    backgroundColor: "#121212",
    color: "#fff",
    padding: 14,
    borderRadius: 16,
    textAlign: "center",
    borderWidth: 1,
    borderColor: "#333",
    fontSize: 16,
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: "#f97316",
    paddingVertical: 16,
    borderRadius: 18,
    alignItems: "center",
  },
  primaryButtonText: {
    color: "#111",
    fontSize: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  secondaryButton: {
    marginTop: 10,
    backgroundColor: "#2a2a2a",
    paddingVertical: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#333",
  },
  secondaryButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  accountName: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900",
  },
  hostAccess: {
    color: "#22c55e",
    marginTop: 8,
    fontWeight: "900",
  },
  notApprovedText: {
    color: "#ef4444",
    marginTop: 20,
    textAlign: "center",
    fontWeight: "800",
    lineHeight: 22,
  },
  upcomingCard: {
    width: "100%",
    backgroundColor: "#1f1f1f",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 16,
  },
  upcomingFireButton: {
    backgroundColor: "#2a2a2a",
    borderRadius: 18,
    padding: 12,
    borderWidth: 1,
    borderColor: "#333",
    marginTop: 10,
  },
  selectedUpcomingFireButton: {
    borderColor: "#f97316",
    backgroundColor: "#2a1a10",
  },
  upcomingFireTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
  },
  upcomingFireMessage: {
    color: "#bbb",
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
  },
  unreadBadge: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    alignSelf: "flex-start" as const,
    marginTop: 8,
    marginBottom: 8,
  },
  unreadBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "800" as const,
    letterSpacing: 0.5,
  },
});
