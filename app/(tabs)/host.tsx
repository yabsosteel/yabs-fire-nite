import { ScrollView, Text, View } from "react-native";

export default function HostScreen() {
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

        <Text style={{ color: "#b3b3ba", marginTop: 10 }}>
          Next we’ll move Fire Controls, Announcements, Reminders, Guests, and Fire History here.
        </Text>
      </View>
    </ScrollView>
  );
}