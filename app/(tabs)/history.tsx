import { ScrollView, Text, View } from "react-native";

export default function HistoryScreen() {
  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: "#0f0f10",
        padding: 20,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700" }}>
        Fire History
      </Text>

      <Text style={{ color: "#b3b3ba", marginTop: 10 }}>
        Next step: move full history here
      </Text>
    </ScrollView>
  );
}