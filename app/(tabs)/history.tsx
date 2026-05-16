import AsyncStorage from "@react-native-async-storage/async-storage";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useCallback, useState } from "react";
import { useFocusEffect } from "expo-router";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { supabase } from "../../lib/supabase";

type HistoryFilter = "all" | "going" | "maybe" | "not_going";
type HostStatusFilter = "all" | "going" | "maybe" | "not_going" | "no_reply";
type DateRangeFilter = "30_days" | "90_days" | "this_year" | "all_time";
type FireStatusFilter = "all" | "completed" | "canceled" | "upcoming";
type ActiveDatePicker = "start" | "end" | null;

export default function HistoryScreen() {
  const [fires, setFires] = useState<any[]>([]);
  const [myHistory, setMyHistory] = useState<any[]>([]);
  const [expandedFireId, setExpandedFireId] = useState<string | null>(null);
  const [savedFirstName, setSavedFirstName] = useState<string | null>(null);
  const [savedLastName, setSavedLastName] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [hostSearch, setHostSearch] = useState("");
  const [hostStatusFilter, setHostStatusFilter] = useState<HostStatusFilter>("all");
  const [dateRangeFilter, setDateRangeFilter] = useState<DateRangeFilter>("all_time");
  const [fireStatusFilter, setFireStatusFilter] = useState<FireStatusFilter>("all");
  const [startDateSearch, setStartDateSearch] = useState<Date | null>(null);
  const [endDateSearch, setEndDateSearch] = useState<Date | null>(null);
  const [activeDatePicker, setActiveDatePicker] = useState<ActiveDatePicker>(null);

  useFocusEffect(
    useCallback(() => {
      loadHistoryScreen();
    }, []),
  );

  async function loadHistoryScreen() {
    setLoading(true);

    const first = await AsyncStorage.getItem("first_name");
    const last = await AsyncStorage.getItem("last_name");

    setSavedFirstName(first);
    setSavedLastName(last);

    const hostUser =
      first?.trim().toLowerCase() === "rian" &&
      last?.trim().toLowerCase() === "yablun";

    setIsHost(hostUser);

    if (!first || !last) {
      setFires([]);
      setMyHistory([]);
      setLoading(false);
      return;
    }

    if (hostUser) {
      await loadAllFireHistory();
    } else {
      await loadMyFireHistory(first, last);
    }

    setLoading(false);
  }

  function getDisplayName(person: any) {
    if (person?.first_name && person?.last_name) {
      return `${person.first_name} ${person.last_name}`;
    }

    if (person?.name) return person.name;
    if (person?.first_name) return person.first_name;
    if (person?.last_name) return person.last_name;

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

  function getStartOfToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
  }

  function getFireDate(dateString?: string) {
    if (!dateString) return null;
    const fireDate = new Date(`${dateString}T00:00:00`);
    fireDate.setHours(0, 0, 0, 0);
    return fireDate;
  }

  function getStartOfDay(date: Date) {
    const cleanDate = new Date(date);
    cleanDate.setHours(0, 0, 0, 0);
    return cleanDate;
  }

  function getFireStatusType(fire: any): FireStatusFilter {
    const status = String(fire?.status || "").toLowerCase();
    const fireDate = getFireDate(fire?.event_date);
    const today = getStartOfToday();

    if (status === "cancelled" || status === "canceled") {
      return "canceled";
    }

    if (fireDate && fireDate < today) {
      return "completed";
    }

    return "upcoming";
  }

  function fireMatchesDateFilters(dateString?: string) {
    const fireDate = getFireDate(dateString);

    if (!fireDate) return false;

    let matchesDate = true;

    if (dateRangeFilter !== "all_time") {
      const now = getStartOfToday();

      if (dateRangeFilter === "30_days") {
        const cutoff = new Date(now);
        cutoff.setDate(now.getDate() - 30);
        matchesDate = fireDate >= cutoff;
      }

      if (dateRangeFilter === "90_days") {
        const cutoff = new Date(now);
        cutoff.setDate(now.getDate() - 90);
        matchesDate = fireDate >= cutoff;
      }

      if (dateRangeFilter === "this_year") {
        matchesDate = fireDate.getFullYear() === now.getFullYear();
      }
    }

    if (startDateSearch && fireDate < getStartOfDay(startDateSearch)) {
      matchesDate = false;
    }

    if (endDateSearch && fireDate > getStartOfDay(endDateSearch)) {
      matchesDate = false;
    }

    return matchesDate;
  }

  function formatDisplayDate(dateString?: string) {
    if (!dateString) return "No date";

    const date = new Date(`${dateString}T00:00:00`);

    return date.toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  }

  function formatShortDate(date: Date | null) {
    if (!date) return "";

    return date.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
  }

  function formatTime(timeString?: string) {
    if (!timeString) return "";

    return new Date(`2000-01-01T${timeString}`).toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }

  function formatHistoryResponse(response: string) {
    if (response === "going") return "Going";
    if (response === "maybe") return "Maybe";
    if (response === "not_going") return "Not Going";
    return response;
  }

  function formatFireStatus(status: FireStatusFilter) {
    if (status === "completed") return "Completed";
    if (status === "canceled") return "Canceled";
    if (status === "upcoming") return "Published / Upcoming";
    return "All";
  }

  function getResponseColor(response: string) {
    if (response === "going") return "#22c55e";
    if (response === "maybe") return "#facc15";
    if (response === "not_going") return "#ef4444";
    return "#bbb";
  }

  function handleDateChange(_: any, selectedDate?: Date) {
    if (!selectedDate) {
      setActiveDatePicker(null);
      return;
    }

    if (activeDatePicker === "start") {
      setStartDateSearch(selectedDate);
    }

    if (activeDatePicker === "end") {
      setEndDateSearch(selectedDate);
    }

    setActiveDatePicker(null);
  }

  function renderDateFilters() {
    return (
      <>
        <View style={styles.filterRow}>
          <FilterButton label="30 Days" active={dateRangeFilter === "30_days"} onPress={() => setDateRangeFilter("30_days")} />
          <FilterButton label="90 Days" active={dateRangeFilter === "90_days"} onPress={() => setDateRangeFilter("90_days")} />
          <FilterButton label="This Year" active={dateRangeFilter === "this_year"} onPress={() => setDateRangeFilter("this_year")} />
          <FilterButton label="All Time" active={dateRangeFilter === "all_time"} onPress={() => setDateRangeFilter("all_time")} />
        </View>

        <Text style={styles.filterSectionTitle}>Search By Date</Text>

        <View style={styles.datePickerRow}>
          <Pressable
            style={styles.datePickerButton}
            onPress={() => setActiveDatePicker("start")}
          >
            <Text style={styles.datePickerLabel}>Start Date</Text>
            <Text style={styles.datePickerValue}>
              {startDateSearch ? formatShortDate(startDateSearch) : "Select date"}
            </Text>
          </Pressable>

          <Pressable
            style={styles.datePickerButton}
            onPress={() => setActiveDatePicker("end")}
          >
            <Text style={styles.datePickerLabel}>End Date</Text>
            <Text style={styles.datePickerValue}>
              {endDateSearch ? formatShortDate(endDateSearch) : "Select date"}
            </Text>
          </Pressable>
        </View>

        <Pressable
          style={styles.clearDateButton}
          onPress={() => {
            setStartDateSearch(null);
            setEndDateSearch(null);
          }}
        >
          <Text style={styles.clearDateButtonText}>Clear Date Search</Text>
        </Pressable>

        {activeDatePicker && (
          <DateTimePicker
            value={
              activeDatePicker === "start"
                ? startDateSearch || new Date()
                : endDateSearch || new Date()
            }
            mode="date"
            display="default"
            onChange={handleDateChange}
          />
        )}
      </>
    );
  }

  function renderFireStatusFilters() {
    return (
      <>
        <Text style={styles.filterSectionTitle}>Fire Status</Text>

        <View style={styles.filterRow}>
          <FilterButton label="All" active={fireStatusFilter === "all"} onPress={() => setFireStatusFilter("all")} />
          <FilterButton label="Completed" active={fireStatusFilter === "completed"} onPress={() => setFireStatusFilter("completed")} />
          <FilterButton label="Canceled" active={fireStatusFilter === "canceled"} onPress={() => setFireStatusFilter("canceled")} />
          <FilterButton label="Published / Upcoming" active={fireStatusFilter === "upcoming"} onPress={() => setFireStatusFilter("upcoming")} />
        </View>
      </>
    );
  }

  async function loadAllFireHistory() {
    const { data, error } = await supabase
      .from("events")
      .select(
        `
        *,
        rsvps (
          id,
          first_name,
          last_name,
          name,
          response_status,
          created_at
        )
      `,
      )
      .is("deleted_at", null)
      .neq("status", "deleted")
      .order("event_date", { ascending: false })
      .order("event_time", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setFires(data ?? []);
    setMyHistory([]);
  }

  async function loadMyFireHistory(first: string, last: string) {
    const { data, error } = await supabase
      .from("rsvps")
      .select(
        `
        *,
        events!inner (
          id,
          title,
          event_date,
          event_time,
          message,
          status,
          deleted_at
        )
      `,
      )
      .eq("first_name", first)
      .eq("last_name", last)
      .is("events.deleted_at", null)
      .neq("events.status", "deleted")
      .order("created_at", { ascending: false });

    if (error) {
      alert(error.message);
      return;
    }

    setMyHistory(data ?? []);
    setFires([]);
  }

  const filteredMyHistory = myHistory.filter((item: any) => {
    const event = item.events;

    const matchesResponse =
      historyFilter === "all" || item.response_status === historyFilter;

    const matchesDate = fireMatchesDateFilters(event?.event_date);

    const matchesFireStatus =
      fireStatusFilter === "all" ||
      getFireStatusType(event) === fireStatusFilter;

    return matchesResponse && matchesDate && matchesFireStatus;
  });

  function renderHostHistory() {
    if (fires.length === 0) {
      return <Text style={styles.emptyText}>No fire history yet.</Text>;
    }

    const searchText = hostSearch.trim().toLowerCase();

    const filteredFires = fires.filter((fire: any) => {
      const rsvps = fire.rsvps || [];

      const goingList = dedupePeople(
        rsvps.filter((r: any) => r.response_status === "going"),
      );

      const maybeList = dedupePeople(
        rsvps.filter((r: any) => r.response_status === "maybe"),
      );

      const notGoingList = dedupePeople(
        rsvps.filter((r: any) => r.response_status === "not_going"),
      );

      const matchesSearch =
        !searchText ||
        rsvps.some((person: any) =>
          getDisplayName(person).toLowerCase().includes(searchText),
        );

      const matchesStatus =
        hostStatusFilter === "all" ||
        (hostStatusFilter === "going" && goingList.length > 0) ||
        (hostStatusFilter === "maybe" && maybeList.length > 0) ||
        (hostStatusFilter === "not_going" && notGoingList.length > 0) ||
        (hostStatusFilter === "no_reply" && rsvps.length === 0);

      const matchesDate = fireMatchesDateFilters(fire.event_date);

      const matchesFireStatus =
        fireStatusFilter === "all" ||
        getFireStatusType(fire) === fireStatusFilter;

      return matchesSearch && matchesStatus && matchesDate && matchesFireStatus;
    });

    return (
      <>
        <TextInput
          placeholder="Search guest name..."
          placeholderTextColor="#777"
          value={hostSearch}
          onChangeText={setHostSearch}
          style={styles.searchInput}
        />

        <View style={styles.filterRow}>
          <FilterButton label="All" active={hostStatusFilter === "all"} onPress={() => setHostStatusFilter("all")} />
          <FilterButton label="Going" active={hostStatusFilter === "going"} onPress={() => setHostStatusFilter("going")} />
          <FilterButton label="Maybe" active={hostStatusFilter === "maybe"} onPress={() => setHostStatusFilter("maybe")} />
          <FilterButton label="Not Going" active={hostStatusFilter === "not_going"} onPress={() => setHostStatusFilter("not_going")} />
          <FilterButton label="No Reply" active={hostStatusFilter === "no_reply"} onPress={() => setHostStatusFilter("no_reply")} />
        </View>

        {renderDateFilters()}

        {renderFireStatusFilters()}

        {filteredFires.length === 0 ? (
          <Text style={styles.emptyText}>No fire history matches these filters.</Text>
        ) : (
          filteredFires.map((fire: any) => {
            const goingList = dedupePeople(
              fire.rsvps?.filter((r: any) => r.response_status === "going") || [],
            );

            const maybeList = dedupePeople(
              fire.rsvps?.filter((r: any) => r.response_status === "maybe") || [],
            );

            const notGoingList = dedupePeople(
              fire.rsvps?.filter((r: any) => r.response_status === "not_going") || [],
            );

            const isExpanded = expandedFireId === fire.id;
            const displayStatus = formatFireStatus(getFireStatusType(fire));

            return (
              <View
                key={fire.id}
                style={[
                  styles.historyCard,
                  getFireStatusType(fire) === "canceled" && styles.cancelledCard,
                ]}
              >
                <Pressable onPress={() => setExpandedFireId(isExpanded ? null : fire.id)}>
                  <Text style={styles.fireDateText}>
                    {formatDisplayDate(fire.event_date)}
                    {fire.event_time ? ` at ${formatTime(fire.event_time)}` : ""}
                  </Text>

                  <Text
                    style={[
                      styles.statusText,
                      getFireStatusType(fire) === "canceled" && styles.cancelledText,
                    ]}
                  >
                    Status: {displayStatus}
                  </Text>

                  <Text style={styles.summaryText}>
                    Going: {goingList.length} | Maybe: {maybeList.length} | Not Going: {notGoingList.length}
                  </Text>

                  <Text style={styles.tapText}>{isExpanded ? "Hide RSVPs" : "View RSVPs"}</Text>
                </Pressable>

                {isExpanded && (
                  <View style={styles.expandedSection}>
                    <ResponseList title="Going" color="#22c55e" list={goingList} getDisplayName={getDisplayName} />
                    <ResponseList title="Maybe" color="#facc15" list={maybeList} getDisplayName={getDisplayName} />
                    <ResponseList title="Not Going" color="#ef4444" list={notGoingList} getDisplayName={getDisplayName} />
                  </View>
                )}
              </View>
            );
          })
        )}
      </>
    );
  }

  function renderUserHistory() {
    if (myHistory.length === 0) {
      return <Text style={styles.emptyText}>You do not have any fire history yet.</Text>;
    }

    return (
      <>
        <View style={styles.filterRow}>
          <FilterButton label="All" active={historyFilter === "all"} onPress={() => setHistoryFilter("all")} />
          <FilterButton label="Going" active={historyFilter === "going"} onPress={() => setHistoryFilter("going")} />
          <FilterButton label="Maybe" active={historyFilter === "maybe"} onPress={() => setHistoryFilter("maybe")} />
          <FilterButton label="Not Going" active={historyFilter === "not_going"} onPress={() => setHistoryFilter("not_going")} />
        </View>

        {renderDateFilters()}

        {renderFireStatusFilters()}

        {filteredMyHistory.length === 0 ? (
          <Text style={styles.emptyText}>No history matches these filters.</Text>
        ) : (
          filteredMyHistory.map((item: any) => {
            const displayStatus = formatFireStatus(getFireStatusType(item.events));

            return (
              <View
                key={item.id}
                style={[
                  styles.historyCard,
                  getFireStatusType(item.events) === "canceled" && styles.cancelledCard,
                ]}
              >
                <Text style={styles.fireDateText}>
                  {formatDisplayDate(item.events?.event_date)}
                  {item.events?.event_time ? ` at ${formatTime(item.events.event_time)}` : ""}
                </Text>

                <Text
                  style={[
                    styles.userResponseText,
                    { color: getResponseColor(item.response_status) },
                  ]}
                >
                  Response: {formatHistoryResponse(item.response_status)}
                </Text>

                <Text
                  style={[
                    styles.statusText,
                    getFireStatusType(item.events) === "canceled" && styles.cancelledText,
                  ]}
                >
                  Status: {displayStatus}
                </Text>

                {item.events?.message ? (
                  <Text style={styles.messageText}>{item.events.message}</Text>
                ) : null}
              </View>
            );
          })
        )}
      </>
    );
  }
  async function onRefresh() {
    setRefreshing(true);

    try {
      await loadHistoryScreen();
    } finally {
      setRefreshing(false);
    }
  }


  return (
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
      <Text style={styles.title}>Fire History</Text>

      <Text style={styles.subtitle}>
        {isHost
          ? "Host view: all fire history"
          : savedFirstName && savedLastName
            ? `${savedFirstName} ${savedLastName}'s history`
            : "Enter your name on the Home screen to view your history"}
      </Text>

      <Pressable onPress={loadHistoryScreen} style={styles.refreshButton}>
        <Text style={styles.refreshButtonText}>
          {loading ? "Loading..." : "Refresh History"}
        </Text>
      </Pressable>

      {!savedFirstName || !savedLastName ? (
        <Text style={styles.emptyText}>No saved user found.</Text>
      ) : isHost ? (
        renderHostHistory()
      ) : (
        renderUserHistory()
      )}
    </ScrollView>
  );
}

function ResponseList({
  title,
  color,
  list,
  getDisplayName,
}: {
  title: string;
  color: string;
  list: any[];
  getDisplayName: (person: any) => string;
}) {
  return (
    <View style={styles.responseGroup}>
      <Text style={[styles.responseHeading, { color }]}>
        {title} ({list.length})
      </Text>

      {list.length === 0 ? (
        <Text style={styles.emptyResponseText}>No responses.</Text>
      ) : (
        list.map((person: any) => (
          <Text key={person.id} style={styles.responseName}>
            • {getDisplayName(person)}
          </Text>
        ))
      )}
    </View>
  );
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
      style={[
        styles.filterButton,
        active ? styles.filterButtonActive : styles.filterButtonInactive,
      ]}
    >
      <Text style={[styles.filterButtonText, active && styles.filterButtonTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flexGrow: 1,
    backgroundColor: "#121212",
    padding: 20,
    paddingBottom: 50,
  },
  title: {
    color: "#fff",
    fontSize: 32,
    fontWeight: "900",
    marginTop: 10,
  },
  subtitle: {
    color: "#b3b3ba",
    fontSize: 15,
    marginTop: 8,
    marginBottom: 14,
    lineHeight: 22,
  },
  searchInput: {
    backgroundColor: "#1f1f1f",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 14,
    padding: 14,
    color: "#fff",
    marginTop: 10,
    marginBottom: 8,
  },
  filterSectionTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 12,
  },
  datePickerRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  datePickerButton: {
    flex: 1,
    backgroundColor: "#1f1f1f",
    borderWidth: 1,
    borderColor: "#333",
    borderRadius: 14,
    padding: 14,
  },
  datePickerLabel: {
    color: "#888",
    fontSize: 12,
    fontWeight: "800",
    marginBottom: 5,
    textTransform: "uppercase",
  },
  datePickerValue: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "900",
  },
  clearDateButton: {
    backgroundColor: "#232326",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#333",
    marginTop: 10,
    marginBottom: 8,
  },
  clearDateButtonText: {
    color: "#fff",
    fontWeight: "900",
    textAlign: "center",
  },
  refreshButton: {
    backgroundColor: "#232326",
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#333",
    marginBottom: 8,
  },
  refreshButtonText: {
    color: "#fff",
    fontWeight: "900",
    textAlign: "center",
  },
  emptyText: {
    color: "#888",
    marginTop: 16,
    fontSize: 15,
    lineHeight: 22,
  },
  historyCard: {
    marginTop: 12,
    padding: 16,
    backgroundColor: "#1f1f1f",
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#333",
  },
  cancelledCard: {
    borderColor: "#7f1d1d",
  },
  fireDateText: {
    color: "#fff",
    fontSize: 17,
    fontWeight: "900",
    lineHeight: 24,
  },
  statusText: {
    color: "#b3b3ba",
    marginTop: 6,
    fontWeight: "700",
  },
  summaryText: {
    color: "#b3b3ba",
    marginTop: 6,
    lineHeight: 20,
  },
  tapText: {
    color: "#f97316",
    marginTop: 10,
    fontWeight: "900",
  },
  expandedSection: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopColor: "#333",
    paddingTop: 14,
  },
  responseGroup: {
    marginBottom: 14,
  },
  responseHeading: {
    fontSize: 17,
    fontWeight: "900",
    marginBottom: 6,
  },
  responseName: {
    color: "#ddd",
    fontSize: 15,
    marginTop: 4,
  },
  emptyResponseText: {
    color: "#777",
    fontSize: 15,
  },
  userResponseText: {
    marginTop: 8,
    fontSize: 16,
    fontWeight: "900",
  },
  messageText: {
    color: "#ddd",
    marginTop: 10,
    lineHeight: 22,
  },
  cancelledText: {
    color: "#ef4444",
    marginTop: 8,
    fontWeight: "900",
  },
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 8,
    marginBottom: 8,
  },
  filterButton: {
    marginRight: 8,
    marginTop: 8,
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 999,
    borderWidth: 1,
  },
  filterButtonActive: {
    backgroundColor: "#f97316",
    borderColor: "#f97316",
  },
  filterButtonInactive: {
    backgroundColor: "#232326",
    borderColor: "#333",
  },
  filterButtonText: {
    color: "#fff",
    fontWeight: "900",
  },
  filterButtonTextActive: {
    color: "#111",
  },
});
