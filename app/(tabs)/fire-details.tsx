import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import {
  sendFireChatNotification,
  sendPushNotificationToHosts,
  sendRSVPNotificationToAttendees,
} from "../../lib/notifications";

export default function FireDetailsScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams();
  const chatScrollRef = useRef<ScrollView>(null);

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [savedFirstName, setSavedFirstName] = useState<string | null>(null);
  const [savedLastName, setSavedLastName] = useState<string | null>(null);
  const [approvedGuests, setApprovedGuests] = useState<any[]>([]);
  const [myRSVP, setMyRSVP] = useState<"going" | "maybe" | "not_going" | null>(
    null
  );

  const goingList = dedupePeople(
    event?.rsvps?.filter((r: any) => r.response_status === "going") || []
  );

  const maybeList = dedupePeople(
    event?.rsvps?.filter((r: any) => r.response_status === "maybe") || []
  );

  const notGoingList = dedupePeople(
    event?.rsvps?.filter((r: any) => r.response_status === "not_going") || []
  );

  const respondedKeys = new Set(
    (event?.rsvps || []).map((r: any) =>
      `${r.first_name || ""} ${r.last_name || ""}`.toLowerCase().trim()
    )
  );

  const noResponseList = dedupePeople(
    (approvedGuests || []).filter((guest: any) => {
      const key = `${guest.first_name || ""} ${guest.last_name || ""}`
        .toLowerCase()
        .trim();

      return key !== "rian yablun" && !!key && !respondedKeys.has(key);
    })
  );

  useEffect(() => {
    loadName();
    loadFireDetails();
    loadApprovedGuests();
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      loadName();
      loadFireDetails();
      loadApprovedGuests();

      if (event?.id) {
        markFireChatAsSeen(event.id);
      }
    }, [eventId, event?.id, savedFirstName, savedLastName])
  );

  useEffect(() => {
    if (event?.id) {
      loadChatMessages();
      markFireChatAsSeen(event.id);
    }
  }, [event?.id, savedFirstName, savedLastName]);

  useEffect(() => {
    if (!event?.rsvps || !savedFirstName || !savedLastName) return;

    const existingRSVP = event.rsvps.find(
      (r: any) =>
        r.first_name === savedFirstName && r.last_name === savedLastName
    );

    setMyRSVP(existingRSVP?.response_status ?? null);
  }, [event, savedFirstName, savedLastName]);

  useEffect(() => {
    if (!event?.id) return;

    const channel = supabase
      .channel(`fire-chat-details-${event.id}`)
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

          markFireChatAsSeen(event.id);

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
  }, [event?.id, savedFirstName, savedLastName]);

  function dedupePeople(people: any[]) {
    const seen = new Set();

    return people.filter((person: any) => {
      const key = `${person.first_name || ""} ${person.last_name || ""}`
        .toLowerCase()
        .trim();

      if (!key || seen.has(key)) return false;

      seen.add(key);
      return true;
    });
  }

  function getChatSeenKey(fireId: string) {
    const first = savedFirstName?.trim().toLowerCase() || "unknown";
    const last = savedLastName?.trim().toLowerCase() || "unknown";

    return `last_seen_chat_${fireId}_${first}_${last}`;
  }

  async function loadName() {
    const storedFirstName = await AsyncStorage.getItem("first_name");
    const storedLastName = await AsyncStorage.getItem("last_name");

    setSavedFirstName(storedFirstName);
    setSavedLastName(storedLastName);
  }

  async function markFireChatAsSeen(fireId: string) {
    if (!fireId || !savedFirstName || !savedLastName) return;

    await AsyncStorage.setItem(getChatSeenKey(fireId), new Date().toISOString());
  }

  async function loadApprovedGuests() {
    const { data, error } = await supabase
      .from("approved_users")
      .select("*")
      .eq("is_approved", true)
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true });

    if (error) {
      console.log("Error loading approved guests:", error.message);
      setApprovedGuests([]);
      return;
    }

    setApprovedGuests(data ?? []);
  }

  async function loadFireDetails() {
    if (!eventId) return;

    setLoading(true);

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
      .eq("id", eventId)
      .maybeSingle();

    if (error) {
      alert(error.message);
      setLoading(false);
      return;
    }

    setEvent(data);
    setLoading(false);
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
    if (isSendingMessage) return;

    setIsSendingMessage(true);

    try {
      if (!event?.id) {
        alert("Missing event ID");
        return;
      }

      if (!savedFirstName || !savedLastName) {
        alert("Missing saved name");
        return;
      }

      if (!chatInput.trim()) {
        alert("Message is empty");
        return;
      }

      const trimmedMessage = chatInput.trim();

      const { error } = await supabase.from("fire_chat").insert({
        event_id: event.id,
        first_name: savedFirstName,
        last_name: savedLastName,
        message: trimmedMessage,
      });

      if (error) {
        alert(error.message);
        return;
      }

      const fireDate = new Date(
        `${event.event_date}T00:00:00`
      ).toLocaleDateString();

      await sendFireChatNotification(
        event.id,
        `${event.title || "Fire"} - ${fireDate}`,
        savedFirstName,
        savedFirstName,
        savedLastName,
        trimmedMessage
      );

      setChatInput("");
      await markFireChatAsSeen(event.id);
    } finally {
      setTimeout(() => {
        setIsSendingMessage(false);
      }, 700);
    }
  }

  async function handleRSVP(response_status: "going" | "maybe" | "not_going") {
    if (!event?.id) return;

    const currentFirstName = await AsyncStorage.getItem("first_name");
    const currentLastName = await AsyncStorage.getItem("last_name");

    console.log("Current RSVP user:", currentFirstName, currentLastName);

    if (!currentFirstName || !currentLastName) {
      alert(
        "Missing saved name. Please return to the home screen and save your name again."
      );
      return;
    }

    setSavedFirstName(currentFirstName);
    setSavedLastName(currentLastName);

    const { error } = await supabase.from("rsvps").upsert(
      {
        event_id: event.id,
        name: `${currentFirstName} ${currentLastName}`,
        first_name: currentFirstName,
        last_name: currentLastName,
        response_status,
      },
      { onConflict: "event_id,first_name,last_name" }
    );

    if (error) {
      alert(error.message);
      return;
    }

    const responseText =
      response_status === "going"
        ? "Going"
        : response_status === "maybe"
          ? "Maybe"
          : "Not Going";

    const fireDateTime = formatFireNotificationDateTime(
      event.event_date,
      event.event_time
    );

    const hostNotificationTitle = `${currentFirstName} ${currentLastName} is ${responseText} to ${fireDateTime}.`;

    console.log("Sending RSVP notification:", hostNotificationTitle);

    await sendPushNotificationToHosts(hostNotificationTitle, "");

    await sendRSVPNotificationToAttendees(
      event.id,
      currentFirstName,
      currentLastName,
      hostNotificationTitle
    );

    setMyRSVP(response_status);
    loadFireDetails();
    loadApprovedGuests();
  }

  function formatFireNotificationDateTime(date?: string, time?: string) {
    if (!date) return "the fire";

    const dateText = new Date(`${date}T00:00:00`).toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });

    if (!time) return dateText;

    const timeText = new Date(`${date}T${time}`).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });

    return `${dateText} at ${timeText}`;
  }

  function formatFireDateTime(date?: string, time?: string) {
    if (!date) return "Date TBD";

    const datePart = new Date(`${date}T00:00:00`).toLocaleDateString();

    if (!time) return datePart;

    const timePart = new Date(`${date}T${time}`).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    return `${datePart} at ${timePart}`;
  }

  function formatChatTime(dateString?: string) {
    if (!dateString) return "";

    return new Date(dateString).toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });
  }

  function renderPersonList(people: any[], emptyText: string) {
    if (people.length === 0) {
      return <Text style={styles.emptyResponseText}>{emptyText}</Text>;
    }

    return people.map((person: any) => (
      <Text key={person.id} style={styles.responseName}>
        •{" "}
        {person.first_name && person.last_name
          ? `${person.first_name} ${person.last_name}`
          : person.name || "Unknown Guest"}
      </Text>
    ));
  }

  if (loading) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.loadingText}>Loading fire...</Text>
      </View>
    );
  }

  if (!event) {
    return (
      <View style={styles.centerScreen}>
        <Text style={styles.loadingText}>Fire not found.</Text>

        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </Pressable>

      <View style={styles.heroCard}>
        <Text style={styles.label}>FIRE DETAILS</Text>
        <Text style={styles.title}>{event.title || "Fire"}</Text>

        <Text style={styles.date}>
          {formatFireDateTime(event.event_date, event.event_time)}
        </Text>

        <Text style={styles.message}>
          {event.message || "No message for this fire."}
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{goingList.length}</Text>
          <Text style={styles.summaryLabel}>Going</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{maybeList.length}</Text>
          <Text style={styles.summaryLabel}>Maybe</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{notGoingList.length}</Text>
          <Text style={styles.summaryLabel}>Not Going</Text>
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryNumber}>{noResponseList.length}</Text>
          <Text style={styles.summaryLabel}>No Reply</Text>
        </View>
      </View>

      <View style={styles.rsvpListCard}>
        <Text style={styles.sectionTitle}>Responses</Text>
        <Text style={styles.sectionHint}>See who has responded to this fire.</Text>

        <Text style={styles.goingHeading}>Going ({goingList.length})</Text>
        {renderPersonList(goingList, "No responses yet")}

        <Text style={styles.maybeHeading}>Maybe ({maybeList.length})</Text>
        {renderPersonList(maybeList, "No responses yet")}

        <Text style={styles.notGoingHeading}>
          Not Going ({notGoingList.length})
        </Text>
        {renderPersonList(notGoingList, "No responses yet")}

        <Text style={styles.noResponseHeading}>
          No Response ({noResponseList.length})
        </Text>
        {renderPersonList(noResponseList, "Everyone has responded")}
      </View>

      <View style={styles.rsvpCard}>
        <Text style={styles.sectionTitle}>Your RSVP</Text>

        <Pressable
          onPress={() => handleRSVP("going")}
          style={[
            styles.rsvpButton,
            myRSVP === "going" && styles.rsvpButtonActive,
          ]}
        >
          <Text style={styles.rsvpButtonText}>
            {myRSVP === "going" ? "You're In 🔥" : "Yes — I’m Coming"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => handleRSVP("maybe")}
          style={[
            styles.rsvpButton,
            myRSVP === "maybe" && styles.rsvpButtonActive,
          ]}
        >
          <Text style={styles.rsvpButtonText}>
            {myRSVP === "maybe" ? "Marked Maybe" : "Maybe"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => handleRSVP("not_going")}
          style={[
            styles.rsvpButton,
            myRSVP === "not_going" && styles.rsvpButtonActive,
          ]}
        >
          <Text style={styles.rsvpButtonText}>
            {myRSVP === "not_going"
              ? "Marked Not Coming"
              : "No — I’m Not Coming"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.chatCard}>
        <Text style={styles.sectionTitle}>Fire Chat</Text>
        <Text style={styles.chatHint}>Messages for this fire only</Text>

        <ScrollView
          ref={chatScrollRef}
          style={{ maxHeight: 350 }}
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
            chatMessages.map((chat: any) => {
              const isMyMessage =
                chat.first_name === savedFirstName &&
                chat.last_name === savedLastName;

              return (
                <View
                  key={chat.id}
                  style={[
                    styles.chatMessage,
                    isMyMessage && styles.myChatMessage,
                  ]}
                >
                  <View style={styles.chatHeaderRow}>
                    <Text style={styles.chatName}>
                      {chat.first_name} {chat.last_name}
                    </Text>

                    <Text style={styles.chatTime}>
                      {formatChatTime(chat.created_at)}
                    </Text>
                  </View>

                  <Text style={styles.chatText}>{chat.message}</Text>
                </View>
              );
            })
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

        <Pressable
          onPress={sendChatMessage}
          disabled={isSendingMessage}
          style={[
            styles.primaryButton,
            isSendingMessage && styles.primaryButtonDisabled,
          ]}
        >
          <Text style={styles.primaryButtonText}>
            {isSendingMessage ? "Sending..." : "Send Message"}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = {
  screen: {
    flexGrow: 1,
    backgroundColor: "#121212",
    padding: 20,
    paddingBottom: 40,
  },
  centerScreen: {
    flex: 1,
    backgroundColor: "#121212",
    alignItems: "center" as const,
    justifyContent: "center" as const,
    padding: 24,
  },
  loadingText: {
    color: "#fff",
    fontSize: 18,
  },
  backButton: {
    alignSelf: "flex-start" as const,
    backgroundColor: "#242424",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 18,
  },
  backButtonText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700" as const,
  },
  heroCard: {
    backgroundColor: "#1f1f1f",
    borderRadius: 28,
    padding: 22,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 18,
  },
  summaryRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 18,
  },
  summaryCard: {
    flex: 1,
    backgroundColor: "#1f1f1f",
    borderRadius: 18,
    paddingVertical: 16,
    alignItems: "center" as const,
    borderWidth: 1,
    borderColor: "#333",
  },
  summaryNumber: {
    color: "#f97316",
    fontSize: 24,
    fontWeight: "900" as const,
  },
  summaryLabel: {
    color: "#bbb",
    fontSize: 12,
    marginTop: 4,
    fontWeight: "700" as const,
    textAlign: "center" as const,
  },
  rsvpCard: {
    backgroundColor: "#1f1f1f",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 18,
  },
  rsvpListCard: {
    backgroundColor: "#1f1f1f",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 18,
  },
  label: {
    color: "#f97316",
    fontSize: 13,
    fontWeight: "800" as const,
    letterSpacing: 1,
    marginBottom: 10,
  },
  title: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "900" as const,
    marginBottom: 8,
  },
  date: {
    color: "#facc15",
    fontSize: 17,
    fontWeight: "700" as const,
    marginBottom: 16,
  },
  message: {
    color: "#ddd",
    fontSize: 17,
    lineHeight: 25,
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900" as const,
    marginBottom: 6,
  },
  sectionHint: {
    color: "#888",
    fontSize: 13,
    marginBottom: 16,
  },
  goingHeading: {
    color: "#4CAF50",
    fontSize: 18,
    fontWeight: "800" as const,
    marginBottom: 8,
  },
  maybeHeading: {
    color: "#FFD54F",
    fontSize: 18,
    fontWeight: "800" as const,
    marginTop: 18,
    marginBottom: 8,
  },
  notGoingHeading: {
    color: "#EF5350",
    fontSize: 18,
    fontWeight: "800" as const,
    marginTop: 18,
    marginBottom: 8,
  },
  noResponseHeading: {
    color: "#9CA3AF",
    fontSize: 18,
    fontWeight: "800" as const,
    marginTop: 18,
    marginBottom: 8,
  },
  responseName: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 6,
  },
  emptyResponseText: {
    color: "#777",
    fontSize: 15,
    marginBottom: 4,
  },
  rsvpButton: {
    backgroundColor: "#2a2a2a",
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  rsvpButtonActive: {
    backgroundColor: "#f97316",
  },
  rsvpButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800" as const,
    textAlign: "center" as const,
  },
  chatCard: {
    backgroundColor: "#1f1f1f",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#333",
  },
  chatHint: {
    color: "#888",
    fontSize: 13,
    marginBottom: 12,
  },
  emptyText: {
    color: "#888",
    fontSize: 15,
    marginVertical: 12,
  },
  chatMessage: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#2a2a2a",
  },
  myChatMessage: {
    backgroundColor: "#1a1a1a",
  },
  chatHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginBottom: 4,
  },
  chatName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700" as const,
    marginRight: 8,
  },
  chatTime: {
    color: "#777",
    fontSize: 12,
  },
  chatText: {
    color: "#ddd",
    fontSize: 16,
    lineHeight: 22,
    paddingLeft: 2,
  },
  chatInput: {
    backgroundColor: "#121212",
    color: "#fff",
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    borderWidth: 1,
    borderColor: "#333",
    marginTop: 12,
    marginBottom: 12,
  },
  primaryButton: {
    backgroundColor: "#f97316",
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center" as const,
  },
  primaryButtonText: {
    color: "#111",
    fontSize: 16,
    fontWeight: "900" as const,
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
};
