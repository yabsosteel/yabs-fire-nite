export async function loadFireWeather(date: string, time: string) {
  try {
    const latitude = 42.4439;
    const longitude = -88.2365;

    const weatherResponse = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&hourly=temperature_2m,precipitation_probability,wind_speed_10m,weather_code&temperature_unit=fahrenheit&wind_speed_unit=mph&timezone=America%2FChicago`,
    );

    const weatherData = await weatherResponse.json();

    const targetDateTime = new Date(`${date}T${time}`);
    const hourlyTimes = weatherData?.hourly?.time || [];

    let targetIndex = hourlyTimes.findIndex((hour: string) => {
      const hourDate = new Date(hour);

      return (
        hourDate.getFullYear() === targetDateTime.getFullYear() &&
        hourDate.getMonth() === targetDateTime.getMonth() &&
        hourDate.getDate() === targetDateTime.getDate() &&
        hourDate.getHours() === targetDateTime.getHours()
      );
    });

    if (targetIndex === -1) {
      targetIndex = hourlyTimes.findIndex((hour: string) =>
        hour.startsWith(`${date}T`),
      );
    }

    if (targetIndex === -1) {
      return null;
    }

    const weatherCode = weatherData.hourly.weather_code?.[targetIndex];

    return {
      temperature: weatherData.hourly.temperature_2m?.[targetIndex],
      rainChance: weatherData.hourly.precipitation_probability?.[targetIndex],
      windSpeed: weatherData.hourly.wind_speed_10m?.[targetIndex],
      icon: getWeatherIcon(weatherCode),
      description: getWeatherDescription(weatherCode),
    };
  } catch (error) {
    console.log("Weather load error:", error);

    return null;
  }
}

function getWeatherIcon(code: number) {
  if (code === 0) return "☀️";
  if ([1, 2].includes(code)) return "⛅";
  if (code === 3) return "☁️";
  if ([45, 48].includes(code)) return "🌫️";
  if ([51, 53, 55, 56, 57].includes(code)) return "🌦️";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "❄️";
  if ([95, 96, 99].includes(code)) return "⛈️";

  return "🌤️";
}

function getWeatherDescription(code: number) {
  if (code === 0) return "Clear";
  if (code === 1) return "Mostly clear";
  if (code === 2) return "Partly cloudy";
  if (code === 3) return "Cloudy";
  if ([45, 48].includes(code)) return "Foggy";
  if ([51, 53, 55, 56, 57].includes(code)) return "Drizzle";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "Snow";
  if ([95, 96, 99].includes(code)) return "Storms";

  return "Weather";
}
