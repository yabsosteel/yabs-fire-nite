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
import * as FileSystem from "expo-file-system";
import { supabase } from "../../lib/supabase";
import { loadFireWeather } from "../../lib/weather";
import { GIPHY_API_KEY } from "../../lib/giphy";
import {
  sendFireChatNotification,
  sendPushNotificationToHosts,
  sendRSVPNotificationToAttendees,
} from "../../lib/notifications";

type GiphyResult = {
  id: string;
  title?: string;
  images?: {
    fixed_width?: {
      url?: string;
    };
    downsized_medium?: {
      url?: string;
    };
    original?: {
      url?: string;
    };
  };
};

function decodeBase64ToUint8Array(base64: string) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  let output = "";

  for (
    let bc = 0, bs = 0, buffer = 0, index = 0;
    (buffer = chars.indexOf(base64.charAt(index++))) !== -1;

  ) {
    bs = bc % 4 ? bs * 64 + buffer : buffer;
    if (bc++ % 4) {
      output += String.fromCharCode(255 & (bs >> ((-2 * bc) & 6)));
    }
  }

  return Uint8Array.from(output, (character) => character.charCodeAt(0));
}

export default function FireDetailsScreen() {
  const router = useRouter();
  const { eventId } = useLocalSearchParams();
  const chatScrollRef = useRef<ScrollView>(null);

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [chatMessages, setChatMessages] = useState<any[]>([]);
  const [lastSeenChatAt, setLastSeenChatAt] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [countdownText, setCountdownText] = useState("");
  const [weather, setWeather] = useState<any>(null);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [savedFirstName, setSavedFirstName] = useState<string | null>(null);
  const [savedLastName, setSavedLastName] = useState<string | null>(null);
  const [approvedGuests, setApprovedGuests] = useState<any[]>([]);
  const [myRSVP, setMyRSVP] = useState<"going" | "maybe" | "not_going" | null>(
    null
  );
  const [isGiphyOpen, setIsGiphyOpen] = useState(false);
  const [giphySearch, setGiphySearch] = useState("");
  const [giphyResults, setGiphyResults] = useState<GiphyResult[]>([]);
  const [isLoadingGiphy, setIsLoadingGiphy] = useState(false);
  const [firePhotos, setFirePhotos] = useState<any[]>([]);

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
    loadFirePhotos();
  }, [eventId]);

  useFocusEffect(
    useCallback(() => {
      loadName();
      loadFireDetails();
      loadApprovedGuests();
      loadFirePhotos();
    }, [eventId])
  );

  useEffect(() => {
    if (event?.id && savedFirstName && savedLastName) {
      loadChatMessages();
    }
  }, [event?.id, savedFirstName, savedLastName]);

  useFocusEffect(
    useCallback(() => {
      if (event?.id && savedFirstName && savedLastName) {
        loadChatMessages();
      }

      return () => {
        if (event?.id && savedFirstName && savedLastName) {
          markFireChatAsSeen(event.id);
          setLastSeenChatAt(null);
        }
      };
    }, [event?.id, savedFirstName, savedLastName])
  );

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

    const channel = supabase.channel(`fire-chat-details-${event.id}`);

    channel.on(
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

        markFireChatAsSeen(event.id);
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [event?.id, savedFirstName, savedLastName]);

  useEffect(() => {
    if (!event?.id) return;

    const channel = supabase.channel(`fire-photos-details-${event.id}`);

    channel.on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "fire_photos",
        filter: `event_id=eq.${event.id}`,
      },
      (payload) => {
        const newPhoto = payload.new;

        setFirePhotos((currentPhotos: any[]) => {
          const alreadyExists = currentPhotos.some(
            (photo) => photo.id === newPhoto.id
          );

          if (alreadyExists) return currentPhotos;

          return [newPhoto, ...currentPhotos];
        });
      }
    );

    channel.subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
          }`
        );
        return;
      }

      if (hours > 0) {
        setCountdownText(
          `Fire starts in ${hours} hour${hours === 1 ? "" : "s"}${
            minutes > 0 ? `, ${minutes} min` : ""
          }`
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
        event.event_time
      );

      setWeather(forecast);
    }

    loadWeatherForFire();
  }, [event?.event_date, event?.event_time]);

  useEffect(() => {
    if (isGiphyOpen) {
      loadTrendingGifs();
    }
  }, [isGiphyOpen]);

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


  function getGiphyImageUrl(gif: GiphyResult) {
    return (
      gif.images?.fixed_width?.url ||
      gif.images?.downsized_medium?.url ||
      gif.images?.original?.url ||
      ""
    );
  }

  async function loadName() {
    const storedFirstName = await AsyncStorage.getItem("first_name");
    const storedLastName = await AsyncStorage.getItem("last_name");

    setSavedFirstName(storedFirstName);
    setSavedLastName(storedLastName);
  }

  async function markFireChatAsSeen(fireId: string) {
    if (!fireId || !savedFirstName || !savedLastName) return null;

    const seenAt = new Date().toISOString();

    await AsyncStorage.setItem(getChatSeenKey(fireId), seenAt);

    return seenAt;
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

  async function loadFirePhotos() {
    if (!eventId) return;

    const fireId = Array.isArray(eventId) ? eventId[0] : eventId;

    const { data, error } = await supabase
      .from("fire_photos")
      .select("*")
      .eq("event_id", fireId)
      .order("created_at", { ascending: false });

    if (error) {
      showErrorToast(error.message);
      return;
    }

    setFirePhotos(data ?? []);
  }

  async function loadChatMessages() {
    if (!event?.id || !savedFirstName || !savedLastName) return;

    const previousLastSeen = await AsyncStorage.getItem(getChatSeenKey(event.id));
    setLastSeenChatAt(previousLastSeen);

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

    await markFireChatAsSeen(event.id);
  }

  async function insertChatMessage({
    message,
    mediaUrl,
    mediaType,
    mediaSource,
    giphyId,
  }: {
    message: string;
    mediaUrl?: string | null;
    mediaType?: string | null;
    mediaSource?: string | null;
    giphyId?: string | null;
  }) {
    if (!event?.id) {
      showErrorToast("Missing event ID");
      return false;
    }

    if (!savedFirstName || !savedLastName) {
      showErrorToast("Missing saved name");
      return false;
    }

    const { error } = await supabase.from("fire_chat").insert({
      event_id: event.id,
      first_name: savedFirstName,
      last_name: savedLastName,
      message,
      media_url: mediaUrl ?? null,
      media_type: mediaType ?? null,
      media_source: mediaSource ?? null,
      giphy_id: giphyId ?? null,
    });

    if (error) {
      showErrorToast(error.message);
      return false;
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
      message
    );

    await markFireChatAsSeen(event.id);
    return true;
  }

  async function sendChatMessage() {
    if (isSendingMessage) return;

    setIsSendingMessage(true);

    try {
      const trimmedMessage = chatInput.trim();

      if (!trimmedMessage) {
        showErrorToast("Message is empty");
        return;
      }

      const sent = await insertChatMessage({
        message: trimmedMessage,
      });

      if (!sent) return;

      setChatInput("");
      showSuccessToast("Message sent 🔥");
    } finally {
      setTimeout(() => {
        setIsSendingMessage(false);
      }, 700);
    }
  }


  async function loadTrendingGifs() {
    if (!GIPHY_API_KEY) {
      showErrorToast("Missing GIPHY API key.");
      return;
    }

    setIsLoadingGiphy(true);

    try {
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/trending?api_key=${GIPHY_API_KEY}&limit=20&rating=pg-13`
      );
      const json = await response.json();

      setGiphyResults(json?.data ?? []);
    } catch (error: any) {
      showErrorToast(error?.message || "Could not load GIFs.");
    } finally {
      setIsLoadingGiphy(false);
    }
  }

  async function searchGifs() {
    const searchText = giphySearch.trim();

    if (!searchText) {
      loadTrendingGifs();
      return;
    }

    setIsLoadingGiphy(true);

    try {
      const response = await fetch(
        `https://api.giphy.com/v1/gifs/search?api_key=${GIPHY_API_KEY}&q=${encodeURIComponent(
          searchText
        )}&limit=20&rating=pg-13&lang=en`
      );
      const json = await response.json();

      setGiphyResults(json?.data ?? []);
    } catch (error: any) {
      showErrorToast(error?.message || "Could not search GIFs.");
    } finally {
      setIsLoadingGiphy(false);
    }
  }

  async function sendGiphyGif(gif: GiphyResult) {
    const gifUrl = getGiphyImageUrl(gif);

    if (!gifUrl) {
      showErrorToast("Could not use this GIF.");
      return;
    }

    const sent = await insertChatMessage({
      message: "Shared a GIF 🔥",
      mediaUrl: gifUrl,
      mediaType: "image/gif",
      mediaSource: "giphy",
      giphyId: gif.id,
    });

    if (sent) {
      setIsGiphyOpen(false);
      setGiphySearch("");
      showSuccessToast("GIF sent 🔥");
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

    const messageDate = new Date(dateString);
    const today = new Date();
    const isToday = messageDate.toDateString() === today.toDateString();

    const timeText = messageDate.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    });

    if (isToday) return timeText;

    const dateText = messageDate.toLocaleDateString([], {
      month: "short",
      day: "numeric",
    });

    return `${dateText} • ${timeText}`;
  }

  function isSameChatSender(firstMessage: any, secondMessage: any) {
    if (!firstMessage || !secondMessage) return false;

    return (
      (firstMessage.first_name || "").trim().toLowerCase() ===
        (secondMessage.first_name || "").trim().toLowerCase() &&
      (firstMessage.last_name || "").trim().toLowerCase() ===
        (secondMessage.last_name || "").trim().toLowerCase()
    );
  }

  function areMessagesCloseTogether(firstMessage: any, secondMessage: any) {
    if (!firstMessage?.created_at || !secondMessage?.created_at) return false;

    const firstTime = new Date(firstMessage.created_at).getTime();
    const secondTime = new Date(secondMessage.created_at).getTime();

    return Math.abs(secondTime - firstTime) <= 5 * 60 * 1000;
  }

  async function onRefresh() {
    setRefreshing(true);

    try {
      await loadName();
      await loadFireDetails();
      await loadApprovedGuests();
      await loadFirePhotos();

      if (event?.id && savedFirstName && savedLastName) {
        await loadChatMessages();
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

  function renderChatMedia(chat: any) {
    if (!chat.media_url) return null;

    return (
      <View>
        <Image
          source={{ uri: chat.media_url }}
          style={styles.chatMedia}
          resizeMode="contain"
        />
        {chat.media_source === "giphy" ? (
          <Text style={styles.giphyLabel}>via GIF</Text>
        ) : null}
      </View>
    );
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
    <View style={styles.page}>
      <View style={styles.fixedHeader}>
        <Pressable style={styles.backButton} onPress={() => router.back()}>
          <Text style={styles.backButtonText}>← Back</Text>
        </Pressable>
      </View>

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
        <View style={styles.heroCard}>
          <Text style={styles.label}>FIRE DETAILS</Text>
          <Text style={styles.title}>{event.title || "Fire"}</Text>

          <Text style={styles.date}>
            {formatFireDateTime(event.event_date, event.event_time)}
          </Text>

          {countdownText ? (
            <Text style={styles.countdownText}>🔥 {countdownText}</Text>
          ) : null}

          {weather ? (
            <Text style={styles.weatherText}>
              {weather.icon || "🌤️"} {Math.round(weather.temperature)}°F •{" "}
              {weather.rainChance ?? 0}% rain • {Math.round(weather.windSpeed)} mph wind
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

          <Text style={styles.notGoingHeading}>Not Going ({notGoingList.length})</Text>
          {renderPersonList(notGoingList, "No responses yet")}

          <Text style={styles.noResponseHeading}>No Response ({noResponseList.length})</Text>
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

        <View style={styles.photosCard}>
          <View style={styles.photoHeaderRow}>
            <View>
              <Text style={styles.sectionTitle}>Fire Photos</Text>
              <Text style={styles.chatHint}>Photos will show here once uploaded</Text>
            </View>
          </View>

          {firePhotos.length === 0 ? (
            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyStateTitle}>No photos yet</Text>
              <Text style={styles.emptyStateText}>
                Photo uploads are temporarily disabled while we stabilize the app.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {firePhotos.map((photo: any) => (
                <View key={photo.id} style={styles.firePhotoItem}>
                  <Image
                    source={{ uri: photo.image_url }}
                    style={styles.firePhotoImage}
                    resizeMode="cover"
                  />

                  {photo.uploaded_by_name ? (
                    <Text style={styles.firePhotoName}>
                      {photo.uploaded_by_name}
                    </Text>
                  ) : null}
                </View>
              ))}
            </ScrollView>
          )}
        </View>

        <View style={styles.chatCard}>
          <Text style={styles.sectionTitle}>Fire Chat</Text>
          <Text style={styles.chatHint}>Messages, photos, and GIFs for this fire only</Text>

          <ScrollView
            ref={chatScrollRef}
            style={{ maxHeight: 390 }}
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
              chatMessages.map((chat: any, index: number) => {
                const previousChat = index > 0 ? chatMessages[index - 1] : null;
                const nextChat =
                  index < chatMessages.length - 1 ? chatMessages[index + 1] : null;

                const isMyMessage =
                  chat.first_name === savedFirstName &&
                  chat.last_name === savedLastName;

                const isGroupedWithPrevious =
                  isSameChatSender(previousChat, chat) &&
                  areMessagesCloseTogether(previousChat, chat);

                const isGroupedWithNext =
                  isSameChatSender(chat, nextChat) &&
                  areMessagesCloseTogether(chat, nextChat);

                const shouldShowHeader = true;

                const hasEarlierUnreadMessageFromSomeoneElse =
                  !!lastSeenChatAt &&
                  chatMessages.slice(0, index).some((message: any) => {
                    const messageIsMine =
                      message.first_name === savedFirstName &&
                      message.last_name === savedLastName;

                    return (
                      !messageIsMine &&
                      new Date(message.created_at).getTime() >
                        new Date(lastSeenChatAt).getTime()
                    );
                  });

                const shouldShowUnreadSeparator =
                  !!lastSeenChatAt &&
                  !isMyMessage &&
                  new Date(chat.created_at).getTime() >
                    new Date(lastSeenChatAt).getTime() &&
                  !hasEarlierUnreadMessageFromSomeoneElse;

                return (
                  <View key={chat.id}>
                    {shouldShowUnreadSeparator ? (
                      <View style={styles.unreadSeparator}>
                        <View style={styles.unreadSeparatorLine} />
                        <Text style={styles.unreadSeparatorText}>
                          New Messages
                        </Text>
                        <View style={styles.unreadSeparatorLine} />
                      </View>
                    ) : null}

                    <View
                      style={[
                        styles.chatMessage,
                        isMyMessage && styles.myChatMessage,
                        isGroupedWithPrevious && styles.groupedChatMessage,
                        isGroupedWithNext && styles.chatMessageGroupedWithNext,
                      ]}
                    >
                      {shouldShowHeader ? (
                        <View style={styles.chatHeaderRow}>
                          <Text style={styles.chatName}>
                            {chat.first_name} {chat.last_name}
                          </Text>

                          <Text style={styles.chatTime}>
                            {formatChatTime(chat.created_at)}
                          </Text>
                        </View>
                      ) : null}

                      {renderChatMedia(chat)}

                      {chat.message ? (
                        <Text
                          style={[
                            styles.chatText,
                          ]}
                        >
                          {chat.message}
                        </Text>
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

          <View style={styles.chatActionRow}>
<Pressable
              onPress={() => setIsGiphyOpen(true)}
              style={styles.secondaryButton}
            >
              <Text style={styles.secondaryButtonText}>Search Gif's</Text>
            </Pressable>
          </View>

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

      <Modal visible={isGiphyOpen} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.giphyModal}>
            <View style={styles.giphyHeaderRow}>
              <Text style={styles.giphyTitle}>Search GIF</Text>
              <Pressable onPress={() => setIsGiphyOpen(false)}>
                <Text style={styles.closeText}>Close</Text>
              </Pressable>
            </View>

            <View style={styles.giphySearchRow}>
              <TextInput
                placeholder="Search GIFs..."
                placeholderTextColor="#888"
                value={giphySearch}
                onChangeText={setGiphySearch}
                style={styles.giphyInput}
                returnKeyType="search"
                onSubmitEditing={searchGifs}
              />

              <Pressable style={styles.giphySearchButton} onPress={searchGifs}>
                <Text style={styles.giphySearchButtonText}>Search</Text>
              </Pressable>
            </View>

            {isLoadingGiphy ? (
              <View style={styles.giphyLoading}>
                <ActivityIndicator color="#f97316" />
                <Text style={styles.giphyLoadingText}>Loading GIFs...</Text>
              </View>
            ) : (
              <ScrollView contentContainerStyle={styles.giphyGrid}>
                {giphyResults.map((gif) => {
                  const gifUrl = getGiphyImageUrl(gif);
                  if (!gifUrl) return null;

                  return (
                    <Pressable
                      key={gif.id}
                      style={styles.giphyItem}
                      onPress={() => sendGiphyGif(gif)}
                    >
                      <Image
                        source={{ uri: gifUrl }}
                        style={styles.giphyImage}
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
    </View>
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
  page: {
    flex: 1,
    backgroundColor: "#121212",
  },
  fixedHeader: {
    backgroundColor: "#121212",
    paddingTop: 18,
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#242424",
    zIndex: 10,
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
  photosCard: {
    backgroundColor: "#1f1f1f",
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 18,
  },
  photoHeaderRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    gap: 12,
    marginBottom: 12,
  },
  photoUploadButton: {
    backgroundColor: "#f97316",
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  photoUploadButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900" as const,
  },
  firePhotoItem: {
    width: 210,
    marginRight: 12,
  },
  firePhotoImage: {
    width: 210,
    height: 210,
    borderRadius: 18,
    backgroundColor: "#111",
  },
  firePhotoName: {
    color: "#aaa",
    fontSize: 12,
    fontWeight: "700" as const,
    marginTop: 6,
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
  chatMessage: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 16,
    marginBottom: 8,
    backgroundColor: "#242424",
    borderWidth: 1,
    borderColor: "#303036",
  },
  myChatMessage: {
    backgroundColor: "#1a1a1a",
    borderColor: "#3a3a3f",
  },
  groupedChatMessage: {
    marginTop: -4,
    paddingTop: 8,
  },
  chatMessageGroupedWithNext: {
    marginBottom: 4,
  },
  chatHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginBottom: 4,
    gap: 8,
  },
  chatName: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "800" as const,
    flexShrink: 1,
  },
  chatTime: {
    color: "#888",
    fontSize: 11,
    fontWeight: "700" as const,
  },
  chatText: {
    color: "#e5e5e5",
    fontSize: 16,
    lineHeight: 22,
    paddingLeft: 2,
    marginTop: 4,
  },
  groupedChatText: {
    marginTop: 0,
  },
  chatMedia: {
    width: "100%" as const,
    maxWidth: 360,
    height: 220,
    alignSelf: "center" as const,
    borderRadius: 18,
    backgroundColor: "#111",
    marginTop: 6,
    marginBottom: 6,
  },
  giphyLabel: {
    color: "#777",
    fontSize: 11,
    fontWeight: "800" as const,
    marginBottom: 4,
    textAlign: "right" as const,
  },
  unreadSeparator: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginVertical: 14,
  },
  unreadSeparatorLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#f97316",
    opacity: 0.7,
  },
  unreadSeparatorText: {
    color: "#f97316",
    fontSize: 12,
    fontWeight: "900" as const,
    marginHorizontal: 10,
    textTransform: "uppercase" as const,
    letterSpacing: 1,
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
  chatActionRow: {
    flexDirection: "row" as const,
    gap: 10,
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
  secondaryButton: {
    flex: 1,
    backgroundColor: "#2a2a2a",
    borderRadius: 16,
    paddingVertical: 13,
    alignItems: "center" as const,
    borderWidth: 1,
    borderColor: "#3a3a3a",
  },
  secondaryButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "900" as const,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    justifyContent: "flex-end" as const,
  },
  giphyModal: {
    backgroundColor: "#1f1f1f",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 18,
    maxHeight: "82%" as const,
    borderWidth: 1,
    borderColor: "#333",
  },
  giphyHeaderRow: {
    flexDirection: "row" as const,
    justifyContent: "space-between" as const,
    alignItems: "center" as const,
    marginBottom: 14,
  },
  giphyTitle: {
    color: "#fff",
    fontSize: 22,
    fontWeight: "900" as const,
  },
  closeText: {
    color: "#f97316",
    fontSize: 15,
    fontWeight: "900" as const,
  },
  giphySearchRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginBottom: 14,
  },
  giphyInput: {
    flex: 1,
    backgroundColor: "#121212",
    color: "#fff",
    borderRadius: 14,
    padding: 12,
    fontSize: 15,
    borderWidth: 1,
    borderColor: "#333",
  },
  giphySearchButton: {
    backgroundColor: "#f97316",
    borderRadius: 14,
    paddingHorizontal: 14,
    justifyContent: "center" as const,
  },
  giphySearchButtonText: {
    color: "#111",
    fontWeight: "900" as const,
  },
  giphyLoading: {
    padding: 24,
    alignItems: "center" as const,
  },
  giphyLoadingText: {
    color: "#aaa",
    marginTop: 10,
    fontWeight: "700" as const,
  },
  giphyGrid: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    gap: 8,
    paddingBottom: 18,
  },
  giphyItem: {
    width: "48%" as const,
    height: 130,
    borderRadius: 16,
    overflow: "hidden" as const,
    backgroundColor: "#111",
  },
  giphyImage: {
    width: "100%" as const,
    height: "100%" as const,
  },
};
