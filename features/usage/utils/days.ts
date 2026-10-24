// Usage days are UTC calendar days, written as ISO dates so they compare and
// sort as strings and match Postgres `date` values exactly.

const DAY_MS = 24 * 60 * 60 * 1000

export function utcDay(date: Date) {
  return date.toISOString().slice(0, 10)
}

export function addDays(day: string, days: number) {
  return utcDay(new Date(Date.parse(`${day}T00:00:00Z`) + days * DAY_MS))
}

// Every day from `from` to `to`, both included.
export function daysBetween(from: string, to: string) {
  const days: string[] = []
  for (let day = from; day <= to; day = addDays(day, 1)) days.push(day)

  return days
}

// The current period ends today; the previous one is the same length before it.
export function periodBounds(today: string, period: number) {
  const currentFrom = addDays(today, -(period - 1))

  return {
    currentFrom,
    previousFrom: addDays(currentFrom, -period),
    previousTo: addDays(currentFrom, -1),
  }
}
