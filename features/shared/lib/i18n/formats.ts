import type { Formats } from "next-intl"

// Named formats for `format.dateTime(value, "date" | "dateTime" |
// "preciseDateTime")`, rendered in the reader's locale.
export const formats = {
  dateTime: {
    date: { dateStyle: "medium" },
    dateTime: { dateStyle: "medium", timeStyle: "short" },
    preciseDateTime: { dateStyle: "medium", timeStyle: "medium" },
  },
} satisfies Formats
