import { useState, useEffect } from "react";
import {
  ScrollView,
  Text,
  View,
  Pressable,
  TextInput,
  Platform,
} from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { supabase } from "../../lib/supabase";

export default function HostScreen() {
  const [newEventDate, setNewEventDate] = useState("");
  const [newEventTime, setNewEventTime] = useState("");
  const [newEventMessage, setNewEventMessage] = useState("");
  const [currentEvent, setCurrentEvent] = useState<any>(null);
  const [isEditing, setIsEditing] = useState(false);

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);

  useEffect(() => {
    loadCurrentEvent();
  }, []);

  function formatDateForDatabase(date: Date) {
    return date.toISOString().split("T")[0];
  }

  function formatTimeForDatabase(date: Date) {
    return date.toTimeString().slice(0, 5);
  }

  async function loadCurrentEvent() {
    const today = new Date().toISOString().split("T")[0];

    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .gte("event_date", today)
      .order("event_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!error && data) {
      setCurrentEvent(data);
    }
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

    alert("Fire created 🔥");
    setNewEventDate("");
    setNewEventTime("");
    setNewEventMessage("");
    loadCurrentEvent();
  }

  async function saveFireChanges() {
    if (!currentEvent?.id) return;

    const { error } = await supabase
      .from("events")
      .update({
        event_date: newEventDate,
        event_time: newEventTime,
        message: newEventMessage,
      })
      .eq("id", currentEvent.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Fire updated 🔥");
    setIsEditing(false);
    loadCurrentEvent();
  }

  async function cancelFire() {
    if (!currentEvent?.id) return;

    const { error } = await supabase
      .from("events")
      .update({ status: "cancelled" })
      .eq("id", currentEvent.id);

    if (error) {
      alert(error.message);
      return;
    }

    alert("Fire cancelled.");
    setCurrentEvent(null);
    setIsEditing(false);
    setNewEventDate("");
    setNewEventTime("");
    setNewEventMessage("");
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

        {currentEvent && (
          <Pressable
            onPress={() => {
              setNewEventDate(currentEvent.event_date);
              setNewEventTime(currentEvent.event_time);
              setNewEventMessage(currentEvent.message || "");
              setIsEditing(true);
            }}
            style={{
              marginTop: 10,
              backgroundColor: "#232326",
              paddingVertical: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: "#f97316",
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
              Load Current Fire
            </Text>
          </Pressable>
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
              <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
                Save Changes
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setIsEditing(false)}
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
            <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
              Create Fire 🔥
            </Text>
          </Pressable>
        )}

        {currentEvent && (
          <Pressable
            onPress={cancelFire}
            style={{
              marginTop: 10,
              backgroundColor: "#7f1d1d",
              paddingVertical: 12,
              borderRadius: 10,
            }}
          >
            <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
              Cancel Current Fire
            </Text>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}