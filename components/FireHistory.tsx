import { View } from "react-native";

export default function FireHistory({
  isHost,
  renderHostFireHistory,
}: any) {
  if (!isHost) return null;

  return <View>{renderHostFireHistory()}</View>;
}