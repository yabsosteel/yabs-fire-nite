import { useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "../../lib/supabase";
import {
  formatFireDateTime,
  sendPushNotificationToAll,
} from "../../lib/notifications";

function Section({
    title,
    subtitle,
    open,
    onPress,
    children,
  }: {
    title: string;
    subtitle?: string;
    open: boolean;
    onPress: () => void;
    children: any;
  }) {
    return (
      <View style={styles.card}>
        <Pressable onPress={onPress} style={styles.sectionHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardLabel}>{title}</Text>
            {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
          </View>

          <Text style={styles.chevron}>{open ? "▼" : "▶"}</Text>
        </Pressable>

        {open && <View style={{ marginTop: 10 }}>{children}</View>}
      </View>
    );
  }

export default function HostScreen() {
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventTime, setNewEventTime] = useState("");
  const [newEventMessage, setNewEventMessage] = useState("");

  const [publishedFires, setPublishedFires] = useState<any[]>([]);
  const [fireHistory, setFireHistory] = useState<any[]>([]);
  const [fireFilter, setFireFilter] = useState<"all" | "active" | "cancelled">("all");

  const [selectedFire, setSelectedFire] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcements, setAnnouncements] = useState<any[]>([]);

  const [approvedGuests, setApprovedGuests] = useState<any[]>([]);
  const [newGuestFirstName, setNewGuestFirstName] = useState("");
  const [newGuestLastName, setNewGuestLastName] = useState("");

  const [reminderRecipients, setReminderRecipients] = useState<any[]>([]);
  const [expandedFireId, setExpandedFireId] = useState<string | null>(null);

  const [showCreateEditFire, setShowCreateEditFire] = useState(false);
  const [showFireManagement, setShowFireManagement] = useState(false);
  const [showFireHistory, setShowFireHistory] = useState(false);
  const [showAnnouncements, setShowAnnouncements] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [showGuests, setShowGuests] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  const filteredFireHistory =
    fireFilter === "all"
      ? fireHistory
      : fireHistory.filter((fire) =>
          fireFilter === "active"
            ? fire.status === "published"
            : fire.status === "cancelled"
        );

  useEffect(() => {
    loadHostData();

    const channel = supabase
      .channel("realtime-all")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "events" },
        () => {
          loadHostData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rsvps" },
        () => {
          loadHostData();
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "announcements" },
        () => {
          loadHostData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function loadHostData() {
    await Promise.all([
      loadPublishedFires(),
      loadFireHistory(),
      loadAnnouncements(),
      loadApprovedGuests(),
      loadReminderRecipients(),
    ]);
  }

  function formatDateForDatabase(date: Date) {
    return date.toISOString().split("T")[0];
  }

  function formatTimeForDatabase(date: Date) {
    return date.toTimeString().slice(0, 5);
  }

  function getDisplayName(person: any) {
    if (person?.first_name && person?.last_name) {
      return `${person.first_name} ${person.last_name}`;
    }

    if (person?.name) return person.name;
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

  function adjustTime(minutesToAdd: number) {
    if (!newEventTime) {
      alert("Please choose a time first.");
      return;
    }

    const [hours, minutes] = newEventTime.split(":").map(Number);
    const date = new Date();

    date.setHours(hours);
    date.setMinutes(minutes + minutesToAdd);

    setNewEventTime(date.toTimeString().slice(0, 5));
  }

  async function loadPublishedFires() {
    const today = new Date().toISOString().split("T")[0];

    const response = await supabase
  .from("events")
  .insert({
    title: "Yabs Fire Nite",
    event_date: newEventDate,
    event_time: newEventTime,
    message: newEventMessage,
    status: "published",
  })
  .select()
  .single();

const data = response.data as any;
const error = response.error;

    if (error) {
      alert(error.message);
      return;
    }

    setPublishedFires(data || []);
  }

  async function loadFireHistory() {
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
      .is("deleted_at", null)
      .neq("status", "deleted")
      .order("event_date", { ascending: false })
      .order("event_time", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setFireHistory(data || []);
  }

  async function loadAnnouncements() {
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

    setAnnouncements(data || []);
  }

  async function loadApprovedGuests() {
    const { data, error } = await supabase
      .from("approved_users")
      .select("*")
      .order("first_name", { ascending: true })
      .order("last_name", { ascending: true });

    if (error) {
      alert(error.message);
      return;
    }

    setApprovedGuests(data || []);
  }

  async function loadReminderRecipients() {
    const { data, error } = await supabase
      .from("reminder_recipients")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setReminderRecipients(data || []);
  }

  function loadFireForEditing(fire: any) {
    setSelectedFire(fire);
    setNewEventDate(fire.event_date);
    setNewEventTime(fire.event_time);
    setNewEventMessage(fire.message || "");
    setIsEditing(true);
    setShowCreateEditFire(true);
  }

  function clearForm() {
    setNewEventDate("");
    setNewEventTime("");
    setNewEventMessage("");
    setSelectedFire(null);
    setIsEditing(false);
  }

  async function createNewEvent() {
    if (isSaving) return;
    setIsSaving(true);

    try {
      if (!newEventDate || !newEventTime) {
        alert("Please choose a date and time.");
        return;
      }

      const { data, error } = await supabase
  .from("events")
  .insert({
    title: "Yabs Fire Nite",
    event_date: newEventDate,
    event_time: newEventTime,
    message: newEventMessage,
    status: "published",
  })
  .select()
  .single();

if (error) {
  alert(error.message);
  return;
}

await supabase.from("rsvps").insert({
  event_id: data.id,
  first_name: "Rian",
  last_name: "Yablun",
  name: "Rian Yablun",
  response_status: "going",
});
      await sendPushNotificationToAll(
        "🔥 New Fire",
        `${formatFireDateTime(newEventDate, newEventTime)} — Tap to RSVP`
      );

      alert("Fire created 🔥");
      clearForm();
      loadHostData();
    } finally {
      setIsSaving(false);
    }
  }

  async function saveFireChanges() {
    if (isSaving) return;
    setIsSaving(true);

    try {
      if (!selectedFire?.id) return;

      if (!newEventDate || !newEventTime) {
        alert("Please choose a date and time.");
        return;
      }

      const { error } = await supabase
        .from("events")
        .update({
          event_date: newEventDate,
          event_time: newEventTime,
          message: newEventMessage,
        })
        .eq("id", selectedFire.id);

      if (error) {
        alert(error.message);
        return;
      }

      await sendPushNotificationToAll(
        "🔥 Fire Updated",
        `Now set for ${formatFireDateTime(newEventDate, newEventTime)}`
      );

      alert("Fire updated 🔥");
      clearForm();
      loadHostData();
    } finally {
      setIsSaving(false);
    }
  }

  async function cancelFire(fire: any) {
    Alert.alert(
      "Cancel Fire?",
      "This will remove the fire from the active screen but keep it in history as cancelled.",
      [
        { text: "Keep Fire", style: "cancel" },
        {
          text: "Cancel Fire",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("events")
              .update({ status: "cancelled" })
              .eq("id", fire.id);

            if (error) {
              alert(error.message);
              return;
            }

            await sendPushNotificationToAll(
              "❌ Fire Cancelled",
              `${formatFireDateTime(fire.event_date, fire.event_time)} has been cancelled.`
            );

            alert("Fire cancelled.");
            clearForm();
            loadHostData();
          },
        },
      ]
    );
  }

  async function deleteFire(fire: any) {
    Alert.alert(
      "Delete Fire?",
      "This permanently hides the fire from the app. This should only be used for mistakes.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            const { error } = await supabase
              .from("events")
              .update({
                status: "deleted",
                deleted_at: new Date().toISOString(),
              })
              .eq("id", fire.id);

            if (error) {
              alert(error.message);
              return;
            }

            alert("Fire deleted.");
            clearForm();
            loadHostData();
          },
        },
      ]
    );
  }

  async function postAnnouncement() {
    if (!announcementMessage.trim()) {
      alert("Please enter an announcement.");
      return;
    }

    const activeFire = publishedFires[0];
    const yesRsvps = dedupePeople(
      activeFire?.rsvps?.filter((r: any) => r.response_status === "going") || []
    );

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

    await sendPushNotificationToAll("📢 Fire Update", announcementMessage.trim());

    if (yesRsvps.length > 0 && activeFire?.id) {
      const recipientsToInsert = yesRsvps.map((person: any) => ({
        announcement_id: newAnnouncement.id,
        event_id: activeFire.id,
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

    alert("Announcement posted.");
    setAnnouncementMessage("");
    loadAnnouncements();
  }

  async function clearActiveAnnouncement() {
    const activeAnnouncement = announcements.find((item) => item.is_active);

    if (!activeAnnouncement?.id) {
      alert("There is no active announcement to clear.");
      return;
    }

    const { error } = await supabase
      .from("announcements")
      .update({ is_active: false })
      .eq("id", activeAnnouncement.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Announcement cleared.");
    loadAnnouncements();
  }

  async function createReminderList(reminderType: "tomorrow" | "two_hour") {
  const activeFire = publishedFires[0];

  if (!activeFire?.id) {
    alert("There is no active fire for reminders.");
    return;
  }

  const yesRsvps = dedupePeople(
    activeFire.rsvps?.filter((r: any) => r.response_status === "going") || []
  );

  if (yesRsvps.length === 0) {
    alert("No RSVP Yes guests found for this fire.");
    return;
  }

  const { data: existingRecipients, error: existingError } = await supabase
    .from("reminder_recipients")
    .select("*")
    .eq("event_id", activeFire.id)
    .eq("reminder_type", reminderType);

  if (existingError) {
    alert(existingError.message);
    return;
  }

  const existingKeys = new Set(
    (existingRecipients || []).map((person: any) => getPersonKey(person))
  );

  const newRecipientsOnly = yesRsvps.filter(
    (person: any) => !existingKeys.has(getPersonKey(person))
  );

  if (newRecipientsOnly.length === 0) {
    alert("Reminder list already exists. No duplicates were added.");
    return;
  }

  const recipientsToInsert = newRecipientsOnly.map((person: any) => ({
    event_id: activeFire.id,
    name: getDisplayName(person),
    first_name: person.first_name || null,
    last_name: person.last_name || null,
    response_status: person.response_status,
    reminder_type: reminderType,
  }));

  const { error } = await supabase
    .from("reminder_recipients")
    .insert(recipientsToInsert);

  if (error) {
    alert(error.message);
    return;
  }

  alert("Reminder list updated.");
  loadReminderRecipients();
}

  async function addApprovedGuest() {
  const cleanFirstName = newGuestFirstName.trim();
  const cleanLastName = newGuestLastName.trim();

  if (!cleanFirstName || !cleanLastName) {
    alert("Please enter first and last name.");
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
      .update({ is_approved: true })
      .eq("id", existingGuest.id);

    if (error) {
      alert(error.message);
      return;
    }
  } else {
    const { error } = await supabase.from("approved_users").insert({
      first_name: cleanFirstName,
      last_name: cleanLastName,
      is_approved: true,
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
  const { error } = await supabase
    .from("approved_users")
    .update({ is_approved: false })
    .eq("id", guest.id);

  if (error) {
    alert(error.message);
    return;
  }

  loadApprovedGuests();
}

 async function reactivateGuest(guest: any) {
  const { error } = await supabase
    .from("approved_users")
    .update({ is_approved: true })
    .eq("id", guest.id);

  if (error) {
    alert(error.message);
    return;
  }

  loadApprovedGuests();
}

async function deleteGuest(guest: any) {
  Alert.alert(
    "Delete Guest?",
    `This will remove ${getDisplayName(guest)} from the app.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          const { error } = await supabase
            .from("approved_users")
            .delete()
            .eq("id", guest.id);

          if (error) {
            alert(error.message);
            return;
          }

          loadApprovedGuests();
        },
      },
    ]
  );
}

  function renderFireWithRsvps(fire: any) {
    const yesList = dedupePeople(
      fire.rsvps?.filter((r: any) => r.response_status === "going") || []
    );

    const maybeList = dedupePeople(
      fire.rsvps?.filter((r: any) => r.response_status === "maybe") || []
    );

    const noList = dedupePeople(
      fire.rsvps?.filter((r: any) => r.response_status === "not_going") || []
    );

    const isExpanded = expandedFireId === fire.id;

    return (
      <View
        key={fire.id}
        style={[
          styles.fireCard,
          fire.status === "published" && styles.activeFireCard,
          fire.status === "cancelled" && styles.cancelledFireCard,
        ]}
      >
        <Pressable onPress={() => setExpandedFireId(isExpanded ? null : fire.id)}>
          <Text style={styles.fireTitle}>
            {formatFireDateTime(fire.event_date, fire.event_time)}
          </Text>

          <Text style={styles.fireMessage}>{fire.message || "No message added."}</Text>

          <Text style={styles.fireMeta}>
            Status: {fire.status} | Yes: {yesList.length} | Maybe:{" "}
            {maybeList.length} | No: {noList.length}
          </Text>

          <Text style={styles.linkText}>
            {isExpanded ? "Hide RSVPs" : "View RSVPs"}
          </Text>
        </Pressable>

        {isExpanded && (
          <View style={{ marginTop: 12 }}>
            <Text style={styles.greenHeading}>Coming</Text>
            {yesList.length === 0 ? (
              <Text style={styles.emptyText}>No yes responses.</Text>
            ) : (
              yesList.map((person: any) => (
                <Text key={getPersonKey(person)} style={styles.listText}>
                  • {getDisplayName(person)}
                </Text>
              ))
            )}

            <Text style={styles.yellowHeading}>Maybe</Text>
            {maybeList.length === 0 ? (
              <Text style={styles.emptyText}>No maybe responses.</Text>
            ) : (
              maybeList.map((person: any) => (
                <Text key={getPersonKey(person)} style={styles.listText}>
                  • {getDisplayName(person)}
                </Text>
              ))
            )}

            <Text style={styles.redHeading}>Not Coming</Text>
            {noList.length === 0 ? (
              <Text style={styles.emptyText}>No no responses.</Text>
            ) : (
              noList.map((person: any) => (
                <Text key={getPersonKey(person)} style={styles.listText}>
                  • {getDisplayName(person)}
                </Text>
              ))
            )}
          </View>
        )}
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Host Controls</Text>
        <Text style={styles.subtitle}>
          Manage fires, guests, announcements, reminders, and RSVP history.
        </Text>
      </View>
<Section
        title={isEditing ? "Edit Selected Fire" : "Create New Fire"}
        subtitle={isEditing ? "Update the selected fire" : "Schedule the next fire"}
        open={showCreateEditFire}
        onPress={() => setShowCreateEditFire(!showCreateEditFire)}
      >
        {isEditing && selectedFire && (
          <Text style={styles.editingText}>
            Editing {formatFireDateTime(selectedFire.event_date, selectedFire.event_time)}
          </Text>
        )}

        <Pressable onPress={() => setShowDatePicker(true)} style={styles.inputButton}>
          <Text style={styles.inputButtonText}>
            {newEventDate ? `Date: ${newEventDate}` : "Choose Date"}
          </Text>
        </Pressable>

        <Pressable onPress={() => setShowTimePicker(true)} style={styles.inputButton}>
          <Text style={styles.inputButtonText}>
            {newEventTime ? `Time: ${newEventTime}` : "Choose Time"}
          </Text>
        </Pressable>

        <View style={styles.timeAdjustRow}>
          <Pressable onPress={() => adjustTime(15)} style={styles.timeAdjustButton}>
            <Text style={styles.buttonText}>+15 min</Text>
          </Pressable>

          <Pressable onPress={() => adjustTime(30)} style={styles.timeAdjustButton}>
            <Text style={styles.buttonText}>+30 min</Text>
          </Pressable>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={newEventDate ? new Date(`${newEventDate}T00:00:00`) : new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(event, selectedDate) => {
              setShowDatePicker(false);
              if (selectedDate) setNewEventDate(formatDateForDatabase(selectedDate));
            }}
          />
        )}

        {showTimePicker && (
          <DateTimePicker
            value={new Date()}
            mode="time"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(event, selectedTime) => {
              setShowTimePicker(false);
              if (selectedTime) setNewEventTime(formatTimeForDatabase(selectedTime));
            }}
          />
        )}

        <TextInput
  placeholder="Optional message"
  placeholderTextColor="#888"
  value={newEventMessage}
  onChangeText={setNewEventMessage}
  style={styles.textInput}
  multiline
  blurOnSubmit={false}
  textAlignVertical="top"
/>

        {isEditing ? (
          <>
            <Pressable
              onPress={saveFireChanges}
              disabled={isSaving}
              style={[styles.successButton, isSaving && styles.disabledButton]}
            >
              <Text style={styles.successButtonText}>
                {isSaving ? "Saving..." : "Save Fire Changes"}
              </Text>
            </Pressable>

            <Pressable onPress={clearForm} style={styles.secondaryButton}>
              <Text style={styles.buttonText}>Cancel Editing</Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={createNewEvent}
            disabled={isSaving}
            style={[styles.primaryButton, isSaving && styles.disabledButton]}
          >
            <Text style={styles.primaryButtonText}>
              {isSaving ? "Creating..." : "Create Fire 🔥"}
            </Text>
          </Pressable>
        )}
      </Section>
      <Section
        title="Fire Management"
        subtitle={`${publishedFires.length} upcoming fire(s)`}
        open={showFireManagement}
        onPress={() => setShowFireManagement(!showFireManagement)}
      >
        {publishedFires.length === 0 ? (
          <Text style={styles.emptyText}>No upcoming published fires found.</Text>
        ) : (
          publishedFires.map((fire) => (
            <View
              key={fire.id}
              style={[
                styles.fireCard,
                selectedFire?.id === fire.id && styles.selectedFireCard,
              ]}
            >
              <Text style={styles.fireTitle}>
                {formatFireDateTime(fire.event_date, fire.event_time)}
              </Text>

              <Text style={styles.fireMessage}>
                {fire.message || "No message added."}
              </Text>

              <Pressable
                onPress={() => loadFireForEditing(fire)}
                style={styles.primaryButton}
              >
                <Text style={styles.primaryButtonText}>Edit Fire</Text>
              </Pressable>

              <Pressable onPress={() => cancelFire(fire)} style={styles.dangerButton}>
                <Text style={styles.buttonText}>Cancel Fire</Text>
              </Pressable>

              <Pressable onPress={() => deleteFire(fire)} style={styles.deleteButton}>
                <Text style={styles.buttonText}>Delete Fire</Text>
              </Pressable>
            </View>
          ))
        )}

        <Pressable onPress={loadHostData} style={styles.secondaryButton}>
          <Text style={styles.buttonText}>Refresh Host Data</Text>
        </Pressable>
      </Section>

      
      <Section
        title="Fire History + RSVPs"
        subtitle={`${filteredFireHistory.length} fire(s) shown`}
        open={showFireHistory}
        onPress={() => setShowFireHistory(!showFireHistory)}
      >
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setFireFilter("all")}
            style={[
              styles.filterButton,
              fireFilter === "all" && styles.activeFilterButton,
            ]}
          >
            <Text
              style={[
                styles.filterButtonText,
                fireFilter === "all" && styles.activeFilterButtonText,
              ]}
            >
              All
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setFireFilter("active")}
            style={[
              styles.filterButton,
              fireFilter === "active" && styles.activeFilterButton,
            ]}
          >
            <Text
              style={[
                styles.filterButtonText,
                fireFilter === "active" && styles.activeFilterButtonText,
              ]}
            >
              Active
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setFireFilter("cancelled")}
            style={[
              styles.filterButton,
              fireFilter === "cancelled" && styles.activeFilterButton,
            ]}
          >
            <Text
              style={[
                styles.filterButtonText,
                fireFilter === "cancelled" && styles.activeFilterButtonText,
              ]}
            >
              Cancelled
            </Text>
          </Pressable>
        </View>

        {filteredFireHistory.length === 0 ? (
          <Text style={styles.emptyText}>No fires match this filter.</Text>
        ) : (
          filteredFireHistory.map(renderFireWithRsvps)
        )}
      </Section>

      <Section
        title="Announcements"
        subtitle={`${announcements.length} announcement(s)`}
        open={showAnnouncements}
        onPress={() => setShowAnnouncements(!showAnnouncements)}
      >
        <TextInput
          placeholder="No fire this week, weather update, time change..."
          placeholderTextColor="#888"
          value={announcementMessage}
          onChangeText={setAnnouncementMessage}
          style={styles.textInput}
          multiline
        />

        <Pressable onPress={postAnnouncement} style={styles.primaryButton}>
          <Text style={styles.primaryButtonText}>Post Announcement</Text>
        </Pressable>

        <Pressable onPress={clearActiveAnnouncement} style={styles.secondaryButton}>
          <Text style={styles.buttonText}>Clear Active Announcement</Text>
        </Pressable>

        {announcements.length === 0 ? (
          <Text style={styles.emptyText}>No announcements yet.</Text>
        ) : (
          announcements.map((item) => (
            <View key={item.id} style={styles.fireCard}>
              <Text style={styles.fireTitle}>{item.message}</Text>
              <Text style={styles.fireMeta}>
                Status: {item.is_active ? "Active" : "Inactive"}
              </Text>
              <Text style={styles.fireMeta}>
                Sent To: {item.announcement_recipients?.length || 0}
              </Text>
            </View>
          ))
        )}
      </Section>

      <Section
        title="Reminders"
        subtitle={`${reminderRecipients.length} reminder recipient(s)`}
        open={showReminders}
        onPress={() => setShowReminders(!showReminders)}
      >
        <Text style={styles.fireMessage}>
          Build reminder lists from guests who RSVP’d Yes for the next active fire.
        </Text>

        <Pressable
          onPress={() => createReminderList("tomorrow")}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Create Tomorrow Reminder List</Text>
        </Pressable>

        <Pressable
          onPress={() => createReminderList("two_hour")}
          style={styles.primaryButton}
        >
          <Text style={styles.primaryButtonText}>Create 2 Hour Reminder List</Text>
        </Pressable>

        {dedupePeople(reminderRecipients)
          .slice(0, 20)
          .map((person) => (
            <Text key={`${getPersonKey(person)}-${person.reminder_type}`} style={styles.listText}>
              • {getDisplayName(person)} ({person.reminder_type})
            </Text>
          ))}
      </Section>

      <Section
        title="Guests"
        subtitle={`${approvedGuests.length} approved guest(s)`}
        open={showGuests}
        onPress={() => setShowGuests(!showGuests)}
      >
        <TextInput
          placeholder="Guest first name"
          placeholderTextColor="#888"
          value={newGuestFirstName}
          onChangeText={setNewGuestFirstName}
          style={styles.smallInput}
        />

        <TextInput
          placeholder="Guest last name"
          placeholderTextColor="#888"
          value={newGuestLastName}
          onChangeText={setNewGuestLastName}
          style={styles.smallInput}
        />

        <Pressable onPress={addApprovedGuest} style={styles.successButton}>
          <Text style={styles.successButtonText}>Approve Guest</Text>
        </Pressable>

        {approvedGuests.map((guest) => (
          <View key={guest.id} style={styles.fireCard}>
            <Text style={styles.fireTitle}>{getDisplayName(guest)}</Text>
            <Text style={styles.fireMeta}>
  Status: {guest.is_approved ? "Approved" : "Pending / Not Approved"}
</Text>

            {guest.is_approved ? (
              <Pressable
                onPress={() => deactivateGuest(guest)}
                style={styles.dangerButton}
              >
                <Text style={styles.buttonText}>Deactivate Guest</Text>
              </Pressable>
              
            ) : (
              <Pressable
                onPress={() => reactivateGuest(guest)}
                style={styles.successButton}
              >
                <Text style={styles.successButtonText}>Reactivate Guest</Text>
              </Pressable>
            )}
<Pressable
  onPress={() => deleteGuest(guest)}
  style={styles.deleteButton}
>
  <Text style={styles.buttonText}>Delete Guest</Text>
</Pressable>

          </View>
        ))}
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: "#0f0f10",
    padding: 20,
    paddingBottom: 40,
  },
  header: {
    marginTop: 12,
    marginBottom: 16,
  },
  title: {
    color: "#fff",
    fontSize: 30,
    fontWeight: "800",
  },
  subtitle: {
    color: "#b3b3ba",
    marginTop: 6,
    fontSize: 15,
    lineHeight: 21,
  },
  card: {
    backgroundColor: "#18181b",
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: "#2f2f35",
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  sectionSubtitle: {
    color: "#b3b3ba",
    fontSize: 13,
    marginTop: 3,
  },
  chevron: {
    color: "#f97316",
    fontSize: 18,
    fontWeight: "800",
    marginLeft: 10,
  },
  cardLabel: {
    color: "#f97316",
    fontSize: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  fireCard: {
    backgroundColor: "#232326",
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: "#2f2f35",
    marginTop: 10,
  },
  activeFireCard: {
    borderColor: "#22c55e",
  },
  cancelledFireCard: {
    borderColor: "#7f1d1d",
  },
  selectedFireCard: {
    borderColor: "#f97316",
    backgroundColor: "#3a2415",
  },
  fireTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "800",
  },
  fireMessage: {
    color: "#b3b3ba",
    marginTop: 5,
    marginBottom: 10,
    lineHeight: 20,
  },
  fireMeta: {
    color: "#b3b3ba",
    marginTop: 4,
  },
  emptyText: {
    color: "#8e8e95",
    marginTop: 4,
  },
  editingText: {
    color: "#22c55e",
    fontWeight: "700",
    marginBottom: 10,
  },
  inputButton: {
    backgroundColor: "#232326",
    padding: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2f2f35",
    marginTop: 10,
  },
  inputButtonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "700",
  },
  textInput: {
    marginTop: 10,
    backgroundColor: "#232326",
    color: "#fff",
    padding: 12,
    borderRadius: 10,
    minHeight: 80,
    textAlignVertical: "top",
    borderWidth: 1,
    borderColor: "#2f2f35",
  },
  smallInput: {
    marginTop: 10,
    backgroundColor: "#232326",
    color: "#fff",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2f2f35",
  },
  timeAdjustRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 10,
  },
  timeAdjustButton: {
    flex: 1,
    backgroundColor: "#232326",
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2f2f35",
  },
  filterRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  filterButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: "#232326",
    borderWidth: 1,
    borderColor: "#2f2f35",
  },
  activeFilterButton: {
    backgroundColor: "#f97316",
    borderColor: "#f97316",
  },
  filterButtonText: {
    color: "#fff",
    textAlign: "center",
    fontWeight: "800",
  },
  activeFilterButtonText: {
    color: "#111",
  },
  primaryButton: {
    backgroundColor: "#f97316",
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  primaryButtonText: {
    color: "#111",
    fontWeight: "800",
    textAlign: "center",
  },
  secondaryButton: {
    backgroundColor: "#232326",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2f2f35",
    marginTop: 10,
  },
  successButton: {
    backgroundColor: "#22c55e",
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 10,
  },
  successButtonText: {
    color: "#111",
    fontWeight: "800",
    textAlign: "center",
  },
  dangerButton: {
    backgroundColor: "#7f1d1d",
    paddingVertical: 12,
    borderRadius: 10,
    marginTop: 8,
  },
  deleteButton: {
    backgroundColor: "#450a0a",
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#ef4444",
    marginTop: 8,
  },
  disabledButton: {
    opacity: 0.5,
  },
  buttonText: {
    color: "#fff",
    fontWeight: "800",
    textAlign: "center",
  },
  linkText: {
    color: "#f97316",
    marginTop: 8,
    fontWeight: "700",
  },
  greenHeading: {
    color: "#22c55e",
    fontWeight: "800",
    marginTop: 8,
  },
  yellowHeading: {
    color: "#facc15",
    fontWeight: "800",
    marginTop: 12,
  },
  redHeading: {
    color: "#ef4444",
    fontWeight: "800",
    marginTop: 12,
  },
  listText: {
    color: "#d4d4d8",
    marginTop: 4,
  },
  deleteGuestButton: {
  backgroundColor: "#991b1b",
  padding: 12,
  borderRadius: 10,
  marginTop: 8,
  alignItems: "center",
},
});