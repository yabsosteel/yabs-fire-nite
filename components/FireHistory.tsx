import { View } from "react-native";

export default function FireHistory({
  isHost,
  children,
}: any) {
  if (!isHost) return null;

  return <View>{children}</View>;
}