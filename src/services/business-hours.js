/**
 * Business Hours Utilities (timezone-aware)
 *
 * Notes:
 * - `businessDays` uses ISO day numbers: 1=Mon ... 7=Sun
 * - `startTime`/`endTime` are "HH:MM" in the provided `timezone`
 * - Supports overnight windows (e.g. 22:00 -> 02:00)
 */

const WEEKDAY_TO_ISO = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

function parseHHMM(value) {
  if (typeof value !== 'string') return null;
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
  if (!match) return null;
  return { hours: Number(match[1]), minutes: Number(match[2]) };
}

function minutesSinceMidnight({ hours, minutes }) {
  return hours * 60 + minutes;
}

function getZonedNowParts({ now, timezone }) {
  const date = now instanceof Date ? now : new Date();

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const weekday = parts.find((p) => p.type === 'weekday')?.value;
  const hour = parts.find((p) => p.type === 'hour')?.value;
  const minute = parts.find((p) => p.type === 'minute')?.value;

  const isoDay = weekday ? WEEKDAY_TO_ISO[weekday] : null;
  const hours = hour != null ? Number(hour) : null;
  const minutes = minute != null ? Number(minute) : null;

  if (!isoDay || Number.isNaN(hours) || Number.isNaN(minutes)) {
    return null;
  }

  return { isoDay, timeMinutes: minutesSinceMidnight({ hours, minutes }) };
}

/**
 * @returns {{ isWithin: boolean, reason?: string }}
 */
function isWithinBusinessHours({
  timezone,
  businessDays,
  startTime,
  endTime,
  now = new Date(),
}) {
  const safeTimezone = typeof timezone === 'string' && timezone.length > 0 ? timezone : 'UTC';
  const safeBusinessDays = Array.isArray(businessDays) ? businessDays : [1, 2, 3, 4, 5];

  const start = parseHHMM(startTime || '09:00');
  const end = parseHHMM(endTime || '18:00');
  if (!start || !end) return { isWithin: true, reason: 'invalid_time_window' };

  const zoned = getZonedNowParts({ now, timezone: safeTimezone });
  if (!zoned) return { isWithin: true, reason: 'invalid_timezone' };

  if (!safeBusinessDays.includes(zoned.isoDay)) {
    return { isWithin: false, reason: 'outside_business_days' };
  }

  const startMin = minutesSinceMidnight(start);
  const endMin = minutesSinceMidnight(end);
  const t = zoned.timeMinutes;

  // Normal window (same day)
  if (startMin <= endMin) {
    return { isWithin: t >= startMin && t <= endMin, reason: t >= startMin && t <= endMin ? undefined : 'outside_hours' };
  }

  // Overnight window (e.g. 22:00 -> 02:00): within if after start OR before end
  const isWithin = t >= startMin || t <= endMin;
  return { isWithin, reason: isWithin ? undefined : 'outside_hours_overnight' };
}

module.exports = {
  isWithinBusinessHours,
};



