import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, serviceRoleKey);

type ReminderType = "24_hour" | "2_hour";

const FIRE_LATITUDE = 42.4439;
const FIRE_LONGITUDE = -88.2365;

function getFireDateTime(eventDate: string, eventTime: string) {
  return new Date(`${eventDate}T${eventTime}`);
}

function getMinutesUntilFire(eventDate: string, eventTime: string) {
  const fireDateTime = getFireDateTime(eventDate, eventTime);
  const now = new Date();

  return Math.round((fireDateTime.getTime() - now.getTime()) / 60000);
}

function shouldSendReminder(minutesUntilFire: number, type: ReminderType) {
  if (type === "24_hour") {
    return minutesUntilFire <= 1440 && minutesUntilFire > 1425;
  }

  if (type === "2_hour") {
    return minutesUntilFire <= 120 && minutesUntilFire > 105;
  }

  return false;
}

function formatTime(eventTime: string) {
  const [hourString, minuteString] = eventTime.split(":");
  const hour = Number(hourString);
  const minute = minuteString ?? "00";

  const suffix = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return `${displayHour}:${minute} ${suffix}`;
}

async function getWeatherText(eventDate: string, eventTime: string) {
  try {
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${FIRE_LATITUDE}&longitude=${FIRE_LONGITUDE}&hourly=temperature_2m,precipitation_probability,wind_speed_10m&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago&start_date=${eventDate}&end_date=${eventDate}`
    );

    const weather = await response.json();
    const hourlyTimes = weather?.hourly?.time ?? [];

    const fireHour = eventTime.slice(0, 2);
    const targetHour = `${eventDate}T${fireHour}:00`;
    const index = hourlyTimes.findIndex((time: string) => time === targetHour);

    if (index === -1) return "";

    const temp = Math.round(weather.hourly.temperature_2m[index]);
    const rainChance = weather.hourly.precipitation_probability[index];
    const wind = Math.round(weather.hourly.wind_speed_10m[index]);

    return ` Weather: ${temp}°, wind ${wind} mph, rain ${rainChance}%.`;
  } catch {
    return "";
  }
}

async function sendExpoPush(token: string, title: string, body: string) {
  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: token,
      sound: "default",
      title,
      body,
      data: {
        screen: "home",
      },
    }),
  });

  return response.json();
}

async function sendReminderForEvent(event: any, reminderType: ReminderType) {
  const { data: rsvps, error: rsvpError } = await supabase
    .from("rsvps")
    .select("first_name,last_name,response_status")
    .eq("event_id", event.id)
    .in("response_status", ["going", "maybe"]);

  if (rsvpError) throw rsvpError;

  let sentCount = 0;
  const weatherText = await getWeatherText(event.event_date, event.event_time);

  for (const rsvp of rsvps ?? []) {
    if (!rsvp.first_name || !rsvp.last_name) continue;

    const { data: tokens, error: tokenError } = await supabase
      .from("push_tokens")
      .select("token")
      .eq("first_name", rsvp.first_name)
      .eq("last_name", rsvp.last_name);

    if (tokenError) throw tokenError;

    for (const tokenRow of tokens ?? []) {
      const token = tokenRow.token;
      if (!token) continue;

      const { data: alreadySent } = await supabase
        .from("fire_reminder_sends")
        .select("id")
        .eq("event_id", event.id)
        .eq("reminder_type", reminderType)
        .eq("token", token)
        .maybeSingle();

      if (alreadySent) continue;

      const fireTime = formatTime(event.event_time);

      const title =
        reminderType === "24_hour"
          ? "🔥 Fire tomorrow"
          : "🔥 Fire starts soon";

      const body =
        reminderType === "24_hour"
          ? `Yabs Fire Nite is tomorrow at ${fireTime}.${weatherText}`
          : `Yabs Fire Nite starts in about 2 hours.${weatherText}`;

      await sendExpoPush(token, title, body);

      await supabase.from("fire_reminder_sends").insert({
        event_id: event.id,
        reminder_type: reminderType,
        token,
      });

      sentCount++;
    }
  }

  return sentCount;
}

Deno.serve(async () => {
  try {
    const { data: events, error: eventsError } = await supabase
      .from("events")
      .select("*")
      .eq("status", "published")
      .is("deleted_at", null);

    if (eventsError) throw eventsError;

    let totalSent = 0;

    for (const event of events ?? []) {
      if (!event.event_date || !event.event_time) continue;

      const minutesUntilFire = getMinutesUntilFire(
        event.event_date,
        event.event_time
      );

      if (shouldSendReminder(minutesUntilFire, "24_hour")) {
        totalSent += await sendReminderForEvent(event, "24_hour");
      }

      if (shouldSendReminder(minutesUntilFire, "2_hour")) {
        totalSent += await sendReminderForEvent(event, "2_hour");
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        sent: totalSent,
      }),
      {
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: String(error),
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});