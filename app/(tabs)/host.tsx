import { ScrollView, Text, View, Pressable } from "react-native";

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

        <Pressable
          style={{
            marginTop: 15,
            backgroundColor: "#f97316",
            paddingVertical: 12,
            paddingHorizontal: 20,
            borderRadius: 10,
          }}
        >
          <Text style={{ color: "#111", fontWeight: "700", textAlign: "center" }}>
            Fire Controls Coming Next 🔥
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}