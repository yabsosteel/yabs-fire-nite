import { ScrollView, Text } from "react-native";
import FireHistory from "../../components/FireHistory";

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

      <FireHistory isHost={true}>
  <Text style={{ color: "#b3b3ba", marginTop: 10 }}>
    Fire history data coming next.
  </Text>
</FireHistory>
    </ScrollView>
  );
}