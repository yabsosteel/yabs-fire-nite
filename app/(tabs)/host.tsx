import { useState, useEffect } from "react";
import {
  ScrollView,
  Text,
  View,
  Pressable,
  TextInput,
  Platform,
  Alert,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "../../lib/supabase";
import {
  sendPushNotificationToAll,
  formatFireDateTime,
} from "../../lib/notifications";

export default function HostScreen() {
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventTime, setNewEventTime] = useState("");
  const [newEventMessage, setNewEventMessage] = useState("");

  const [publishedFires, setPublishedFires] = useState<any[]>([]);
  const [selectedFire, setSelectedFire] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    loadPublishedFires();
  }, []);

  function formatDateForDatabase(date: Date) {
    return date.toISOString().split("T")[0];
  }

  function formatTimeForDatabase(date: Date) {
    return date.toTimeString().slice(0, 5);
  }

  function formatDateForNotification(dateString: string) {
    if (!dateString) return "";

    const date = new Date(`${dateString}T00:00:00`);

    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }

  function formatTimeForNotification(timeString: string) {
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

  function formatFireNotificationDateTime(dateString: string, timeString: string) {
    return `${formatDateForNotification(dateString)} at ${formatTimeForNotification(
      timeString
    )}`;
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

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .is("deleted_at", null)
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .order("event_time", { ascending: true });

    if (error) {
      alert(error.message);
      return;
    }

    setPublishedFires(data || []);
  }

  function loadFireForEditing(fire: any) {
    setSelectedFire(fire);
    setNewEventDate(fire.event_date);
    setNewEventTime(fire.event_time);
    setNewEventMessage(fire.message || "");
    setIsEditing(true);
  }

  async function createNewEvent() {
    if (!newEventDate || !newEventTime) {
      alert("Please choose a date and time.");
      return;
    }

    const { error } = await supabase.from("events").insert({
      title: "Yabs Fire Nite",
      event_date: newEventDate,
      event_time: newEventTime,
      message: newEventMessage,
      status: "published",
    });

    if (error) {
      alert(error.message);
      return;
    }

    await sendPushNotificationToAll(
      "🔥 New Fire",
       `${formatFireDateTime(newEventDate, newEventTime)} — Tap to RSVP`
    );

    alert("Fire created 🔥");
    clearForm();
    loadPublishedFires();
  }

  async function saveFireChanges() {
    if (!selectedFire?.id) return;

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
    loadPublishedFires();
  }

  async function cancelFire(fire: any) {
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
    loadPublishedFires();
  }

  async function deleteFire(fire: any) {
    Alert.alert(
      "Delete Fire",
      "Are you sure you want to permanently delete this fire? This cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
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

            setPublishedFires((prev) => prev.filter((f) => f.id !== fire.id));

            clearForm();
          },
        },
      ]
    );
  }

  function clearForm() {
    setNewEventDate("");
    setNewEventTime("");
    setNewEventMessage("");
    setSelectedFire(null);
    setIsEditing(false);
  }

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: "#0f0f10",
        padding: 20,
      }}
    >
      <View
        style={{
          marginTop: 20,
          backgroundColor: "#18181b",
          padding: 15,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#2f2f35",
        }}
      >
        <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>
          Host Panel
        </Text>

        <View
          style={{
            marginTop: 15,
            backgroundColor: "#232326",
            padding: 12,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: "#2f2f35",
          }}
        >
          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 16 }}>
            Published Fires
          </Text>

          {publishedFires.length === 0 ? (
            <Text style={{ color: "#b3b3ba", marginTop: 8 }}>
              No upcoming published fires found.
            </Text>
          ) : (
            publishedFires.map((fire) => (
              <View
                key={fire.id}
                style={{
                  marginTop: 12,
                  padding: 12,
                  borderRadius: 10,
                  backgroundColor:
                    selectedFire?.id === fire.id ? "#3a2415" : "#18181b",
                  borderWidth: 1,
                  borderColor:
                    selectedFire?.id === fire.id ? "#f97316" : "#2f2f35",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {fire.event_date} at {fire.event_time}
                </Text>

                <Text style={{ color: "#b3b3ba", marginTop: 4 }}>
                  {fire.message || "No message"}
                </Text>

                <Pressable
                  onPress={() => loadFireForEditing(fire)}
                  style={{
                    marginTop: 10,
                    backgroundColor: "#f97316",
                    paddingVertical: 10,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      color: "#111",
                      fontWeight: "700",
                      textAlign: "center",
                    }}
                  >
                    Edit This Fire
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => cancelFire(fire)}
                  style={{
                    marginTop: 8,
                    backgroundColor: "#7f1d1d",
                    paddingVertical: 10,
                    borderRadius: 8,
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontWeight: "700",
                      textAlign: "center",
                    }}
                  >
                    Cancel This Fire
                  </Text>
                </Pressable>

                <Pressable
                  onPress={() => deleteFire(fire)}
                  style={{
                    marginTop: 8,
                    backgroundColor: "#450a0a",
                    paddingVertical: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: "#ef4444",
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontWeight: "700",
                      textAlign: "center",
                    }}
                  >
                    Delete This Fire
                  </Text>
                </Pressable>
              </View>
            ))
          )}
        </View>

        <Text
          style={{
            color: "#fff",
            fontSize: 18,
            fontWeight: "700",
            marginTop: 20,
          }}
        >
          {isEditing ? "Edit Fire" : "Create New Fire"}
        </Text>

        {isEditing && selectedFire && (
          <Text style={{ color: "#f97316", marginTop: 6 }}>
            Currently editing: {selectedFire.event_date} at{" "}
            {selectedFire.event_time}
          </Text>
        )}

        <Pressable
          onPress={() => setShowDatePicker(true)}
          style={{
            marginTop: 15,
            backgroundColor: "#232326",
            padding: 12,
            borderRadius: 8,
          }}
        >
          <Text style={{ color: "#fff", textAlign: "center" }}>
            {newEventDate ? `Date: ${newEventDate}` : "Choose Date"}
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

        <View style={{ flexDirection: "row", marginTop: 10, gap: 10 }}>
          <Pressable
            onPress={() => adjustTime(15)}
            style={{
              flex: 1,
              backgroundColor: "#1f2937",
              padding: 10,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: "#fff", textAlign: "center" }}>+15 min</Text>
          </Pressable>

          <Pressable
            onPress={() => adjustTime(30)}
            style={{
              flex: 1,
              backgroundColor: "#1f2937",
              padding: 10,
              borderRadius: 8,
            }}
          >
            <Text style={{ color: "#fff", textAlign: "center" }}>+30 min</Text>
          </Pressable>
        </View>

        {showDatePicker && (
          <DateTimePicker
            value={new Date()}
            mode="date"
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={(event, selectedDate) => {
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
            onChange={(event, selectedTime) => {
              setShowTimePicker(false);
              if (selectedTime) {
                setNewEventTime(formatTimeForDatabase(selectedTime));
              }
            }}
          />
        )}

        <TextInput
          placeholder="Optional message"
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

        {isEditing ? (
          <>
            <Pressable
              onPress={saveFireChanges}
              style={{
                marginTop: 15,
                backgroundColor: "#22c55e",
                paddingVertical: 12,
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
                Save Changes
              </Text>
            </Pressable>

            <Pressable
              onPress={clearForm}
              style={{
                marginTop: 10,
                backgroundColor: "#232326",
                paddingVertical: 12,
                borderRadius: 10,
              }}
            >
              <Text style={{ color: "#fff", textAlign: "center" }}>
                Cancel Editing
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={createNewEvent}
            style={{
              marginTop: 15,
              backgroundColor: "#f97316",
              paddingVertical: 12,
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
              Create Fire 🔥
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}