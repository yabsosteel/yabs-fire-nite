import AsyncStorage from "@react-native-async-storage/async-storage";
import FireHistory from "../../components/FireHistory";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

export default function HomeScreen() {
  const [event, setEvent] = useState<any>(null);
  const [announcement, setAnnouncement] = useState<any>(null);
  const [announcementRecipients, setAnnouncementRecipients] = useState<any[]>([]);
  const [announcementHistory, setAnnouncementHistory] = useState<any[]>([]);
  const [expandedAnnouncementId, setExpandedAnnouncementId] = useState<string | null>(null);

  const [status, setStatus] = useState("Loading event...");
  const [message, setMessage] = useState("");

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [savedFirstName, setSavedFirstName] = useState<string | null>(null);
  const [savedLastName, setSavedLastName] = useState<string | null>(null);

  const [isApproved, setIsApproved] = useState(false);
  const [approvalChecked, setApprovalChecked] = useState(false);

  const [showHostPanel, setShowHostPanel] = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const [showFireControls, setShowFireControls] = useState(true);
  const [showAnnouncementsSection, setShowAnnouncementsSection] = useState(false);
  const [showRemindersSection, setShowRemindersSection] = useState(false);
  const [showGuestsSection, setShowGuestsSection] = useState(false);
  const [showHostHistorySection, setShowHostHistorySection] = useState(false);

  const [historyFilter, setHistoryFilter] = useState<"all" | "going" | "not_going">("all");
  const [fireHistoryFilter, setFireHistoryFilter] = useState<"all" | "active" | "cancelled">("all");

  const [newEventDate, setNewEventDate] = useState("");
  const [newEventTime, setNewEventTime] = useState("");
  const [newEventMessage, setNewEventMessage] = useState("");
  const [isEditingFire, setIsEditingFire] = useState(false);

  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [reminderRecipients, setReminderRecipients] = useState<any[]>([]);

  const [newGuestFirstName, setNewGuestFirstName] = useState("");
  const [newGuestLastName, setNewGuestLastName] = useState("");
  const [approvedGuests, setApprovedGuests] = useState<any[]>([]);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const [history, setHistory] = useState<any[]>([]);
  const [hostFireHistory, setHostFireHistory] = useState<any[]>([]);
  const [expandedFireId, setExpandedFireId] = useState<string | null>(null);

  const [myRSVP, setMyRSVP] = useState<"going" | "not_going" | null>(null);

  const isHost =
    savedFirstName?.toLowerCase() === "rian" &&
    savedLastName?.toLowerCase() === "yablun";

  const currentGoingList = dedupePeople(
    event?.rsvps?.filter((r: any) => r.response_status === "going") || []
  );

  const goingCount = currentGoingList.length;

  const filteredHistory =
    historyFilter === "all"
      ? history
      : history.filter((item: any) => item.response_status === historyFilter);

  const filteredFireHistory =
    fireHistoryFilter === "all"
      ? hostFireHistory
      : hostFireHistory.filter((fire: any) =>
          fireHistoryFilter === "active"
            ? fire.status === "published"
            : fire.status === "cancelled"
        );

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

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
  }

  useEffect(() => {
    loadEvent();
    loadAnnouncement();
    loadName();
  }, []);

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
      loadHostFireHistory();
      loadAnnouncementHistory();
      if (event?.id) loadReminderRecipients(event.id);
    }
  }, [isHost, event?.id]);

  useEffect(() => {
    if (!event?.id) return;

    const channel = supabase
      .channel(`rsvps-${event.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "rsvps",
          filter: `event_id=eq.${event.id}`,
        },
        () => {
          loadEvent();
          if (showHistory) refreshHistory();
          if (isHost) loadHostFireHistory();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [event?.id, showHistory, isHost]);

  function todayForDatabase() {
    return new Date().toISOString().split("T")[0];
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

  async function registerForPushNotifications() {
    alert("Push notifications are temporarily disabled while testing in Expo Go.");
  }

  async function sendReminderPush(reminderType: "tomorrow" | "two_hour") {
    alert("Push reminders are temporarily disabled while testing in Expo Go.");
  }

  async function sendAnnouncementPush() {
    alert("Announcement push is temporarily disabled while testing in Expo Go.");
  }

  async function loadReminderRecipients(eventId: string) {
    const { data, error } = await supabase
      .from("reminder_recipients")
      .select("*")
      .eq("event_id", eventId)
      .order("created_at", { ascending: true });

    if (error) {
      alert(error.message);
      return;
    }

    setReminderRecipients(data ?? []);
  }

  async function createReminderList(reminderType: "tomorrow" | "two_hour") {
    if (!isHost || !event?.id) {
      alert("There is no active fire for reminders.");
      return;
    }

    const yesRsvps = dedupePeople(
      event?.rsvps?.filter((r: any) => r.response_status === "going") || []
    );

    if (yesRsvps.length === 0) {
      alert("No RSVP Yes guests found for this fire.");
      return;
    }

    const { data: existing, error: lookupError } = await supabase
      .from("reminder_recipients")
      .select("*")
      .eq("event_id", event.id)
      .eq("reminder_type", reminderType);

    if (lookupError) {
      alert(lookupError.message);
      return;
    }

    const existingKeys = new Set(
      (existing ?? []).map((person: any) => getPersonKey(person))
    );

    const recipientsToInsert = yesRsvps
      .filter((person: any) => !existingKeys.has(getPersonKey(person)))
      .map((person: any) => ({
        event_id: event.id,
        name: getDisplayName(person),
        first_name: person.first_name || null,
        last_name: person.last_name || null,
        response_status: person.response_status,
        reminder_type: reminderType,
      }));

    if (recipientsToInsert.length === 0) {
      alert(
        reminderType === "tomorrow"
          ? "Tomorrow reminder list is already up to date."
          : "2 hour reminder list is already up to date."
      );
      await loadReminderRecipients(event.id);
      return;
    }

    const { error } = await supabase
      .from("reminder_recipients")
      .insert(recipientsToInsert);

    if (error) {
      alert(error.message);
      return;
    }

    alert(
      reminderType === "tomorrow"
        ? `Tomorrow reminder list created with ${recipientsToInsert.length} recipient(s).`
        : `2 hour reminder list created with ${recipientsToInsert.length} recipient(s).`
    );

    await loadReminderRecipients(event.id);
  }

  async function loadAnnouncementRecipients(announcementId: string) {
    const { data, error } = await supabase
      .from("announcement_recipients")
      .select("*")
      .eq("announcement_id", announcementId)
      .order("created_at", { ascending: true });

    if (!error) setAnnouncementRecipients(data ?? []);
  }

  async function loadAnnouncementHistory() {
    if (!isHost) return;

    const { data, error } = await supabase
      .from("announcements")
      .select(`
        *,
        announcement_recipients (
          id,
          name,
          first_name,
          last_name,
          response_status,
          created_at
        )
      `)
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setAnnouncementHistory(data ?? []);
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
      await loadAnnouncementRecipients(data.id);
    } else {
      setAnnouncement(null);
      setAnnouncementRecipients([]);
    }
  }

  async function loadEvent() {
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
      .gte("event_date", todayForDatabase())
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      setEvent(null);
      setStatus("No upcoming fire found");
      setMessage("");
      return;
    }

    setEvent(data);
    setStatus(data.title);
    setMessage(
      `${formatDisplayDate(data.event_date)} at ${data.event_time}\n${data.message ?? ""}`
    );
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
      .eq("access_status", "active")
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

  async function handleRSVP(response_status: "going" | "not_going") {
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
    } else {
      setMyRSVP(response_status);
      alert(response_status === "going" ? "You're in 🔥" : "Got it — marked not coming");
      loadEvent();

      if (showHistory) await refreshHistory();
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

  async function refreshHistory() {
    if (!savedFirstName || !savedLastName) return;

    let query = supabase
      .from("rsvps")
      .select(`
        *,
        events (
          event_date,
          event_time,
          message,
          status
        )
      `)
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

  async function loadHostFireHistory() {
    if (!isHost) return;

    const { data, error } = await supabase
      .from("events")
      .select(`
        *,
        rsvps (
          id,
          first_name,
          last_name,
          name,
          response_status,
          created_at
        )
      `)
      .order("event_date", { ascending: false })
      .order("event_time", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setHostFireHistory(data ?? []);
  }

  function formatDateForDatabase(date: Date) {
    return date.toISOString().split("T")[0];
  }

  function formatTimeForDatabase(date: Date) {
    return date.toTimeString().slice(0, 5);
  }

  function loadCurrentFireForEditing() {
    if (!event?.id) {
      alert("There is no active fire to edit.");
      return;
    }

    setNewEventDate(event.event_date || "");
    setNewEventTime(event.event_time || "");
    setNewEventMessage(event.message || "");
    setIsEditingFire(true);
  }

  function clearFireForm() {
    setNewEventDate("");
    setNewEventTime("");
    setNewEventMessage("");
    setIsEditingFire(false);
  }

  async function createNewEvent() {
    if (!isHost) return;

    if (!newEventDate.trim() || !newEventTime.trim()) {
      alert("Please choose a date and time.");
      return;
    }

    const { error } = await supabase.from("events").insert({
      title: "Yabs Fire Nite",
      event_date: newEventDate.trim(),
      event_time: newEventTime.trim(),
      message: newEventMessage.trim(),
      status: "published",
    });

    if (error) {
      alert(error.message);
    } else {
      alert("Fire event published 🔥");
      clearFireForm();
      await loadEvent();
      await loadHostFireHistory();
      if (showHistory) await refreshHistory();
    }
  }

  async function saveFireChanges() {
    if (!isHost || !event?.id) return;

    if (!newEventDate.trim() || !newEventTime.trim()) {
      alert("Please choose a date and time.");
      return;
    }

    const { error } = await supabase
      .from("events")
      .update({
        event_date: newEventDate.trim(),
        event_time: newEventTime.trim(),
        message: newEventMessage.trim(),
      })
      .eq("id", event.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Fire updated 🔥");
    clearFireForm();
    await loadEvent();
    await loadHostFireHistory();
    if (showHistory) await refreshHistory();
  }

  async function cancelCurrentEvent() {
    if (!event?.id || !isHost) return;

    Alert.alert(
      "Cancel Fire?",
      "This will remove the current fire from the active event screen, but it will still show in history as cancelled.",
      [
        { text: "Keep Fire", style: "cancel" },
        {
          text: "Cancel Fire",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("events")
              .update({ status: "cancelled" })
              .eq("id", event.id);

            if (error) {
              alert(error.message);
              return;
            }

            alert("Fire cancelled.");
            setEvent(null);
            setStatus("No upcoming fire found");
            setMessage("");
            clearFireForm();

            await loadEvent();
            await loadHostFireHistory();
            if (showHistory) await refreshHistory();
          },
        },
      ]
    );
  }

  async function postAnnouncement() {
    if (!isHost) return;

    if (!announcementMessage.trim()) {
      alert("Please enter an announcement.");
      return;
    }

    const yesRsvps =
      event?.rsvps?.filter((r: any) => r.response_status === "going") || [];

    const { error: clearError } = await supabase
      .from("announcements")
      .update({ is_active: false })
      .eq("is_active", true);

    if (clearError) {
      alert(clearError.message);
      return;
    }

    const { data: newAnnouncement, error } = await supabase
      .from("announcements")
      .insert({
        message: announcementMessage.trim(),
        is_active: true,
      })
      .select("*")
      .single();

    if (error) {
      alert(error.message);
      return;
    }

    if (yesRsvps.length > 0 && event?.id) {
      const recipientsToInsert = yesRsvps.map((person: any) => ({
        announcement_id: newAnnouncement.id,
        event_id: event.id,
        name: getDisplayName(person),
        first_name: person.first_name || null,
        last_name: person.last_name || null,
        response_status: person.response_status,
      }));

      const { error: recipientsError } = await supabase
        .from("announcement_recipients")
        .insert(recipientsToInsert);

      if (recipientsError) {
        alert(recipientsError.message);
        return;
      }
    }

    alert(
      yesRsvps.length > 0
        ? `Announcement posted and added to ${yesRsvps.length} recipient(s).`
        : "Announcement posted. No RSVP Yes recipients found."
    );

    setAnnouncementMessage("");
    setAnnouncement(newAnnouncement);
    await loadAnnouncementRecipients(newAnnouncement.id);
    await loadAnnouncementHistory();
  }

  async function clearAnnouncement() {
    if (!isHost || !announcement?.id) return;

    Alert.alert("Clear Announcement?", "This will remove it from the main screen.", [
      { text: "Keep It", style: "cancel" },
      {
        text: "Clear",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("announcements")
            .update({ is_active: false })
            .eq("id", announcement.id);

          if (error) {
            alert(error.message);
            return;
          }

          alert("Announcement cleared.");
          setAnnouncement(null);
          setAnnouncementRecipients([]);
          await loadAnnouncementHistory();
        },
      },
    ]);
  }

  async function reactivateAnnouncement(item: any) {
    if (!isHost || !item?.id) return;

    const { error: clearError } = await supabase
      .from("announcements")
      .update({ is_active: false })
      .eq("is_active", true);

    if (clearError) {
      alert(clearError.message);
      return;
    }

    const { error } = await supabase
      .from("announcements")
      .update({ is_active: true })
      .eq("id", item.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Announcement reactivated.");
    await loadAnnouncement();
    await loadAnnouncementHistory();
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

  async function addApprovedGuest() {
    const cleanFirstName = newGuestFirstName.trim();
    const cleanLastName = newGuestLastName.trim();

    if (!cleanFirstName || !cleanLastName) {
      alert("Please enter the guest's first and last name.");
      return;
    }

    const { data: existingGuest, error: lookupError } = await supabase
      .from("approved_users")
      .select("*")
      .ilike("first_name", cleanFirstName)
      .ilike("last_name", cleanLastName)
      .maybeSingle();

    if (lookupError) {
      alert(lookupError.message);
      return;
    }

    if (existingGuest) {
      const { error } = await supabase
        .from("approved_users")
        .update({ access_status: "active" })
        .eq("id", existingGuest.id);

      if (error) {
        alert(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from("approved_users").insert({
        first_name: cleanFirstName,
        last_name: cleanLastName,
        access_status: "active",
      });

      if (error) {
        alert(error.message);
        return;
      }
    }

    alert(`${cleanFirstName} ${cleanLastName} is approved.`);
    setNewGuestFirstName("");
    setNewGuestLastName("");
    loadApprovedGuests();
  }

  async function deactivateGuest(guest: any) {
    if (!isHost || !guest?.id) return;

    Alert.alert(
      "Deactivate Guest?",
      `Remove access for ${guest.first_name} ${guest.last_name}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Deactivate",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("approved_users")
              .update({ access_status: "inactive" })
              .eq("id", guest.id);

            if (error) {
              alert(error.message);
              return;
            }

            alert(`${guest.first_name} ${guest.last_name} has been deactivated.`);
            loadApprovedGuests();
          },
        },
      ]
    );
  }

  async function reactivateGuest(guest: any) {
    if (!isHost || !guest?.id) return;

    const { error } = await supabase
      .from("approved_users")
      .update({ access_status: "active" })
      .eq("id", guest.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert(`${guest.first_name} ${guest.last_name} has been reactivated.`);
    loadApprovedGuests();
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
        style={{
          marginRight: 8,
          marginTop: 8,
          backgroundColor: active ? "#f97316" : "#232326",
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: active ? "#f97316" : "#2f2f35",
        }}
      >
        <Text style={{ color: active ? "#111" : "#fff", fontWeight: "700" }}>
          {label}
        </Text>
      </Pressable>
    );
  }

  function SectionHeader({
    title,
    open,
    onPress,
  }: {
    title: string;
    open: boolean;
    onPress: () => void;
  }) {
    return (
      <Pressable
        onPress={onPress}
        style={{
          marginTop: 12,
          backgroundColor: "#232326",
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: open ? "#f97316" : "#2f2f35",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
          {open ? "▼" : "▶"} {title}
        </Text>
      </Pressable>
    );
  }

  function renderReminderRecipients() {
    if (!isHost) return null;

    const tomorrowList = dedupePeople(
      reminderRecipients.filter((person: any) => person.reminder_type === "tomorrow")
    );
    const twoHourList = dedupePeople(
      reminderRecipients.filter((person: any) => person.reminder_type === "two_hour")
    );

    function renderList(title: string, list: any[]) {
      return (
        <View
          style={{
            marginTop: 12,
            backgroundColor: "#232326",
            padding: 10,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#2f2f35",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700" }}>
            {title}: {list.length}
          </Text>

          {list.length === 0 ? (
            <Text style={{ color: "#b3b3ba", marginTop: 5 }}>
              No recipients added yet.
            </Text>
          ) : (
            list.map((person: any) => (
              <Text key={person.id} style={{ color: "#b3b3ba", marginTop: 4 }}>
                • {getDisplayName(person)}
              </Text>
            ))
          )}
        </View>
      );
    }

    return (
      <View style={{ marginTop: 12 }}>
        {renderList("Tomorrow Reminder List", tomorrowList)}
        {renderList("2 Hour Reminder List", twoHourList)}
      </View>
    );
  }

  function renderAnnouncementRecipients() {
    if (!isHost) return null;

    return (
      <View
        style={{
          marginTop: 12,
          backgroundColor: "#232326",
          padding: 10,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#2f2f35",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700" }}>
          Sent To: {announcementRecipients.length}
        </Text>

        {announcementRecipients.length === 0 ? (
          <Text style={{ color: "#b3b3ba", marginTop: 5 }}>No recipients yet.</Text>
        ) : (
          announcementRecipients.map((person: any) => (
            <Text key={person.id} style={{ color: "#b3b3ba", marginTop: 4 }}>
              • {getDisplayName(person)}
            </Text>
          ))
        )}
      </View>
    );
  }

  function renderAnnouncementHistory() {
    if (!isHost) return null;

    return (
      <View style={{ marginTop: 15 }}>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>
          Announcement History
        </Text>

        <Pressable
          onPress={loadAnnouncementHistory}
          style={{
            marginTop: 10,
            backgroundColor: "#232326",
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#2f2f35",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
            Refresh Announcement History
          </Text>
        </Pressable>

        {announcementHistory.length === 0 ? (
          <Text style={{ color: "#b3b3ba", marginTop: 10 }}>No announcements yet.</Text>
        ) : (
          announcementHistory.map((item: any) => {
            const isExpanded = expandedAnnouncementId === item.id;
            const recipients = item.announcement_recipients || [];

            return (
              <View
                key={item.id}
                style={{
                  marginTop: 10,
                  padding: 10,
                  backgroundColor: "#232326",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: item.is_active ? "#f97316" : "#2f2f35",
                }}
              >
                <Pressable
                  onPress={() =>
                    setExpandedAnnouncementId(isExpanded ? null : item.id)
                  }
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    {item.message}
                  </Text>

                  <Text
                    style={{
                      color: item.is_active ? "#f97316" : "#b3b3ba",
                      marginTop: 5,
                    }}
                  >
                    Status: {item.is_active ? "Active" : "Inactive"}
                  </Text>

                  <Text style={{ color: "#b3b3ba", marginTop: 3 }}>
                    Posted: {new Date(item.created_at).toLocaleString()}
                  </Text>

                  <Text style={{ color: "#b3b3ba", marginTop: 3 }}>
                    Sent To: {recipients.length}
                  </Text>

                  <Text style={{ color: "#f97316", marginTop: 5 }}>
                    {isExpanded ? "Hide Recipients" : "View Recipients"}
                  </Text>
                </Pressable>

                {isExpanded && (
                  <View style={{ marginTop: 10 }}>
                    {recipients.length === 0 ? (
                      <Text style={{ color: "#b3b3ba" }}>
                        No recipients saved for this announcement.
                      </Text>
                    ) : (
                      recipients.map((person: any) => (
                        <Text key={person.id} style={{ color: "#b3b3ba", marginTop: 4 }}>
                          • {getDisplayName(person)}
                        </Text>
                      ))
                    )}

                    {!item.is_active && (
                      <Pressable
                        onPress={() => reactivateAnnouncement(item)}
                        style={{
                          marginTop: 10,
                          backgroundColor: "#f97316",
                          paddingVertical: 10,
                          paddingHorizontal: 20,
                          borderRadius: 10,
                        }}
                      >
                        <Text
                          style={{
                            color: "#111",
                            fontWeight: "700",
                            textAlign: "center",
                          }}
                        >
                          Reactivate Announcement
                        </Text>
                      </Pressable>
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    );
  }

  function renderHostFireHistory() {
    if (!isHost) return null;

    return (
      <View style={{ marginTop: 15 }}>
        <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>
          Host Fire History
        </Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4 }}>
          <FilterButton
            label="All"
            active={fireHistoryFilter === "all"}
            onPress={() => setFireHistoryFilter("all")}
          />
          <FilterButton
            label="Active"
            active={fireHistoryFilter === "active"}
            onPress={() => setFireHistoryFilter("active")}
          />
          <FilterButton
            label="Cancelled"
            active={fireHistoryFilter === "cancelled"}
            onPress={() => setFireHistoryFilter("cancelled")}
          />
        </View>

        <Pressable
          onPress={loadHostFireHistory}
          style={{
            marginTop: 10,
            backgroundColor: "#232326",
            paddingVertical: 10,
            paddingHorizontal: 20,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#2f2f35",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
            Refresh Fire History
          </Text>
        </Pressable>

        {filteredFireHistory.length === 0 ? (
          <Text style={{ color: "#b3b3ba", marginTop: 10 }}>
            No fires match this filter.
          </Text>
        ) : (
          filteredFireHistory.map((fire: any) => {
            const yesList = dedupePeople(
              fire.rsvps?.filter((r: any) => r.response_status === "going") || []
            );
            const noList = dedupePeople(
              fire.rsvps?.filter((r: any) => r.response_status === "not_going") || []
            );
            const isExpanded = expandedFireId === fire.id;

            return (
              <View
                key={fire.id}
                style={{
                  marginTop: 10,
                  padding: 10,
                  backgroundColor: "#232326",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor:
                    fire.status === "cancelled" ? "#7f1d1d" : "#2f2f35",
                }}
              >
                <Pressable
                  onPress={() => setExpandedFireId(isExpanded ? null : fire.id)}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>
                    {fire.event_date ? formatDisplayDate(fire.event_date) : "No date"}{" "}
                    {fire.event_time ? `at ${fire.event_time}` : ""}
                  </Text>

                  <Text
                    style={{
                      color:
                        fire.status === "cancelled" ? "#ef4444" : "#b3b3ba",
                      marginTop: 3,
                    }}
                  >
                    Status: {fire.status}
                  </Text>

                  <Text style={{ color: "#b3b3ba", marginTop: 3 }}>
                    Yes: {yesList.length} | No: {noList.length}
                  </Text>

                  {fire.message ? (
                    <Text style={{ color: "#b3b3ba", marginTop: 3 }}>
                      Message: {fire.message}
                    </Text>
                  ) : null}

                  <Text style={{ color: "#f97316", marginTop: 5 }}>
                    {isExpanded ? "Hide RSVPs" : "View RSVPs"}
                  </Text>
                </Pressable>

                {isExpanded && (
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ color: "#22c55e", fontWeight: "700" }}>
                      Yes — Coming
                    </Text>

                    {yesList.length === 0 ? (
                      <Text style={{ color: "#b3b3ba", marginTop: 4 }}>
                        No yes responses.
                      </Text>
                    ) : (
                      yesList.map((person: any) => (
                        <Text key={person.id} style={{ color: "#b3b3ba", marginTop: 4 }}>
                          • {getDisplayName(person)}
                        </Text>
                      ))
                    )}

                    <Text
                      style={{
                        color: "#ef4444",
                        fontWeight: "700",
                        marginTop: 12,
                      }}
                    >
                      No — Not Coming
                    </Text>

                    {noList.length === 0 ? (
                      <Text style={{ color: "#b3b3ba", marginTop: 4 }}>
                        No no responses.
                      </Text>
                    ) : (
                      noList.map((person: any) => (
                        <Text key={person.id} style={{ color: "#b3b3ba", marginTop: 4 }}>
                          • {getDisplayName(person)}
                        </Text>
                      ))
                    )}
                  </View>
                )}
              </View>
            );
          })
        )}
      </View>
    );
  }

  const mainTitle = event ? status : announcement ? "Fire Announcement" : status;
  const mainMessage = event ? message : announcement ? announcement.message : message;

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: "#0f0f10",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 28, fontWeight: "700" }}>
        🔥 {mainTitle}
      </Text>

      <Text style={{ color: "#b3b3ba", marginTop: 10, textAlign: "center" }}>
        {mainMessage}
      </Text>

      {!event && announcement && (
        <View
          style={{
            marginTop: 15,
            backgroundColor: "#232326",
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#f97316",
            width: "90%",
          }}
        >
          <Text style={{ color: "#f97316", fontWeight: "700", textAlign: "center" }}>
            Host Update
          </Text>
          <Text style={{ color: "#fff", marginTop: 6, textAlign: "center" }}>
            {announcement.message}
          </Text>
        </View>
      )}

      {event && (
        <View style={{ marginTop: 15 }}>
          <Text style={{ color: "#fff", fontWeight: "700", marginBottom: 5 }}>
            Who’s Coming: {goingCount}
          </Text>

          {currentGoingList.map((r: any) => (
            <Text key={r.id} style={{ color: "#b3b3ba" }}>
              • {getDisplayName(r)}
            </Text>
          ))}
        </View>
      )}

      {!savedFirstName || !savedLastName ? (
        <>
          <TextInput
            placeholder="First name"
            placeholderTextColor="#888"
            value={firstName}
            onChangeText={setFirstName}
            style={{
              marginTop: 20,
              backgroundColor: "#232326",
              color: "#fff",
              padding: 10,
              borderRadius: 8,
              width: "80%",
              textAlign: "center",
            }}
          />

          <TextInput
            placeholder="Last name"
            placeholderTextColor="#888"
            value={lastName}
            onChangeText={setLastName}
            style={{
              marginTop: 10,
              backgroundColor: "#232326",
              color: "#fff",
              padding: 10,
              borderRadius: 8,
              width: "80%",
              textAlign: "center",
            }}
          />

          <Pressable
            onPress={saveName}
            style={{
              marginTop: 10,
              backgroundColor: "#f97316",
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: "#111", fontWeight: "700" }}>Save Name</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={{ color: "#fff", marginTop: 15 }}>
            Welcome, {savedFirstName} {savedLastName}
          </Text>

          {isHost && (
            <Text style={{ color: "#22c55e", marginTop: 8 }}>
              You are hosting this fire 🔥
            </Text>
          )}

          <Pressable
            onPress={resetName}
            style={{
              marginTop: 10,
              backgroundColor: "#232326",
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#2f2f35",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>Reset Name</Text>
          </Pressable>

          {isApproved && (
            <Pressable
              onPress={registerForPushNotifications}
              style={{
                marginTop: 10,
                backgroundColor: "#232326",
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: "#2f2f35",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700" }}>
                Enable Notifications Disabled
              </Text>
            </Pressable>
          )}

          <Pressable
            onPress={loadHistory}
            style={{
              marginTop: 10,
              backgroundColor: "#232326",
              paddingVertical: 10,
              paddingHorizontal: 20,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#2f2f35",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700" }}>
              {showHistory
                ? "Hide History"
                : isHost
                ? "View All History"
                : "View My History"}
            </Text>
          </Pressable>

          {isHost && (
            <Pressable
              onPress={() => setShowHostPanel(!showHostPanel)}
              style={{
                marginTop: 10,
                backgroundColor: "#f97316",
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "#111", fontWeight: "700" }}>
                {showHostPanel ? "Hide Host Panel" : "Show Host Panel"}
              </Text>
            </Pressable>
          )}

          {isHost && showHostPanel && (
            <View
              style={{
                marginTop: 20,
                width: "90%",
                backgroundColor: "#18181b",
                padding: 15,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#2f2f35",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>
                Host Panel
              </Text>

              <SectionHeader
                title="Fire Controls"
                open={showFireControls}
                onPress={() => setShowFireControls(!showFireControls)}
              />

              {showFireControls && (
                <View style={{ marginTop: 10 }}>
                  {event && (
                    <Pressable
                      onPress={loadCurrentFireForEditing}
                      style={{
                        backgroundColor: "#232326",
                        paddingVertical: 12,
                        paddingHorizontal: 20,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: "#f97316",
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
                        Load Current Fire for Editing
                      </Text>
                    </Pressable>
                  )}

                  {isEditingFire && (
                    <Text style={{ color: "#22c55e", marginTop: 10, textAlign: "center" }}>
                      Editing current fire
                    </Text>
                  )}

                  <Pressable
                    onPress={() => setShowDatePicker(true)}
                    style={{
                      marginTop: 10,
                      backgroundColor: "#232326",
                      padding: 12,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: "#fff", textAlign: "center" }}>
                      {newEventDate
                        ? `Date: ${formatDisplayDate(newEventDate)}`
                        : "Choose Date"}
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => setShowTimePicker(true)}
                    style={{
                      marginTop: 10,
                      backgroundColor: "#232326",
                      padding: 12,
                      borderRadius: 8,
                    }}
                  >
                    <Text style={{ color: "#fff", textAlign: "center" }}>
                      {newEventTime ? `Time: ${newEventTime}` : "Choose Time"}
                    </Text>
                  </Pressable>

                  {showDatePicker && (
                    <DateTimePicker
                      value={
                        newEventDate
                          ? new Date(`${newEventDate}T00:00:00`)
                          : new Date()
                      }
                      mode="date"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(pickerEvent, selectedDate) => {
                        setShowDatePicker(false);
                        if (selectedDate) {
                          setNewEventDate(formatDateForDatabase(selectedDate));
                        }
                      }}
                    />
                  )}

                  {showTimePicker && (
                    <DateTimePicker
                      value={new Date()}
                      mode="time"
                      display={Platform.OS === "ios" ? "spinner" : "default"}
                      onChange={(pickerEvent, selectedTime) => {
                        setShowTimePicker(false);
                        if (selectedTime) {
                          setNewEventTime(formatTimeForDatabase(selectedTime));
                        }
                      }}
                    />
                  )}

                  <TextInput
                    placeholder="Message optional"
                    placeholderTextColor="#888"
                    value={newEventMessage}
                    onChangeText={setNewEventMessage}
                    style={{
                      marginTop: 10,
                      backgroundColor: "#232326",
                      color: "#fff",
                      padding: 10,
                      borderRadius: 8,
                    }}
                  />

                  {isEditingFire ? (
                    <>
                      <Pressable
                        onPress={saveFireChanges}
                        style={{
                          marginTop: 10,
                          backgroundColor: "#22c55e",
                          paddingVertical: 12,
                          paddingHorizontal: 20,
                          borderRadius: 10,
                        }}
                      >
                        <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
                          Save Fire Changes
                        </Text>
                      </Pressable>

                      <Pressable
                        onPress={clearFireForm}
                        style={{
                          marginTop: 10,
                          backgroundColor: "#232326",
                          paddingVertical: 12,
                          paddingHorizontal: 20,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: "#2f2f35",
                        }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
                          Cancel Editing
                        </Text>
                      </Pressable>
                    </>
                  ) : (
                    <Pressable
                      onPress={createNewEvent}
                      style={{
                        marginTop: 10,
                        backgroundColor: "#f97316",
                        paddingVertical: 12,
                        paddingHorizontal: 20,
                        borderRadius: 10,
                      }}
                    >
                      <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
                        Create / Publish Fire 🔥
                      </Text>
                    </Pressable>
                  )}

                  {event && (
                    <Pressable
                      onPress={cancelCurrentEvent}
                      style={{
                        marginTop: 10,
                        backgroundColor: "#7f1d1d",
                        paddingVertical: 12,
                        paddingHorizontal: 20,
                        borderRadius: 10,
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
                        Cancel Current Fire
                      </Text>
                    </Pressable>
                  )}
                </View>
              )}

              <SectionHeader
                title="Announcements"
                open={showAnnouncementsSection}
                onPress={() => setShowAnnouncementsSection(!showAnnouncementsSection)}
              />

              {showAnnouncementsSection && (
                <View style={{ marginTop: 10 }}>
                  <TextInput
                    placeholder="No fire this week, cancelled because of weather, pushing to Saturday..."
                    placeholderTextColor="#888"
                    value={announcementMessage}
                    onChangeText={setAnnouncementMessage}
                    multiline
                    style={{
                      backgroundColor: "#232326",
                      color: "#fff",
                      padding: 10,
                      borderRadius: 8,
                      minHeight: 80,
                      textAlignVertical: "top",
                    }}
                  />

                  <Pressable
                    onPress={postAnnouncement}
                    style={{
                      marginTop: 10,
                      backgroundColor: "#f97316",
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
                      Post Announcement
                    </Text>
                  </Pressable>

                  {announcement && (
                    <>
                      <Pressable
                        onPress={clearAnnouncement}
                        style={{
                          marginTop: 10,
                          backgroundColor: "#7f1d1d",
                          paddingVertical: 12,
                          paddingHorizontal: 20,
                          borderRadius: 10,
                        }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
                          Clear Current Announcement
                        </Text>
                      </Pressable>

                      {renderAnnouncementRecipients()}

                      <Pressable
                        onPress={sendAnnouncementPush}
                        style={{
                          marginTop: 10,
                          backgroundColor: "#22c55e",
                          paddingVertical: 12,
                          paddingHorizontal: 20,
                          borderRadius: 10,
                        }}
                      >
                        <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
                          Send Announcement Push Disabled
                        </Text>
                      </Pressable>
                    </>
                  )}

                  {renderAnnouncementHistory()}
                </View>
              )}

              <SectionHeader
                title="Reminders"
                open={showRemindersSection}
                onPress={() => setShowRemindersSection(!showRemindersSection)}
              />

              {showRemindersSection && (
                <View style={{ marginTop: 10 }}>
                  <Text style={{ color: "#b3b3ba", textAlign: "center" }}>
                    Build reminder lists from everyone who RSVP’d Yes for the current fire.
                  </Text>

                  <Pressable
                    onPress={() => createReminderList("tomorrow")}
                    style={{
                      marginTop: 10,
                      backgroundColor: "#f97316",
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
                      Create Tomorrow Reminder List
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => createReminderList("two_hour")}
                    style={{
                      marginTop: 10,
                      backgroundColor: "#f97316",
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
                      Create 2 Hour Reminder List
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => sendReminderPush("tomorrow")}
                    style={{
                      marginTop: 10,
                      backgroundColor: "#22c55e",
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
                      Send Tomorrow Push Reminder Disabled
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={() => sendReminderPush("two_hour")}
                    style={{
                      marginTop: 10,
                      backgroundColor: "#22c55e",
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
                      Send 2 Hour Push Reminder Disabled
                    </Text>
                  </Pressable>

                  {event ? (
                    renderReminderRecipients()
                  ) : (
                    <Text style={{ color: "#b3b3ba", marginTop: 10, textAlign: "center" }}>
                      No active fire found. Create or publish a fire before building reminders.
                    </Text>
                  )}
                </View>
              )}

              <SectionHeader
                title="Guests"
                open={showGuestsSection}
                onPress={() => setShowGuestsSection(!showGuestsSection)}
              />

              {showGuestsSection && (
                <View style={{ marginTop: 10 }}>
                  <TextInput
                    placeholder="Guest first name"
                    placeholderTextColor="#888"
                    value={newGuestFirstName}
                    onChangeText={setNewGuestFirstName}
                    style={{
                      backgroundColor: "#232326",
                      color: "#fff",
                      padding: 10,
                      borderRadius: 8,
                    }}
                  />

                  <TextInput
                    placeholder="Guest last name"
                    placeholderTextColor="#888"
                    value={newGuestLastName}
                    onChangeText={setNewGuestLastName}
                    style={{
                      marginTop: 10,
                      backgroundColor: "#232326",
                      color: "#fff",
                      padding: 10,
                      borderRadius: 8,
                    }}
                  />

                  <Pressable
                    onPress={addApprovedGuest}
                    style={{
                      marginTop: 10,
                      backgroundColor: "#22c55e",
                      paddingVertical: 12,
                      paddingHorizontal: 20,
                      borderRadius: 10,
                    }}
                  >
                    <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
                      Approve Guest
                    </Text>
                  </Pressable>

                  <Pressable
                    onPress={loadApprovedGuests}
                    style={{
                      marginTop: 10,
                      backgroundColor: "#232326",
                      paddingVertical: 10,
                      paddingHorizontal: 20,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: "#2f2f35",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
                      Refresh Guest List
                    </Text>
                  </Pressable>

                  <View style={{ marginTop: 15 }}>
                    <Text style={{ color: "#fff", fontWeight: "700", marginBottom: 5 }}>
                      Approved Guests: {approvedGuests.length}
                    </Text>

                    {approvedGuests.length === 0 ? (
                      <Text style={{ color: "#b3b3ba" }}>No approved guests yet.</Text>
                    ) : (
                      approvedGuests.map((guest: any) => (
                        <View
                          key={guest.id}
                          style={{
                            marginTop: 10,
                            padding: 10,
                            backgroundColor: "#232326",
                            borderRadius: 10,
                            borderWidth: 1,
                            borderColor: "#2f2f35",
                          }}
                        >
                          <Text style={{ color: "#b3b3ba" }}>
                            • {getDisplayName(guest)}
                            {guest.access_status !== "active"
                              ? ` (${guest.access_status})`
                              : ""}
                          </Text>

                          {guest.access_status === "active" ? (
                            <Pressable
                              onPress={() => deactivateGuest(guest)}
                              style={{
                                marginTop: 8,
                                backgroundColor: "#7f1d1d",
                                paddingVertical: 8,
                                paddingHorizontal: 12,
                                borderRadius: 8,
                              }}
                            >
                              <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
                                Deactivate Guest
                              </Text>
                            </Pressable>
                          ) : (
                            <Pressable
                              onPress={() => reactivateGuest(guest)}
                              style={{
                                marginTop: 8,
                                backgroundColor: "#22c55e",
                                paddingVertical: 8,
                                paddingHorizontal: 12,
                                borderRadius: 8,
                              }}
                            >
                              <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
                                Reactivate Guest
                              </Text>
                            </Pressable>
                          )}
                        </View>
                      ))
                    )}
                  </View>
                </View>
              )}

              <SectionHeader
                title="Fire History"
                open={showHostHistorySection}
                onPress={() => setShowHostHistorySection(!showHostHistorySection)}
              />

              {showHostHistorySection && (
  <FireHistory
    isHost={isHost}
    renderHostFireHistory={renderHostFireHistory}
  />
)}
            </View>
          )}

          {showHistory && (
            <View
              style={{
                marginTop: 20,
                width: "95%",
                backgroundColor: "#18181b",
                padding: 15,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: "#2f2f35",
              }}
            >
              <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700" }}>
                {isHost ? "All Fire History" : "My Fire History"}
              </Text>

              <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 6 }}>
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
                  label="Not Going"
                  active={historyFilter === "not_going"}
                  onPress={() => setHistoryFilter("not_going")}
                />
              </View>

              {filteredHistory.length === 0 ? (
                <Text style={{ color: "#b3b3ba", marginTop: 10 }}>
                  No history matches this filter.
                </Text>
              ) : (
                filteredHistory.map((item) => (
                  <View
                    key={item.id}
                    style={{
                      marginTop: 10,
                      padding: 10,
                      backgroundColor: "#232326",
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor:
                        item.events?.status === "cancelled"
                          ? "#7f1d1d"
                          : "#2f2f35",
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700" }}>
                      {getDisplayName(item)}
                    </Text>

                    <Text style={{ color: "#b3b3ba", marginTop: 3 }}>
                      Response:{" "}
                      {item.response_status === "going"
                        ? "Yes — Coming"
                        : "No — Not Coming"}
                    </Text>

                    <Text style={{ color: "#b3b3ba", marginTop: 3 }}>
                      Fire:{" "}
                      {item.events?.event_date
                        ? formatDisplayDate(item.events.event_date)
                        : ""}
                      {item.events?.event_time ? ` at ${item.events.event_time}` : ""}
                    </Text>

                    {item.events?.status && (
                      <Text
                        style={{
                          color:
                            item.events.status === "cancelled"
                              ? "#ef4444"
                              : "#b3b3ba",
                          marginTop: 3,
                        }}
                      >
                        Status: {item.events.status}
                      </Text>
                    )}

                    <Text style={{ color: "#b3b3ba", marginTop: 3 }}>
                      RSVP Date: {new Date(item.created_at).toLocaleString()}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}

          {event && isApproved && !isHost && (
            <>
              <Pressable
                onPress={() => handleRSVP("going")}
                style={{
                  marginTop: 20,
                  backgroundColor:
                    myRSVP === "going" ? "#f97316" : "#232326",
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor:
                    myRSVP === "going" ? "#f97316" : "#2f2f35",
                }}
              >
                <Text
                  style={{
                    color: myRSVP === "going" ? "#111" : "#fff",
                    fontWeight: "700",
                  }}
                >
                  Yes — I’m Coming
                </Text>
              </Pressable>

              <Pressable
                onPress={() => handleRSVP("not_going")}
                style={{
                  marginTop: 10,
                  backgroundColor:
                    myRSVP === "not_going" ? "#f97316" : "#232326",
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor:
                    myRSVP === "not_going" ? "#f97316" : "#2f2f35",
                }}
              >
                <Text
                  style={{
                    color: myRSVP === "not_going" ? "#111" : "#fff",
                    fontWeight: "700",
                  }}
                >
                  No — I’m Not Coming
                </Text>
              </Pressable>
            </>
          )}

          {event && approvalChecked && !isApproved && (
            <Text style={{ color: "#ef4444", marginTop: 20, textAlign: "center" }}>
              You are not currently approved to access Yabs Fire Nite.
            </Text>
          )}
        </>
      )}
    </ScrollView>
  );
}
