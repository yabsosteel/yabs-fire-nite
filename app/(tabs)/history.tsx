import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { supabase } from "../../lib/supabase";

export default function HistoryScreen() {
  const [fires, setFires] = useState<any[]>([]);
  const [expandedFireId, setExpandedFireId] = useState<string | null>(null);

  useEffect(() => {
    loadFireHistory();
  }, []);

  function getDisplayName(person: any) {
    if (person?.first_name && person?.last_name) {
      return `${person.first_name} ${person.last_name}`;
    }
    if (person?.name) return person.name;
    return "Unknown Guest";
  }

  function dedupePeople(list: any[]) {
    const seen = new Set<string>();

    return list.filter((person: any) => {
      const key = getDisplayName(person).trim().toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function formatDisplayDate(dateString: string) {
    const date = new Date(`${dateString}T00:00:00`);
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
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
      .order("event_date", { ascending: false })
      .order("event_time", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setFires(data ?? []);
  }

  return (
    <ScrollView
      contentContainerStyle={{
        flexGrow: 1,
        backgroundColor: "#0f0f10",
        padding: 20,
      }}
    >
      <Text style={{ color: "#fff", fontSize: 24, fontWeight: "700" }}>
        Fire History
      </Text>

      <Pressable
        onPress={loadFireHistory}
        style={{
          marginTop: 12,
          backgroundColor: "#232326",
          paddingVertical: 10,
          paddingHorizontal: 20,
          borderRadius: 10,
          borderWidth: 1,
          borderColor: "#2f2f35",
        }}
      >
        <Text style={{ color: "#fff", fontWeight: "700", textAlign: "center" }}>
          Refresh History
        </Text>
      </Pressable>

      {fires.length === 0 ? (
        <Text style={{ color: "#b3b3ba", marginTop: 15 }}>
          No fire history yet.
        </Text>
      ) : (
        fires.map((fire: any) => {
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
                marginTop: 12,
                padding: 12,
                backgroundColor: "#18181b",
                borderRadius: 12,
                borderWidth: 1,
                borderColor: fire.status === "cancelled" ? "#7f1d1d" : "#2f2f35",
              }}
            >
              <Pressable
                onPress={() => setExpandedFireId(isExpanded ? null : fire.id)}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>
                  {fire.event_date ? formatDisplayDate(fire.event_date) : "No date"}
                  {fire.event_time ? ` at ${fire.event_time}` : ""}
                </Text>

                <Text
                  style={{
                    color: fire.status === "cancelled" ? "#ef4444" : "#b3b3ba",
                    marginTop: 4,
                  }}
                >
                  Status: {fire.status}
                </Text>

                <Text style={{ color: "#b3b3ba", marginTop: 4 }}>
                  Yes: {yesList.length} | No: {noList.length}
                </Text>

                <Text style={{ color: "#f97316", marginTop: 6 }}>
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
    </ScrollView>
  );
}