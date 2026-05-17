import AsyncStorage from "@react-native-async-storage/async-storage";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import Toast from "react-native-toast-message";
import { supabase } from "../../lib/supabase";
import { GIPHY_API_KEY } from "../../lib/giphy";
import { loadFireWeather } from "../../lib/weather";
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
  const [refreshing, setRefreshing] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [countdownText, setCountdownText] = useState("");
  const [weather, setWeather] = useState<any>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [gifModalVisible, setGifModalVisible] = useState(false);
  const [gifSearch, setGifSearch] = useState("");
  const [gifResults, setGifResults] = useState<any[]>([]);
  const [gifLoading, setGifLoading] = useState(false);
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


  function showSuccessToast(messageText: string) {
    Toast.show({
      type: "success",
      text1: messageText,
      position: "top",
      visibilityTime: 2200,
    });
  }

  function showErrorToast(messageText: string) {
    Toast.show({
      type: "error",
      text1: messageText,
      position: "top",
      visibilityTime: 3200,
    });
  }

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
      showErrorToast(error.message);
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
      showErrorToast(error.message);
      return;
    }

    setChatMessages(data ?? []);
  }

  async function sendChatMessage() {
    if (isSendingMessage) return;

    setIsSendingMessage(true);

    try {
      if (!event?.id) {
        showErrorToast("Missing event ID");
        return;
      }

      if (!savedFirstName || !savedLastName) {
        showErrorToast("Missing saved name");
        return;
      }

      if (!chatInput.trim()) {
        showErrorToast("Message is empty");
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
        showErrorToast(error.message);
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
      showSuccessToast("Message sent 🔥");
    } finally {
      setTimeout(() => {
        setIsSendingMessage(false);
      }, 700);
    }
  }

  async function loadTrendingGifs() {
    setGifLoading(true);

    try {
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=24&rating=pg-13`
      );

      const json = await response.json();
      setGifResults(json?.data ?? []);
    } catch (error: any) {
      showErrorToast("Could not load GIFs");
    } finally {
      setGifLoading(false);
    }
  }

  async function searchGifs() {
    const searchTerm = gifSearch.trim();

    if (!searchTerm) {
      await loadTrendingGifs();
      return;
    }

    setGifLoading(true);

    try {
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(
          searchTerm
        )}&limit=24&rating=pg-13`
      );

      const json = await response.json();
      setGifResults(json?.data ?? []);
    } catch (error: any) {
      showErrorToast("Could not search GIFs");
    } finally {
      setGifLoading(false);
    }
  }

  async function openGifModal() {
    setGifModalVisible(true);

    if (gifResults.length === 0) {
      await loadTrendingGifs();
    }
  }

  async function sendGiphyGif(gif: any) {
    if (isSendingMessage) return;

    setIsSendingMessage(true);

    try {
      if (!event?.id) {
        showErrorToast("Missing event ID");
        return;
      }

      if (!savedFirstName || !savedLastName) {
        showErrorToast("Missing saved name");
        return;
      }

      const gifUrl =
        gif?.images?.fixed_height?.url ||
        gif?.images?.downsized_medium?.url ||
        gif?.images?.original?.url;

      if (!gifUrl) {
        showErrorToast("Missing GIF URL");
        return;
      }

      const { error } = await supabase.from("fire_chat").insert({
        event_id: event.id,
        first_name: savedFirstName,
        last_name: savedLastName,
        message: "Sent a GIF",
        media_url: gifUrl,
        media_type: "gif",
        media_source: "giphy",
        giphy_id: gif.id,
      });

      if (error) {
        showErrorToast(error.message);
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
        "Sent a GIF"
      );

      setGifModalVisible(false);
      await markFireChatAsSeen(event.id);
      showSuccessToast("GIF sent 🔥");
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
      showErrorToast(
        "Missing saved name. Please return home and save your name again."
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
      showErrorToast(error.message);
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
    showSuccessToast(`RSVP updated: ${responseText} 🔥`);
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

  async function onRefresh() {
    setRefreshing(true);

    try {
      await loadName();
      await loadFireDetails();
      await loadApprovedGuests();

      if (event?.id) {
        await loadChatMessages();
        await markFireChatAsSeen(event.id);
      }

    } finally {
      setRefreshing(false);
    }
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

  function getInitials(first?: string, last?: string) {
    const firstInitial = first?.trim()?.[0] ?? "";
    const lastInitial = last?.trim()?.[0] ?? "";
    const initials = `${firstInitial}${lastInitial}`.toUpperCase();

    return initials || "?";
  }

  function getAvatarColor(first?: string, last?: string) {
    const name = `${first ?? ""}${last ?? ""}`.trim() || "guest";
    const colors = [
      "#F97316",
      "#EF4444",
      "#22C55E",
      "#3B82F6",
      "#A855F7",
      "#EAB308",
      "#14B8A6",
    ];

    let hash = 0;

    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }

    return colors[Math.abs(hash) % colors.length];
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
      <Pressable style={styles.backButton} onPress={() => router.back()}>
        <Text style={styles.backButtonText}>← Back</Text>
      </Pressable>

      <View style={styles.heroCard}>
        <Text style={styles.label}>FIRE DETAILS</Text>
        <Text style={styles.title}>{event.title || "Fire"}</Text>

        <Text style={styles.date}>
          {formatFireDateTime(event.event_date, event.event_time)}
        </Text>

        {countdownText ? (
          <Text style={styles.countdownText}>
            🔥 {countdownText}
          </Text>
        ) : null}

        {weather ? (
          <Text style={styles.weatherText}>
            {weather.icon || "🌤️"} {Math.round(weather.temperature)}°F •{" "}
            {weather.rainChance ?? 0}% rain •{" "}
            {Math.round(weather.windSpeed)} mph wind
          </Text>
        ) : null}

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
            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyStateTitle}>No messages yet</Text>
              <Text style={styles.emptyStateText}>
                Start the fire chat and get the conversation going 🔥
              </Text>
            </View>
          ) : (
            chatMessages.map((chat: any) => {
              const isMyMessage =
                chat.first_name === savedFirstName &&
                chat.last_name === savedLastName;

              return (
                <View
                  key={chat.id}
                  style={[
                    styles.chatRow,
                    isMyMessage && styles.myChatRow,
                  ]}
                >
                  {!isMyMessage ? (
                    <View
                      style={[
                        styles.avatar,
                        {
                          backgroundColor: getAvatarColor(
                            chat.first_name,
                            chat.last_name
                          ),
                        },
                      ]}
                    >
                      <Text style={styles.avatarText}>
                        {getInitials(chat.first_name, chat.last_name)}
                      </Text>
                    </View>
                  ) : null}

                  <View
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

                    {chat.media_url ? (
                      <Image
                        source={{ uri: chat.media_url }}
                        style={styles.chatGif}
                        resizeMode="cover"
                      />
                    ) : null}

                    {chat.message ? (
                      <Text style={styles.chatText}>{chat.message}</Text>
                    ) : null}
                  </View>
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
          onPress={openGifModal}
          style={styles.gifButton}
        >
          <Text style={styles.gifButtonText}>Search GIFs</Text>
        </Pressable>

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

      <Modal
        visible={gifModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setGifModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.gifModal}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Choose a GIF</Text>

              <Pressable onPress={() => setGifModalVisible(false)}>
                <Text style={styles.modalClose}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.gifSearchRow}>
              <TextInput
                placeholder="Search GIPHY..."
                placeholderTextColor="#888"
                value={gifSearch}
                onChangeText={setGifSearch}
                style={styles.gifSearchInput}
                returnKeyType="search"
                onSubmitEditing={searchGifs}
              />

              <Pressable onPress={searchGifs} style={styles.gifSearchButton}>
                <Text style={styles.gifSearchButtonText}>Search</Text>
              </Pressable>
            </View>

            {gifLoading ? (
              <View style={styles.gifLoadingWrap}>
                <ActivityIndicator />
                <Text style={styles.gifLoadingText}>Loading GIFs...</Text>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.gifGrid}
                keyboardShouldPersistTaps="handled"
              >
                {gifResults.map((gif: any) => {
                  const gifUrl =
                    gif?.images?.fixed_width?.url ||
                    gif?.images?.fixed_height?.url ||
                    gif?.images?.downsized_medium?.url;

                  if (!gifUrl) return null;

                  return (
                    <Pressable
                      key={gif.id}
                      onPress={() => sendGiphyGif(gif)}
                      style={styles.gifTile}
                    >
                      <Image
                        source={{ uri: gifUrl }}
                        style={styles.gifTileImage}
                        resizeMode="cover"
                      />
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = {
  emptyStateCard: {
    backgroundColor: "#18181b",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: "#2f2f35",
    marginTop: 10,
    marginBottom: 10,
  },
  emptyStateTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900" as const,
    marginBottom: 6,
  },
  emptyStateText: {
    color: "#b3b3ba",
    fontSize: 14,
    lineHeight: 20,
  },

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
    fontWeight: "800" as const,
    marginBottom: 14,
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
  chatRow: {
    flexDirection: "row" as const,
    alignItems: "flex-end" as const,
    marginBottom: 10,
  },
  myChatRow: {
    justifyContent: "flex-end" as const,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginRight: 8,
    marginBottom: 4,
  },
  avatarText: {
    color: "#fff",
    fontWeight: "800" as const,
    fontSize: 13,
  },
  chatMessage: {
    maxWidth: "88%" as const,
    backgroundColor: "#18181b",
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#2a2a2a",
  },
  myChatMessage: {
    backgroundColor: "#3b2415",
    borderColor: "#7c2d12",
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
  gifButton: {
    backgroundColor: "#27272a",
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: "center" as const,
    borderWidth: 1,
    borderColor: "#3f3f46",
    marginBottom: 10,
  },
  gifButtonText: {
    color: "#facc15",
    fontSize: 15,
    fontWeight: "900" as const,
  },
  chatGif: {
    width: 220,
    height: 160,
    borderRadius: 14,
    marginTop: 8,
    marginBottom: 8,
    backgroundColor: "#27272a",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end" as const,
  },
  gifModal: {
    backgroundColor: "#111",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 16,
    maxHeight: "82%" as const,
    borderWidth: 1,
    borderColor: "#333",
  },
  modalHeader: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 14,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: "900" as const,
  },
  modalClose: {
    color: "#f97316",
    fontSize: 15,
    fontWeight: "900" as const,
  },
  gifSearchRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 14,
  },
  gifSearchInput: {
    flex: 1,
    backgroundColor: "#1f1f1f",
    color: "#fff",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#333",
    fontSize: 15,
  },
  gifSearchButton: {
    backgroundColor: "#f97316",
    borderRadius: 14,
    paddingHorizontal: 14,
    justifyContent: "center" as const,
  },
  gifSearchButtonText: {
    color: "#111",
    fontSize: 14,
    fontWeight: "900" as const,
  },
  gifLoadingWrap: {
    alignItems: "center" as const,
    paddingVertical: 30,
  },
  gifLoadingText: {
    color: "#aaa",
    marginTop: 10,
    fontSize: 14,
  },
  gifGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    paddingBottom: 24,
  },
  gifTile: {
    width: "31%" as const,
    aspectRatio: 1,
    borderRadius: 12,
    overflow: "hidden" as const,
    backgroundColor: "#27272a",
  },
  gifTileImage: {
    width: "100%" as const,
    height: "100%" as const,
  },

};
