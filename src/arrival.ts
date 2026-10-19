// Supplier pages print estimated arrival in words ("Expected to arrive Tue. Oct 20.").
// Code, not the model, converts that text to an ISO date, so a ranking never
// depends on a model's date arithmetic. Ranges such as "1-2 Days" stay unranked.
const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const weekday = '(Sun|Mon|Tue|Wed|Thu|Fri|Sat)[a-z]*\\.?,?\\s+';
const month = '(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\\.?\\s+(\\d{1,2})';
const year = '(?:,?\\s+(20\\d{2}))?';

/** Shipping-arrival phrasings. Pickup phrasing is deliberately absent: it is not delivery. */
const shippingArrivalPrefix =
  '(?:Expected to arrive|Estimated (?:delivery|arrival)(?: date)?:?(?: by)?|Arrives(?: by)?|Get it by|Deliver(?:y|ed) by)';

/**
 * Converts a printed shipping-arrival phrase to an ISO date, or null when the
 * text is a range, a dispatch promise, a pickup estimate, an impossible date,
 * a weekday that disagrees with the date, or more than 180 days out.
 */
export function parseShippingArrival(text: string, observedAt: string): string | null {
  const match = text.match(
    new RegExp(`${shippingArrivalPrefix}\\s+(?:${weekday})?${month}${year}(?![0-9])`, 'i'),
  );
  if (!match) return null;
  const now = new Date(observedAt),
    m = months.indexOf(match[2]!.slice(0, 3).toLowerCase());
  let y = match[4] ? Number(match[4]) : now.getUTCFullYear();
  if (!match[4] && m < now.getUTCMonth()) y++;
  const date = new Date(Date.UTC(y, m, Number(match[3]))),
    ahead = (date.getTime() - Date.parse(now.toISOString().slice(0, 10))) / 86400000;
  if (
    date.getUTCMonth() !== m ||
    ahead < 0 ||
    ahead > 180 ||
    (match[1] && date.getUTCDay() !== days.indexOf(match[1].slice(0, 3).toLowerCase()))
  )
    return null;
  return date.toISOString().slice(0, 10);
}
