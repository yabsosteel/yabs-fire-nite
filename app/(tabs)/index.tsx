import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { registerForPushNotificationsAsync } from "../../lib/notifications";
import Animated, { FadeInUp } from "react-native-reanimated";

export default function HomeScreen() {
  const router = useRouter();
  const eventIdRef = useRef<string | null>(null);

  const [event, setEvent] = useState<any>(null);
  const [upcomingFires, setUpcomingFires] = useState<any[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState<any>(null);
  const [status, setStatus] = useState("Loading event...");
  const [message, setMessage] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savedFirstName, setSavedFirstName] = useState<string | null>(null);
  const [savedLastName, setSavedLastName] = useState<string | null>(null);

  const [isApproved, setIsApproved] = useState(false);
  const [approvalChecked, setApprovalChecked] = useState(false);

  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [historyFilter, setHistoryFilter] = useState<
    "all" | "going" | "maybe" | "not_going"
  >("all");

  const [approvedGuests, setApprovedGuests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasUnreadChat, setHasUnreadChat] = useState(false);
  const [latestChatCreatedAt, setLatestChatCreatedAt] = useState<string | null>(null);

  const isHost =
    savedFirstName?.toLowerCase() === "rian" &&
    savedLastName?.toLowerCase() === "yablun";

  const currentGoingList = dedupePeople(
    event?.rsvps?.filter((r: any) => r.response_status === "going") || []
  );

  const maybeList = dedupePeople(
    event?.rsvps?.filter((r: any) => r.response_status === "maybe") || []
  );

  const notGoingList = dedupePeople(
    event?.rsvps?.filter((r: any) => r.response_status === "not_going") || []
  );

  const goingCount = currentGoingList.length;
  const maybeCount = maybeList.length;
  const notGoingCount = notGoingList.length;

  const respondedKeys = new Set(
    (event?.rsvps || []).map((r: any) =>
      `${r.first_name} ${r.last_name}`.toLowerCase().trim()
    )
  );

  const notRespondedList = dedupePeople(
    (approvedGuests || []).filter((guest: any) => {
      const key = `${guest.first_name} ${guest.last_name}`
        .toLowerCase()
        .trim();

      return key !== "rian yablun" && !respondedKeys.has(key);
    })
  );

  const visibleHistory = history.filter((item: any) => {
    const itemStatus = item.events?.status?.toLowerCase?.().trim();
    return !item.events?.deleted_at && itemStatus !== "deleted";
  });

  const displayHistory =
    historyFilter === "all"
      ? visibleHistory
      : visibleHistory.filter(
          (item: any) => item.response_status === historyFilter
        );

  useEffect(() => {
    loadEvent();
    loadAnnouncement();
    loadName();
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
    const channel = supabase
      .channel("realtime-home")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          loadEvent();
          loadAnnouncement();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rsvps" },
        () => {
          loadEvent();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => {
          loadAnnouncement();
        }
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
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [event?.id]);

  useFocusEffect(
    useCallback(() => {
      loadEvent();
      loadAnnouncement();

      if (event?.id) {
        loadUnreadChat(event.id);
      }

      if (isHost) {
        loadApprovedGuests();
      }
    }, [isHost, event?.id, savedFirstName, savedLastName])
  );

  useEffect(() => {
    const receivedSubscription = Notifications.addNotificationReceivedListener(
      () => {
        const activeEventId = eventIdRef.current;

        if (activeEventId) {
          loadUnreadChat(activeEventId);
        }
      }
    );

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;

        const activeEventId = eventIdRef.current;

        if (activeEventId) {
          loadUnreadChat(activeEventId);
        }

        if (data?.screen === "home") {
          router.push("/");
        }
      }
    );

    return () => {
      receivedSubscription.remove();
      responseSubscription.remove();
    };
  }, [router]);

  useEffect(() => {
    if (isHost) {
      loadApprovedGuests();
    }
  }, [isHost]);

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
      }
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

    const { data, error } = await supabase
      .from("fire_chat")
      .select("created_at")
      .eq("event_id", fireEventId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.log("Error loading unread chat status:", error.message);
      return;
    }

    if (!data?.created_at) {
      setLatestChatCreatedAt(null);
      setHasUnreadChat(false);
      return;
    }

    setLatestChatCreatedAt(data.created_at);

    const lastSeen = await AsyncStorage.getItem(getChatSeenKey(fireEventId));

    if (!lastSeen) {
      setHasUnreadChat(true);
      return;
    }

    setHasUnreadChat(new Date(data.created_at) > new Date(lastSeen));
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
      `${fireEvent.event_date}T${fireEvent.event_time}`
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
        notification.content?.data?.reminderAt === reminderAt
    );

    if (alreadyScheduled === "true" && matchingReminderAlreadyExists) {
      return;
    }

    for (const notification of scheduledNotifications as any[]) {
      if (notification.content?.data?.type === "fire_reminder") {
        await Notifications.cancelScheduledNotificationAsync(
          notification.identifier
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

  function formatHistoryResponse(response: string) {
    if (response === "going") return "Yes — Coming";
    if (response === "maybe") return "Maybe";
    return "No — Not Coming";
  }

  function formatRSVPDate(dateString: string) {
    return new Date(dateString).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  async function loadAnnouncement() {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setAnnouncement(data);
    } else {
      setAnnouncement(null);
    }
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
      `
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

    const selectedFire =
      data.find((fire: any) => fire.id === selectedEventId) || data[0];

    setSelectedEventId(selectedFire.id);
    setEvent(selectedFire);
    setStatus(selectedFire.title || "Next Fire");
    setMessage(selectedFire.message || "");
    setLoading(false);
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
    setHistory([]);
    setShowHistory(false);
  }

  async function loadHistory() {
    if (!savedFirstName || !savedLastName) return;

    if (showHistory) {
      setShowHistory(false);
      return;
    }

    await refreshHistory();
    setShowHistory(true);
  }

  async function refreshHistory() {
    if (!savedFirstName || !savedLastName) return;

    let query = supabase
      .from("rsvps")
      .select(
        `
        *,
        events!inner (
          event_date,
          event_time,
          message,
          status,
          deleted_at
        )
      `
      )
      .is("events.deleted_at", null)
      .neq("events.status", "deleted")
      .order("created_at", { ascending: false });

    if (!isHost) {
      query = query.eq("first_name", savedFirstName).eq("last_name", savedLastName);
    }

    const { data, error } = await query;

    if (error) {
      alert(error.message);
      return;
    }

    setHistory(data ?? []);
  }

  async function loadApprovedGuests() {
    if (!isHost) return;

    const { data, error } = await supabase
      .from("approved_users")
      .select("*")
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true });

    if (error) {
      alert(error.message);
      return;
    }

    setApprovedGuests(data ?? []);
  }

  function selectUpcomingFire(fire: any) {
    setSelectedEventId(fire.id);
    setEvent(fire);
    setStatus(fire.title || "Next Fire");
    setMessage(fire.message || "");
    loadUnreadChat(fire.id);
  }

  async function openFireDetails() {
    if (!event?.id) return;

    await AsyncStorage.setItem(
      getChatSeenKey(event.id),
      latestChatCreatedAt || new Date().toISOString()
    );
    setHasUnreadChat(false);

    router.push({
      pathname: "/fire-details",
      params: {
        eventId: event.id,
      },
    });
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.appTitle}>🔥 Yabs Fire Nite</Text>
        <Text style={styles.subtitle}>
          {event
            ? "The next fire is locked in."
            : announcement
            ? "Latest host update"
            : "No fire scheduled right now."}
        </Text>
      </View>

      {upcomingFires.length > 1 && (
        <View style={styles.upcomingCard}>
          <Text style={styles.sectionTitle}>Upcoming Fires</Text>

          {upcomingFires.map((fire: any) => (
            <Pressable
              key={fire.id}
              onPress={() => selectUpcomingFire(fire)}
              style={[
                styles.upcomingFireButton,
                selectedEventId === fire.id && styles.selectedUpcomingFireButton,
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

      <Pressable disabled={!event} onPress={openFireDetails}>
        <Animated.View entering={FadeInUp.duration(500)} style={styles.heroCard}>
          <Text style={styles.heroLabel}>
            {event ? "NEXT FIRE" : announcement ? "ANNOUNCEMENT" : "STATUS"}
          </Text>

          <Text style={styles.heroTitle}>
            {event ? status : announcement ? "Fire Announcement" : status}
          </Text>

          {event && (
            <Text style={styles.heroDate}>
              {formatFireDateTime(event.event_date, event.event_time)}
            </Text>
          )}

          <Text style={styles.heroMessage}>
            {event
              ? message || "No message for this fire."
              : announcement
              ? announcement.message
              : loading
              ? "Loading..."
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
                  <Text style={styles.statNumber}>{notRespondedList.length}</Text>
                  <Text style={styles.statLabel}>No Reply</Text>
                </View>
              </View>

              {hasUnreadChat && (
                <View style={styles.unreadChatPill}>
                  <Text style={styles.unreadChatPillText}>New chat messages</Text>
                </View>
              )}

              <Text style={styles.tapHint}>Tap to RSVP, view guests, and chat</Text>
            </>
          )}
        </Animated.View>
      </Pressable>

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

            <Pressable onPress={loadHistory} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>
                {showHistory
                  ? "Hide History"
                  : isHost
                  ? "View All History"
                  : "View My History"}
              </Text>
            </Pressable>

            <Pressable onPress={resetName} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Reset Name</Text>
            </Pressable>
          </View>

          {showHistory && (
            <View style={styles.historyCard}>
              <Text style={styles.historyTitle}>
                {isHost ? "All Fire History" : "My Fire History"}
              </Text>

              <View style={styles.filterRow}>
                <FilterButton
                  label="All"
                  active={historyFilter === "all"}
                  onPress={() => setHistoryFilter("all")}
                />
                <FilterButton
                  label="Going"
                  active={historyFilter === "going"}
                  onPress={() => setHistoryFilter("going")}
                />
                <FilterButton
                  label="Maybe"
                  active={historyFilter === "maybe"}
                  onPress={() => setHistoryFilter("maybe")}
                />
                <FilterButton
                  label="Not Going"
                  active={historyFilter === "not_going"}
                  onPress={() => setHistoryFilter("not_going")}
                />
              </View>

              {displayHistory.length === 0 ? (
                <Text style={styles.emptyText}>No history matches this filter.</Text>
              ) : (
                displayHistory.map((item: any) => (
                  <View key={item.id} style={styles.historyItem}>
                    <Text style={styles.historyName}>{getDisplayName(item)}</Text>

                    <Text style={styles.historyText}>
                      Response: {formatHistoryResponse(item.response_status)}
                    </Text>

                    <Text style={styles.historyText}>
                      Fire:{" "}
                      {item.events?.event_date
                        ? formatDisplayDate(item.events.event_date)
                        : ""}
                      {item.events?.event_time
                        ? ` at ${formatTime(item.events.event_time)}`
                        : ""}
                    </Text>

                    {item.events?.status && (
                      <Text
                        style={[
                          styles.historyText,
                          item.events.status === "cancelled" && {
                            color: "#ef4444",
                          },
                        ]}
                      >
                        Status: {item.events.status}
                      </Text>
                    )}

                    <Text style={styles.historyText}>
                      RSVP Date: {formatRSVPDate(item.created_at)}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}

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

function FilterButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.filterButton,
        {
          backgroundColor: active ? "#f97316" : "#232326",
          borderColor: active ? "#f97316" : "#2f2f35",
        },
      ]}
    >
      <Text style={{ color: active ? "#111" : "#fff", fontWeight: "700" }}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: "#0f0f10",
    padding: 20,
    paddingBottom: 40,
    alignItems: "center",
  },
  header: {
    width: "100%",
    marginTop: 10,
    marginBottom: 18,
    alignItems: "center",
  },
  appTitle: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "900",
    textAlign: "center",
  },
  subtitle: {
    color: "#b3b3ba",
    marginTop: 6,
    fontSize: 15,
    textAlign: "center",
  },
  heroCard: {
    width: "100%",
    backgroundColor: "#18181b",
    borderRadius: 22,
    padding: 20,
    borderWidth: 1,
    borderColor: "#2f2f35",
    marginTop: 8,
  },
  heroLabel: {
    color: "#f97316",
    fontWeight: "900",
    marginBottom: 6,
    letterSpacing: 1,
    fontSize: 13,
  },
  heroTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
    marginBottom: 8,
  },
  heroDate: {
    color: "#fff",
    fontSize: 26,
    fontWeight: "900",
    lineHeight: 34,
  },
  heroMessage: {
    color: "#b3b3ba",
    marginTop: 10,
    marginBottom: 20,
    fontSize: 15,
    lineHeight: 22,
  },
  tapHint: {
    color: "#f97316",
    fontSize: 13,
    fontWeight: "800",
    textAlign: "center",
    marginTop: 16,
  },
  unreadChatPill: {
    alignSelf: "center",
    marginTop: 14,
    backgroundColor: "#ef4444",
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
  },
  unreadChatPillText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "900",
  },
  mainCard: {
    width: "100%",
    backgroundColor: "#18181b",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#2f2f35",
    marginTop: 14,
  },
  cardLabel: {
    color: "#f97316",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statBox: {
    width: "48%",
    backgroundColor: "#232326",
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#2f2f35",
  },
  statNumber: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900",
  },
  statLabel: {
    color: "#b3b3ba",
    marginTop: 3,
    fontSize: 12,
    fontWeight: "700",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },
  emptyText: {
    color: "#8e8e95",
    marginTop: 8,
    fontSize: 14,
  },
  nameInput: {
    marginTop: 10,
    backgroundColor: "#232326",
    color: "#fff",
    padding: 12,
    borderRadius: 10,
    textAlign: "center",
  },
  primaryButton: {
    marginTop: 12,
    backgroundColor: "#f97316",
    paddingVertical: 13,
    borderRadius: 12,
  },
  primaryButtonText: {
    color: "#111",
    fontWeight: "900",
    textAlign: "center",
  },
  secondaryButton: {
    marginTop: 10,
    backgroundColor: "#232326",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2f2f35",
  },
  secondaryButtonText: {
    color: "#fff",
    fontWeight: "800",
    textAlign: "center",
  },
  accountName: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "800",
  },
  hostAccess: {
    color: "#22c55e",
    marginTop: 6,
    fontWeight: "800",
  },
  historyCard: {
    marginTop: 20,
    width: "100%",
    backgroundColor: "#18181b",
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#2f2f35",
  },
  historyTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 6,
  },
  filterButton: {
    marginRight: 8,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  historyItem: {
    marginTop: 10,
    padding: 10,
    backgroundColor: "#232326",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2f2f35",
  },
  historyName: {
    color: "#fff",
    fontWeight: "800",
  },
  historyText: {
    color: "#b3b3ba",
    marginTop: 3,
  },
  notApprovedText: {
    color: "#ef4444",
    marginTop: 20,
    textAlign: "center",
  },
  upcomingCard: {
    width: "100%",
    backgroundColor: "#18181b",
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2f2f35",
    marginBottom: 16,
  },
  upcomingFireButton: {
    backgroundColor: "#232326",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2f2f35",
    marginTop: 10,
  },
  selectedUpcomingFireButton: {
    borderColor: "#f97316",
    backgroundColor: "#2a1a10",
  },
  upcomingFireTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800",
  },
  upcomingFireMessage: {
    color: "#b3b3ba",
    marginTop: 5,
    fontSize: 14,
  },
});