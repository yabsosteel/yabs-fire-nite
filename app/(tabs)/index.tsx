import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import * as Notifications from "expo-notifications";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";
import { registerForPushNotificationsAsync } from "../../lib/notifications";
import { sendPushNotificationToHosts } from "../../lib/notifications";
import Animated, {
  FadeInUp,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

export default function HomeScreen() {
  const router = useRouter();

  const [event, setEvent] = useState<any>(null);
  const [announcement, setAnnouncement] = useState<any>(null);
  const [status, setStatus] = useState("Loading event...");
  const [message, setMessage] = useState("");
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const chatScrollRef = useRef<ScrollView>(null);

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
  const [myRSVP, setMyRSVP] = useState<
    "going" | "maybe" | "not_going" | null
  >(null);

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
const [loading, setLoading] = useState(true);

  useEffect(() => {
    setupNotifications();
    loadEvent();
    loadAnnouncement();
    loadName();
  }, []);

  useEffect(() => {
    if (event?.id) {
      scheduleFireReminderIfNeeded(event);
    }
  }, [event?.id, event?.event_date, event?.event_time]);
useEffect(() => {
  if (event?.id) {
    loadChatMessages();
  }
}, [event?.id]);
useEffect(() => {
  if (!event?.id) return;

  const channel = supabase
    .channel(`fire-chat-${event.id}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "fire_chat",
        filter: `event_id=eq.${event.id}`,
      },
      (payload) => {
        const newMessage = payload.new;

        setChatMessages((currentMessages: any[]) => {
          const alreadyExists = currentMessages.some(
            (message) => message.id === newMessage.id
          );

          if (alreadyExists) return currentMessages;

          return [...currentMessages, newMessage];
        });
      }
    )
    .subscribe();

  return () => {
    supabase.removeChannel(channel);
  };
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadEvent();
      loadAnnouncement();

      if (isHost) {
        loadApprovedGuests();
      }
    }, [isHost])
  );

  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data;

        if (data?.screen === "home") {
          router.push("/");
        }
      }
    );

    return () => subscription.remove();
  }, [router]);

  useEffect(() => {
    if (event && savedFirstName && savedLastName) {
      const mine = event.rsvps?.find(
        (r: any) =>
          r.first_name?.toLowerCase() === savedFirstName.toLowerCase() &&
          r.last_name?.toLowerCase() === savedLastName.toLowerCase()
      );

      setMyRSVP(mine?.response_status || null);
    } else {
      setMyRSVP(null);
    }
  }, [event, savedFirstName, savedLastName]);

  useEffect(() => {
    if (isHost) {
      loadApprovedGuests();
    }
  }, [isHost]);

  async function setupNotifications() {
    try {
      await registerForPushNotificationsAsync();
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
      .select(`
        *,
        rsvps (
          id,
          name,
          first_name,
          last_name,
          response_status
        )
      `)
      .eq("status", "published")
      .is("deleted_at", null)
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      setEvent(null);
      setStatus("No upcoming fire found");
      setMessage("");
      setLoading(false);
      return;
    }

    setEvent(data);
    setStatus(data.title || "Next Fire");
    setMessage(data.message || "");
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
    setMyRSVP(null);
  }

  async function handleRSVP(response_status: "going" | "maybe" | "not_going") {
    if (!event || !savedFirstName || !savedLastName || !isApproved) return;

    const { error } = await supabase.from("rsvps").upsert(
      {
        event_id: event.id,
        name: `${savedFirstName} ${savedLastName}`,
        first_name: savedFirstName,
        last_name: savedLastName,
        response_status,
      },
      { onConflict: "event_id,first_name,last_name" }
    );

    if (error) {
      alert(error.message);
      return;
    }
    
const formattedDate = new Date(event.event_date).toLocaleDateString(
  "en-US",
  {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }
);

const responseText =
  response_status === "going"
    ? "is going to"
    : response_status === "maybe"
    ? "is maybe attending"
    : "is not going to";

await sendPushNotificationToHosts(
  "Fire RSVP Update",
  `${savedFirstName} ${savedLastName} ${responseText} ${
    event.title || "the Fire"
  } on ${formattedDate}.`
);
    setMyRSVP(response_status);

    alert(
      response_status === "going"
        ? "You're in 🔥"
        : response_status === "maybe"
        ? "Got it — marked maybe"
        : "Got it — marked not coming"
    );

    await loadEvent();

    if (showHistory) {
      await refreshHistory();
    }
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
async function loadChatMessages() {
  if (!event?.id) return;

  const { data, error } = await supabase
    .from("fire_chat")
    .select("*")
    .eq("event_id", event.id)
    .order("created_at", { ascending: true });

  if (error) {
    alert(error.message);
    return;
  }

  setChatMessages(data ?? []);
}

async function sendChatMessage() {
  if (!event?.id || !savedFirstName || !savedLastName || !chatInput.trim()) {
    return;
  }

  const { error } = await supabase.from("fire_chat").insert({
    event_id: event.id,
    first_name: savedFirstName,
    last_name: savedLastName,
    message: chatInput.trim(),
  });

  if (error) {
    alert(error.message);
    return;
  }

  setChatInput("");
}
  async function refreshHistory() {
    if (!savedFirstName || !savedLastName) return;

    let query = supabase
      .from("rsvps")
      .select(`
        *,
        events!inner (
          event_date,
          event_time,
          message,
          status,
          deleted_at
        )
      `)
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

      <Animated.View
  entering={FadeInUp.duration(500)}
  style={styles.heroCard}
>
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
            : "Check back soon."}
        </Text>

        {event && (
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
        )}

        {event && isApproved && !isHost && (
          <View style={styles.rsvpArea}>
            <RSVPButton
              label="Yes — I’m Coming"
              activeLabel="You're In 🔥"
              active={myRSVP === "going"}
              color="#22c55e"
              textColor="#07130b"
              onPress={() => handleRSVP("going")}
            />

            <RSVPButton
              label="Maybe"
              activeLabel="Marked Maybe"
              active={myRSVP === "maybe"}
              color="#facc15"
              textColor="#1c1600"
              onPress={() => handleRSVP("maybe")}
            />

            <RSVPButton
              label="No — I’m Not Coming"
              activeLabel="Marked Not Coming"
              active={myRSVP === "not_going"}
              color="#ef4444"
              textColor="#1a0505"
              onPress={() => handleRSVP("not_going")}
            />
          </View>
        )}
      </Animated.View>

      {event && (
        <View style={styles.listCard}>
          <Text style={styles.sectionTitle}>Guest List</Text>

          <Text style={styles.listHeadingGreen}>Coming</Text>
          {currentGoingList.length === 0 ? (
            <Text style={styles.emptyText}>No yes responses yet.</Text>
          ) : (
            currentGoingList.map((r: any) => (
              <Text key={r.id} style={styles.guestName}>
                • {getDisplayName(r)}
              </Text>
            ))
          )}

          <Text style={styles.listHeadingYellow}>Maybe</Text>
          {maybeList.length === 0 ? (
            <Text style={styles.emptyText}>No maybe responses yet.</Text>
          ) : (
            maybeList.map((r: any) => (
              <Text key={r.id} style={styles.guestName}>
                • {getDisplayName(r)}
              </Text>
            ))
          )}

          <Text style={styles.listHeadingRed}>Not Coming</Text>
          {notGoingList.length === 0 ? (
            <Text style={styles.emptyText}>No no responses yet.</Text>
          ) : (
            notGoingList.map((r: any) => (
              <Text key={r.id} style={styles.guestName}>
                • {getDisplayName(r)}
              </Text>
            ))
          )}

          {isHost && (
            <>
              <Text style={styles.listHeadingYellow}>Hasn’t Responded</Text>
              {notRespondedList.length === 0 ? (
                <Text style={styles.emptyText}>Everyone has responded.</Text>
              ) : (
                notRespondedList.map((person: any) => (
                  <Text key={person.id} style={styles.guestName}>
                    • {getDisplayName(person)}
                  </Text>
                ))
              )}
            </>
          )}
        </View>
      )}
{event && savedFirstName && savedLastName && isApproved && (
  <View style={styles.chatCard}>
  
<Text style={styles.chatHint}>Scroll inside chat to view older messages</Text>
<ScrollView
  ref={chatScrollRef}
  style={{ maxHeight: 300 }}
  nestedScrollEnabled={true}
  keyboardShouldPersistTaps="handled"
  onContentSizeChange={() => {
  if (chatMessages.length > 0) {
    setTimeout(() => {
      chatScrollRef.current?.scrollToEnd({ animated: true });
    }, 100);
  }
}}
>
  {chatMessages.length === 0 ? (
    <Text style={styles.emptyText}>No messages yet. Start the chat.</Text>
  ) : (
    chatMessages.map((chat: any) => (
      <View key={chat.id} style={styles.chatMessage}>
        <Text style={styles.chatName}>
          {chat.first_name} {chat.last_name}
        </Text>
        <Text style={styles.chatText}>{chat.message}</Text>
      </View>
    ))
  )}
</ScrollView>

    <TextInput
      placeholder="Send a message..."
      placeholderTextColor="#888"
      value={chatInput}
      onChangeText={setChatInput}
      style={styles.chatInput}
      maxLength={200}
    />

    <Pressable onPress={sendChatMessage} style={styles.primaryButton}>
      <Text style={styles.primaryButtonText}>Send Message</Text>
    </Pressable>
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

function RSVPButton({
  label,
  activeLabel,
  active,
  color,
  textColor,
  onPress,
}: {
  label: string;
  activeLabel: string;
  active: boolean;
  color: string;
  textColor: string;
  onPress: () => void;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));


  return (
    <Animated.View style={animatedStyle}>
      <Pressable
        onPressIn={() => {
          scale.value = withSpring(0.96);
        }}
        onPressOut={() => {
          scale.value = withSpring(1);
        }}
        onPress={onPress}
        style={[
          styles.rsvpButton,
          {
            backgroundColor: active ? color : "#232326",
            borderColor: active ? color : "#2f2f35",
          },
        ]}
      >
        <Text
          style={[
            styles.rsvpButtonText,
            {
              color: active ? textColor : "#fff",
            },
          ]}
        >
          {active ? activeLabel : label}
        </Text>
      </Pressable>
    </Animated.View>
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
function SkeletonCard() {
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(0.8, { duration: 900 }),
      -1,
      true
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: "100%",
          backgroundColor: "#18181b",
          borderRadius: 22,
          padding: 20,
          borderWidth: 1,
          borderColor: "#2f2f35",
          marginTop: 8,
          height: 280,
        },
        animatedStyle,
      ]}
    />
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
  rsvpArea: {
    marginTop: 18,
  },
  rsvpButton: {
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 10,
  },
  rsvpButtonText: {
    fontWeight: "900",
    textAlign: "center",
    fontSize: 15,
  },
  listCard: {
    width: "100%",
    marginTop: 14,
    backgroundColor: "#18181b",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#2f2f35",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "900",
    marginBottom: 12,
  },
  listHeadingGreen: {
    color: "#22c55e",
    fontWeight: "900",
    marginTop: 6,
    marginBottom: 4,
  },
  listHeadingRed: {
    color: "#ef4444",
    fontWeight: "900",
    marginTop: 14,
    marginBottom: 4,
  },
  listHeadingYellow: {
    color: "#facc15",
    fontWeight: "900",
    marginTop: 14,
    marginBottom: 4,
  },
  guestName: {
    color: "#d4d4d8",
    marginTop: 4,
    fontSize: 15,
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
  chatCard: {
  width: "100%",
  marginTop: 14,
  backgroundColor: "#18181b",
  borderRadius: 18,
  padding: 18,
  borderWidth: 1,
  borderColor: "#2f2f35",
},
chatMessage: {
  backgroundColor: "#232326",
  borderRadius: 12,
  padding: 10,
  marginTop: 8,
  borderWidth: 1,
  borderColor: "#2f2f35",
},
chatName: {
  color: "#f97316",
  fontWeight: "800",
  marginBottom: 4,
},
chatText: {
  color: "#fff",
  fontSize: 15,
  lineHeight: 21,
},
chatInput: {
  marginTop: 12,
  backgroundColor: "#232326",
  color: "#fff",
  padding: 12,
  borderRadius: 10,
},
chatHint: {
  color: "#9ca3af",
  fontSize: 12,
  marginBottom: 8,
},
});