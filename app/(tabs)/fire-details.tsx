import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { supabase } from "../../lib/supabase";
import { sendFireChatNotification } from "../../lib/notifications";

export default function FireDetailsScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams();
  const chatScrollRef = useRef<ScrollView>(null);

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [savedFirstName, setSavedFirstName] = useState<string | null>(null);
  const [savedLastName, setSavedLastName] = useState<string | null>(null);
  const [myRSVP, setMyRSVP] = useState<"going" | "maybe" | "not_going" | null>(
    null
  );

  const currentGoingList =
    event?.rsvps?.filter((r: any) => r.response_status === "going") || [];

  const maybeList =
    event?.rsvps?.filter((r: any) => r.response_status === "maybe") || [];

  const notGoingList =
    event?.rsvps?.filter((r: any) => r.response_status === "not_going") || [];

  useEffect(() => {
    loadName();
    loadFireDetails();
  }, [eventId]);

  useEffect(() => {
    if (event?.id) {
      loadChatMessages();
    }
  }, [event?.id]);

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

  async function loadName() {
    const storedFirstName = await AsyncStorage.getItem("first_name");
    const storedLastName = await AsyncStorage.getItem("last_name");

    setSavedFirstName(storedFirstName);
    setSavedLastName(storedLastName);
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
  }

  async function handleRSVP(response_status: "going" | "maybe" | "not_going") {
    if (!event?.id || !savedFirstName || !savedLastName) return;

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

    setMyRSVP(response_status);
    loadFireDetails();
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
            {myRSVP === "not_going" ? "Marked Not Coming" : "No — I’m Not Coming"}
          </Text>
        </Pressable>
      </View>

      <View style={styles.guestCard}>
        <Text style={styles.sectionTitle}>Guest List</Text>

        <Text style={styles.listHeadingGreen}>Coming</Text>
        {currentGoingList.length === 0 ? (
          <Text style={styles.emptyText}>No yes responses yet.</Text>
        ) : (
          currentGoingList.map((r: any) => (
            <Text key={r.id} style={styles.guestName}>
              • {r.first_name} {r.last_name}
            </Text>
          ))
        )}

        <Text style={styles.listHeadingYellow}>Maybe</Text>
        {maybeList.length === 0 ? (
          <Text style={styles.emptyText}>No maybe responses yet.</Text>
        ) : (
          maybeList.map((r: any) => (
            <Text key={r.id} style={styles.guestName}>
              • {r.first_name} {r.last_name}
            </Text>
          ))
        )}

        <Text style={styles.listHeadingRed}>Not Coming</Text>
        {notGoingList.length === 0 ? (
          <Text style={styles.emptyText}>No no responses yet.</Text>
        ) : (
          notGoingList.map((r: any) => (
            <Text key={r.id} style={styles.guestName}>
              • {r.first_name} {r.last_name}
            </Text>
          ))
        )}
      </View>

      <View style={styles.chatCard}>
        <Text style={styles.sectionTitle}>Fire Chat</Text>
        <Text style={styles.chatHint}>Messages for this fire only</Text>

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
  rsvpCard: {
    backgroundColor: "#1f1f1f",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 18,
  },
  guestCard: {
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
  chatCard: {
    backgroundColor: "#1f1f1f",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#333",
  },
  sectionTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900" as const,
    marginBottom: 6,
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
  guestName: {
    color: "#fff",
    fontSize: 16,
    marginBottom: 6,
  },
  listHeadingGreen: {
    color: "#22c55e",
    fontSize: 17,
    fontWeight: "900" as const,
    marginTop: 12,
    marginBottom: 8,
  },
  listHeadingYellow: {
    color: "#facc15",
    fontSize: 17,
    fontWeight: "900" as const,
    marginTop: 12,
    marginBottom: 8,
  },
  listHeadingRed: {
    color: "#ef4444",
    fontSize: 17,
    fontWeight: "900" as const,
    marginTop: 12,
    marginBottom: 8,
  },
  chatMessage: {
    backgroundColor: "#2a2a2a",
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
  },
  chatName: {
    color: "#facc15",
    fontSize: 14,
    fontWeight: "800" as const,
    marginBottom: 4,
  },
  chatText: {
    color: "#fff",
    fontSize: 16,
    lineHeight: 22,
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
};